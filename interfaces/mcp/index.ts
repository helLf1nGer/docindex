#!/usr/bin/env node
/**
 * MCP Server implementation for DocSI
 * 
 * This file implements a Domain-Driven Design approach with proper 
 * separation of concerns for the DocSI MCP server.
 * 
 * @see https://modelcontextprotocol.io/introduction
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
} from './tool-types.js';

// Import service interfaces
import {
  IDiscoverService,
  ISearchService,
  IAnalyzeService,
  IAdminService
} from './services/interfaces.js';

// Import service implementations
import { DiscoverService } from './services/DiscoverService.js';
import { SearchService } from './services/SearchService.js';
import { AnalyzeService } from './services/AnalyzeService.js';
import { AdminService } from './services/AdminService.js';

// Import domain services
import { CrawlerServiceProvider } from '../../services/crawler/infrastructure/CrawlerServiceProvider.js';

// Import repositories
import { FileSystemDocumentRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';

// Initialize logger
const logger = console; // Will be replaced with proper logger

/**
 * DocSI MCP Server with Domain-Driven Design
 */
class DocSIMcpServer {
  private server: Server;
  // The non-null assertion operator (!) tells TypeScript these will be initialized before use
  private discoverService!: IDiscoverService;
  private searchService!: ISearchService;
  private analyzeService!: IAnalyzeService;
  private adminService!: IAdminService;
  
  constructor() {
    // Create MCP server
    this.server = new Server(
      {
        name: config.mcp.name,
        version: config.mcp.version,
      },
      {
        capabilities: {
          tools: {}, // Configure tool capabilities if needed
        },
      }
    );
    
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
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      // Ensure data directories exist
      ensureDirectories();
      
      // Initialize repositories
      const documentRepository = new FileSystemDocumentRepository();
      const sourceRepository = new FileSystemDocumentSourceRepository();
      
      await documentRepository.initialize();
      await sourceRepository.initialize();
      
      // Get crawler service
      const crawlerService = await CrawlerServiceProvider.getInstance();
      
      // Create services with dependencies
      this.discoverService = new DiscoverService(sourceRepository, crawlerService);
      this.searchService = new SearchService(documentRepository, sourceRepository);
      this.analyzeService = new AnalyzeService(documentRepository, sourceRepository);
      this.adminService = new AdminService(documentRepository, sourceRepository);
      
      logger.info('DocSI MCP server services initialized');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }
  
  /**
   * Setup tool handlers for MCP requests
   */
  private setupToolHandlers() {
    // Set up the tools list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        /* docsi-discover tool definition */
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
        
        /* docsi-search tool definition */
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
                default: 'semantic'
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
        
        /* docsi-analyze tool definition */
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
        
        /* docsi-admin tool definition */
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
    }));
    
    // Set up the tool execution handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'docsi-discover':
            return await this.discoverService.handleToolRequest(args as unknown as DiscoverToolArgs);
          case 'docsi-search':
            return await this.searchService.handleToolRequest(args as unknown as SearchToolArgs);
          case 'docsi-analyze':
            return await this.analyzeService.handleToolRequest(args as unknown as AnalyzeToolArgs);
          case 'docsi-admin':
            return await this.adminService.handleToolRequest(args as unknown as AdminToolArgs);
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
   * Start the MCP server
   */
  public async start(): Promise<void> {
    try {
      // Initialize services first
      await this.initializeServices();
      
      // Connect to the transport (stdio)
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('DocSI MCP server running on stdio');
    } catch (error: unknown) {
      logger.error('Failed to start DocSI MCP server:', error);
      process.exit(1);
    }
  }
}

// Create and start the server
logger.info('Starting DocSI MCP server with DDD architecture...');
const server = new DocSIMcpServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});