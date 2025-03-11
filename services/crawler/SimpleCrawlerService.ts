/**
 * SimpleCrawlerService
 * 
 * Adapter that integrates the SimpleCrawler implementation with the ICrawlerService 
 * interface used by the MCP handlers. This provides compatibility with the existing
 * tool handlers while using the simplified crawler implementation.
 */

import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import { SimpleCrawler } from './SimpleCrawler.js';
import { 
  ICrawlerService, 
  CrawlJobSettings, 
  CrawlJobStatus, 
  JobStatusType 
} from './domain/CrawlerService.js';
import { IDocumentRepository } from '../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../shared/domain/repositories/DocumentSourceRepository.js';
import { Document, DocumentSource } from '../../shared/domain/models/Document.js';

/**
 * Simple in-memory document storage implementation that adapts DocumentRepository
 */
class CrawlerDocumentStorage {
  constructor(private documentRepository: IDocumentRepository) {}
  
  async saveDocument(document: Document): Promise<boolean> {
    try {
      await this.documentRepository.save(document);
      return true;
    } catch (error) {
      console.error(`Error saving document: ${error}`);
      return false;
    }
  }
  
  async documentExists(url: string): Promise<boolean> {
    try {
      const doc = await this.documentRepository.findByUrl(url);
      return !!doc;
    } catch (error) {
      console.error(`Error checking document existence: ${error}`);
      return false;
    }
  }
}

/**
 * Job tracking interface for SimpleCrawlerService
 */
interface JobInfo {
  id: string;
  sourceId: string;
  settings: CrawlJobSettings;
  status: JobStatusType;
  startTime: Date;
  endTime?: Date;
  progress: {
    pagesCrawled: number;
    pagesDiscovered: number;
    pagesInQueue: number;
    maxDepthReached: number;
  };
  crawler?: SimpleCrawler;
  error?: string;
}

/**
 * SimpleCrawlerService implements ICrawlerService to provide compatibility
 * with the existing MCP handlers while using the simplified crawler implementation.
 */
export class SimpleCrawlerService implements ICrawlerService {
  private eventEmitter = new EventEmitter();
  private jobs = new Map<string, JobInfo>();
  private documentStorage: CrawlerDocumentStorage;
  
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly sourceRepository: IDocumentSourceRepository
  ) {
    this.documentStorage = new CrawlerDocumentStorage(documentRepository);
    
    // Set higher limit for event listeners to handle multiple crawl jobs
    this.eventEmitter.setMaxListeners(50);
  }
  
  /**
   * Start a new crawl job
   */
  async startCrawlJob(settings: CrawlJobSettings): Promise<string> {
    console.log(`Starting crawl job for source: ${settings.sourceId}`);
    
    // Generate job ID if not provided
    const jobId = settings.jobId || uuidv4();
    
    // Get source from repository
    const source = await this.sourceRepository.findById(settings.sourceId);
    if (!source) {
      throw new Error(`Source ${settings.sourceId} not found`);
    }
    
    // Create job info
    const jobInfo: JobInfo = {
      id: jobId,
      sourceId: settings.sourceId,
      settings,
      status: 'pending',
      startTime: new Date(),
      progress: {
        pagesCrawled: 0,
        pagesDiscovered: 0,
        pagesInQueue: 0,
        maxDepthReached: 0
      }
    };
    
    // Store job info
    this.jobs.set(jobId, jobInfo);
    
    // Start crawler in background
    this.doCrawl(jobId, source, settings).catch(error => {
      console.error(`Error in crawl job ${jobId}:`, error);
      
      // Update job status
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.endTime = new Date();
        job.error = error instanceof Error ? error.message : String(error);
      }
    });
    
    return jobId;
  }
  
  /**
   * Get crawl job status
   */
  async getCrawlJobStatus(jobId: string): Promise<CrawlJobStatus> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    return {
      jobId: job.id,
      sourceId: job.sourceId,
      status: job.status,
      startTime: job.startTime,
      endTime: job.endTime,
      progress: job.progress,
      error: job.error
    };
  }
  
  /**
   * Cancel a crawl job
   */
  async cancelCrawlJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }
    
    // Cancel crawler if running
    if (job.crawler) {
      job.crawler.stop();
    }
    
    // Update job status
    job.status = 'canceled';
    job.endTime = new Date();
    
    return true;
  }
  
  /**
   * Get the event emitter for crawler events
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Perform the actual crawling process
   */
  private async doCrawl(
    jobId: string, 
    source: DocumentSource, 
    settings: CrawlJobSettings
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    // Update job status
    job.status = 'running';
    
    try {
      // Create crawler instance
      const crawler = new SimpleCrawler(this.documentStorage, {
        baseUrl: source.baseUrl,
        maxDepth: settings.maxDepth ?? source.crawlConfig.maxDepth,
        maxPages: settings.maxPages ?? source.crawlConfig.maxPages,
        requestDelay: source.crawlConfig.crawlDelay,
        concurrency: settings.pagePrioritization?.concurrency || 2,
        includePatterns: source.crawlConfig.includePatterns,
        force: settings.force || false,
        excludePatterns: source.crawlConfig.excludePatterns
      });
      
      // Store crawler instance for potential cancellation
      job.crawler = crawler;
      
      // Setup event handlers
      crawler.on('start', (data) => {
        this.eventEmitter.emit('crawl-started', {
          jobId,
          sourceId: source.id,
          timestamp: new Date(),
          data
        });
      });
      
      crawler.on('processing', (data) => {
        // Update in-queue count
        if (job) {
          job.progress.pagesInQueue = crawler.getStatus().discovered - 
                                     crawler.getStatus().processed;
        }
        
        // Emit page discovered event
        this.eventEmitter.emit('page-discovered', {
          jobId,
          sourceId: source.id,
          timestamp: new Date(),
          data: {
            url: data.url,
            depth: data.depth,
            parentUrl: data.parentUrl || ''
          }
        });
      });
      
      crawler.on('document', (data) => {
        // Update crawled count
        if (job) {
          job.progress.pagesCrawled = crawler.getStatus().succeeded;
        }
      });
      
      // Start crawling
      const result = await crawler.start();
      
      // Update job status and progress
      job.status = 'completed';
      job.endTime = new Date();
      job.progress.pagesCrawled = result.succeeded;
      job.progress.pagesDiscovered = result.discovered;
      job.progress.pagesInQueue = 0;
      
      // Calculate max depth reached - this may be approximate
      // If we have succeeded items, assume we reached the configured depth
      if (result.succeeded > 0) {
        const maxConfiguredDepth = settings.maxDepth ?? source.crawlConfig.maxDepth;
        // Heuristic: use min of configured depth and actual crawl status
        job.progress.maxDepthReached = Math.min(maxConfiguredDepth, crawler.getStatus().processed > 0 ? maxConfiguredDepth : 0);
      }
      
      // Emit job completed event
      this.eventEmitter.emit('job-completed', {
        jobId,
        sourceId: source.id,
        timestamp: new Date(),
        data: {
          pagesCrawled: result.succeeded,
          pagesDiscovered: result.discovered,
          totalTime: result.endTime ? 
            result.endTime.getTime() - result.startTime.getTime() : 0,
          success: true
        }
      });
      
      // Update source lastCrawledAt
      source.lastCrawledAt = new Date();
      await this.sourceRepository.save(source);
      
      console.log(`Crawl job ${jobId} completed: ${result.succeeded} pages crawled, ` +
                  `${result.discovered} discovered`);
      
    } catch (error) {
      // Update job status
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error instanceof Error ? error.message : String(error);
      
      // Emit job completed event with error
      this.eventEmitter.emit('job-completed', {
        jobId,
        sourceId: source.id,
        timestamp: new Date(),
        data: {
          pagesCrawled: job.progress.pagesCrawled,
          pagesDiscovered: job.progress.pagesDiscovered,
          totalTime: job.endTime.getTime() - job.startTime.getTime(),
          success: false,
          error: job.error
        }
      });
      
      throw error;
    }
  }
}