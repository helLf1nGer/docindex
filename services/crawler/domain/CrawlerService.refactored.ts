/**
 * Refactored CrawlerService for the DocSI system
 * 
 * This service has been refactored to use separate components for job management,
 * content processing, URL processing, and storage, improving separation of concerns
 * and maintainability while fixing crawl depth issues.
 */

import EventEmitter from 'events';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { JobManager } from './JobManager.js';
import { ContentProcessor } from './ContentProcessor.js';
import { StorageManager } from './StorageManager.js';
import { UrlProcessor } from './UrlProcessor.js';
import { CrawlerEngine } from './CrawlerEngine.js';

const logger = getLogger();

/**
 * Interface for settings of a crawler job
 */
export interface CrawlJobSettings {
  /** ID of the documentation source to crawl */
  sourceId: string;
  
  /** Optional maximum depth to crawl (overrides source config) */
  maxDepth?: number;
  
  /** Optional maximum pages to crawl (overrides source config) */
  maxPages?: number;
  
  /** Optional force flag to recrawl pages already indexed */
  force?: boolean;
  
  /** Optional job ID */
  jobId?: string;
  
  /** Optional page prioritization configuration */
  pagePrioritization?: {
    /** Crawl strategy (breadth-first, depth-first, or hybrid) */
    strategy: 'breadth' | 'depth' | 'hybrid';
    
    /** URL or title patterns to prioritize */
    patterns: string[];
    
    /** Number of concurrent requests */
    concurrency: number;
  };
}

/**
 * Status of a crawl job
 */
export type JobStatusType = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

/**
 * Interface for crawler events payload
 */
export interface CrawlerEventPayload {
  /** Job ID */
  jobId: string;
  
  /** Source ID */
  sourceId: string;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Additional event data */
  data: any;
}

export interface CrawlJobStatus {
  /** Job ID */
  jobId: string;
  
  /** Source ID */
  sourceId: string;
  
  /** Current status */
  status: JobStatusType;
  
  /** Start time */
  startTime?: Date;
  
  /** End time */
  endTime?: Date;
  
  /** Current progress */
  progress: {
    /** Number of pages crawled */
    pagesCrawled: number;
    
    /** Number of pages discovered */
    pagesDiscovered: number;
    
    /** Number of pages in queue */
    pagesInQueue: number;
    
    /** Max depth reached */
    maxDepthReached: number;
  };
  
  /** Error message if the job failed */
  error?: string;
}

/**
 * Interface for the crawler service
 */
export interface ICrawlerService {
  /**
   * Start a new crawl job for a documentation source
   * @param settings Settings for the crawl job
   * @returns Promise that resolves to the job ID
   */
  startCrawlJob(settings: CrawlJobSettings): Promise<string>;
  
  /**
   * Get the status of a crawl job
   * @param jobId ID of the job to get status for
   * @returns Promise that resolves to the job status
   */
  getCrawlJobStatus(jobId: string): Promise<CrawlJobStatus>;
  
  /**
   * Cancel a running crawl job
   * @param jobId ID of the job to cancel
   * @returns Promise that resolves to true if the job was canceled
   */
  cancelCrawlJob(jobId: string): Promise<boolean>;
  
  /**
   * Get the event emitter for crawler events
   * This allows other services to subscribe to crawler events
   */
  getEventEmitter(): EventEmitter;
}

/**
 * Refactored implementation of the crawler service
 * Using separate components for job management, queue management, content processing, and storage
 */
export class CrawlerService implements ICrawlerService {
  private eventEmitter = new EventEmitter();
  
  // Component instances
  private jobManager: JobManager;
  private contentProcessor: ContentProcessor;
  private storageManager: StorageManager;
  private urlProcessor: UrlProcessor;
  private crawlerEngine: CrawlerEngine;
  
  // Active crawl engines by job ID
  private activeEngines = new Map<string, CrawlerEngine>();
  
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
    this.crawlerEngine = new CrawlerEngine(
      httpClient,
      this.contentProcessor,
      this.storageManager,
      this.urlProcessor
    );
    
    // Forward events from components to the crawler service event emitter
    this.jobManager.getEventEmitter().on('job-completed', (event) => {
      this.eventEmitter.emit('job-completed', event);
    });
    
    this.storageManager.getEventEmitter().on('document-stored', (event) => {
      this.eventEmitter.emit('document-stored', event);
    });
    
    logger.info('CrawlerService initialized with component architecture', 'CrawlerService');
  }
  
  /**
   * Start a new crawl job for a documentation source
   * @param settings Settings for the crawl job
   * @returns Promise that resolves to the job ID
   */
  async startCrawlJob(settings: CrawlJobSettings): Promise<string> {
    logger.info(`Starting crawl job for source: ${settings.sourceId}`, 'CrawlerService');
    
    // Create job using job manager
    const { jobId, status } = this.jobManager.createJob(settings);
    
    // Start crawling in the background
    this.doCrawl(jobId, settings).catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in crawl job ${jobId}:`, 'CrawlerService', error);
      
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
    logger.info(`Canceling crawl job: ${jobId}`, 'CrawlerService');
    
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
   * Perform the actual crawling process
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
      
      // Create a new crawler engine for this job
      const engine = new CrawlerEngine(
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
      
      engine.getEventEmitter().on('page-crawled', () => {
        // Update crawled count in job manager
        const stats = this.jobManager.getJobStatus(jobId);
        this.jobManager.updateJobProgress(jobId, {
          pagesCrawled: (stats.progress.pagesCrawled || 0) + 1
        });
      });
      
      // Determine crawl configuration
      const config = {
        maxDepth: settings.maxDepth ?? source.crawlConfig.maxDepth,
        maxPages: settings.maxPages ?? source.crawlConfig.maxPages,
        force: settings.force,
        crawlDelay: source.crawlConfig.crawlDelay,
        strategy: settings.pagePrioritization?.strategy || 'hybrid',
        prioritizationPatterns: settings.pagePrioritization?.patterns || [],
        concurrency: settings.pagePrioritization?.concurrency || 1, // Default to 1 if not specified
        debug: true // Enable detailed logging
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
        `Crawl job ${jobId} completed: ${result.pagesCrawled} pages crawled, ` +
        `${result.pagesDiscovered} discovered, max depth ${result.maxDepthReached}, ` +
        `runtime: ${result.runtime}ms`,
        'CrawlerService'
      );
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