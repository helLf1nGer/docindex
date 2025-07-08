#!/usr/bin/env node
/**
 * DocSI MCP Server - Main entry point
 * 
 * This server provides MCP tools for document indexing and searching.
 * It follows a modular architecture with separate handlers for each tool.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import os from 'os';

// Import handlers
import { CheckToolHandler } from './handlers/check-tool-handler.js';
import { InfoToolHandler } from './handlers/info-tool-handler.js';
import { DiscoverToolHandler } from './handlers/discover-tool-handler.js';
import { SearchToolHandler } from './handlers/search-tool-handler.js';
import { GetDocumentHandler } from './handlers/get-document-handler.js';
import { BatchCrawlToolHandler } from './handlers/batch-crawl-tool-handler.js';

// Import services
import { LoggerService } from './services/logger-service.js';
import { ConfigService } from './services/config-service.js';

// Import repositories
import { FileSystemDocumentRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';

// Import crawler service
import { CrawlerServiceProvider } from '../../services/crawler/infrastructure/CrawlerServiceProvider.js';

// Initialize logger
const logger = new LoggerService();

/**
 * Main DocSI MCP server class
 * Initializes and manages the MCP server instance
 */
class DocSIServer {
  private server: Server;
  private configService: ConfigService;
  
  // Tool handlers
  private checkToolHandler: CheckToolHandler;
  private infoToolHandler: InfoToolHandler;
  private discoverToolHandler: DiscoverToolHandler;
  private searchToolHandler: SearchToolHandler;
  private getDocumentHandler: GetDocumentHandler;
  private batchCrawlToolHandler: BatchCrawlToolHandler;
  
  constructor() {
    // Initialize configuration
    this.configService = new ConfigService({
      dataDir: process.env.DOCSI_DATA_DIR || path.join(os.homedir(), '.docsi'),
      version: '1.0.0',
    });
    
    // Create MCP server
    this.server = new Server(
      {
        name: 'docsi',
        version: this.configService.get('version'),
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Initialize repositories
    const documentRepository = new FileSystemDocumentRepository(
      path.join(this.configService.get('dataDir'), 'documents')
    );
    
    const documentSourceRepository = new FileSystemDocumentSourceRepository(
      path.join(this.configService.get('dataDir'), 'sources')
    );
    
    // Initialize tool handlers
    this.checkToolHandler = new CheckToolHandler();
    this.infoToolHandler = new InfoToolHandler(this.configService);
    this.discoverToolHandler = new DiscoverToolHandler(
      documentSourceRepository,
      documentRepository
    );
    this.searchToolHandler = new SearchToolHandler(documentRepository);
    this.getDocumentHandler = new GetDocumentHandler(documentRepository);
    this.batchCrawlToolHandler = new BatchCrawlToolHandler(
      documentSourceRepository,
      documentRepository,
      new (require('events').EventEmitter)()
    );
    
    // Initialize error handler
    this.server.onerror = (error) => {
      logger.error('[MCP Error]', error);
    };
    
    // Initialize shutdown handler
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
    
    // Initialize crawler service and connect to handlers
    this.initializeCrawlerService();
  }
  
  /**
   * Initialize the crawler service and connect it to the handlers
   */
  private async initializeCrawlerService(): Promise<void> {
    try {
      // Get crawler service instance
      const crawlerService = await CrawlerServiceProvider.getInstance();
      
      // Connect crawler service to handlers
      this.discoverToolHandler.setCrawlerService(crawlerService);
      this.batchCrawlToolHandler.setCrawlerService(crawlerService);
      
      // Setup event listeners for crawler events
      const eventEmitter = crawlerService.getEventEmitter();
      
      // Log crawler events - but only at debug level, not visible in standard output
      eventEmitter.on('page-discovered', (event: any) => {
        // Don't log in standard output to avoid cluttering MCP communication
        // logger.debug(`Discovered page: ${event.data.url} (depth: ${event.data.depth})`);
      });
      
      eventEmitter.on('page-crawled', (event: any) => {
        // Don't log in standard output to avoid cluttering MCP communication
        // logger.debug(`Crawled page: ${event.data.url} (title: ${event.data.title})`);
      });
      
      eventEmitter.on('job-completed', (event: any) => {
        // Don't log in standard output to avoid cluttering MCP communication
        // logger.debug(`Crawl job completed: ${event.jobId} (pages: ${event.data.pagesCrawled})`);
      });
      
      // Removed info log message to prevent cluttering output
    } catch (error: unknown) {
      // Only log errors - these are important enough to display
      logger.error('Failed to initialize crawler service:', error);
    }
  }
  
  /**
   * Initialize server handlers
   */
  private initializeHandlers(): void {
    // Set handler for listing tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        ...this.checkToolHandler.getToolDefinitions(),
        ...this.infoToolHandler.getToolDefinitions(),
        ...this.discoverToolHandler.getToolDefinitions(),
        ...this.searchToolHandler.getToolDefinitions(),
        ...this.getDocumentHandler.getToolDefinitions(),
        ...this.batchCrawlToolHandler.getToolDefinitions(),
      ];
      
      return { tools };
    });
    
    // Set handler for tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: toolArgs } = request.params;
      
      try {
        let toolResponse;
        
        // Route to appropriate handler
        if (name.startsWith('docsi-check')) {
          toolResponse = await this.checkToolHandler.handleToolCall(name, toolArgs);
        } else if (name.startsWith('docsi-info')) {
          toolResponse = await this.infoToolHandler.handleToolCall(name, toolArgs);
        } else if (name.startsWith('docsi-discover')) {
          toolResponse = await this.discoverToolHandler.handleToolCall(name, toolArgs);
        } else if (name.startsWith('docsi-search')) {
          toolResponse = await this.searchToolHandler.handleToolCall(name, toolArgs);
        } else if (name.startsWith('docsi-get-document')) {
          toolResponse = await this.getDocumentHandler.handleToolCall(name, toolArgs);
        } else if (name.startsWith('docsi-batch')) {
          toolResponse = await this.batchCrawlToolHandler.handleToolCall(name, toolArgs);
        } else {
          // Unknown tool - return error
          return {
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          };
        }
        
        // Properly format the response according to MCP SDK expectations
        return {
          content: toolResponse.content,
          isError: toolResponse.isError || false
        };
        
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error executing tool ${name}:`, message);
        
        // Return error in the format expected by MCP SDK
        return {
          error: {
            code: -32603,
            message: `Error executing tool ${name}: ${message}`
          }
        };
      }
    });
  }
  
  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Initialize handlers
      this.initializeHandlers();
      
      // Connect to transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      // Don't log server start to avoid cluttering MCP communication
      // logger.info('DocSI MCP server running on stdio');
    } catch (error) {
      logger.error('Failed to start DocSI MCP server:', error);
      process.exit(1);
    }
  }
}

// Create and start server
// Removed startup log message to prevent cluttering output
const server = new DocSIServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});