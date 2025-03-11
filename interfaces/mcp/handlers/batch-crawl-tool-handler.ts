/**
 * Handler for the docsi-batch-crawl tool
 * 
 * This handler manages long-running background crawl jobs across multiple
 * documentation sources with advanced prioritization.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { McpToolResponse } from '../tool-types.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { ICrawlerService, CrawlJobSettings } from '../../../services/crawler/domain/CrawlerService.js';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';

/**
 * Arguments for the batch crawl tool
 */
interface BatchCrawlArgs {
  /** Array of source names or "all" to crawl all sources */
  sources: string[];
  
  /** Maximum crawl depth (default: 5) */
  depth?: number;
  
  /** Maximum pages per source (default: 500) */
  pages?: number;
  
  /** Crawl strategy (default: "hybrid") */
  strategy?: 'breadth' | 'depth' | 'hybrid';
  
  /** Number of concurrent requests per source (default: 5) */
  concurrency?: number;
  
  /** URL or title patterns to prioritize (regex patterns) */
  prioritize?: string[];

  /** Wait time for initial status report (default: 30 seconds) */
  timeout?: number;
  
  /** Use sitemap discovery for finding URLs (default: true) */
  useSitemaps?: boolean;
  
  /** Maximum number of retry attempts for failed requests (default: 3) */
  maxRetries?: number;
  
  /** Force crawling even if document exists (default: false) */
  force?: boolean;
  
  /** Enable debug mode for verbose logging (default: true) */
  debug?: boolean;
}

/**
 * Score assigned to a URL based on prioritization rules
 */
interface UrlScore {
  url: string;
  score: number;
  depth: number;
  parentUrl: string;
}

/**
 * Background job tracking
 */
interface BackgroundJob {
  /** Job ID */
  id: string;
  
  /** Source IDs being processed */
  sourceIds: string[];
  
  /** Start time */
  startTime: Date;
  
  /** Crawl job IDs mapped to source IDs */
  crawlJobIds: Map<string, string>;
  
  /** Status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  
  /** Progress information */
  progress: {
    /** Total pages crawled */
    pagesCrawled: number;
    
    /** Total pages discovered */
    pagesDiscovered: number;
    
    /** Max depth reached */
    maxDepthReached: number;
  };
  
  /** Configuration */
  config: {
    depth: number;
    pages: number;
    strategy: string;
    concurrency: number;
    prioritize: string[];
    useSitemaps: boolean;
    maxRetries: number;
    force: boolean;
    debug: boolean;
  };
}

/**
 * Handler for the docsi-batch-crawl tool
 */
export class BatchCrawlToolHandler extends BaseToolHandler {
  private crawlerService: ICrawlerService | null = null;
  private backgroundJobs: Map<string, BackgroundJob> = new Map();
  private logger = getLogger();
  
  /**
   * Create a new batch crawl tool handler
   * @param sourceRepository Repository for document sources
   * @param documentRepository Repository for documents
   */
  constructor(
    private readonly sourceRepository: IDocumentSourceRepository,
    private readonly documentRepository: IDocumentRepository
  ) {
    super();
    
    // Start background job monitoring
    this.monitorBackgroundJobs();
  }
  
  /**
   * Set the crawler service
   * @param service Crawler service instance
   */
  public setCrawlerService(service: ICrawlerService): void {
    this.crawlerService = service;
    
    // Add event listeners for job completions
    const eventEmitter = service.getEventEmitter();
    eventEmitter.on('job-completed', this.handleJobCompletion.bind(this));
  }
  
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docsi-batch-crawl',
        description: 'Start a long-running background crawl job for one or more documentation sources with advanced prioritization. This tool allows you to initiate comprehensive crawls that continue in the background after the initial response. You can specify multiple sources to crawl, the maximum depth, prioritization patterns for URLs, and crawl strategy. The tool returns immediately with job information while the crawling continues in the background. Use this for thorough documentation indexing.',
        inputSchema: {
          type: 'object',
          properties: {
            sources: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of source names to crawl, or ["all"] to crawl all configured sources.'
            },
            depth: {
              type: 'integer',
              description: 'Maximum crawl depth (default: 5). Controls how deep the crawler will follow links from the base URL.',
              default: 5
            },
            pages: {
              type: 'integer',
              description: 'Maximum pages per source (default: 500). Limits the total number of pages that will be indexed from each source.',
              default: 500
            },
            strategy: {
              type: 'string',
              description: 'Crawl strategy (default: "hybrid"). "breadth" crawls level by level, "depth" follows each path to completion, "hybrid" uses smart prioritization.',
              enum: ['breadth', 'depth', 'hybrid'],
              default: 'hybrid'
            },
            concurrency: {
              type: 'integer',
              description: 'Number of concurrent requests per source (default: 2). Higher values crawl faster but may overload servers.',
              default: 2
            },
            prioritize: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'URL or title patterns (regex) to prioritize during crawling. For example: ["api", "reference", "guide"].'
            },
            timeout: {
              type: 'integer',
              description: 'Wait time in seconds for initial status report (default: 30). The tool will wait this long before returning initial results.',
              default: 30
            },
            useSitemaps: {
              type: 'boolean',
              description: 'Whether to use sitemaps for URL discovery (default: true). Enables XML sitemap processing for efficient URL discovery.',
              default: true
            },
            maxRetries: {
              type: 'integer',
              description: 'Maximum number of retry attempts for failed requests (default: 3).',
              default: 3
            },
            force: {
              type: 'boolean',
              description: 'Force crawling even if document exists (default: false). When true, documents that already exist in storage will be recrawled.',
              default: false
            },
            debug: {
              type: 'boolean',
              description: 'Enable debug mode for verbose logging (default: true).',
              default: true
            }
          },
          required: ['sources']
        }
      },
      {
        name: 'docsi-batch-status',
        description: 'Get the status of a background batch crawl job. This tool returns detailed information about an ongoing or completed batch crawl job, including progress statistics and individual source statuses.',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: {
              type: 'string',
              description: 'ID of the batch job to check status for.'
            }
          },
          required: ['jobId']
        }
      }
    ];
  }
  
  /**
   * Handle a tool call
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool response
   */
  async handleToolCall(name: string, args: any): Promise<McpToolResponse> {
    if (name === 'docsi-batch-crawl') {
      return await this.handleBatchCrawl(args as BatchCrawlArgs);
    } else if (name === 'docsi-batch-status') {
      return await this.handleBatchStatus(args as { jobId: string });
    } else {
      return this.createErrorResponse(`Unknown tool: ${name}`);
    }
  }
  
  /**
   * Handle the batch crawl tool call
   * @param args Tool arguments
   * @returns Tool response
   */
  private async handleBatchCrawl(args: BatchCrawlArgs): Promise<McpToolResponse> {
    if (!this.crawlerService) {
      return this.createErrorResponse('Crawler service not available');
    }
    
    try {
      // Set default values
      const depth = args.depth || 5;
      const pages = args.pages || 500;
      const strategy = args.strategy || 'hybrid';
      const concurrency = args.concurrency || 2; // Lowered default to 2 for better stability
      const prioritize = args.prioritize || [];
      const timeout = args.timeout || 30;
      const useSitemaps = args.useSitemaps !== false; // Default to true
      const maxRetries = args.maxRetries || 3;
      const force = args.force || false; // Default to false
      const debug = args.debug !== false; // Default to true
      
      // Find sources to crawl
      let sources: DocumentSource[] = [];
      if (args.sources.includes('all')) {
        // Get all sources
        sources = await this.sourceRepository.findAll();
      } else {
        // Get sources by name
        const allSources = await this.sourceRepository.findAll();
        sources = allSources.filter(s => args.sources.includes(s.name));
        
        if (sources.length === 0) {
          return this.createErrorResponse('No valid sources found with the provided names');
        }
        
        if (sources.length < args.sources.length) {
          const foundNames = sources.map(s => s.name);
          const missingNames = args.sources.filter(name => !foundNames.includes(name));
          this.logger.warn(`Some sources were not found: ${missingNames.join(', ')}`, 'BatchCrawlToolHandler');
        }
      }
      
      // Create background job
      const jobId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const job: BackgroundJob = {
        id: jobId,
        sourceIds: sources.map(s => s.id),
        startTime: new Date(),
        crawlJobIds: new Map(),
        status: 'pending',
        progress: {
          pagesCrawled: 0,
          pagesDiscovered: 0,
          maxDepthReached: 0
        },
        config: {
          depth,
          pages,
          strategy,
          concurrency,
          prioritize,
          useSitemaps,
          maxRetries,
          force,
          debug
        }
      };
      
      // Store the job
      this.backgroundJobs.set(jobId, job);
      
      // Start background processing after responding
      setTimeout(() => {
        this.processBatchJob(jobId, sources, job.config).catch(error => {
          this.logger.error(`Error processing batch job ${jobId}:`, 'BatchCrawlToolHandler', error);
          const failedJob = this.backgroundJobs.get(jobId);
          if (failedJob) {
            failedJob.status = 'failed';
            this.backgroundJobs.set(jobId, failedJob);
          }
        });
      }, 0);
      
      // Wait for initial results up to the timeout
      await new Promise(resolve => setTimeout(resolve, timeout * 1000));
      
      // Get the latest job status
      const updatedJob = this.backgroundJobs.get(jobId);
      if (!updatedJob) {
        return this.createErrorResponse(`Job ${jobId} not found`);
      }
      
      const responseText = `
Batch crawl job started:
Job ID: ${jobId}
Sources: ${sources.map(s => s.name).join(', ')}
Configuration:
  - Maximum depth: ${depth}
  - Maximum pages per source: ${pages}
  - Crawl strategy: ${strategy}
  - Concurrency: ${concurrency}
  - Prioritized patterns: ${prioritize.length > 0 ? prioritize.join(', ') : 'none'}
  - Use sitemaps: ${useSitemaps ? 'Yes' : 'No'}
  - Force recrawl: ${force ? 'Yes' : 'No'}
  - Max retries: ${maxRetries}
  - Debug mode: ${debug ? 'Enabled' : 'Disabled'}

Current status: ${updatedJob.status}
Initial progress:
  - Pages crawled: ${updatedJob.progress.pagesCrawled}
  - Pages discovered: ${updatedJob.progress.pagesDiscovered}
  - Max depth reached: ${updatedJob.progress.maxDepthReached}

The crawl is continuing in the background and may run for up to 20 minutes.
Use the docsi-batch-status tool with this job ID to check progress.
      `.trim();
      
      return {
        content: [
          {
            type: 'text',
            text: responseText
          }
,
          {
            type: 'text',
            text: `JobID: ${jobId}`
          }
        ],
      };
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Handle the batch status tool call
   * @param args Tool arguments
   * @returns Tool response
   */
  private async handleBatchStatus(args: { jobId: string }): Promise<McpToolResponse> {
    const { jobId } = args;
    
    // Get job
    const job = this.backgroundJobs.get(jobId);
    if (!job) {
      return this.createErrorResponse(`Batch job ${jobId} not found`);
    }
    
    // Get individual crawl job statuses
    const jobStatuses: Array<{ sourceId: string, sourceName: string, status: string, progress: any }> = [];
    
    for (const [sourceId, crawlJobId] of job.crawlJobIds.entries()) {
      try {
        // Get source name
        const source = await this.sourceRepository.findById(sourceId);
        const sourceName = source ? source.name : sourceId;
        
        // Get crawl job status
        if (this.crawlerService) {
          try {
            const status = await this.crawlerService.getCrawlJobStatus(crawlJobId);
            jobStatuses.push({
              sourceId,
              sourceName,
              status: status.status,
              progress: status.progress
            });
          } catch (error) {
            jobStatuses.push({
              sourceId,
              sourceName,
              status: 'unknown',
              progress: { pagesCrawled: 0, pagesDiscovered: 0, maxDepthReached: 0 }
            });
          }
        }
      } catch (error) {
        // Skip problematic job status
        this.logger.warn(`Error getting status for job ${crawlJobId}:`, 'BatchCrawlToolHandler', error);
      }
    }
    
    // Calculate runtime
    const runtime = Math.floor((Date.now() - job.startTime.getTime()) / 1000);
    const hours = Math.floor(runtime / 3600);
    const minutes = Math.floor((runtime % 3600) / 60);
    const seconds = runtime % 60;
    const runtimeStr = `${hours > 0 ? `${hours}h ` : ''}${minutes}m ${seconds}s`;
    
    return {
      content: [
        {
          type: 'text',
          text: `
Batch Job Status: ${jobId}
Status: ${job.status}
Started: ${job.startTime.toISOString()}
Runtime: ${runtimeStr}
Configuration:
  - Maximum depth: ${job.config.depth}
  - Maximum pages per source: ${job.config.pages}
  - Crawl strategy: ${job.config.strategy}
  - Concurrency: ${job.config.concurrency}
  - Prioritized patterns: ${job.config.prioritize.length > 0 ? job.config.prioritize.join(', ') : 'none'}
  - Use sitemaps: ${job.config.useSitemaps ? 'Yes' : 'No'}
  - Force recrawl: ${job.config.force ? 'Yes' : 'No'}
  - Max retries: ${job.config.maxRetries}
  - Debug mode: ${job.config.debug ? 'Enabled' : 'Disabled'}

Overall Progress:
  - Pages crawled: ${job.progress.pagesCrawled}
  - Pages discovered: ${job.progress.pagesDiscovered}
  - Max depth reached: ${job.progress.maxDepthReached}

Individual Source Status:
${jobStatuses.map(js => `- ${js.sourceName}: ${js.status}, Crawled: ${js.progress.pagesCrawled}, Discovered: ${js.progress.pagesDiscovered}, Depth: ${js.progress.maxDepthReached}`).join('\n')}
          `.trim()
        }
      ]
    };
  }
  
  /**
   * Process a batch job
   * @param jobId Batch job ID
   * @param sources Sources to crawl
   * @param config Crawl configuration
   */
  private async processBatchJob(
    jobId: string,
    sources: DocumentSource[],
    config: { 
      depth: number, 
      pages: number, 
      strategy: string, 
      concurrency: number, 
      prioritize: string[],
      useSitemaps: boolean,
      maxRetries: number,
      force: boolean,
      debug: boolean
    }
  ): Promise<void> {
    // Get the job
    const job = this.backgroundJobs.get(jobId);
    if (!job) {
      throw new Error(`Batch job ${jobId} not found`);
    }
    
    // Update job status
    job.status = 'running';
    this.backgroundJobs.set(jobId, job);
    
    try {
      // Process each source
      for (const source of sources) {
        try {
          // Configure crawler settings
          const settings: CrawlJobSettings = {
            sourceId: source.id,
            maxDepth: config.depth,
            maxPages: config.pages,
            pagePrioritization: {
              // Ensure strategy is of the correct type
              strategy: (config.strategy === 'breadth' || config.strategy === 'depth' || 
                         config.strategy === 'hybrid') ? config.strategy : 'hybrid',
              patterns: config.prioritize,
              concurrency: config.concurrency
            },
            useSitemaps: config.useSitemaps,
            maxRetries: config.maxRetries,
            force: config.force,
            debug: config.debug
          };
          
          // Start crawl job
          if (this.crawlerService) {
            const crawlJobId = await this.crawlerService.startCrawlJob(settings);
            
            // Store crawl job ID
            job.crawlJobIds.set(source.id, crawlJobId);
            this.backgroundJobs.set(jobId, job);
            
            this.logger.info(`Started crawl job ${crawlJobId} for source ${source.name} as part of batch job ${jobId}`, 'BatchCrawlToolHandler');
          }
        } catch (error) {
          this.logger.error(`Error starting crawl for source ${source.name}:`, 'BatchCrawlToolHandler', error);
        }
      }
      
      // Wait for a maximum of 20 minutes
      const maxWaitTime = 20 * 60 * 1000; // 20 minutes
      const pollInterval = 10000; // 10 seconds
      let totalWaitTime = 0;
      
      // Poll until all jobs are completed or timeout
      while (totalWaitTime < maxWaitTime) {
        // Check if job has been marked as completed or failed
        const currentJob = this.backgroundJobs.get(jobId);
        if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
          return;
        }
        
        // Check if all crawl jobs are completed
        let allCompleted = true;
        for (const [sourceId, crawlJobId] of currentJob.crawlJobIds.entries()) {
          try {
            if (this.crawlerService) {
              const status = await this.crawlerService.getCrawlJobStatus(crawlJobId);
              if (status.status !== 'completed' && status.status !== 'failed' && status.status !== 'canceled') {
                allCompleted = false;
                break;
              }
            }
          } catch (error) {
            this.logger.warn(`Error checking status for job ${crawlJobId}:`, 'BatchCrawlToolHandler', error);
          }
        }
        
        if (allCompleted) {
          // Update job status
          currentJob.status = 'completed';
          this.backgroundJobs.set(jobId, currentJob);
          return;
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        totalWaitTime += pollInterval;
        
        // Update job progress from individual crawl jobs
        await this.updateBatchJobProgress(jobId);
      }
      
      // If we reach here, the job has timed out
      const timeoutJob = this.backgroundJobs.get(jobId);
      if (timeoutJob) {
        timeoutJob.status = 'completed';
        this.backgroundJobs.set(jobId, timeoutJob);
      }
      
      this.logger.info(`Batch job ${jobId} completed due to timeout after 20 minutes`, 'BatchCrawlToolHandler');
    } catch (error) {
      // Update job status on error
      const failedJob = this.backgroundJobs.get(jobId);
      if (failedJob) {
        failedJob.status = 'failed';
        this.backgroundJobs.set(jobId, failedJob);
      }
      
      throw error;
    }
  }
  
  /**
   * Update batch job progress from individual crawl jobs
   * @param jobId Batch job ID
   */
  private async updateBatchJobProgress(jobId: string): Promise<void> {
    const job = this.backgroundJobs.get(jobId);
    if (!job || !this.crawlerService) {
      return;
    }
    
    let totalPagesCrawled = 0;
    let totalPagesDiscovered = 0;
    let maxDepthReached = 0;
    
    for (const [_, crawlJobId] of job.crawlJobIds.entries()) {
      try {
        const status = await this.crawlerService.getCrawlJobStatus(crawlJobId);
        totalPagesCrawled += status.progress.pagesCrawled;
        totalPagesDiscovered += status.progress.pagesDiscovered;
        maxDepthReached = Math.max(maxDepthReached, status.progress.maxDepthReached);
      } catch (error) {
        // Skip problematic job status
      }
    }
    
    // Update job progress
    job.progress = {
      pagesCrawled: totalPagesCrawled,
      pagesDiscovered: totalPagesDiscovered,
      maxDepthReached
    };
    
    this.backgroundJobs.set(jobId, job);
  }
  
  /**
   * Handle job completion event from crawler service
   * @param event Job completed event
   */
  private handleJobCompletion(event: any): void {
    // Find the batch job that contains this crawl job
    for (const [jobId, job] of this.backgroundJobs.entries()) {
      if (job.crawlJobIds.has(event.sourceId) && job.crawlJobIds.get(event.sourceId) === event.jobId) {
        // Update batch job progress
        this.updateBatchJobProgress(jobId).catch(error => {
          this.logger.error(`Error updating batch job progress:`, 'BatchCrawlToolHandler', error);
        });
        
        break;
      }
    }
  }
  
  /**
   * Monitor background jobs and clean up old ones
   */
  private monitorBackgroundJobs(): void {
    // Check every hour for old jobs
    setInterval(() => {
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      for (const [jobId, job] of this.backgroundJobs.entries()) {
        const age = now - job.startTime.getTime();
        
        if (age > maxAge) {
          // Remove old job
          this.backgroundJobs.delete(jobId);
          this.logger.info(`Removed old batch job ${jobId}`, 'BatchCrawlToolHandler');
        }
      }
    }, 60 * 60 * 1000); // 1 hour
  }
}