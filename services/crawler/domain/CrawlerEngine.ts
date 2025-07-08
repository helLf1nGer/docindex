/**
 * CrawlerEngine for handling the core crawling logic
 * 
 * This class is responsible for the actual crawling process,
 * coordinating URL processing, content fetching, and document creation
 * while delegating to specialized components.
 */

import { getLogger } from '../../../shared/infrastructure/logging.js';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { QueueManager } from './QueueManager.js';
import { ContentProcessor, ContentProcessorOptions } from './ContentProcessor.js';
import { StorageManager } from './StorageManager.js';
import { UrlProcessor } from './UrlProcessor.js';
import { SitemapProcessor, SitemapEntry } from './SitemapProcessor.js';
import { strategyFactory } from './strategies/StrategyFactory.js';
import EventEmitter from 'events';

const logger = getLogger();

/**
 * Crawler configuration
 */
export interface CrawlerEngineConfig {
  /** Maximum depth to crawl */
  maxDepth: number;
  
  /** Maximum pages to crawl */
  maxPages: number;
  
  /** Force recrawling of already indexed content */
  force?: boolean;
  
  /** Crawl delay in milliseconds */
  crawlDelay?: number;
  
  /** Strategy name (breadth, depth, hybrid) */
  strategy?: 'breadth' | 'depth' | 'hybrid';
  
  /** Patterns to prioritize */
  prioritizationPatterns?: string[];
  
  /** Number of concurrent requests */
  concurrency?: number;
  
  /** Debug mode */
  debug?: boolean;
  
  /** Use sitemaps for URL discovery */
  useSitemaps?: boolean;
  
  /** Maximum number of retry attempts for failed requests */
  maxRetries?: number;
}

/** Additional processing options for content */
export type DocumentProcessingConfig = ContentProcessorOptions & { [key: string]: any };

/**
 * HTTP response with metadata
 */
export interface HttpResponse {
  /** Response body */
  body: string;
  
  /** Response status code */
  statusCode: number;
  
  /** Response headers */
  headers: Record<string, string>;
}

/**
 * Event interface for crawler engine events
 */
export interface CrawlerEngineEvent {
  /** Event type */
  type: string;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Event data */
  data: any;
}

/**
 * Core engine for crawling process
 */
export class CrawlerEngine {
  /** Event emitter for engine events */
  private eventEmitter = new EventEmitter();
  
  /** Sitemap processor for sitemap-based URL discovery */
  private sitemapProcessor: SitemapProcessor;
  
  /** Set of visited URLs */
  private visited = new Set<string>();
  
  /** Cancellation token */
  private isCancelled = false;
  
  /** Stats for the crawling process */
  private stats = {
    pagesCrawled: 0,
    totalDiscovered: 0,
    maxDepthReached: 0,
    startTime: new Date(),
    endTime: new Date()
  };
  
  /**
   * Create a new crawler engine
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly contentProcessor: ContentProcessor,
    private readonly storageManager: StorageManager,
    private readonly urlProcessor: UrlProcessor
    
  ) {
    logger.info('CrawlerEngine initialized', 'CrawlerEngine');
    // Initialize the sitemap processor with the same HTTP client
    this.sitemapProcessor = new SitemapProcessor(httpClient);
  }
  
  /**
   * Start a crawling process
   * @param source Documentation source to crawl
   * @param config Crawler configuration
   * @returns Promise that resolves when crawling is complete
   */
  async crawl(
    source: DocumentSource,
    config: CrawlerEngineConfig
  ): Promise<{
    pagesCrawled: number;
    pagesDiscovered: number;
    maxDepthReached: number;
    runtime: number;
  }> {
    this.isCancelled = false;
    this.stats.startTime = new Date();
    
    logger.info(
      `Starting crawl for ${source.name} (${source.baseUrl}) - max depth: ${config.maxDepth}, max pages: ${config.maxPages}`,
      'CrawlerEngine'
    );
    
    // Set up queue manager with appropriate strategy
    const strategyName = config.strategy || 'hybrid';
    const strategy = strategyFactory.createStrategy(strategyName, {
      patterns: config.prioritizationPatterns,
      concurrency: config.concurrency
    });
    
    const queueManager = new QueueManager({
      maxDepth: config.maxDepth,
      strategy,
      concurrency: config.concurrency || 1,
      debug: config.debug || false
    });
    
    // If sitemaps are enabled, discover URLs from sitemaps first
    if (config.useSitemaps !== false) {
      try {
        logger.info(`Checking sitemaps for ${source.baseUrl}`, 'CrawlerEngine.crawl');
        const sitemapEntries = await this.sitemapProcessor.discoverAndProcessSitemaps(source.baseUrl);
        
        // Filter entries based on include/exclude patterns
        const filteredEntries = this.sitemapProcessor.filterEntries(
          sitemapEntries,
          source.crawlConfig.includePatterns,
          source.crawlConfig.excludePatterns
        );
        
        if (filteredEntries.length > 0) {
          logger.info(`Found ${filteredEntries.length} URLs from sitemaps`, 'CrawlerEngine.crawl');
          
          // Add URLs to queue with appropriate depth calculation
          this.addSitemapUrlsToQueue(filteredEntries, source, queueManager);
          
          this.emitEvent('sitemap-urls-added', { count: filteredEntries.length });
        }
      } catch (error) {
        logger.warn(`Error processing sitemaps: ${error}`, 'CrawlerEngine.crawl');
        // Continue with regular crawling even if sitemap processing fails
      }
    }
    
    // Set up event forwarding from queue manager
    queueManager.getEventEmitter().on('queue-stats-updated', (stats) => {
      this.emitEvent('queue-stats-updated', stats.data);
    });
    
    // Log the initial URL being added to the queue
    logger.info(
      `Adding initial URL to queue: ${source.baseUrl} (depth: 0)`,
      'CrawlerEngine.crawl'
    );
    
    // Initialize crawling queue with the base URL
    const initialUrlAdded = queueManager.addUrl(source.baseUrl, 0, '');
    logger.info(`Initial URL added to queue: ${initialUrlAdded}`, 'CrawlerEngine.crawl');
    
    // Track crawled count
    let crawledCount = 0;
    
    // Process queue until empty or limits reached
    while (queueManager.hasMoreUrls() && crawledCount < config.maxPages) {
      // Check if crawling was cancelled
      if (this.isCancelled) {
        logger.info('Crawling was cancelled', 'CrawlerEngine');
        break;
      }
      
      // Get next batch of URLs to process
      const batchSize = Math.min(
        config.concurrency || 1,
        config.maxPages - crawledCount
      );
      
      const batch = queueManager.getNextBatch(batchSize);
      
      if (batch.length === 0) {
        logger.debug(`Got empty batch, in-progress URLs: ${queueManager.getStats().inProgress}`, 'CrawlerEngine.crawl');
        // If no URLs to process but in-progress URLs, wait a bit and try again
        if (queueManager.getStats().inProgress > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Otherwise, we're done
        logger.info(`No more URLs to process, queue is empty`, 'CrawlerEngine.crawl');
        break;
      }
      
      // Process batch in parallel
      await Promise.all(
        batch.map(async (item) => {
          try {
            await this.processUrl(
              item.url,
              item.depth,
              item.parentUrl,
              source,
              config,
              queueManager
            );
            
            // Increment crawled count
            crawledCount++;
            this.stats.pagesCrawled = crawledCount;
            
            // Emit event
            this.emitEvent('page-crawled', {
              url: item.url,
              depth: item.depth,
              crawledCount
            });
          } catch (error) {
            logger.warn(`Error processing ${item.url}:`, 'CrawlerEngine', error);
            
            // Mark as failed in queue manager
            queueManager.markFailed(item.url, item.depth);
          }
        })
      );
      
      // Respect crawl delay
      if (config.crawlDelay) {
        await new Promise(resolve => setTimeout(resolve, config.crawlDelay));
      }
    }
    
    // Get final stats
    const finalStats = queueManager.getStats();
    this.stats.maxDepthReached = finalStats.maxDepthReached;
    this.stats.totalDiscovered = finalStats.visited + finalStats.queued;
    this.stats.endTime = new Date();
    
    const runtime = this.stats.endTime.getTime() - this.stats.startTime.getTime();
    
    logger.info(
      `Crawl completed: ${crawledCount} pages crawled, ${this.stats.totalDiscovered} discovered, max depth ${finalStats.maxDepthReached}, runtime: ${runtime}ms`,
      'CrawlerEngine'
    );
    
    return {
      pagesCrawled: crawledCount,
      pagesDiscovered: this.stats.totalDiscovered,
      maxDepthReached: finalStats.maxDepthReached,
      runtime
    };
  }
  
  /**
   * Add URLs discovered from sitemaps to the queue
   * @param entries Sitemap entries to add
   * @param source Documentation source
   * @param queueManager Queue manager to add URLs to
   * @returns Number of URLs added
   */
  private addSitemapUrlsToQueue(
    entries: SitemapEntry[],
    source: DocumentSource,
    queueManager: QueueManager
  ): number {
    let addedCount = 0;
    
    for (const entry of entries) {
      // Calculate initial depth based on URL structure
      // This is an approximation - we set a reasonable initial depth
      // since sitemap URLs don't have parent-child relationships
      const initialDepth = this.urlProcessor.calculateCrawlDepth(
        entry.url,
        source.baseUrl
      );
      
      // Add URL to queue - it's ok if it returns false (already queued)
      const added = queueManager.addUrl(entry.url, initialDepth, source.baseUrl);
      if (added) {
        addedCount++;
      }
    }
    
    return addedCount;
  }
  
  /**
   * Cancel the crawling process
      maxDepthReached: finalStats.maxDepthReached,
      runtime
    };
  }
  
  /**
   * Cancel the crawling process
   */
  cancel(): void {
    this.isCancelled = true;
    logger.info('Crawling cancellation requested', 'CrawlerEngine');
  }
  
  /**
   * Get the event emitter for engine events
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Process a single URL
   * @param url URL to process
   * @param depth Depth of the URL
   * @param parentUrl URL that linked to this URL
   * @param source Documentation source
   * @param config Crawler configuration
   * @param queueManager Queue manager for the crawl
   */
  private async processUrl(
    url: string,
    depth: number,
    parentUrl: string,
    source: DocumentSource, 
    config: CrawlerEngineConfig,
    queueManager: QueueManager
  ): Promise<void> {
    logger.info(`Processing URL: ${url} (depth: ${depth}, parent: ${parentUrl})`, 'CrawlerEngine');

    // Check if URL was already visited (protection against cycles)
    if (this.visited.has(url)) {
      logger.debug(`URL already visited: ${url}`, 'CrawlerEngine');
      queueManager.markVisited(url, depth);
      return;
    }
    
    this.visited.add(url);
    
    try {
      // Fetch the page content
      const { content, metadata } = await this.fetchPage(url, config);
      
      if (!content) {
        throw new Error(`Empty content returned for ${url}`);
      }
      
      // Skip non-HTML content
      if (!metadata.contentType.includes('html') && !metadata.contentType.includes('xml')) {
        logger.debug(`Skipping non-HTML content: ${url} (${metadata.contentType})`, 'CrawlerEngine');
        queueManager.markVisited(url, depth);
        return;
      }
      
      // Prepare content processing options
      const contentOptions: ContentProcessorOptions = {
        // Enable specialized processors
        useSpecializedProcessors: true,
        
        // Enable enhanced processing features
        convertToMarkdown: true,
        deduplicate: true,
        applyChunking: false, // Chunking is better left to the indexer
        
        // Debug mode
        debug: config.debug || false,
        
        // Source-specific configurations based on URL patterns
        sourceConfig: {
          host: new URL(url).hostname
        }
      };
      
      let processedContent = this.contentProcessor.processContent(content, url, contentOptions);
      
      // Ensure processedContent has valid structure even if extraction failed
      if (!processedContent || !processedContent.textContent) {
        logger.warn(`Content extraction failed for ${url}, using fallback content`, 'CrawlerEngine');
        processedContent = {
          title: url.split('/').pop() || url,
          htmlContent: content,
          textContent: `[Content from ${url} - extraction failed]`,
          links: [],
          metadata: {}
        };
      }
      
      // Create document from processed content
      const document = this.contentProcessor.createDocument(
        processedContent,
        url,
        source.id
      );
      
      // Only store document if it has meaningful content
      if (document.textContent && document.textContent.length > 10) {
        logger.debug(`Storing document for ${url} (${document.textContent.length} chars)`, 'CrawlerEngine');
        await this.storageManager.storeDocument(document, {
          overwrite: !!config.force
        }).catch(err => logger.error(`Error storing document: ${err}`, 'CrawlerEngine'));
      } else {
        logger.warn(`Not storing document for ${url} due to insufficient content`, 'CrawlerEngine');
      }
      
      // Extract links for further crawling
      const links = this.urlProcessor.extractLinks(content, url);
      logger.debug(`Extracted ${links.length} links from ${url}`, 'CrawlerEngine');
      
      logger.debug(`Extracted ${links.length} links from ${url}`, 'CrawlerEngine');
      
      // Add discovered links to queue
      let newLinksCount = 0;
      for (const link of links) {
        // Use improved depth calculation from parent relationship
        logger.debug(`Processing link: ${link} from parent: ${url}`, 'CrawlerEngine');
        const childDepth = this.urlProcessor.calculateCrawlDepthFromParent(
          link, 
          url, 
          depth,
          source.baseUrl
        );
        
        // Process URL through the URL processor
        logger.debug(`Calculated depth for ${link}: ${childDepth}`, 'CrawlerEngine');
        const processedUrl = this.urlProcessor.processUrl(
          link,
          source,
          url,
          childDepth
        );
        
        if (processedUrl.accepted) {
          logger.info(`Adding link: ${processedUrl.url} (depth: ${childDepth}, parent: ${url})`, 'CrawlerEngine');
          // Use actual calculated depth
          if (queueManager.addUrl(processedUrl.url, childDepth, url)) {
            newLinksCount++;
          }
        }
      }
      
      if (newLinksCount > 0) {
        logger.info(`Added ${newLinksCount} new links from ${url}`, 'CrawlerEngine');
      }
      
      // Mark URL as visited in the queue manager
      queueManager.markVisited(url, depth);
    } catch (error) {
      logger.warn(`Error processing URL ${url}: ${error}`, 'CrawlerEngine');
      
      // Mark URL as failed in the queue manager
      queueManager.markFailed(url, depth);
      
      // Re-throw to let the caller handle it
      throw error;
    }
  }
  
  /**
   * Fetch a page from a URL
   * @param url URL to fetch
   * @param config Crawler configuration
   * @returns Page content and metadata
   */
  private async fetchPage(
    url: string,
    config?: CrawlerEngineConfig
  ): Promise<{
    content: string;
    metadata: {
      statusCode: number;
      contentType: string;
      contentSize: number;
      fetchTime: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Use the fetchWithRetry method to handle retries
      const response = await this.fetchWithRetry(url, config);
      const fetchTime = Date.now() - startTime;
      
      // Extract content type from headers
      const contentType = response.headers['content-type'] || 'text/html';
      
      // Log success
      logger.info(`Successfully fetched ${url} (${response.body.length} bytes, content-type: ${contentType})`, 'CrawlerEngine');
      
      return {
        content: response.body,
        metadata: {
          statusCode: response.statusCode,
          // Normalize content type by trimming off charset information
          contentType: contentType.split(';')[0].trim(),
          contentSize: response.body.length,
          fetchTime
        }
      };
    } catch (error) {
      logger.warn(`Error fetching ${url}: ${error}`, 'CrawlerEngine');
      
      // Re-throw to let the caller handle it
      throw error;
    }
  }

  /**
   * Fetch a URL with automatic retry on failure
   * @param url URL to fetch
   * @returns Page content and metadata
   */
  private async fetchWithRetry(
    url: string,
    config?: CrawlerEngineConfig
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }> {
    // Get max retries from config or use default
    const maxRetries = config?.maxRetries || 3;
    let lastError: Error | null = null;
    
    logger.debug(`Fetching ${url} with max ${maxRetries} retries`, 'CrawlerEngine.fetchWithRetry');
    
    // Try fetching with retries
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`Retry attempt ${attempt}/${maxRetries} for ${url}`, 'CrawlerEngine.fetchWithRetry');
        }
      
        // Fetch the page
        const response = await this.httpClient.get(url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 DocSI/1.0',
            'Cache-Control': 'no-cache',
            // Some sites require these headers to avoid bot detection
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate'
          },
          timeout: 30000 // 30 second timeout
        });
        
        // Check if the response is valid (some servers return 200 with error pages)
        if (response.statusCode >= 400) {
          throw new Error(`HTTP error: ${response.statusCode}`);
        }
        
        return response; // Success, return the response
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn(`Fetch attempt ${attempt + 1}/${maxRetries} failed for ${url}: ${lastError.message}`, 'CrawlerEngine.fetchWithRetry');
        
        if (attempt < maxRetries - 1) {
          // Calculate backoff delay with jitter to prevent thundering herd
          const baseDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
          const jitter = Math.random() * 1000; // Random jitter up to 1 second
          const delay = baseDelay + jitter;
          
          logger.debug(`Waiting ${delay.toFixed(0)}ms before retry ${attempt + 1}`, 'CrawlerEngine.fetchWithRetry');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
  }
  
  /**
   * Emit an event
   * @param type Event type
   * @param data Event data
   */
  private emitEvent(type: string, data: any): void {
    const event: CrawlerEngineEvent = {
      type,
      timestamp: new Date(),
      data
    };
    
    this.eventEmitter.emit(type, event);
    this.eventEmitter.emit('event', event);
  }
}