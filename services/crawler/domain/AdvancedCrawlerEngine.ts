/**
 * AdvancedCrawlerEngine for handling the core crawling logic with improved
 * sitemap processing, depth management, and URL prioritization.
 * 
 * This class extends the base crawler engine with enhanced capabilities
 * for handling different website structures and documentation sites.
 */

import { getLogger } from '../../../shared/infrastructure/logging.js';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { QueueManager } from './QueueManager.js';
import { ContentProcessor } from './ContentProcessor.js';
import { StorageManager } from './StorageManager.js';
import { UrlProcessor } from './UrlProcessor.js';
import { EnhancedSitemapProcessor, SitemapProcessingOptions } from './sitemap/EnhancedSitemapProcessor.js';
import { SitemapEntry } from './sitemap/SitemapTypes.js';
import { strategyFactory } from './strategies/StrategyFactory.js';
import EventEmitter from 'events';
import { URL } from 'url';

const logger = getLogger();

/**
 * Advanced crawler configuration with improved depth handling
 */
export interface AdvancedCrawlerConfig {
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
  
  /** Depth handling mode (strict, flexible, adaptive) */
  depthHandlingMode?: 'strict' | 'flexible' | 'adaptive';
  
  /** Sitemap processing options */
  sitemapOptions?: SitemapProcessingOptions;
  
  /** Patterns to include in crawling */
  includePatterns?: string[];
  
  /** Patterns to exclude from crawling */
  excludePatterns?: string[];
  
  /** Special entry point URLs to consider as base URLs */
  entryPoints?: string[];
  
  /** Options for handling large documentation sites */
  largeDocSiteOptions?: {
    /** Whether to detect large documentation sites */
    detectLargeSites?: boolean;
    /** Threshold of URLs found to consider a site large */
    largeSiteThreshold?: number;
    /** URL path limit per section for large sites */
    maxUrlsPerSection?: number;
  };
}

/**
 * Advanced crawler engine with improved depth handling and URL prioritization
 */
export class AdvancedCrawlerEngine {
  /** Event emitter for engine events */
  private eventEmitter = new EventEmitter();
  
  /** Enhanced sitemap processor for better sitemap handling */
  private sitemapProcessor: EnhancedSitemapProcessor;
  
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
    endTime: new Date(),
    sitemapUrlsDiscovered: 0,
    sitemapUrlsCrawled: 0,
    sectionCoverage: new Map<string, number>(), // Track coverage by section
    urlsByDepth: new Map<number, number>(), // Track URLs by depth
    errors: 0
  };
  
  /**
   * Create a new advanced crawler engine
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly contentProcessor: ContentProcessor,
    private readonly storageManager: StorageManager,
    private readonly urlProcessor: UrlProcessor
  ) {
    logger.info('AdvancedCrawlerEngine initialized', 'AdvancedCrawlerEngine');
    
    // Initialize the enhanced sitemap processor with the same HTTP client
    this.sitemapProcessor = new EnhancedSitemapProcessor(httpClient);
  }
  
  /**
   * Start a crawling process with enhanced depth handling
   * @param source Documentation source to crawl
   * @param config Advanced crawler configuration
   * @returns Promise that resolves when crawling is complete
   */
  async crawl(
    source: DocumentSource,
    config: AdvancedCrawlerConfig
  ): Promise<{
    pagesCrawled: number;
    pagesDiscovered: number;
    maxDepthReached: number;
    runtime: number;
    sitemapUrlsDiscovered: number;
    sitemapUrlsCrawled: number;
    sectionCoverage: Map<string, number>;
    urlsByDepth: Map<number, number>;
    errors: number;
  }> {
    this.isCancelled = false;
    this.stats.startTime = new Date();
    
    logger.info(
      `Starting advanced crawl for ${source.name} (${source.baseUrl}) - max depth: ${config.maxDepth}, max pages: ${config.maxPages}`,
      'AdvancedCrawlerEngine'
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
      concurrency: config.concurrency || 2, // Default to 2 for better performance
      depthHandlingMode: config.depthHandlingMode || 'adaptive', // Use adaptive mode by default
      debug: config.debug || false
    });
    
    // If sitemaps are enabled, discover URLs from sitemaps first
    if (config.useSitemaps !== false) {
      try {
        logger.info(`Checking sitemaps for ${source.baseUrl}`, 'AdvancedCrawlerEngine.crawl');
        
        // Configure sitemap processing options
        const sitemapOptions: SitemapProcessingOptions = {
          followSitemapIndex: true,
          maxEntries: 1000,
          assignCustomDepth: true,
          baseDepth: 0, // Start with base depth 0 for sitemap URLs
          treatAsHighPriority: true,
          depthCalculationMethod: 'hybrid', // Use hybrid depth calculation
          ...config.sitemapOptions // Override with user-provided options
        };
        
        // Process sitemaps with enhanced processor
        const sitemapEntries = await this.sitemapProcessor.discoverAndProcessSitemaps(
          source.baseUrl, 
          sitemapOptions
        );
        
        // Filter entries based on include/exclude patterns
        const filteredEntries = this.sitemapProcessor.filterEntries(
          sitemapEntries,
          config.includePatterns || source.crawlConfig.includePatterns,
          config.excludePatterns || source.crawlConfig.excludePatterns
        );
        
        if (filteredEntries.length > 0) {
          logger.info(`Found ${filteredEntries.length} URLs from sitemaps`, 'AdvancedCrawlerEngine.crawl');
          
          // Add URLs to queue with appropriate depth calculation
          await this.addSitemapUrlsToQueue(filteredEntries, source, queueManager, config);
          
          // Update stats
          this.stats.sitemapUrlsDiscovered = filteredEntries.length;
          
          this.emitEvent('sitemap-urls-added', { count: filteredEntries.length });
        }
        
        // Check for large documentation site
        if (config.largeDocSiteOptions?.detectLargeSites && 
            filteredEntries.length > (config.largeDocSiteOptions.largeSiteThreshold || 500)) {
          logger.info(`Detected large documentation site with ${filteredEntries.length} URLs in sitemap`, 'AdvancedCrawlerEngine');
          
          // For large sites, organize and limit URLs by section
          await this.handleLargeDocumentationSite(
            filteredEntries, 
            source, 
            queueManager, 
            config
          );
        }
      } catch (error) {
        logger.warn(`Error processing sitemaps: ${error}`, 'AdvancedCrawlerEngine.crawl');
        // Continue with regular crawling even if sitemap processing fails
      }
    }
    
    // Process additional entry points if provided
    if (config.entryPoints && config.entryPoints.length > 0) {
      logger.info(`Processing ${config.entryPoints.length} additional entry points`, 'AdvancedCrawlerEngine');
      
      for (const entryPoint of config.entryPoints) {
        // Add entry point as depth 0 (same as base URL)
        queueManager.addUrl(entryPoint, 0, source.baseUrl, true);
      }
    }
    
    // Set up event forwarding from queue manager
    queueManager.getEventEmitter().on('queue-stats-updated', (stats) => {
      this.emitEvent('queue-stats-updated', stats.data);
    });
    
    // Log the initial URL being added to the queue
    logger.info(
      `Adding initial URL to queue: ${source.baseUrl} (depth: 0)`,
      'AdvancedCrawlerEngine.crawl'
    );
    
    // Initialize crawling queue with the base URL
    const initialUrlAdded = queueManager.addUrl(source.baseUrl, 0, '', true); // Mark as high priority
    logger.info(`Initial URL added to queue: ${initialUrlAdded}`, 'AdvancedCrawlerEngine.crawl');
    
    // Track crawled count
    let crawledCount = 0;
    
    // Process queue until empty or limits reached
    while (queueManager.hasMoreUrls() && crawledCount < config.maxPages) {
      // Check if crawling was cancelled
      if (this.isCancelled) {
        logger.info('Crawling was cancelled', 'AdvancedCrawlerEngine');
        break;
      }
      
      // Get next batch of URLs to process
      const batchSize = Math.min(
        config.concurrency || 2,
        config.maxPages - crawledCount
      );
      
      const batch = queueManager.getNextBatch(batchSize);
      
      if (batch.length === 0) {
        logger.debug(`Got empty batch, in-progress URLs: ${queueManager.getStats().inProgress}`, 'AdvancedCrawlerEngine.crawl');
        // If no URLs to process but in-progress URLs, wait a bit and try again
        if (queueManager.getStats().inProgress > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Otherwise, we're done
        logger.info(`No more URLs to process, queue is empty`, 'AdvancedCrawlerEngine.crawl');
        break;
      }
      
      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const result = await this.processUrl(
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
            
            // If this was from a sitemap, increment that counter too
            if (item.isPriority) {
              this.stats.sitemapUrlsCrawled++;
            }
            
            // Track URLs by depth
            const depthCount = this.stats.urlsByDepth.get(item.depth) || 0;
            this.stats.urlsByDepth.set(item.depth, depthCount + 1);
            
            // Track section coverage
            this.trackSectionCoverage(item.url, source.baseUrl);
            
            // Emit event
            this.emitEvent('page-crawled', {
              url: item.url,
              depth: item.depth,
              crawledCount,
              fromSitemap: item.isPriority
            });
            
            return result;
          } catch (error) {
            logger.warn(`Error processing ${item.url}:`, 'AdvancedCrawlerEngine', error);
            
            // Track error
            this.stats.errors++;
            
            // Mark as failed in queue manager
            queueManager.markFailed(item.url, item.depth);
            throw error;
          }
        })
      );
      
      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      if (failed > 0) {
        logger.info(`Batch processing completed: ${successful} succeeded, ${failed} failed`, 'AdvancedCrawlerEngine');
      }
      
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
      `Crawl completed: ${crawledCount} pages crawled, ${this.stats.totalDiscovered} discovered, ` +
      `max depth ${finalStats.maxDepthReached}, runtime: ${runtime}ms, ` +
      `sitemap URLs: ${this.stats.sitemapUrlsCrawled}/${this.stats.sitemapUrlsDiscovered}`,
      'AdvancedCrawlerEngine'
    );
    
    return {
      pagesCrawled: crawledCount,
      pagesDiscovered: this.stats.totalDiscovered,
      maxDepthReached: finalStats.maxDepthReached,
      runtime,
      sitemapUrlsDiscovered: this.stats.sitemapUrlsDiscovered,
      sitemapUrlsCrawled: this.stats.sitemapUrlsCrawled,
      sectionCoverage: this.stats.sectionCoverage,
      urlsByDepth: this.stats.urlsByDepth,
      errors: this.stats.errors
    };
  }
  
  /**
   * Add URLs discovered from sitemaps to the queue
   * @param entries Sitemap entries to add
   * @param source Documentation source
   * @param queueManager Queue manager to add URLs to
   * @param config Crawler configuration
   * @returns Number of URLs added
   */
  private async addSitemapUrlsToQueue(
    entries: SitemapEntry[],
    source: DocumentSource,
    queueManager: QueueManager,
    config: AdvancedCrawlerConfig
  ): Promise<number> {
    let addedCount = 0;
    
    // Sort entries by priority score
    const sortedEntries = entries.sort((a, b) => {
      // Lower score means higher priority
      return (a.score || 50) - (b.score || 50);
    });
    
    // Add each entry to the queue
    for (const entry of sortedEntries) {
      // Calculate depth for sitemap URL
      let initialDepth = entry.calculatedDepth !== undefined ? entry.calculatedDepth : 0;
      
      // Limit initial depth to maxDepth
      if (initialDepth > config.maxDepth) {
        initialDepth = config.maxDepth;
      }
      
      // Add URL to queue - it's ok if it returns false (already queued)
      const added = queueManager.addUrl(entry.url, initialDepth, source.baseUrl, true);
      if (added) {
        addedCount++;
        
        // Add to visited URLs set
        this.visited.add(entry.url);
        
        // If we have too many URLs and using adaptive depth handling,
        // start being more selective about what we add
        if (config.depthHandlingMode === 'adaptive' && addedCount > 500) {
          // Only add high-priority items beyond this point
          if ((entry.score || 50) > 30) {
            continue; // Skip lower priority items
          }
        }
      }
    }
    
    logger.info(`Added ${addedCount} URLs from sitemap to queue`, 'AdvancedCrawlerEngine');
    return addedCount;
  }
  
  /**
   * Special handling for large documentation sites
   * @param entries Sitemap entries
   * @param source Documentation source
   * @param queueManager Queue manager
   * @param config Crawler configuration
   */
  private async handleLargeDocumentationSite(
    entries: SitemapEntry[],
    source: DocumentSource,
    queueManager: QueueManager,
    config: AdvancedCrawlerConfig
  ): Promise<void> {
    logger.info(`Applying large documentation site optimizations`, 'AdvancedCrawlerEngine');
    
    const maxUrlsPerSection = config.largeDocSiteOptions?.maxUrlsPerSection || 50;
    
    // Group URLs by section
    const sectionMap = new Map<string, SitemapEntry[]>();
    
    for (const entry of entries) {
      try {
        const urlObj = new URL(entry.url);
        const path = urlObj.pathname;
        
        // Extract first level section
        const firstPathSegment = path.split('/').filter(Boolean)[0] || '';
        const section = firstPathSegment || '_root';
        
        // Add to section map
        if (!sectionMap.has(section)) {
          sectionMap.set(section, []);
        }
        
        sectionMap.get(section)?.push(entry);
      } catch (error) {
        logger.warn(`Error grouping URL by section: ${entry.url}`, 'AdvancedCrawlerEngine');
      }
    }
    
    // Add limited URLs from each section to ensure balanced coverage
    for (const [section, sectionEntries] of sectionMap.entries()) {
      logger.info(`Processing section "${section}" with ${sectionEntries.length} URLs`, 'AdvancedCrawlerEngine');
      
      // Sort section entries by priority
      const sortedEntries = sectionEntries.sort((a, b) => (a.score || 50) - (b.score || 50));
      
      // Take only top entries up to limit
      const entriesToAdd = sortedEntries.slice(0, maxUrlsPerSection);
      
      logger.info(`Adding ${entriesToAdd.length} prioritized URLs from section "${section}"`, 'AdvancedCrawlerEngine');
      
      // Add entries with high priority
      for (const entry of entriesToAdd) {
        // Calculate depth for sitemap URL
        let initialDepth = entry.calculatedDepth !== undefined ? entry.calculatedDepth : 0;
        
        // Add URL to queue
        queueManager.addUrl(entry.url, initialDepth, source.baseUrl, true);
      }
    }
  }
  
  /**
   * Track coverage by section
   * @param url URL to track
   * @param baseUrl Base URL of the site
   */
  private trackSectionCoverage(url: string, baseUrl: string): void {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Extract section from path
      const pathSegments = path.split('/').filter(Boolean);
      const section = pathSegments[0] || '_root';
      
      // Update section coverage
      const count = this.stats.sectionCoverage.get(section) || 0;
      this.stats.sectionCoverage.set(section, count + 1);
    } catch (error) {
      // Skip tracking if URL is invalid
    }
  }
  
  /**
   * Cancel the crawling process
   */
  cancel(): void {
    this.isCancelled = true;
    logger.info('Crawling cancellation requested', 'AdvancedCrawlerEngine');
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
    config: AdvancedCrawlerConfig,
    queueManager: QueueManager
  ): Promise<void> {
    logger.info(`Processing URL: ${url} (depth: ${depth}, parent: ${parentUrl})`, 'AdvancedCrawlerEngine');
    
    // Check if URL was already visited (protection against cycles)
    if (this.visited.has(url)) {
      logger.debug(`URL already visited: ${url}`, 'AdvancedCrawlerEngine');
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
        logger.debug(`Skipping non-HTML content: ${url} (${metadata.contentType})`, 'AdvancedCrawlerEngine');
        queueManager.markVisited(url, depth);
        return;
      }
      
      // Process content using content processor
      let processedContent = this.contentProcessor.processContent(content, url);
      
      // Ensure processedContent has valid structure even if extraction failed
      if (!processedContent || !processedContent.textContent) {
        logger.warn(`Content extraction failed for ${url}, using fallback content`, 'AdvancedCrawlerEngine');
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
        logger.debug(`Storing document for ${url} (${document.textContent.length} chars)`, 'AdvancedCrawlerEngine');
        await this.storageManager.storeDocument(document, {
          overwrite: !!config.force
        }).catch(err => logger.error(`Error storing document: ${err}`, 'AdvancedCrawlerEngine'));
      } else {
        logger.warn(`Not storing document for ${url} due to insufficient content`, 'AdvancedCrawlerEngine');
      }
      
      // Extract links for further crawling
      const links = this.urlProcessor.extractLinks(content, url);
      logger.debug(`Extracted ${links.length} links from ${url}`, 'AdvancedCrawlerEngine');
      
      // Add discovered links to queue using the improved depth calculation
      let newLinksCount = 0;
      for (const link of links) {
        // Use improved depth calculation from parent relationship
        logger.debug(`Processing link: ${link} from parent: ${url}`, 'AdvancedCrawlerEngine');
        
        // Calculate proper depth from parent
        const childDepth = this.urlProcessor.calculateCrawlDepthFromParent(
          link, 
          url, 
          depth,
          source.baseUrl
        );
        
        // Process URL through the URL processor
        logger.debug(`Calculated depth for ${link}: ${childDepth}`, 'AdvancedCrawlerEngine');
        
        // Apply include/exclude patterns
        const includePatterns = config.includePatterns || source.crawlConfig.includePatterns;
        const excludePatterns = config.excludePatterns || source.crawlConfig.excludePatterns;
        
        // Process URL with patterns applied
        const processedUrl = this.urlProcessor.processUrl(
          link,
          source,
          url,
          childDepth
        );
        
        // Additional filtering using advanced include/exclude logic
        const shouldInclude = !includePatterns || includePatterns.length === 0 || 
          includePatterns.some(pattern => {
            try {
              const regex = new RegExp(pattern);
              return regex.test(link);
            } catch (error) {
              return false;
            }
          });
        
        const shouldExclude = excludePatterns && excludePatterns.length > 0 && 
          excludePatterns.some(pattern => {
            try {
              const regex = new RegExp(pattern);
              return regex.test(link);
            } catch (error) {
              return false;
            }
          });
        
        // Add to queue if it passes all filters
        if (processedUrl.accepted && shouldInclude && !shouldExclude) {
          logger.info(`Adding link: ${processedUrl.url} (depth: ${childDepth}, parent: ${url})`, 'AdvancedCrawlerEngine');
          
          // Use actual calculated depth
          if (queueManager.addUrl(processedUrl.url, childDepth, url)) {
            newLinksCount++;
          }
        }
      }
      
      if (newLinksCount > 0) {
        logger.info(`Added ${newLinksCount} new links from ${url}`, 'AdvancedCrawlerEngine');
      }
      
      // Mark URL as visited in the queue manager
      queueManager.markVisited(url, depth);
    } catch (error) {
      logger.warn(`Error processing URL ${url}: ${error}`, 'AdvancedCrawlerEngine');
      
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
    config: AdvancedCrawlerConfig
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
      logger.info(`Successfully fetched ${url} (${response.body.length} bytes, content-type: ${contentType})`, 'AdvancedCrawlerEngine');
      
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
      logger.warn(`Error fetching ${url}: ${error}`, 'AdvancedCrawlerEngine');
      
      // Re-throw to let the caller handle it
      throw error;
    }
  }
  
  /**
   * Fetch a URL with automatic retry on failure
   * @param url URL to fetch
   * @param config Crawler configuration
   * @returns Page content and metadata
   */
  private async fetchWithRetry(
    url: string,
    config: AdvancedCrawlerConfig
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }> {
    // Get max retries from config or use default
    const maxRetries = config.maxRetries || 3;
    let lastError: Error | null = null;
    
    logger.debug(`Fetching ${url} with max ${maxRetries} retries`, 'AdvancedCrawlerEngine.fetchWithRetry');
    
    // Try fetching with retries
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`Retry attempt ${attempt}/${maxRetries} for ${url}`, 'AdvancedCrawlerEngine.fetchWithRetry');
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
        logger.warn(`Fetch attempt ${attempt + 1}/${maxRetries} failed for ${url}: ${lastError.message}`, 'AdvancedCrawlerEngine.fetchWithRetry');
        
        if (attempt < maxRetries - 1) {
          // Calculate backoff delay with jitter to prevent thundering herd
          const baseDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
          const jitter = Math.random() * 1000; // Random jitter up to 1 second
          const delay = baseDelay + jitter;
          
          logger.debug(`Waiting ${delay.toFixed(0)}ms before retry ${attempt + 1}`, 'AdvancedCrawlerEngine.fetchWithRetry');
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
    const event = {
      type,
      timestamp: new Date(),
      data
    };
    
    this.eventEmitter.emit(type, event);
    this.eventEmitter.emit('event', event);
  }
}