import { EventEmitter } from 'events';
import { Browser } from 'playwright';
import { SimpleCrawler, DocumentStorage as SimpleCrawlerDocumentStorage, CrawlStatus as SimpleCrawlerCrawlStatus } from './SimpleCrawler.js'; // Import SimpleCrawler types
import { BrowserCrawler } from './BrowserCrawler.js';
import { IDocumentRepository } from '../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../shared/domain/repositories/DocumentSourceRepository.js';
import { Document, DocumentSource } from '../../shared/domain/models/Document.js';
import { getLogger, Logger } from '../../shared/infrastructure/logging.js';
import {
  ICrawlerService,
  CrawlJobSettings,
  CrawlJobStatus,
  JobStatusType,
  JobCompletedEvent
} from './domain/CrawlerService.js';
import { SourceNotFoundError, isDocsiError, DocsiError, CrawlError } from '../../shared/domain/errors.js'; // Import custom errors
import { v4 as uuidv4 } from 'uuid';

// Local interface for internal job tracking
interface JobInfo {
  id: string;
  sourceId: string;
  settings: CrawlJobSettings; // Use imported type
  status: JobStatusType; // Use imported type
  startTime: Date;
  endTime?: Date;
  progress: {
    pagesCrawled: number;
    pagesDiscovered: number;
    pagesInQueue: number;
    maxDepthReached: number;
  };
  crawler?: SimpleCrawler | BrowserCrawler;
  error?: string;
}

export class SimpleCrawlerService implements ICrawlerService {
  private eventEmitter = new EventEmitter();
  private jobs = new Map<string, JobInfo>();
  private documentRepository: IDocumentRepository;
  private sourceRepository: IDocumentSourceRepository;
  private browser: Browser;
  private logger: Logger;

  constructor(
    documentRepository: IDocumentRepository,
    sourceRepository: IDocumentSourceRepository,
    browser: Browser,
    logger: Logger // Inject logger
  ) {
    this.documentRepository = documentRepository;
    this.sourceRepository = sourceRepository;
    this.browser = browser;
    this.logger = logger; // Assign injected logger
    this.eventEmitter.setMaxListeners(50);
  }

  /**
   * Start a new crawl job
   */
  async startCrawlJob(settings: CrawlJobSettings): Promise<string> { // Use imported type
    const jobId = settings.jobId || uuidv4(); // Use imported type property
    this.logger.info(`Starting crawl job ${jobId} for source: ${settings.sourceId}`, 'SimpleCrawlerService'); // Add context

    let source: DocumentSource | null = null;
    try {
        source = await this.sourceRepository.findById(settings.sourceId);
    } catch (error) {
        this.logger.error(`Error fetching source ${settings.sourceId}`, 'SimpleCrawlerService.startCrawlJob', error);
        throw new DocsiError(`Failed to fetch source: ${settings.sourceId}`, 'SOURCE_FETCH_ERROR', { originalError: error });
    }

    if (!source) {
      this.logger.warn(`Source ${settings.sourceId} not found`, 'SimpleCrawlerService.startCrawlJob');
      throw new SourceNotFoundError(settings.sourceId);
    }

    const jobInfo: JobInfo = { // Use local JobInfo
      id: jobId,
      sourceId: settings.sourceId,
      settings,
      status: 'pending', // Use JobStatusType value
      startTime: new Date(),
      progress: {
        pagesCrawled: 0,
        pagesDiscovered: 0,
        pagesInQueue: 0,
        maxDepthReached: 0
      }
    };

    this.jobs.set(jobId, jobInfo);

    // Start crawling in the background
    this.doCrawl(jobId, source, settings).catch(error => {
      // Use logger.error directly
      this.logger.error(`Error in crawl job ${jobId}`, 'SimpleCrawlerService.startCrawlJob.catch', error instanceof Error ? error : new Error(String(error)));

      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed'; // Use JobStatusType value
        job.endTime = new Date();
        job.error = error instanceof Error ? error.message : String(error);
      }
    });

    return jobId;
  }

  /**
   * Get crawl job status
   */
  async getCrawlJobStatus(jobId: string): Promise<CrawlJobStatus> { // Return imported type
    const job = this.jobs.get(jobId);
    if (!job) {
      // Consider a specific JobNotFoundError if needed, for now use DocsiError
      throw new DocsiError(`Job ${jobId} not found`, 'JOB_NOT_FOUND');
    }

    // Return structure matching imported CrawlJobStatus
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

    if (job.crawler) {
      if (job.crawler instanceof SimpleCrawler) {
        job.crawler.stop();
      } else if (job.crawler instanceof BrowserCrawler) {
        this.logger.warn(`Stopping BrowserCrawler instance ${jobId} might require manual intervention or context closing.`, 'SimpleCrawlerService'); // Add context
        await job.crawler.stop(); // Assuming stop exists and is async
      }
    }

    // Update job status
    job.status = 'canceled'; // Use JobStatusType value
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
    settings: CrawlJobSettings // Use imported type
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      this.logger.error(`Job ${jobId} not found during doCrawl`, 'SimpleCrawlerService.doCrawl');
      // This should ideally not happen if startCrawlJob succeeded, but handle defensively
      throw new DocsiError(`Job ${jobId} not found during crawl execution`, 'JOB_NOT_FOUND');
    }

    job.status = 'running'; // Use JobStatusType value

    try {
      if (settings.strategy === 'browser') {
        // Use BrowserCrawler
        const crawler = new BrowserCrawler(
          this.browser,
          { // Options for BrowserCrawler
            baseUrl: source.baseUrl, // REQUIRED
            maxDepth: settings.maxDepth ?? source.crawlConfig.maxDepth, // REQUIRED (or default)
            maxPages: settings.maxPages ?? source.crawlConfig.maxPages, // REQUIRED (or default)
            force: settings.force,
            concurrency: settings.pagePrioritization?.concurrency, // Use imported type property
            crawlDelay: source.crawlConfig.crawlDelay,
            debug: settings.debug, // Use imported type property
            // Pass other relevant settings
            useSitemaps: settings.useSitemaps,
            maxRetries: settings.maxRetries,
            // strategy: settings.pagePrioritization?.strategy, // Pass if needed by BrowserCrawlerOptions
            // prioritizationPatterns: settings.pagePrioritization?.patterns, // Pass if needed
          },
          this.logger,
          this.documentRepository
        );
        job.crawler = crawler;

        // Setup event listeners for BrowserCrawler, relaying to service emitter
        crawler.on('start', (data) => {
          this.logger.debug(`[BrowserCrawler Event] start: ${JSON.stringify(data)}`, 'SimpleCrawlerService');
          this.eventEmitter.emit('crawl-started', { jobId, sourceId: source.id, timestamp: new Date(), data });
        });

        crawler.on('processing', (data: { url: string, depth: number, parentUrl?: string }) => {
          this.logger.debug(`[BrowserCrawler Event] processing: ${data.url}`, 'SimpleCrawlerService');
          if (job) {
            // Update progress if BrowserCrawler provides queue status, otherwise estimate
            // job.progress.pagesInQueue = crawler.getStatus().discovered - crawler.getStatus().processed; // Example if getStatus exists
          }
          this.eventEmitter.emit('page-discovered', { jobId, sourceId: source.id, timestamp: new Date(), data: { url: data.url, depth: data.depth, parentUrl: data.parentUrl || '' } });
        });

        crawler.on('document', (data: { url: string, documentId: string, success: boolean }) => {
           this.logger.debug(`[BrowserCrawler Event] document: ${data.url} (Success: ${data.success})`, 'SimpleCrawlerService');
           if (job && data.success) {
             job.progress.pagesCrawled++; // Increment crawled count on success
           }
           // Optionally emit 'page-crawled' or similar event here if needed downstream
           this.eventEmitter.emit('document-processed', { jobId, sourceId: source.id, timestamp: new Date(), data });
        });

        crawler.on('error', (eventData: { jobId: string | null, url?: string, message: string, error: any }) => {
            this.logger.error(`[BrowserCrawler Event] error: ${eventData.message}`, 'SimpleCrawlerService', eventData.error);
            if (eventData.jobId === jobId && job.status === 'running') {
                job.status = 'failed'; // Mark job as failed on crawler error
                job.endTime = new Date();
                job.error = eventData.message || String(eventData.error);
                // Emit a specific error event if needed, or rely on job-completed(success=false)
                this.eventEmitter.emit('crawl-error', { jobId, sourceId: source.id, timestamp: new Date(), data: { url: eventData.url, message: job.error } });
            }
        });

        crawler.on('complete', (eventData: { jobId: string | null, totalProcessed: number, success: boolean, error?: string }) => {
            this.logger.info(`[BrowserCrawler Event] complete: Job ${eventData.jobId}, Success: ${eventData.success}`, 'SimpleCrawlerService');
            if (eventData.jobId === jobId && job.status === 'running') { // Check jobId and status
                job.status = eventData.success ? 'completed' : 'failed';
                job.endTime = new Date();
                job.progress.pagesCrawled = eventData.totalProcessed; // Assuming totalProcessed is pagesCrawled
                job.progress.pagesInQueue = 0; // Queue should be empty on completion
                if (!eventData.success) {
                    job.error = eventData.error || 'BrowserCrawler finished with an unspecified error.';
                }

                // Emit job completed event *after* updating job status
                this.eventEmitter.emit('job-completed', {
                  jobId,
                  sourceId: source.id,
                  timestamp: new Date(),
                  data: {
                    pagesCrawled: job.progress.pagesCrawled,
                    pagesDiscovered: job.progress.pagesDiscovered, // Might need update if BrowserCrawler tracks this
                    totalTime: job.endTime ? job.endTime.getTime() - job.startTime.getTime() : 0,
                    success: eventData.success,
                    error: job.error // Include error message if failed
                  }
                });
            }
        });

        await crawler.start(source.baseUrl, jobId); // Pass jobId

      } else {
        // Use SimpleCrawler
        const crawler = new SimpleCrawler(
          // Adapt IDocumentRepository to the DocumentStorage interface
          {
              saveDocument: (doc: Document): Promise<boolean> => {
                // DEBUG LOG: Log received document data before repository save
                this.logger.debug(`[SimpleCrawlerService Adapter] Received document data for URL: ${doc.url}, Content length: ${doc.content?.length}, Is content undefined?: ${doc.content === undefined}`, 'SimpleCrawlerService');
                // Log the document before saving
                this.logger.debug(`[SimpleCrawlerService] Saving document via adapter: ${JSON.stringify(doc, null, 2)}`, 'SimpleCrawlerService');
                this.logger.debug(`[SimpleCrawlerService Adapter] Attempting to save document ID: ${doc?.id || 'MISSING_ID'} via documentRepository.save()`, 'SimpleCrawlerService');
                return this.documentRepository.save(doc)
                  .then(() => {
                    this.logger.debug(`[SimpleCrawlerService Adapter] Successfully saved document ID: ${doc?.id || 'MISSING_ID'}`, 'SimpleCrawlerService');
                    return true;
                  })
                  .catch((err: unknown) => { // Define err parameter
                    this.logger.error(`[SimpleCrawlerService Adapter] FAILED to save document (ID: ${doc?.id || 'MISSING_ID'})`, 'SimpleCrawlerService', err); // Log error, remove doc.id reference
                    return false;
                  });
              },
              documentExists: (url: string): Promise<boolean> => this.documentRepository.findByUrl(url).then(doc => !!doc)
          } as SimpleCrawlerDocumentStorage, // Use imported type alias
          { // Options for SimpleCrawler
            baseUrl: source.baseUrl,
            maxDepth: settings.maxDepth ?? source.crawlConfig.maxDepth,
            maxPages: settings.maxPages ?? source.crawlConfig.maxPages,
            requestDelay: source.crawlConfig.crawlDelay,
            concurrency: settings.pagePrioritization?.concurrency || 2, // Use imported type property
            includePatterns: source.crawlConfig.includePatterns,
            excludePatterns: source.crawlConfig.excludePatterns,
            force: settings.force ?? false,
            requestConfig: undefined, // Pass request config if available in CrawlJobSettings
            // Add any other options SimpleCrawler expects from CrawlOptions
          },
          this.logger // Pass logger to SimpleCrawler
        );
        job.crawler = crawler;

        // Setup event handlers for SimpleCrawler
        crawler.on('start', (data) => {
          this.eventEmitter.emit('crawl-started', { jobId, sourceId: source.id, timestamp: new Date(), data });
        });

        crawler.on('processing', (data) => {
          if (job) {
            const status = crawler.getStatus();
            job.progress.pagesInQueue = status.discovered - status.processed;
          }
          this.eventEmitter.emit('page-discovered', { jobId, sourceId: source.id, timestamp: new Date(), data: { url: data.url, depth: data.depth, parentUrl: data.parentUrl || '' } });
        });

        crawler.on('document', (data) => {
          if (job) {
            job.progress.pagesCrawled = crawler.getStatus().succeeded;
          }
           // Optionally emit 'page-crawled' or similar event here if needed downstream
        });

        crawler.on('complete', (status: SimpleCrawlerCrawlStatus) => { // Use imported type alias
          if (job && job.status === 'running') { // Check status before marking complete
            job.status = 'completed'; // Use JobStatusType value
            job.endTime = new Date();
            job.progress.pagesCrawled = status.succeeded || 0;
            job.progress.pagesDiscovered = status.discovered || 0;
            job.progress.pagesInQueue = 0;
            job.progress.maxDepthReached = status.processed > 0 ? (settings.maxDepth ?? source.crawlConfig.maxDepth) : 0; // Simplified heuristic

            // Emit job completed event *after* updating job status
            this.eventEmitter.emit('job-completed', {
              jobId,
              sourceId: source.id,
              timestamp: new Date(),
              data: {
                pagesCrawled: job.progress.pagesCrawled,
                pagesDiscovered: job.progress.pagesDiscovered,
                totalTime: job.endTime ? job.endTime.getTime() - job.startTime.getTime() : 0, // Add null check
                success: true
              }
            });
          }
        });

        // Start SimpleCrawler and wait for its completion status
        const simpleCrawlerResult = await crawler.start();

        // This block might be redundant if 'complete' event handles final status
        if (job.status === 'running') { // Check if not already completed/failed by event
            job.status = 'completed';
            job.endTime = new Date();
            job.progress.pagesCrawled = simpleCrawlerResult.succeeded;
            job.progress.pagesDiscovered = simpleCrawlerResult.discovered;
            job.progress.pagesInQueue = 0;
            job.progress.maxDepthReached = simpleCrawlerResult.processed > 0 ? (settings.maxDepth ?? source.crawlConfig.maxDepth) : 0; // Simplified heuristic
        }
      } // End of else block for SimpleCrawler

      // Common completion logic (only update source if job wasn't failed/canceled)
      if (job.status === 'completed') {
        source.lastCrawledAt = new Date();
        await this.sourceRepository.save(source);

        // Emit job completed event if not already emitted by SimpleCrawler's 'complete' handler
        // Check if endTime was set recently to avoid double emit (heuristic)
        const justCompleted = job.endTime && (Date.now() - job.endTime.getTime() < 1000);
        if (!justCompleted) {
             this.eventEmitter.emit('job-completed', {
               jobId,
               sourceId: source.id,
               timestamp: new Date(),
               data: {
                 pagesCrawled: job.progress.pagesCrawled,
                 pagesDiscovered: job.progress.pagesDiscovered,
                 totalTime: job.endTime ? job.endTime.getTime() - job.startTime.getTime() : 0, // Add null check
                 success: true
               }
             });
        }
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Unhandled error during doCrawl for job ${jobId}: ${errorMessage}`, 'SimpleCrawlerService.doCrawl.catch', error);
      // Ensure job status is marked as failed if an error occurs outside event handlers
      if (job.status === 'running') {
          job.status = 'failed';
          job.endTime = new Date();
          job.error = errorMessage;

          // Emit job completed event with error
          this.eventEmitter.emit('job-completed', {
            jobId,
            sourceId: source.id, // Use source.id here
            timestamp: new Date(),
            data: {
              pagesCrawled: job.progress.pagesCrawled,
              pagesDiscovered: job.progress.pagesDiscovered,
              totalTime: job.endTime ? job.endTime.getTime() - job.startTime.getTime() : 0, // Add null check
              success: false,
              error: job.error
            }
          });
      }
      // Do not re-throw here, as it's handled within the background process started by startCrawlJob
      // throw error;
    }
  }
}
