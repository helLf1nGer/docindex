#!/usr/bin/env node
/**
 * DocSI MCP Server - Domain-Driven Design Implementation
 * 
 * This is the production-ready DDD implementation of the MCP server for DocSI
 * that integrates with the domain services and repositories using clean architecture.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { config, ensureDirectories } from '../../shared/infrastructure/config.js';
import { 
  DiscoverToolArgs, 
  SearchToolArgs, 
  AnalyzeToolArgs, 
  AdminToolArgs,
  McpContentItem
} from './tool-types.js';
import { CrawlerServiceProvider } from '../../services/crawler/infrastructure/CrawlerServiceProvider.js';
import { FileSystemDocumentRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';
import { DocumentSearchQuery } from '../../shared/domain/repositories/DocumentRepository.js';
import { Document, DocumentSource } from '../../shared/domain/models/Document.js';
import { createHash } from 'crypto';

// Initialize logger to console for now
const logger = console;

/**
 * DocSI MCP Server with Domain-Driven Design
 */
class DocSIDDDMcpServer {
  private server: Server;
  private documentRepository: FileSystemDocumentRepository;
  private sourceRepository: FileSystemDocumentSourceRepository;
  
  constructor() {
    // Create MCP server
    this.server = new Server(
      {
        name: config.mcp.name,
        version: config.mcp.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Initialize repositories
    this.documentRepository = new FileSystemDocumentRepository();
    this.sourceRepository = new FileSystemDocumentSourceRepository();
    
    // Initialize handlers
    this.setupToolHandlers();
    
    // Handle errors
    this.server.onerror = (error) => {
      logger.error('[MCP Error]', error);
    };
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }
  
  /**
   * Initialize repositories
   */
  private async initializeRepositories(): Promise<void> {
    try {
      await this.documentRepository.initialize();
      await this.sourceRepository.initialize();
      logger.info('Repositories initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize repositories:', error);
      throw error;
    }
  }
  
  /**
   * Set up MCP tool handlers
   */
  private setupToolHandlers(): void {
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Basic tools
          {
            name: 'docsi-check',
            description: 'Check if the DocSI MCP server is functioning properly',
            inputSchema: {
              type: 'object',
              properties: {
                echo: {
                  type: 'string',
                  description: 'Text to echo back'
                }
              }
            }
          },
          {
            name: 'docsi-info',
            description: 'Get information about the DocSI installation',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          
          // Main tools
          {
            name: 'docsi-discover',
            description: 'Discover and manage documentation sources',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  description: 'Action to perform (add, refresh, list)',
                  enum: ['add', 'refresh', 'list']
                },
                url: {
                  type: 'string',
                  description: 'URL of the documentation source (required for add action)'
                },
                name: {
                  type: 'string',
                  description: 'Name of the documentation source (required for add and refresh actions)'
                },
                depth: {
                  type: 'integer',
                  description: 'Maximum crawl depth',
                  default: 3
                },
                pages: {
                  type: 'integer',
                  description: 'Maximum pages to crawl',
                  default: 100
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Tags for categorizing the documentation'
                },
                force: {
                  type: 'boolean',
                  description: 'Force refresh existing content',
                  default: false
                }
              },
              required: ['action']
            }
          },
          {
            name: 'docsi-search',
            description: 'Search documentation using keyword, semantic, or API-specific queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query'
                },
                type: {
                  type: 'string',
                  description: 'Type of search to perform',
                  enum: ['keyword', 'semantic', 'api'],
                  default: 'keyword'
                },
                sources: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Limit search to specific sources'
                },
                apiType: {
                  type: 'string',
                  description: 'For API searches, type of API component to search for',
                  enum: ['function', 'class', 'method', 'property', 'all'],
                  default: 'all'
                },
                limit: {
                  type: 'integer',
                  description: 'Maximum number of results to return',
                  default: 10
                },
                context: {
                  type: 'boolean',
                  description: 'Include context around search results',
                  default: true
                }
              },
              required: ['query']
            }
          },
          {
            name: 'docsi-analyze',
            description: 'Analyze documentation and extract relationships, specifications, and knowledge graphs',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  description: 'Type of analysis to perform',
                  enum: ['relationships', 'api-spec', 'knowledge-graph', 'semantic-document'],
                  default: 'relationships'
                },
                url_or_id: {
                  type: 'string',
                  description: 'URL or ID of the document to analyze'
                },
                depth: {
                  type: 'integer',
                  description: 'For relationship analysis, depth of relationships to extract',
                  default: 1
                },
                includeContent: {
                  type: 'boolean',
                  description: 'Whether to include full content in the results',
                  default: false
                }
              },
              required: ['url_or_id']
            }
          },
          {
            name: 'docsi-admin',
            description: 'System administration and configuration for DocSI',
            inputSchema: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  description: 'Admin action to perform',
                  enum: ['status', 'config', 'stats', 'clean', 'export', 'import'],
                  default: 'status'
                },
                target: {
                  type: 'string',
                  description: 'Target for the action (e.g., source name for stats)'
                },
                path: {
                  type: 'string',
                  description: 'File path for import/export operations'
                },
                options: {
                  type: 'object',
                  description: 'Additional options for the action'
                }
              },
              required: ['action']
            }
          }
        ]
      };
    });
    
    // Handler for tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'docsi-check':
            return {
              content: [
                {
                  type: 'text',
                  text: `DocSI-DDD MCP server is functioning properly! Echo: ${args?.echo || 'No echo provided'}`
                }
              ]
            };
            
          case 'docsi-info':
            return {
              content: [
                {
                  type: 'text',
                  text: `
DocSI Information:
------------------
Version: ${config.mcp.version}
Data Directory: ${config.dataDir}
Running Since: ${new Date().toISOString()}
Protocol: Model Context Protocol
Transport: stdio
Node Version: ${process.version}
Platform: ${process.platform}
Architecture: Domain-Driven Design
Documents: ${await this.documentRepository.count()}
Sources: ${(await this.sourceRepository.findAll()).length}
                  `.trim()
                }
              ]
            };
            
          case 'docsi-discover':
            return await this.handleDiscoverTool(args as unknown as DiscoverToolArgs);
            
          case 'docsi-search':
            return await this.handleSearchTool(args as unknown as SearchToolArgs);
            
          case 'docsi-analyze':
            return await this.handleAnalyzeTool(args as unknown as AnalyzeToolArgs);
            
          case 'docsi-admin':
            return await this.handleAdminTool(args as unknown as AdminToolArgs);
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${message}`
            }
          ],
          isError: true
        };
      }
    });
  }
  
  /**
   * Handle the docsi-discover tool
   * Manages documentation sources (add, refresh, list)
   */
  private async handleDiscoverTool(args: DiscoverToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
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
          // List all sources
          const sources = await this.sourceRepository.findAll();
          return {
            content: [
              {
                type: 'text',
                text: sources.length > 0 
                  ? `Found ${sources.length} documentation sources:\n\n` + 
                    sources.map(s => `- ${s.name} (${s.baseUrl})\n  Added: ${s.addedAt.toISOString()}\n  Last Crawled: ${s.lastCrawledAt ? s.lastCrawledAt.toISOString() : 'Never'}`).join('\n\n')
                  : 'No documentation sources found. Add sources with the "add" action.'
              }
            ],
            isError: false
          };

        case 'add':
          // Validate required fields
          if (!args.url) {
            return {
              content: [{ type: 'text', text: 'URL is required for add action' }],
              isError: true
            };
          }
          if (!args.name) {
            return {
              content: [{ type: 'text', text: 'Name is required for add action' }],
              isError: true
            };
          }

          // Check if source already exists
          const existingSource = await this.sourceRepository.findByName(args.name);
          if (existingSource && !args.force) {
            return {
              content: [{ 
                type: 'text', 
                text: `Source "${args.name}" already exists. Use "force: true" to overwrite.` 
              }],
              isError: true
            };
          }

          // Create new source
          const newSource: DocumentSource = {
            id: existingSource?.id || this.generateSourceId(args.name),
            name: args.name,
            baseUrl: args.url,
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
          await this.sourceRepository.save(newSource);

          // Optionally start crawling
          if (args.force) {
            const crawlerService = await CrawlerServiceProvider.getInstance();
            const jobId = await crawlerService.startCrawlJob({
              sourceId: newSource.id,
              maxDepth: newSource.crawlConfig.maxDepth,
              maxPages: newSource.crawlConfig.maxPages,
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

        case 'refresh':
          // Validate required fields
          if (!args.name) {
            return {
              content: [{ type: 'text', text: 'Name is required for refresh action' }],
              isError: true
            };
          }

          // Get source
          const source = await this.sourceRepository.findByName(args.name);
          if (!source) {
            return {
              content: [{ type: 'text', text: `Source "${args.name}" not found` }],
              isError: true
            };
          }

          // Start crawling
          const crawlerService = await CrawlerServiceProvider.getInstance();
          const jobId = await crawlerService.startCrawlJob({
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

        default:
          return {
            content: [{ 
              type: 'text', 
              text: `Invalid action: ${args.action}. Use "add", "refresh", or "list".` 
            }],
            isError: true
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing discover tool: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * Handle the docsi-search tool
   * Searches documentation with different modes
   */
  private async handleSearchTool(args: SearchToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Validate required fields
    if (!args.query) {
      return {
        content: [{ type: 'text', text: 'Query is required' }],
        isError: true
      };
    }

    try {
      const searchType = args.type || 'keyword';
      
      // For now, all search types use DocumentRepository search
      // In the future, semantic and API search would use specialized repositories
      // Convert to document search query
      const searchQuery: DocumentSearchQuery = {
        text: args.query,
        sourceIds: args.sources,
        limit: args.limit || 10
      };

      // Perform search
      const results = await this.documentRepository.search(searchQuery);

      if (results.length === 0) {
        return {
          content: [{ 
            type: 'text', 
            text: `No results found for query: "${args.query}"` 
          }],
          isError: false
        }
      }

      // Format results
      let formattedResults: string;
      
      if (searchType === 'api' && args.apiType) {
        // API search would show more structured results for API components
        formattedResults = results.map((doc, index) => {
          return `${index + 1}. ${doc.title}\n   URL: ${doc.url}\n   Source: ${doc.sourceId}\n   ${
            args.context ? `\n   Context: ${doc.textContent.substring(0, 200)}...` : ''
          }\n`;
        }).join('\n');
        
        formattedResults = `API Search Results (${args.apiType}):\n\n${formattedResults}`;
      } else {
        // Standard keyword or semantic search
        formattedResults = results.map((doc, index) => {
          return `${index + 1}. ${doc.title}\n   URL: ${doc.url}\n   Source: ${doc.sourceId}\n   ${
            args.context ? `\n   Context: ${doc.textContent.substring(0, 200)}...` : ''
          }\n`;
        }).join('\n');
        
        formattedResults = `${searchType.charAt(0).toUpperCase() + searchType.slice(1)} Search Results:\n\n${formattedResults}`;
      }

      return {
        content: [{ 
          type: 'text', 
          text: `Found ${results.length} results for "${args.query}":\n\n${formattedResults}` 
        }],
        isError: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing search tool: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * Handle the docsi-analyze tool
   * Analyzes documents with different techniques
   */
  private async handleAnalyzeTool(args: AnalyzeToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Validate required fields
    if (!args.url_or_id) {
      return {
        content: [{ type: 'text', text: 'URL or ID is required' }],
        isError: true
      };
    }

    try {
      // Try to find document by ID first, then by URL
      let document: Document | null = await this.documentRepository.findById(args.url_or_id);
      
      if (!document) {
        document = await this.documentRepository.findByUrl(args.url_or_id);
      }

      if (!document) {
        return {
          content: [
            {
              type: 'text',
              text: `Document not found with ID or URL: ${args.url_or_id}`
            }
          ],
          isError: true
        };
      }

      // Determine analysis type
      const analysisType = args.action || 'relationships';
      
      // Get source information
      const source = await this.sourceRepository.findById(document.sourceId);
      
      // Get basic document info response
      let analysisText = `
Document Analysis (${analysisType}):

Title: ${document.title}
URL: ${document.url}
Source: ${source ? source.name : document.sourceId}
Indexed: ${document.indexedAt.toISOString()}
Last Updated: ${document.updatedAt.toISOString()}
Tags: ${document.tags.join(', ') || 'None'}
`;

      // Specialized handling for different analysis types
      switch (analysisType) {
        case 'api-spec':
          analysisText += `
API Components:
--------------
${document.metadata?.apiComponents ? JSON.stringify(document.metadata.apiComponents, null, 2) : 'No API components detected'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
          break;
          
        case 'knowledge-graph':
          analysisText += `
Knowledge Graph:
--------------
${document.metadata?.knowledgeGraph ? JSON.stringify(document.metadata.knowledgeGraph, null, 2) : 'No knowledge graph available'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
          break;
          
        case 'semantic-document':
          analysisText += `
Semantic Structure:
-----------------
${document.metadata?.semanticStructure ? JSON.stringify(document.metadata.semanticStructure, null, 2) : 'No semantic structure available'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
          break;
          
        case 'relationships':
        default:
          // For relationships, find related documents
          const relatedDocs = await this.documentRepository.search({
            sourceIds: [document.sourceId],
            limit: 5,
            // This is simplistic - in real implementation would use embeddings or more sophisticated matching
            text: document.title.split(' ').slice(0, 3).join(' ')
          });
          
          analysisText += `
Related Documents:
----------------
${relatedDocs.length > 1 ? 
  relatedDocs.filter(d => d.id !== document.id).map(d => `- ${d.title} (${d.url})`).join('\n') : 
  'No related documents found'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
      }

      return {
        content: [{ 
          type: 'text', 
          text: analysisText.trim()
        }],
        isError: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing analyze tool: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * Handle the docsi-admin tool
   * Provides system administration features
   */
  private async handleAdminTool(args: AdminToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
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
          // Get counts
          const docCount = await this.documentRepository.count();
          const sourceCount = (await this.sourceRepository.findAll()).length;

          // Get running crawler jobs if crawler service is available
          let jobsInfo = "";
          try {
            const crawlerService = await CrawlerServiceProvider.getInstance();
            // Since we don't have a method to get all job statuses, we'll just note that the crawler is available
            jobsInfo = "\nCrawler service is active and available for job processing.";
          } catch (error) {
            jobsInfo = "\nCrawler service is not currently available.";
          }
          
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
Architecture: Domain-Driven Design

Statistics:
- Documents: ${docCount}
- Sources: ${sourceCount}${jobsInfo}
              `.trim() 
            }],
            isError: false
          };

        case 'config':
          // Show configuration
          return {
            content: [{ 
              type: 'text', 
              text: `
DocSI Configuration:
-------------------
Data Directory: ${config.dataDir}
Log Level: ${config.logLevel}
Max Concurrent Requests: ${config.maxConcurrentRequests}

Crawler Settings:
- User Agent: ${config.crawler.userAgent}
- Max Depth: ${config.crawler.maxDepth}
- Max Pages: ${config.crawler.maxPages}
- Crawl Delay: ${config.crawler.crawlDelay}ms
- Respect Robots.txt: ${config.crawler.respectRobotsTxt}

Cache Settings:
- Enabled: ${config.cache.enabled}
- TTL: ${config.cache.ttl}s
- Max Size: ${config.cache.maxSize}MB

Security Settings:
- Encrypt Documents: ${config.security.encryptDocuments}
- Max Path Depth: ${config.security.maxPathDepth}
- Allowed Hosts: ${config.security.allowedHosts.join(', ')}
              `.trim() 
            }],
            isError: false
          };

        case 'stats':
          // If target provided, get stats for specific source
          if (args.target) {
            const source = await this.sourceRepository.findByName(args.target);
            if (!source) {
              return {
                content: [{ type: 'text', text: `Source "${args.target}" not found` }],
                isError: true
              };
            }

            const docs = await this.documentRepository.findBySourceId(source.id);
            
            return {
              content: [{ 
                type: 'text', 
                text: `
Stats for source "${args.target}":
- Documents: ${docs.length}
- Base URL: ${source.baseUrl}
- Added: ${source.addedAt.toISOString()}
- Last Crawled: ${source.lastCrawledAt ? source.lastCrawledAt.toISOString() : 'Never'}
- Max Depth: ${source.crawlConfig.maxDepth}
- Max Pages: ${source.crawlConfig.maxPages}
                `.trim() 
              }],
              isError: false
            };
          }
          
          // General stats
          const documents = await this.documentRepository.count();
          const sources = (await this.sourceRepository.findAll()).length;
          
          // Get source-specific counts
          const sourceList = await this.sourceRepository.findAll();
          const sourceCounts = await Promise.all(
            sourceList.map(async source => {
              const count = await this.documentRepository.count({
                sourceIds: [source.id]
              });
              return { name: source.name, count };
            })
          );
          
          return {
            content: [{ 
              type: 'text', 
              text: `
DocSI Statistics:
- Total Documents: ${documents}
- Total Sources: ${sources}

Documents per source:
${sourceCounts.map(s => `- ${s.name}: ${s.count}`).join('\n')}
              `.trim() 
            }],
            isError: false
          };
          
        case 'clean':
          return {
            content: [{ 
              type: 'text', 
              text: `
The clean action is not yet fully implemented in the production release.

This action would:
1. Remove orphaned documents
2. Clean up temporary files
3. Optimize storage

For now, please use file system operations to manage the data directory at:
${config.dataDir}
              `.trim() 
            }],
            isError: false
          };
          
        case 'export':
        case 'import':
          return {
            content: [{ 
              type: 'text', 
              text: `
The ${args.action} action is not yet fully implemented in the production release.

In a future version, this will allow you to:
- Export the entire dataset to a portable format
- Import data from other DocSI instances
- Migrate between storage backends

For now, please use file system operations to manage the data directory at:
${config.dataDir}
              `.trim() 
            }],
            isError: false
          };

        default:
          return {
            content: [{ 
              type: 'text', 
              text: `
Admin action "${args.action}" is not recognized.

Available actions:
- status: Show system status
- config: Show configuration
- stats: Show statistics (optionally with target source name)
- clean: Clean up temporary files and optimize storage
- export: Export data to a file
- import: Import data from a file
              `.trim() 
            }],
            isError: true
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing admin tool: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * Generate a source ID from a name
   */
  private generateSourceId(name: string): string {
    return createHash('sha256').update(name).digest('hex');
  }

  /**
   * Start the MCP server
   */
  public async start(): Promise<void> {
    try {
      // Ensure data directories exist
      ensureDirectories();
      
      // Initialize repositories
      await this.initializeRepositories();
      
      // Connect to the transport (stdio)
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('DocSI-DDD MCP server running on stdio');
    } catch (error: unknown) {
      logger.error('Failed to start DocSI-DDD MCP server:', error);
      process.exit(1);
    }
  }
}

// Create and start server
logger.info('Starting DocSI-DDD MCP server...');
const server = new DocSIDDDMcpServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});