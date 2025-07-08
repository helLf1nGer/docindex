#!/usr/bin/env node
/**
 * DocSI MCP Server - Main entry point (Simplified Version)
 * 
 * This version uses the simplified crawler implementation for more reliable crawling.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { EventEmitter } from 'events';
import { chromium, Browser } from 'playwright'; // Added Playwright imports
import { EmbeddingService } from '../../shared/infrastructure/EmbeddingService.js';
import { QdrantVectorRepository } from '../../shared/infrastructure/repositories/QdrantVectorRepository.js';
import { SemanticSearch } from '../../shared/infrastructure/repositories/document/SemanticSearch.js';
import { HybridSearch } from '../../shared/infrastructure/repositories/document/HybridSearch.js';
import { DocumentSearch } from '../../shared/infrastructure/repositories/document/DocumentSearch.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import os from 'os';

// Removed console.log redirection hack

// Import handlers
import { CheckToolHandler } from './handlers/check-tool-handler.js';
import { InfoToolHandler } from './handlers/info-tool-handler.js';
import { DiscoverToolHandler } from './handlers/discover-tool-handler.js';
import { SearchToolHandler } from './handlers/search-tool-handler.js';
import { GetDocumentHandler } from './handlers/get-document-handler.js';
import { BatchCrawlToolHandler } from './handlers/batch-crawl-tool-handler.js';

// Import services
// Removed incorrect LoggerService import
import { Logger, getLogger } from '../../shared/infrastructure/logging.js'; // Import correct Logger
import { ConfigService } from './services/config-service.js';

// Import repositories
import { FileSystemDocumentRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';

// Import the simplified crawler service provider
import { SimpleCrawlerServiceProvider } from '../../services/crawler/infrastructure/SimpleCrawlerServiceProvider.js';

// Initialize logger
const logger = getLogger(); // Use the correct logger factory

/**
 * Main DocSI MCP server class using the simplified crawler
 * Initializes and manages the MCP server instance
 */
class DocSISimplifiedServer {
  private server: Server;
  private configService: ConfigService;
  private browser: Browser | null = null;
  private documentRepository: FileSystemDocumentRepository; // Store repository instance
  private documentSourceRepository: FileSystemDocumentSourceRepository; // Store repository instance
  
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
    // Pass the logger instance as the second argument
    // Store repository instances as class properties
    this.documentRepository = new FileSystemDocumentRepository(
      path.join(this.configService.get('dataDir'), 'documents'),
      logger // Added logger instance
    );
    
    this.documentSourceRepository = new FileSystemDocumentSourceRepository(
      path.join(this.configService.get('dataDir'), 'sources')
    );
    
    // Initialize tool handlers
    this.checkToolHandler = new CheckToolHandler();
    this.infoToolHandler = new InfoToolHandler(this.configService);
    this.discoverToolHandler = new DiscoverToolHandler(
      this.documentSourceRepository, // Use class property
      this.documentRepository // Use class property
    );
    // Initialize embedding and vector components
    const embeddingService = new EmbeddingService();
    const vectorRepo = new QdrantVectorRepository('http://localhost:6333');

    // Initialize semantic search
    const semanticSearch = new SemanticSearch(
      embeddingService,
      vectorRepo,
      this.documentRepository // Use class property
    );

    // Initialize hybrid search
    const documentSearch = this.documentRepository['searchService'] || new DocumentSearch(); // Use class property
    const hybridSearch = new HybridSearch(
      documentSearch,
      semanticSearch,
      this.documentRepository, // Use class property
      logger // Pass the logger instance as the fourth argument
    );

    // Initialize search tool handler with new components
    this.searchToolHandler = new SearchToolHandler(
      this.documentRepository, // Use class property
      semanticSearch,
      hybridSearch
    );
    this.getDocumentHandler = new GetDocumentHandler(this.documentRepository); // Use class property
    this.batchCrawlToolHandler = new BatchCrawlToolHandler(
      this.documentSourceRepository, // Use class property
      this.documentRepository, // Use class property
      new EventEmitter()
    );
    
    // Initialize error handler
    this.server.onerror = (error) => {
      logger.logError(error instanceof Error ? error : new Error(String(error)), 'DocsiServer', '[MCP Error]');
    };
    
    // Initialize shutdown handler
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT. Shutting down...', 'DocsiServer');
      if (this.browser) {
        logger.info('Closing browser...', 'DocsiServer');
        await this.browser.close();
        logger.info('Browser closed.', 'DocsiServer');
      }
      await this.server.close();
      logger.info('MCP Server closed.', 'DocsiServer');
      process.exit(0);
    });
    
    // Defer crawler service initialization until browser is ready in start()
  }
  
  /**
   * Initialize the simplified crawler service and connect it to the handlers
   */
  private async initializeSimplifiedCrawlerService( // Made async
    // Removed parameters, will use class properties
    browser: Browser // Added browser parameter
  ): Promise<void> { // Return Promise
    try {
      // Create and get the simplified crawler service instance, passing the browser
      const crawlerService = SimpleCrawlerServiceProvider.createService(
        this.documentRepository, // Use class property
        this.documentSourceRepository, // Use class property
        browser // Pass browser instance
      );
      
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
      
      logger.info('Simplified crawler service initialized successfully', 'DocsiServer');
    } catch (error: unknown) {
      // Only log errors - these are important enough to display
      logger.logError(error instanceof Error ? error : new Error(String(error)), 'DocsiServer', 'Failed to initialize simplified crawler service');
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
      logger.info('Launching browser...', 'DocsiServer');
      this.browser = await chromium.launch({ headless: false, slowMo: 250 }); // Launch browser in headed mode with slowMo
      logger.info('Browser launched successfully.', 'DocsiServer');

      // Repositories are now initialized in the constructor and stored as class properties.
      // Remove redundant creation here.

      // Initialize the simplified crawler service now that browser is ready
      // Initialize the document repository (which includes index loading)
      logger.info('Initializing FileSystemDocumentRepository...', 'DocsiServer.start');
      await this.documentRepository.initialize(); // Await repository initialization
      logger.info('FileSystemDocumentRepository initialized.', 'DocsiServer.start');

      // Initialize the simplified crawler service now that browser and repositories are ready
      await this.initializeSimplifiedCrawlerService(this.browser); // Pass only browser

      // Initialize handlers (after services are ready)
      this.initializeHandlers();

      // Connect to transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info('DocSI MCP server (Simplified Version) running on stdio', 'DocsiServer');
    } catch (error) {
      logger.logError(error instanceof Error ? error : new Error(String(error)), 'DocsiServer', 'Failed to start DocSI MCP server');
      process.exit(1);
    }
  }
}

// Create and start server
const server = new DocSISimplifiedServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});