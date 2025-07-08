/**
 * Handler for the docsi-batch-crawl and docsi-batch-status tools
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { McpToolResponse } from '../tool-types.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { ICrawlerService, CrawlJobSettings } from '../../../services/crawler/domain/CrawlerService.js';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { EventEmitter } from 'events'; // Import EventEmitter

const logger = getLogger();

interface BatchCrawlArgs {
  sources: string[];
  depth?: number;
  pages?: number;
  strategy?: 'breadth' | 'depth' | 'hybrid';
  crawlMethod?: 'http' | 'browser';
  concurrency?: number;
  prioritize?: string[];
  timeout?: number;
  useSitemaps?: boolean;
  maxRetries?: number;
  force?: boolean;
  debug?: boolean;
}

interface BackgroundJob {
  id: string;
  sourceIds: string[];
  startTime: Date;
  crawlJobIds: Map<string, string>; // Map<sourceId, crawlJobId>
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    pagesCrawled: number;
    pagesDiscovered: number;
    maxDepthReached: number;
  };
  config: {
    depth: number;
    pages: number;
    strategy: string;
    crawlMethod: string;
    concurrency: number;
    prioritize: string[];
    useSitemaps: boolean;
    maxRetries: number;
    force: boolean;
    debug: boolean;
  };
}

export class BatchCrawlToolHandler extends BaseToolHandler {
  private crawlerService: ICrawlerService | null = null;
  private backgroundJobs: Map<string, BackgroundJob> = new Map(); // Map<batchJobId, BackgroundJob>

  constructor(
    private readonly sourceRepository: IDocumentSourceRepository,
    private readonly documentRepository: IDocumentRepository, // Add documentRepository back
    // Inject EventEmitter if crawlerService doesn't provide one reliably
    private readonly eventEmitter: EventEmitter
  ) {
    super();
    this.monitorBackgroundJobs();

    // Listen for completion events
    this.eventEmitter.on('crawl-job-completed', (event) => {
       logger.debug(`Received crawl-job-completed event: ${JSON.stringify(event)}`, 'BatchCrawlToolHandler');
       this.handleCrawlJobCompletion(event);
    });
     this.eventEmitter.on('crawl-job-failed', (event) => {
       logger.debug(`Received crawl-job-failed event: ${JSON.stringify(event)}`, 'BatchCrawlToolHandler');
       this.handleCrawlJobCompletion(event); // Treat failure same as completion for status update
    });
  }

  // Allow setting the crawler service post-construction (Dependency Injection)
  public setCrawlerService(service: ICrawlerService): void {
    this.crawlerService = service;
    logger.info('Crawler service set for BatchCrawlToolHandler.', 'BatchCrawlToolHandler');
  }

  public getDocumentRepository(): IDocumentRepository {
    return this.documentRepository;
  }

  public getSourceRepository(): IDocumentSourceRepository {
    return this.sourceRepository;
  }


  // No need to explicitly override protected methods if just calling super

  getToolDefinitions(): ToolDefinition[] {
    // Definitions omitted for brevity - assume they are correct
    return [
       {
        name: 'docsi-batch-crawl',
        description: 'Starts a background crawl job for specified sources.',
        inputSchema: {
          type: 'object',
          properties: {
            sources: { type: 'array', items: { type: 'string' }, description: 'Array of source names or ["all"].' },
            depth: { type: 'integer', default: 5 },
            pages: { type: 'integer', default: 500 },
            strategy: { type: 'string', enum: ['breadth', 'depth', 'hybrid'], default: 'hybrid' },
            crawlMethod: { type: 'string', enum: ['http', 'browser'], default: 'http' },
            concurrency: { type: 'integer', default: 2 },
            prioritize: { type: 'array', items: { type: 'string' } },
            timeout: { type: 'integer', default: 30 },
            useSitemaps: { type: 'boolean', default: true },
            maxRetries: { type: 'integer', default: 3 },
            force: { type: 'boolean', default: false },
            debug: { type: 'boolean', default: true }
          },
          required: ['sources']
        }
      },
      {
        name: 'docsi-batch-status',
        description: 'Gets the status of a background batch crawl job.',
        inputSchema: {
          type: 'object',
          properties: { jobId: { type: 'string', description: 'ID of the batch job.' } },
          required: ['jobId']
        }
      }
    ];
  }

  async handleToolCall(name: string, args: any): Promise<McpToolResponse> {
    if (name === 'docsi-batch-crawl') {
      return this.handleBatchCrawl(args as BatchCrawlArgs);
    } else if (name === 'docsi-batch-status') {
      return this.handleBatchStatus(args as { jobId: string });
    } else {
      return this.createErrorResponse(`BatchCrawlToolHandler cannot handle tool: ${name}`);
    }
  }

  private async handleBatchCrawl(args: BatchCrawlArgs): Promise<McpToolResponse> {
    if (!this.crawlerService) {
      return this.createErrorResponse('Crawler service is not available.');
    }

    try {
      const {
        depth = 5, pages = 500, strategy = 'hybrid', crawlMethod = 'http',
        concurrency = 2, prioritize = [], timeout = 30, useSitemaps = true,
        maxRetries = 3, force = false, debug = true
      } = args;

      let sourcesToCrawl: DocumentSource[];
      if (args.sources.includes('all')) {
        sourcesToCrawl = await this.sourceRepository.findAll();
      } else {
        const allSources = await this.sourceRepository.findAll();
        sourcesToCrawl = allSources.filter(s => args.sources.includes(s.name));
        if (sourcesToCrawl.length < args.sources.length) {
           const missing = args.sources.filter(n => !sourcesToCrawl.some(s => s.name === n));
           logger.warn(`Sources not found: ${missing.join(', ')}`, 'BatchCrawlToolHandler');
        }
      }

      if (sourcesToCrawl.length === 0) {
        return this.createErrorResponse('No valid sources found to crawl.');
      }

      const jobId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const job: BackgroundJob = {
        id: jobId,
        sourceIds: sourcesToCrawl.map(s => s.id),
        startTime: new Date(),
        crawlJobIds: new Map(),
        status: 'pending',
        progress: { pagesCrawled: 0, pagesDiscovered: 0, maxDepthReached: 0 },
        config: { depth, pages, strategy, crawlMethod, concurrency, prioritize, useSitemaps, maxRetries, force, debug }
      };
      this.backgroundJobs.set(jobId, job);

      // Start processing async *after* returning initial response
      setTimeout(() => {
        this.processBatchJob(jobId, sourcesToCrawl, job.config).catch(error => {
          logger.error(`Error processing batch job ${jobId}:`, 'BatchCrawlToolHandler', error);
          const failedJob = this.backgroundJobs.get(jobId);
          if (failedJob) failedJob.status = 'failed';
        });
      }, 0);

      const responseText = `Batch crawl job '${jobId}' started for sources: ${sourcesToCrawl.map(s => s.name).join(', ')}. Use docsi-batch-status to check progress.`;
      return this.createSuccessResponse(responseText);

    } catch (error) {
      logger.error('Error initiating batch crawl:', 'BatchCrawlToolHandler', error);
      return this.createStructuredErrorResponse(error);
    }
  }

  private async handleBatchStatus(args: { jobId: string }): Promise<McpToolResponse> {
     const { jobId } = args;
     const job = this.backgroundJobs.get(jobId);

     if (!job) {
       return this.createErrorResponse(`Batch job ${jobId} not found.`);
     }

     await this.updateBatchJobProgress(jobId); // Ensure progress is up-to-date
     const updatedJob = this.backgroundJobs.get(jobId)!;

     // Format status response (simplified)
     const statusText = `Job ID: ${updatedJob.id}\nStatus: ${updatedJob.status}\nStarted: ${updatedJob.startTime.toISOString()}\nCrawled: ${updatedJob.progress.pagesCrawled}\nDiscovered: ${updatedJob.progress.pagesDiscovered}`;
     return this.createSuccessResponse(statusText);
  }

  private async processBatchJob(jobId: string, sources: DocumentSource[], config: BackgroundJob['config']): Promise<void> {
    const job = this.backgroundJobs.get(jobId);
    if (!job || !this.crawlerService) return;

    job.status = 'running';
    logger.info(`Processing batch job ${jobId}...`, 'BatchCrawlToolHandler');

    for (const source of sources) {
      try {
        const settings: CrawlJobSettings = {
          sourceId: source.id,
          maxDepth: config.depth,
          maxPages: config.pages,
          strategy: config.crawlMethod as 'http' | 'browser' | 'simple' | undefined, // Use crawlMethod for fetch strategy
          pagePrioritization: {
             strategy: config.strategy as any, // Use config strategy for prioritization
             patterns: config.prioritize,
             concurrency: config.concurrency
          },
          useSitemaps: config.useSitemaps,
          maxRetries: config.maxRetries,
          force: config.force,
          debug: config.debug
        };
        const crawlJobId = await this.crawlerService.startCrawlJob(settings);
        job.crawlJobIds.set(source.id, crawlJobId);
        logger.info(`Started crawl job ${crawlJobId} for source ${source.name} (Batch: ${jobId})`, 'BatchCrawlToolHandler');
      } catch (error) {
        logger.error(`Failed to start crawl for source ${source.name} in batch ${jobId}:`, 'BatchCrawlToolHandler', error);
        // Optionally mark this source as failed within the batch
      }
    }
    // Completion logic now relies on event listeners
  }

  private handleCrawlJobCompletion(event: { jobId: string; sourceId: string; status: string; progress?: any }): void {
    logger.debug(`Handling completion/failure for crawl job ${event.jobId} (Source: ${event.sourceId}, Status: ${event.status})`, 'BatchCrawlToolHandler');
    for (const [batchJobId, batchJob] of this.backgroundJobs.entries()) {
      if (batchJob.crawlJobIds.get(event.sourceId) === event.jobId) {
        this.updateBatchJobProgress(batchJobId).catch(err => logger.error(`Error updating progress for batch ${batchJobId}`, 'BatchCrawlToolHandler', err));
        break; // Found the parent batch job
      }
    }
  }


  private async updateBatchJobProgress(jobId: string): Promise<void> {
    const job = this.backgroundJobs.get(jobId);
    if (!job || !this.crawlerService || job.status === 'completed' || job.status === 'failed') return;

    let totalPagesCrawled = 0;
    let totalPagesDiscovered = 0;
    let maxDepthReached = 0;
    let allSubJobsDone = true; // Assume done until proven otherwise
    let anySubJobFailed = false;

    for (const crawlJobId of job.crawlJobIds.values()) {
      try {
        const status = await this.crawlerService.getCrawlJobStatus(crawlJobId);
        totalPagesCrawled += status.progress?.pagesCrawled || 0;
        totalPagesDiscovered += status.progress?.pagesDiscovered || 0;
        maxDepthReached = Math.max(maxDepthReached, status.progress?.maxDepthReached || 0);
        if (status.status !== 'completed' && status.status !== 'failed' && status.status !== 'canceled') {
           allSubJobsDone = false;
        }
        if (status.status === 'failed') {
           anySubJobFailed = true;
        }
      } catch (error) {
        logger.warn(`Could not get status for crawl job ${crawlJobId}`, 'BatchCrawlToolHandler');
        allSubJobsDone = false; // Assume not done if status fails
      }
    }

    job.progress = { pagesCrawled: totalPagesCrawled, pagesDiscovered: totalPagesDiscovered, maxDepthReached };

    // Update overall batch status if all sub-jobs are finished
    if (allSubJobsDone && job.status === 'running') {
       job.status = anySubJobFailed ? 'failed' : 'completed';
       logger.info(`Batch job ${jobId} marked as ${job.status}.`, 'BatchCrawlToolHandler');
    }

    logger.debug(`Updated progress for batch job ${jobId}`, 'BatchCrawlToolHandler', job.progress);
  }

  private monitorBackgroundJobs(): void {
    // Simple cleanup, could be more robust
    setInterval(() => {
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      for (const [jobId, job] of this.backgroundJobs.entries()) {
        if (now - job.startTime.getTime() > maxAge) {
          this.backgroundJobs.delete(jobId);
          logger.info(`Removed expired batch job ${jobId}`, 'BatchCrawlToolHandler');
        }
      }
    }, 3600 * 1000); // Check hourly
  }
}