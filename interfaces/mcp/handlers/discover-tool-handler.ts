/**
 * Handler for the docsi-discover tool
 * 
 * This handler manages documentation sources, including adding new sources,
 * refreshing existing ones, and listing all sources.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { DiscoverToolArgs, McpToolResponse } from '../tool-types.js';
import { createHash } from 'crypto';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { ICrawlerService, CrawlJobSettings, JobStatusType } from '../../../services/crawler/domain/CrawlerService.js';
import { Logger, getLogger } from '../../../shared/infrastructure/logging.js'; // Import Logger
import {
  SourceNotFoundError,
  SourceExistsError,
  ValidationError,
  McpHandlerError,
  isDocsiError
} from '../../../shared/domain/errors.js'; // Import custom errors
// Removed console.log redirection hack

/**
 * Handler for the docsi-discover tool
 */
export class DiscoverToolHandler extends BaseToolHandler {
  private crawlerService: ICrawlerService | null = null;
  private logger: Logger; // Added logger property
  
  /**
   * Create a new discover tool handler
   * @param sourceRepository Repository for document sources
   * @param documentRepository Repository for documents
   */
  constructor(
    private readonly sourceRepository: IDocumentSourceRepository,
    private readonly documentRepository: IDocumentRepository,
    loggerInstance?: Logger // Added optional logger parameter
  ) {
    super();
    this.logger = loggerInstance || getLogger(); // Use injected or global logger
  }
  
  /**
   * Set the crawler service
   * @param service Crawler service instance
   */
  public setCrawlerService(service: ICrawlerService): void {
    this.logger.info('Setting crawler service for DiscoverToolHandler', 'DiscoverToolHandler.setCrawlerService');
    this.crawlerService = service;
  }
  
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docsi-discover',
        description: 'Discover and manage documentation sources. This tool allows you to add new documentation sources for indexing, refresh existing sources to update their content, and list all configured sources. Use this tool when you need to: 1) See what documentation sources are available in the system, 2) Add new documentation websites or repositories to be indexed, or 3) Update existing documentation sources with fresh content. The tool requires an "action" parameter that determines the operation to perform ("list", "add", or "refresh"). For "add" actions, you need to provide the URL and name of the documentation source. For "refresh" actions, you need to provide the name of the existing source.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description: 'Action to perform (add, refresh, list). "list" shows all configured documentation sources. "add" adds a new documentation source for indexing. "refresh" updates an existing source with fresh content.',
              enum: ['add', 'refresh', 'list', 'delete']
            },
            url: {
              type: 'string',
              description: 'URL of the documentation source (required for add action). This should be the base URL of the documentation website or repository to be indexed.'
            },
            name: {
              type: 'string',
              description: 'Name of the documentation source (required for add and refresh actions). This is a human-readable identifier for the documentation source.'
            },
            depth: {
              type: 'integer',
              description: 'Maximum crawl depth (default: 3). Controls how deep the crawler will follow links from the base URL.',
              default: 3
            },
            pages: {
              type: 'integer',
              description: 'Maximum pages to crawl (default: 100). Limits the total number of pages that will be indexed from this source.',
              default: 100
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags for categorizing the documentation. These tags can be used for filtering search results and organizing documentation sources.'
            },
            crawlMethod: {
              type: 'string',
              description: 'Fetch method for crawling pages: "http" (default) uses HTTP requests, "browser" uses a headless browser for JavaScript-heavy sites.',
              enum: ['http', 'browser'],
              default: 'http'
            }
          },
          required: ['action']
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
    if (name !== 'docsi-discover') {
      return this.createErrorResponse(`Unknown tool: ${name}`);
    }
    
    const typedArgs = args as unknown as DiscoverToolArgs;
    const action = typedArgs.action;
    
    try {
      switch (action) {
        case 'list':
          return await this.handleListAction();
        case 'add':
          return await this.handleAddAction(typedArgs);
        case 'refresh':
          return await this.handleRefreshAction(typedArgs);
        case 'delete':
          return await this.handleDeleteAction(typedArgs);
        default:
          return this.createErrorResponse(`Unknown action: ${action}`);
      }
    } catch (error: unknown) {
      this.logger.error(`Error in handleToolCall for action ${action}: ${error instanceof Error ? error.message : String(error)}`, 'DiscoverToolHandler.handleToolCall', error);
      return this.createStructuredErrorResponse(error); // Use structured response
    }
  }
  
  /**
   * Handle the list action
   * @returns Tool response
   */
  private async handleListAction(): Promise<McpToolResponse> {
    this.logger.info('Handling list action', 'DiscoverToolHandler.handleListAction');
    const sources = await this.sourceRepository.findAll();
    this.logger.debug(`Found ${sources.length} sources`, 'DiscoverToolHandler.handleListAction');
    
    if (sources.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Document Sources (0):\nNo sources configured yet'
          }
        ]
      };
    }
    
    const sourceList = sources.map((s: DocumentSource) => {
      // Safely format the last crawled date - handle undefined or non-Date objects
      let lastCrawledText = 'never';
      if (s.lastCrawledAt) {
        try {
          // Ensure it's a Date object
          const lastCrawledDate = s.lastCrawledAt instanceof Date 
            ? s.lastCrawledAt 
            : new Date(s.lastCrawledAt);
          
          lastCrawledText = lastCrawledDate.toISOString();
        } catch (error) {
          this.logger.warn(`Invalid date format for lastCrawledAt for source ${s.name}: ${s.lastCrawledAt}`, 'DiscoverToolHandler.handleListAction', error);
          // Ignore formatting errors, keep 'never'
        }
      }
      
      return `- ${s.name} (${s.baseUrl})\n  Last crawled: ${lastCrawledText}`;
    }).join('\n');
    
    return {
      content: [
        {
          type: 'text',
          text: `Document Sources (${sources.length}):\n${sourceList}`
        }
      ]
    };
  }
  
  /**
   * Handle the add action
   * @param args Tool arguments
   * @returns Tool response
   */
  private async handleAddAction(args: DiscoverToolArgs): Promise<McpToolResponse> {
    this.logger.info(`Handling add action for source: ${args.name}`, 'DiscoverToolHandler.handleAddAction');
    const { url, name, depth, pages, tags } = args;

    // Validate URL format
    if (url) {
      try {
        new URL(url); // Attempt to construct URL object
      } catch (e) {
        const validationError = new ValidationError(`Invalid URL format provided: ${url}`);
        // Log the error before throwing
        this.logger.error(validationError.message, 'DiscoverToolHandler.handleAddAction', validationError); 
        throw validationError;
      }
    }


    if (!url || !name) {
      // Throw specific validation error
      const validationError = new ValidationError('URL and name are required for add action');
      this.logger.error(validationError.message, 'DiscoverToolHandler.handleAddAction', validationError);
      throw validationError;
    }
    
    // Create source ID
    const id = createHash('sha256').update(url).digest('hex');
    
    // Check if source already exists by ID (URL hash) or name
    const existingById = await this.sourceRepository.findById(id);
    if (existingById) {
      const existsError = new SourceExistsError(`Source with URL ${url} already exists (ID: ${id}, Name: ${existingById.name})`);
      this.logger.error(existsError.message, 'DiscoverToolHandler.handleAddAction', existsError);
      throw existsError;
    }
    const existingByName = await this.sourceRepository.findByName(name);
     if (existingByName) {
      const existsError = new SourceExistsError(`Source with name "${name}" already exists (ID: ${existingByName.id})`);
      this.logger.error(existsError.message, 'DiscoverToolHandler.handleAddAction', existsError);
      throw existsError;
    }
    
    // Create new source
    const source: DocumentSource = {
      id,
      name,
      baseUrl: url,
      addedAt: new Date(),
      crawlConfig: {
        maxDepth: depth || 3,
        maxPages: pages || 100,
        respectRobotsTxt: false,
        crawlDelay: 1000,
        includePatterns: [],
        excludePatterns: []
      },
      tags: tags || []
    };
    
    // Save source
    this.logger.debug(`Saving new source: ${name} (ID: ${id})`, 'DiscoverToolHandler.handleAddAction');
    await this.sourceRepository.save(source);
    this.logger.info(`Source ${name} saved successfully`, 'DiscoverToolHandler.handleAddAction');
    
    // Start crawling if crawler service is available
    let pageCount = 0;
    let pagesDiscovered = 0;
    let maxDepthReached = 0;
    let jobId = '';
    
    if (this.crawlerService) {
      this.logger.info(`Crawler service available, starting initial crawl for ${name}`, 'DiscoverToolHandler.handleAddAction');
      const settings: CrawlJobSettings = {
        sourceId: id,
        maxDepth: depth,
        maxPages: pages,
        strategy: args.crawlMethod === 'browser' ? 'browser' : 'http'
      };
      
      try {
        // Start crawl job
        this.logger.debug(`Starting crawl job with settings: ${JSON.stringify(settings)}`, 'DiscoverToolHandler.handleAddAction');
        jobId = await this.crawlerService.startCrawlJob(settings);
        this.logger.info(`Crawl job ${jobId} started for new source ${name}`, 'DiscoverToolHandler.handleAddAction');
        
        // Wait for job to complete or timeout after 2 minutes
        // Increased timeout from 30s to 5 minutes to allow deeper crawling
        const maxWaitTime = 300000; // 5 minutes in milliseconds
        const pollInterval = 1000; // 1 second
        let totalWaitTime = 0;
        let jobStatus;
        
        // Poll for job status until completed or timeout
        while (totalWaitTime < maxWaitTime) {
          this.logger.debug(`Polling status for job ${jobId} (Wait time: ${totalWaitTime}ms)`, 'DiscoverToolHandler.handleAddAction');
          jobStatus = await this.crawlerService.getCrawlJobStatus(jobId);
          this.logger.debug(`Job ${jobId} status: ${jobStatus?.status}`, 'DiscoverToolHandler.handleAddAction');
          
          // If job is completed or failed, break the loop
          if (jobStatus.status === 'completed' || 
              jobStatus.status === 'failed' || 
              jobStatus.status === 'canceled') {
            break;
          }
          
          // Otherwise wait and try again
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          totalWaitTime += pollInterval;
        }
        
        if (jobStatus) {
          // Update page counts from job status
          pageCount = jobStatus.progress.pagesCrawled;
          pagesDiscovered = jobStatus.progress.pagesDiscovered;
          maxDepthReached = jobStatus.progress.maxDepthReached;
        }
      } catch (crawlError: unknown) {
        this.logger.error(`Error during initial crawl for source ${name} (Job ID: ${jobId}): ${crawlError instanceof Error ? crawlError.message : String(crawlError)}`, 'DiscoverToolHandler.handleAddAction', crawlError);
        // Don't fail the add operation, just log the crawl error
      }
    }
    
    // If we don't have the crawler service or crawling failed, report default values
    if (pageCount === 0) {
      this.logger.warn(`Crawler service not available or crawl failed for source ${name}. Reporting default page count.`, 'DiscoverToolHandler.handleAddAction');
      pageCount = 0; // Report 0 if crawl didn't run or failed
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `
Added and crawled documentation source:
Name: ${name}
URL: ${url}
Source ID: ${id}
Crawl depth: ${depth || 3}
Max pages: ${pages || 100}
Tagged with: ${tags?.length ? tags.join(', ') : 'no tags'}
Crawled ${pageCount} pages${pagesDiscovered > 0 ? `\nDiscovered ${pagesDiscovered} pages` : ''}${maxDepthReached > 0 ? `\nReached depth ${maxDepthReached}` : ''}${jobId ? `\nJob ID: ${jobId}` : ''}
          `.trim()
        }
      ]
    };
  }
  
  /**
   * Handle the refresh action
   * @param args Tool arguments
   * @returns Tool response
   */
  private async handleRefreshAction(args: DiscoverToolArgs): Promise<McpToolResponse> {
    this.logger.info(`Handling refresh action for source: ${args.name}`, 'DiscoverToolHandler.handleRefreshAction');
    const { name } = args;

    if (!name) {
      const validationError = new ValidationError('Name is required for refresh action');
      this.logger.error(validationError.message, 'DiscoverToolHandler.handleRefreshAction', validationError);
      throw validationError;
    }
    
    // Find source by name
    const sources = await this.sourceRepository.findAll();
    const source = sources.find((s: DocumentSource) => s.name === name);
    
    if (!source) {
      const notFoundError = new SourceNotFoundError(name);
      this.logger.error(notFoundError.message, 'DiscoverToolHandler.handleRefreshAction', notFoundError);
      throw notFoundError;
    }
    
    // Update last crawled timestamp
    const now = new Date();
    source.lastCrawledAt = now;

    // Persistently update URL if provided
    if (args.url) {
      source.baseUrl = args.url;
    }

    // Persistently update crawl config if provided
    if (!source.crawlConfig) {
      source.crawlConfig = { maxDepth: 3, maxPages: 100, respectRobotsTxt: false, crawlDelay: 1000, includePatterns: [], excludePatterns: [] };
    }
    if (args.depth) {
      source.crawlConfig.maxDepth = args.depth;
    }
    if (args.pages) {
      source.crawlConfig.maxPages = args.pages;
    }

    this.logger.debug(`Saving updated source ${name} before refresh`, 'DiscoverToolHandler.handleRefreshAction');
    await this.sourceRepository.save(source);
    this.logger.info(`Source ${name} updated successfully`, 'DiscoverToolHandler.handleRefreshAction');
    
    // Start crawling if crawler service is available
    let pageCount = 0;
    let pagesDiscovered = 0;
    let maxDepthReached = 0;
    let jobId = '';
    
    if (this.crawlerService) {
      this.logger.info(`Crawler service available, starting refresh crawl for ${name}`, 'DiscoverToolHandler.handleRefreshAction');
      const settings: CrawlJobSettings = {
        sourceId: source.id,
        maxDepth: args.depth || source.crawlConfig?.maxDepth || 3,
        maxPages: args.pages || source.crawlConfig?.maxPages || 100,
        force: true,
        strategy: args.crawlMethod === 'browser' ? 'browser' : 'http'
      };
      
      try {
        // Start crawl job
        this.logger.debug(`Starting refresh crawl job with settings: ${JSON.stringify(settings)}`, 'DiscoverToolHandler.handleRefreshAction');
        jobId = await this.crawlerService.startCrawlJob(settings);
        this.logger.info(`Refresh crawl job ${jobId} started for source ${name}`, 'DiscoverToolHandler.handleRefreshAction');
        
        // Wait for job to complete or timeout after 2 minutes
        // Increased timeout from 30s to 5 minutes to allow deeper crawling
        const maxWaitTime = 300000; // 5 minutes in milliseconds
        const pollInterval = 1000; // 1 second
        let totalWaitTime = 0;
        let jobStatus;
        
        // Poll for job status until completed or timeout
        while (totalWaitTime < maxWaitTime) {
          this.logger.debug(`Polling status for refresh job ${jobId} (Wait time: ${totalWaitTime}ms)`, 'DiscoverToolHandler.handleRefreshAction');
          jobStatus = await this.crawlerService.getCrawlJobStatus(jobId);
          this.logger.debug(`Refresh job ${jobId} status: ${jobStatus?.status}`, 'DiscoverToolHandler.handleRefreshAction');
          
          // If job is completed or failed, break the loop
          if (jobStatus.status === 'completed' || 
              jobStatus.status === 'failed' || 
              jobStatus.status === 'canceled') {
            break;
          }
          
          // Otherwise wait and try again
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          totalWaitTime += pollInterval;
        }
        
        if (jobStatus) {
          // Update page counts from job status
          pageCount = jobStatus.progress.pagesCrawled;
          pagesDiscovered = jobStatus.progress.pagesDiscovered;
          maxDepthReached = jobStatus.progress.maxDepthReached;
        }
      } catch (crawlError: unknown) {
        this.logger.error(`Error during refresh crawl for source ${name} (Job ID: ${jobId}): ${crawlError instanceof Error ? crawlError.message : String(crawlError)}`, 'DiscoverToolHandler.handleRefreshAction', crawlError);
        // Don't fail the refresh operation, just log the crawl error
      }
    }
    
    // If we don't have the crawler service or crawling failed, report default values
    if (!jobId) { // If crawl service wasn't available
       this.logger.warn(`Crawler service not available for refresh of source ${name}.`, 'DiscoverToolHandler.handleRefreshAction');
       pageCount = 0;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `
Refreshed documentation source:
Name: ${source.name}
URL: ${source.baseUrl}
Source ID: ${source.id}
Crawled ${pageCount} pages${pagesDiscovered > 0 ? `\nDiscovered ${pagesDiscovered} pages` : ''}${maxDepthReached > 0 ? `\nReached depth ${maxDepthReached}` : ''}${jobId ? `\nJob ID: ${jobId}` : ''}
Last crawled: ${source.lastCrawledAt.toISOString()}
          `.trim()
        }
      ]
    };
  }
  /**
   * Handle the delete action
   * @param args Tool arguments
   * @returns Tool response
   */
  private async handleDeleteAction(args: DiscoverToolArgs): Promise<McpToolResponse> {
    this.logger.info(`Handling delete action for source: ${args.name}`, 'DiscoverToolHandler.handleDeleteAction');
    const { name } = args;
    if (!name) {
      const validationError = new ValidationError('Name is required for delete action');
      this.logger.error(validationError.message, 'DiscoverToolHandler.handleDeleteAction', validationError);
      throw validationError;
    }

    // Find source by name
    const sources = await this.sourceRepository.findAll();
    const source = sources.find((s: DocumentSource) => s.name === name);

    if (!source) {
      const notFoundError = new SourceNotFoundError(name);
      this.logger.error(notFoundError.message, 'DiscoverToolHandler.handleDeleteAction', notFoundError);
      throw notFoundError;
    }

    this.logger.debug(`Attempting to delete source ${name} (ID: ${source.id})`, 'DiscoverToolHandler.handleDeleteAction');
    const deleted = await this.sourceRepository.delete(source.id);

    if (deleted) {
      return {
        content: [
          {
            type: 'text',
            text: `Deleted documentation source "${name}".`
          }
        ]
      };
    } else {
      // Throw an error if deletion failed unexpectedly
      const deleteError = new McpHandlerError(`Failed to delete source "${name}" from repository.`, 'docsi-discover');
      this.logger.error(deleteError.message, 'DiscoverToolHandler.handleDeleteAction', deleteError);
      throw deleteError;
    }
  }
}