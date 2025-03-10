/**
 * Implementation of the admin tool service
 * Provides system administration and configuration capabilities
 */

import { IAdminService } from './interfaces.js';
import { AdminToolArgs, McpContentItem } from '../tool-types.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { config } from '../../../shared/infrastructure/config.js';

/**
 * Implementation of the admin tool service
 */
export class AdminService implements IAdminService {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly sourceRepository: IDocumentSourceRepository
  ) {}

  async handleToolRequest(args: AdminToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Validate required fields
    if (!args.action) {
      return {
        content: [{ type: 'text', text: 'Action is required' }],
        isError: true
      };
    }

    try {
      switch (args.action) {
        case 'status':
          return await this.getStatus();
        case 'stats':
          return await this.getStats(args.target);
        case 'clean':
          return await this.cleanData(args.target);
        case 'config':
          return await this.getConfig();
        case 'export':
          return await this.exportData(args.target, args.path);
        case 'import':
          return await this.importData(args.target, args.path);
        default:
          return {
            content: [{ 
              type: 'text', 
              text: `Admin action '${args.action}' not implemented yet` 
            }],
            isError: false
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing admin request: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * Get system status
   */
  private async getStatus(): Promise<{ content: McpContentItem[], isError: boolean }> {
    const docCount = await this.documentRepository.count();
    const sources = await this.sourceRepository.findAll();
    
    return {
      content: [{ 
        type: 'text', 
        text: `
DocSI Status:
-------------------
Version: ${config.mcp.version}
Data Directory: ${config.dataDir}
Running Since: ${new Date().toISOString()}
Cache Status: ${config.cache.enabled ? 'Enabled' : 'Disabled'}
Log Level: ${config.logLevel}
Robots.txt Respect: ${config.crawler.respectRobotsTxt ? 'Enabled' : 'Disabled'}

System Statistics:
-------------------
Documents Indexed: ${docCount}
Sources Configured: ${sources.length}
Vector Database: ${config.vectorDatabase.type}
Database: ${config.database.type}
`
      }],
      isError: false
    };
  }

  /**
   * Get statistics for a source or global stats
   */
  private async getStats(sourceId?: string): Promise<{ content: McpContentItem[], isError: boolean }> {
    if (sourceId) {
      const source = await this.sourceRepository.findById(sourceId) || 
                     await this.sourceRepository.findByName(sourceId);
      
      if (!source) {
        return {
          content: [{ type: 'text', text: `Source not found: ${sourceId}` }],
          isError: true
        };
      }

      // Count documents for this source
      const docsCount = await this.documentRepository.count({
        sourceIds: [source.id]
      });
      
      return {
        content: [{ 
          type: 'text', 
          text: `
Source Statistics: ${source.name}
-------------------
ID: ${source.id}
Base URL: ${source.baseUrl}
Documents Indexed: ${docsCount}
Added: ${source.addedAt.toISOString()}
Last Crawled: ${source.lastCrawledAt ? source.lastCrawledAt.toISOString() : 'Never'}
Max Depth: ${source.crawlConfig.maxDepth}
Max Pages: ${source.crawlConfig.maxPages}
Tags: ${source.tags.join(', ') || 'None'}
`
        }],
        isError: false
      };
    }

    // Get global stats
    const docCount = await this.documentRepository.count();
    const sources = await this.sourceRepository.findAll();
    
    return {
      content: [{ 
        type: 'text', 
        text: `
Global Statistics:
-------------------
Total Documents: ${docCount}
Total Sources: ${sources.length}
Average Documents per Source: ${sources.length > 0 ? Math.round(docCount / sources.length) : 0}

Top Sources:
${sources.slice(0, 5).map(s => `- ${s.name}: ${s.lastCrawledAt ? 'Last updated ' + s.lastCrawledAt.toISOString() : 'Never crawled'}`).join('\n')}
`
      }],
      isError: false
    };
  }

  /**
   * Clean data for a source or globally
   */
  private async cleanData(target?: string): Promise<{ content: McpContentItem[], isError: boolean }> {
    if (target) {
      const source = await this.sourceRepository.findById(target) || 
                     await this.sourceRepository.findByName(target);
      
      if (!source) {
        return {
          content: [{ type: 'text', text: `Source not found: ${target}` }],
          isError: true
        };
      }

      // Find all documents for this source
      const documents = await this.documentRepository.findBySourceId(source.id);
      
      // Delete each document individually
      for (const doc of documents) {
        await this.documentRepository.delete(doc.id);
      }
      
      return {
        content: [{ 
          type: 'text', 
          text: `Cleaned all documents for source: ${source.name}`
        }],
        isError: false
      };
    }

    return {
      content: [{ 
        type: 'text', 
        text: `Please specify a target source to clean. Use 'all' to clean all data.`
      }],
      isError: true
    };
  }

  /**
   * Get current configuration
   */
  private async getConfig(): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Remove sensitive data from config
    const safeConfig = {
      ...config,
      database: {
        ...config.database,
        connectionString: '***REDACTED***'
      },
      vectorDatabase: {
        ...config.vectorDatabase,
        connectionString: '***REDACTED***'
      }
    };
    
    return {
      content: [{ 
        type: 'text', 
        text: `
DocSI Configuration:
-------------------
${JSON.stringify(safeConfig, null, 2)}
`
      }],
      isError: false
    };
  }

  /**
   * Export data to file
   */
  private async exportData(target?: string, filePath?: string): Promise<{ content: McpContentItem[], isError: boolean }> {
    // This is a placeholder implementation
    return {
      content: [{ 
        type: 'text', 
        text: `Export functionality not fully implemented yet. Would export ${target || 'all'} data to ${filePath || 'default file'}.`
      }],
      isError: false
    };
  }

  /**
   * Import data from file
   */
  private async importData(target?: string, filePath?: string): Promise<{ content: McpContentItem[], isError: boolean }> {
    // This is a placeholder implementation
    return {
      content: [{ 
        type: 'text', 
        text: `Import functionality not fully implemented yet. Would import ${target || 'all'} data from ${filePath || 'default file'}.`
      }],
      isError: false
    };
  }
}