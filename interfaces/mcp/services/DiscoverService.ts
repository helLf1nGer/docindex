/**
 * Implementation of the discover tool service
 * Manages documentation sources (add, refresh, list)
 */

import { IDiscoverService } from './interfaces.js';
import { DiscoverToolArgs, McpContentItem } from '../tool-types.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { ICrawlerService } from '../../../services/crawler/domain/CrawlerService.js';
import { config } from '../../../shared/infrastructure/config.js';
import { createHash } from 'crypto';

/**
 * Implementation of the discover tool service
 */
export class DiscoverService implements IDiscoverService {
  constructor(
    private readonly sourceRepository: IDocumentSourceRepository,
    private readonly crawlerService: ICrawlerService
  ) {}

  async handleToolRequest(args: DiscoverToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Validate required fields
    if (!args.action) {
      return {
        content: [{ type: 'text', text: 'Action is required' }],
        isError: true
      };
    }

    try {
      switch (args.action) {
        case 'list':
          return await this.listSources();
        case 'add':
          if (!args.url || !args.name) {
            return {
              content: [{ type: 'text', text: 'URL and name are required for add action' }],
              isError: true
            };
          }
          return await this.addSource(args);
        case 'refresh':
          if (!args.name) {
            return {
              content: [{ type: 'text', text: 'Name is required for refresh action' }],
              isError: true
            };
          }
          return await this.refreshSource(args);
        default:
          return {
            content: [{ type: 'text', text: `Invalid action: ${args.action}` }],
            isError: true
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing discover request: ${message}` }],
        isError: true
      };
    }
  }

  private async listSources(): Promise<{ content: McpContentItem[], isError: boolean }> {
    const sources = await this.sourceRepository.findAll();
    
    if (sources.length === 0) {
      return {
        content: [{ 
          type: 'text', 
          text: 'No documentation sources found. Add sources with the "add" action.' 
        }],
        isError: false
      };
    }

    const formattedSources = sources.map(s => 
      `- ${s.name} (${s.baseUrl})\n  Added: ${s.addedAt.toISOString()}\n  Last Crawled: ${s.lastCrawledAt ? s.lastCrawledAt.toISOString() : 'Never'}\n  Tags: ${s.tags.join(', ') || 'None'}`
    ).join('\n\n');

    return {
      content: [{ 
        type: 'text', 
        text: `Found ${sources.length} documentation sources:\n\n${formattedSources}` 
      }],
      isError: false
    };
  }

  private async addSource(args: DiscoverToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Check if source already exists
    const existingSource = await this.sourceRepository.findByName(args.name!);
    if (existingSource && !args.force) {
      return {
        content: [{ 
          type: 'text', 
          text: `Source "${args.name}" already exists. Use "force: true" to overwrite.` 
        }],
        isError: true
      };
    }

    // Generate an ID if this is a new source
    const sourceId = existingSource?.id || this.generateSourceId(args.name!);
    
    // Create the source object
    const source = {
      id: sourceId,
      name: args.name!,
      baseUrl: args.url!,
      addedAt: new Date(),
      lastCrawledAt: existingSource?.lastCrawledAt,
      crawlConfig: {
        maxDepth: args.depth || config.crawler.maxDepth,
        maxPages: args.pages || config.crawler.maxPages,
        respectRobotsTxt: config.crawler.respectRobotsTxt,
        crawlDelay: config.crawler.crawlDelay,
        includePatterns: ['*'],
        excludePatterns: []
      },
      tags: args.tags || []
    };

    // Save source
    await this.sourceRepository.save(source);

    // Start crawling if forced
    if (args.force) {
      const jobId = await this.crawlerService.startCrawlJob({
        sourceId: source.id,
        maxDepth: source.crawlConfig.maxDepth,
        maxPages: source.crawlConfig.maxPages,
        force: true
      });

      return {
        content: [{ 
          type: 'text', 
          text: `Added source "${args.name}" and started crawling job ${jobId}.` 
        }],
        isError: false
      };
    }

    return {
      content: [{ 
        type: 'text', 
        text: `Added source "${args.name}". Use refresh action to start crawling.` 
      }],
      isError: false
    };
  }

  private async refreshSource(args: DiscoverToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Get source
    const source = await this.sourceRepository.findByName(args.name!);
    if (!source) {
      return {
        content: [{ 
          type: 'text', 
          text: `Source "${args.name}" not found` 
        }],
        isError: true
      };
    }

    // Start crawling
    const jobId = await this.crawlerService.startCrawlJob({
      sourceId: source.id,
      maxDepth: args.depth || source.crawlConfig.maxDepth,
      maxPages: args.pages || source.crawlConfig.maxPages,
      force: args.force || false
    });

    return {
      content: [{ 
        type: 'text', 
        text: `Started crawl job ${jobId} for source "${args.name}".` 
      }],
      isError: false
    };
  }

  private generateSourceId(name: string): string {
    // Create a predictable ID from name using crypto
    return createHash('sha256').update(name).digest('hex').substring(0, 12);
  }
}