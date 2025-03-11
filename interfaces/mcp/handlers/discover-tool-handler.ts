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

/**
 * Handler for the docsi-discover tool
 */
export class DiscoverToolHandler extends BaseToolHandler {
  private crawlerService: ICrawlerService | null = null;
  
  /**
   * Create a new discover tool handler
   * @param sourceRepository Repository for document sources
   * @param documentRepository Repository for documents
   */
  constructor(
    private readonly sourceRepository: IDocumentSourceRepository,
    private readonly documentRepository: IDocumentRepository
  ) {
    super();
  }
  
  /**
   * Set the crawler service
   * @param service Crawler service instance
   */
  public setCrawlerService(service: ICrawlerService): void {
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
              enum: ['add', 'refresh', 'list']
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
        default:
          return this.createErrorResponse(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Handle the list action
   * @returns Tool response
   */
  private async handleListAction(): Promise<McpToolResponse> {
    const sources = await this.sourceRepository.findAll();
    
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
          console.warn(`Error formatting date for source ${s.name}:`, error);
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
    const { url, name, depth, pages, tags } = args;
    
    if (!url || !name) {
      return this.createErrorResponse('URL and name are required for add action');
    }
    
    // Create source ID
    const id = createHash('sha256').update(url).digest('hex');
    
    // Check if source already exists
    const existingSource = await this.sourceRepository.findById(id);
    if (existingSource) {
      return this.createErrorResponse(`Source with URL ${url} already exists (${existingSource.name})`);
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
    await this.sourceRepository.save(source);
    
    // Start crawling if crawler service is available
    let pageCount = 0;
    let pagesDiscovered = 0;
    let maxDepthReached = 0;
    let jobId = '';
    
    if (this.crawlerService) {
      const settings: CrawlJobSettings = {
        sourceId: id,
        maxDepth: depth,
        maxPages: pages
      };
      
      try {
        // Start crawl job
        jobId = await this.crawlerService.startCrawlJob(settings);
        
        // Wait for job to complete or timeout after 2 minutes
        // Increased timeout from 30s to 5 minutes to allow deeper crawling
        const maxWaitTime = 300000; // 5 minutes in milliseconds
        const pollInterval = 1000; // 1 second
        let totalWaitTime = 0;
        let jobStatus;
        
        // Poll for job status until completed or timeout
        while (totalWaitTime < maxWaitTime) {
          jobStatus = await this.crawlerService.getCrawlJobStatus(jobId);
          
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
      } catch (error) {
        console.error('Error starting or monitoring crawl job:', error);
      }
    }
    
    // If we don't have the crawler service or crawling failed, report default values
    if (pageCount === 0) {
      pageCount = 1;
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
    const { name } = args;
    
    if (!name) {
      return this.createErrorResponse('Name is required for refresh action');
    }
    
    // Find source by name
    const sources = await this.sourceRepository.findAll();
    const source = sources.find((s: DocumentSource) => s.name === name);
    
    if (!source) {
      return this.createErrorResponse(`No source found with name "${name}"`);
    }
    
    // Update last crawled timestamp
    const now = new Date();
    source.lastCrawledAt = now;
    await this.sourceRepository.save(source);
    
    // Start crawling if crawler service is available
    let pageCount = 0;
    let pagesDiscovered = 0;
    let maxDepthReached = 0;
    let jobId = '';
    
    if (this.crawlerService) {
      const settings: CrawlJobSettings = {
        sourceId: source.id,
        maxDepth: args.depth || source.crawlConfig?.maxDepth || 3,
        maxPages: args.pages || source.crawlConfig?.maxPages || 100,
        force: true
      };
      
      try {
        // Start crawl job
        jobId = await this.crawlerService.startCrawlJob(settings);
        
        // Wait for job to complete or timeout after 2 minutes
        // Increased timeout from 30s to 5 minutes to allow deeper crawling
        const maxWaitTime = 300000; // 5 minutes in milliseconds
        const pollInterval = 1000; // 1 second
        let totalWaitTime = 0;
        let jobStatus;
        
        // Poll for job status until completed or timeout
        while (totalWaitTime < maxWaitTime) {
          jobStatus = await this.crawlerService.getCrawlJobStatus(jobId);
          
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
      } catch (error) {
        console.error('Error starting or monitoring crawl job:', error);
      }
    }
    
    // If we don't have the crawler service or crawling failed, report default values
    if (pageCount === 0) {
      pageCount = 1;
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
}