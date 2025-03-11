/**
 * Enhanced CrawlerService implementation
 * 
 * This service has been improved to use the AdvancedCrawlerEngine
 * with better sitemap processing, depth handling, and URL prioritization.
 */

import EventEmitter from 'events';
import { v4 as uuid } from 'uuid';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { JobManager } from './JobManager.js';
import { ContentProcessor } from './ContentProcessor.js';
import { StorageManager } from './StorageManager.js';
import { UrlProcessor } from './UrlProcessor.js';
import { AdvancedCrawlerEngine, AdvancedCrawlerConfig } from './AdvancedCrawlerEngine.js';
import { 
  CrawlJobSettings, 
  CrawlJobStatus, 
  ICrawlerService,
  JobStatusType
} from './CrawlerService.js';

const logger = getLogger();

/**
 * Enhanced implementation of the crawler service
 * Using the advanced crawler engine for better depth handling,
 * sitemap processing, and URL prioritization
 */
export class EnhancedCrawlerService implements ICrawlerService {
  private eventEmitter = new EventEmitter();
  
  // Component instances
  private jobManager: JobManager;
  private contentProcessor: ContentProcessor;
  private storageManager: StorageManager;
  private urlProcessor: UrlProcessor;
  
  // Active crawl engines by job ID
  private activeEngines = new Map<string, AdvancedCrawlerEngine>();
  
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly sourceRepository: IDocumentSourceRepository,
    private readonly httpClient: HttpClient
  ) {
    // Initialize components
    this.jobManager = new JobManager();
    this.contentProcessor = new ContentProcessor();
    this.storageManager = new StorageManager(documentRepository);
    this.urlProcessor = new UrlProcessor();
    
    // Forward events from components to the crawler service event emitter
    this.jobManager.getEventEmitter().on('job-completed', (event) => {
      this.eventEmitter.emit('job-completed', event);
    });
    
    this.storageManager.getEventEmitter().on('document-stored', (event) => {
      this.eventEmitter.emit('document-stored', event);
    });
    
    logger.info('EnhancedCrawlerService initialized with advanced component architecture', 'EnhancedCrawlerService');
  }
  
  /**
   * Start a new crawl job for a documentation source
   * @param settings Settings for the crawl job
   * @returns Promise that resolves to the job ID
   */
  async startCrawlJob(settings: CrawlJobSettings): Promise<string> {
    logger.info(`Starting enhanced crawl job for source: ${settings.sourceId}`, 'EnhancedCrawlerService');
    
    // Create job using job manager
    const jobId = settings.jobId || uuid();
    this.jobManager.createJob({
      ...settings,
      jobId
    });
    
    // Start crawling in the background
    this.doCrawl(jobId, settings).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in crawl job ${jobId}:`, 'EnhancedCrawlerService', error);
      
      // Mark job as failed
      this.jobManager.markJobAsCompleted(jobId, false, errorMessage);
    });
    
    return jobId;
  }
  
  /**
   * Get the status of a crawl job
   * @param jobId ID of the job to get status for
   * @returns Promise that resolves to the job status
   */
  async getCrawlJobStatus(jobId: string): Promise<CrawlJobStatus> {
    return this.jobManager.getJobStatus(jobId);
  }
  
  /**
   * Cancel a running crawl job
   * @param jobId ID of the job to cancel
   * @returns Promise that resolves to true if the job was canceled
   */
  async cancelCrawlJob(jobId: string): Promise<boolean> {
    logger.info(`Canceling enhanced crawl job: ${jobId}`, 'EnhancedCrawlerService');
    
    // Get crawler engine for this job
    const engine = this.activeEngines.get(jobId);
    if (engine) {
      // Cancel the crawler engine
      engine.cancel();
      
      // Remove engine from active engines
      this.activeEngines.delete(jobId);
    }
    
    // Cancel job through job manager
    return this.jobManager.cancelJob(jobId);
  }
  
  /**
   * Get the event emitter for crawler events
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Perform the actual crawling process with the enhanced crawler engine
   * @param jobId ID of the crawl job
   * @param settings Settings for the crawl job
   */
  private async doCrawl(jobId: string, settings: CrawlJobSettings): Promise<void> {
    // Update job status to running
    this.jobManager.markJobAsRunning(jobId);
    
    try {
      // Get the source from the repository
      const source = await this.sourceRepository.findById(settings.sourceId);
      if (!source) {
        throw new Error(`Source ${settings.sourceId} not found`);
      }
      
      // Create a new advanced crawler engine for this job
      const engine = new AdvancedCrawlerEngine(
        this.httpClient,
        this.contentProcessor,
        this.storageManager,
        this.urlProcessor
      );
      
      // Store engine for cancellation
      this.activeEngines.set(jobId, engine);
      
      // Forward engine events to job manager for progress updates
      engine.getEventEmitter().on('queue-stats-updated', (event) => {
        this.jobManager.updateJobProgress(jobId, {
          pagesInQueue: event.data.queued,
          maxDepthReached: event.data.maxDepthReached
        });
      });
      
      engine.getEventEmitter().on('page-crawled', (event) => {
        // Forward page-crawled event
        this.eventEmitter.emit('page-crawled', {
          jobId,
          sourceId: settings.sourceId,
          timestamp: new Date(),
          data: event.data
        });
        
        // Update crawled count in job manager
        const stats = this.jobManager.getJobStatus(jobId);
        this.jobManager.updateJobProgress(jobId, {
          pagesCrawled: (stats.progress.pagesCrawled || 0) + 1
        });
      });
      
      // Create crawler configuration
      const config: AdvancedCrawlerConfig = {
        // Core settings
        maxDepth: settings.maxDepth ?? source.crawlConfig.maxDepth,
        maxPages: settings.maxPages ?? source.crawlConfig.maxPages,
        force: settings.force,
        
        // Enhanced features
        useSitemaps: settings.useSitemaps !== undefined ? settings.useSitemaps : true, // Enable sitemaps by default
        maxRetries: settings.maxRetries || 3, // Default to 3 retries
        
        // Timing settings
        crawlDelay: source.crawlConfig.crawlDelay,
        
        // Crawl strategy configuration
        strategy: settings.pagePrioritization?.strategy || 'hybrid',
        prioritizationPatterns: settings.pagePrioritization?.patterns || [],
        concurrency: settings.pagePrioritization?.concurrency || 2, // Default to 2 for better performance
        
        // Advanced depth handling
        depthHandlingMode: 'adaptive', // Use adaptive depth mode for better site structure handling
        
        // Include/exclude patterns
        includePatterns: source.crawlConfig.includePatterns,
        excludePatterns: source.crawlConfig.excludePatterns,
        
        // Large doc site handling
        largeDocSiteOptions: {
          detectLargeSites: true,
          largeSiteThreshold: 500,
          maxUrlsPerSection: 50
        },
        
        // Sitemap processing options
        sitemapOptions: {
          followSitemapIndex: true,
          maxEntries: 1000,
          assignCustomDepth: true,
          depthCalculationMethod: 'hybrid'
        },
        
        // Debug mode
        debug: settings.debug || false
      };
      
      // Start the crawl
      const result = await engine.crawl(source, config);
      
      // Update job progress with final stats
      this.jobManager.updateJobProgress(jobId, {
        pagesCrawled: result.pagesCrawled,
        pagesDiscovered: result.pagesDiscovered,
        maxDepthReached: result.maxDepthReached
      });
      
      // Mark job as completed
      this.jobManager.markJobAsCompleted(jobId, true);
      
      // Remove engine from active engines
      this.activeEngines.delete(jobId);
      
      logger.info(
        `Enhanced crawl job ${jobId} completed: ${result.pagesCrawled} pages crawled, ` +
        `${result.pagesDiscovered} discovered, max depth ${result.maxDepthReached}, ` +
        `sitemap URLs: ${result.sitemapUrlsCrawled}/${result.sitemapUrlsDiscovered}, ` +
        `runtime: ${result.runtime}ms`,
        'EnhancedCrawlerService'
      );
      
      // Emit enhanced completion event with more detailed stats
      this.eventEmitter.emit('job-completed-enhanced', {
        jobId,
        sourceId: settings.sourceId,
        timestamp: new Date(),
        data: {
          pagesCrawled: result.pagesCrawled,
          pagesDiscovered: result.pagesDiscovered,
          maxDepthReached: result.maxDepthReached,
          runtime: result.runtime,
          sitemapStats: {
            discovered: result.sitemapUrlsDiscovered,
            crawled: result.sitemapUrlsCrawled
          },
          sectionCoverage: Object.fromEntries(result.sectionCoverage),
          depthDistribution: Object.fromEntries(result.urlsByDepth),
          errors: result.errors
        }
      });
    } catch (error: unknown) {
      // Remove engine from active engines
      this.activeEngines.delete(jobId);
      
      // Update job status to failed
      this.jobManager.markJobAsCompleted(
        jobId,
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      throw error;
    }
  }
}