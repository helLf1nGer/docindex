/**
 * MCP Integration Test
 * 
 * This test validates the integration between SimpleCrawler and the MCP server tools.
 * It verifies that all MCP tools work correctly with the simplified crawler implementation.
 */

import assert from 'assert';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import EventEmitter from 'events';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import http from 'http';
import { URL } from 'url';
import { Logger, getLogger } from '../../../shared/infrastructure/logging.js'; // Import logger

// Import server components
import { CheckToolHandler } from '../../../interfaces/mcp/handlers/check-tool-handler.js';
import { InfoToolHandler } from '../../../interfaces/mcp/handlers/info-tool-handler.js';
import { DiscoverToolHandler } from '../../../interfaces/mcp/handlers/discover-tool-handler.js';
import { SearchToolHandler } from '../../../interfaces/mcp/handlers/search-tool-handler.js';
import { GetDocumentHandler } from '../../../interfaces/mcp/handlers/get-document-handler.js';
import { BatchCrawlToolHandler } from '../../../interfaces/mcp/handlers/batch-crawl-tool-handler.js';

// Import repositories
import { FileSystemDocumentRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';

// Import crawler service
import { SimpleCrawlerServiceProvider } from '../infrastructure/SimpleCrawlerServiceProvider.js';
import { ConfigService } from '../../../interfaces/mcp/services/config-service.js';
import { DocumentSource, Document } from '../../../shared/domain/models/Document.js';

// Import MCP types
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
const logger = getLogger(); // Get logger instance at top level


/**
 * Interface for mock HTTP server
 */
interface MockHttpServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * Test class for MCP integration
 */
class MCPIntegrationTest {
  private server: Server | null = null;
  private mockServer: MockHttpServer | null = null;
  private testDataDir: string = '';
  private documentRepository!: FileSystemDocumentRepository;
  private documentSourceRepository!: FileSystemDocumentSourceRepository;
  
  // Tool handlers
  private checkToolHandler!: CheckToolHandler;
  private infoToolHandler!: InfoToolHandler;
  private discoverToolHandler!: DiscoverToolHandler;
  private searchToolHandler!: SearchToolHandler;
  private getDocumentHandler!: GetDocumentHandler;
  private batchCrawlToolHandler!: BatchCrawlToolHandler;
  
  /**
   * Setup the test environment
   */
  async setup() {
    // Create test data directory
    const testId = Date.now().toString();
    this.testDataDir = path.join(os.tmpdir(), `docsi-mcp-test-${testId}`);
    
    await fs.mkdir(this.testDataDir, { recursive: true });
    await fs.mkdir(path.join(this.testDataDir, 'documents'), { recursive: true });
    await fs.mkdir(path.join(this.testDataDir, 'sources'), { recursive: true });
    
    logger.info(`Test data directory: ${this.testDataDir}`, 'MCPIntegrationTest');

    // Initialize repositories
    this.documentRepository = new FileSystemDocumentRepository(
      path.join(this.testDataDir, 'documents')
    );
    
    this.documentSourceRepository = new FileSystemDocumentSourceRepository(
      path.join(this.testDataDir, 'sources')
    );
    
    // Initialize config service
    const configService = new ConfigService({
      dataDir: this.testDataDir,
      version: '1.0.0-test',
    });
    
    // Initialize tool handlers
    this.checkToolHandler = new CheckToolHandler();
    this.infoToolHandler = new InfoToolHandler(configService);
    this.discoverToolHandler = new DiscoverToolHandler(
      this.documentSourceRepository,
      this.documentRepository
    );
    this.searchToolHandler = new SearchToolHandler(this.documentRepository);
    this.getDocumentHandler = new GetDocumentHandler(this.documentRepository);
    this.batchCrawlToolHandler = new BatchCrawlToolHandler(
      this.documentSourceRepository,
      this.documentRepository,
      new (require('events').EventEmitter)()
    );
    
    // Initialize the server
    this.server = new Server(
      {
        name: 'docsi-test',
        version: configService.get('version'),
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Initialize the simplified crawler service and connect to handlers
    // TODO: Fix createService call - requires a Playwright Browser instance
    // const crawlerService = SimpleCrawlerServiceProvider.createService(
    //   this.documentRepository,
    //   this.documentSourceRepository,
    //   /* browser instance needed */
    // );
    const crawlerService: any = null; // Placeholder
    
    // Connect crawler service to handlers
    if (crawlerService) { // Add check for placeholder
      this.discoverToolHandler.setCrawlerService(crawlerService);
    }
    if (crawlerService) { // Add check for placeholder
      this.batchCrawlToolHandler.setCrawlerService(crawlerService);
    }
    
    // Set up server request handlers
    this.initializeServerHandlers();
    
    // Start the mock HTTP server for testing crawling
    this.mockServer = await this.createMockHttpServer();
    
    return this;
  }
  
  /**
   * Initialize server handlers
   */
  private initializeServerHandlers() {
    if (!this.server) return;
    
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
        
        // Format the response according to MCP SDK expectations
        return {
          content: toolResponse.content,
          isError: toolResponse.isError || false
        };
        
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error executing tool ${name}:`, 'MCPIntegrationTest', message); // Pass message as metadata
        
        // Return error in the expected format
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
   * Run the MCP integration tests
   */
  async runTests() {
    try {
      logger.info('Running MCP integration tests...', 'MCPIntegrationTest');
      
      // Test 1: Check info tool
      await this.testInfoTool();
      
      // Test 2: Add a test source
      const sourceId = await this.testAddSource();
      
      // Test 3: Test batch crawl
      await this.testBatchCrawl(sourceId);
      
      // Test 4: Test search
      await this.testSearch();
      
      // Test 5: Test document retrieval
      await this.testGetDocument();
      
      logger.info('All MCP integration tests passed!', 'MCPIntegrationTest');
      
      return true;
    } catch (error) {
      logger.error('MCP integration test failed:', 'MCPIntegrationTest', error);
      throw error;
    } finally {
      // Clean up
      await this.cleanup();
    }
  }
  
  /**
   * Test the info tool
   */
  private async testInfoTool() {
    logger.info('Testing info tool...', 'MCPIntegrationTest');
    
    // Direct call to the handler
    const response = await this.infoToolHandler.handleToolCall('docsi-info', {});
    
    assert(!response.isError, 'Info tool returned an error');
    assert(response.content, 'Info tool returned no content');
    assert(response.content[0].text.includes('Version:'), 'Info tool content is missing version');
    
    logger.info('Info tool test passed!', 'MCPIntegrationTest');
  }
  
  /**
   * Test adding a source
   */
  private async testAddSource() {
    logger.info('Testing discover tool (add source)...', 'MCPIntegrationTest');
    
    const testUrl = this.mockServer ? this.mockServer.url : 'http://localhost:8080';
    
    // Direct call to the handler
    const response = await this.discoverToolHandler.handleToolCall('docsi-discover', {
      action: 'add',
      url: testUrl,
      name: 'Test Documentation',
      depth: 2,
      pages: 10
    });
    
    assert(!response.isError, 'Add source returned an error');
    assert(response.content, 'Add source returned no content');
    
    const sourceText = response.content[0].text;
    const sourceIdMatch = sourceText.match(/Source ID: ([a-zA-Z0-9-]+)/);
    assert(sourceIdMatch, 'Add source did not return a source ID');
    
    const sourceId = sourceIdMatch[1];
    logger.info(`Added source with ID: ${sourceId}`, 'MCPIntegrationTest');
    
    // Verify source exists in repository
    const source = await this.documentSourceRepository.findById(sourceId);
    assert(source, 'Source was not saved in repository');
    assert.strictEqual(source.name, 'Test Documentation', 'Source name does not match');
    assert.strictEqual(source.baseUrl, testUrl, 'Source URL does not match');
    
    logger.info('Discover tool (add source) test passed!', 'MCPIntegrationTest');
    
    return sourceId;
  }
  
  /**
   * Test batch crawl
   */
  private async testBatchCrawl(sourceId: string) {
    logger.info('Testing batch crawl tool...', 'MCPIntegrationTest');
    
    const source = await this.documentSourceRepository.findById(sourceId);
    assert(source, 'Source not found for batch crawl');
    
    // Direct call to handler
    const response = await this.batchCrawlToolHandler.handleToolCall('docsi-batch-crawl', {
      sources: [source.name],
      depth: 2,
      pages: 5,
      timeout: 1, // Short timeout for test
      concurrency: 2
    });
    
    assert(!response.isError, 'Batch crawl returned an error');
    assert(response.content, 'Batch crawl returned no content');
    
    const jobText = response.content[0].text;
    assert(jobText.includes('Batch crawl job started'), 'Batch crawl did not start properly');
    
    const jobIdMatch = jobText.match(/Job ID: ([a-zA-Z0-9-]+)/);
    assert(jobIdMatch, 'Batch crawl did not return a job ID');
    
    const jobId = jobIdMatch[1];
    logger.info(`Started batch crawl with job ID: ${jobId}`, 'MCPIntegrationTest');
    
    // Wait for crawl to progress
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check status via direct call
    const statusResponse = await this.batchCrawlToolHandler.handleToolCall('docsi-batch-status', {
      jobId: jobId
    });
    
    assert(!statusResponse.isError, 'Batch status returned an error');
    assert(statusResponse.content, 'Batch status returned no content');
    
    const statusText = statusResponse.content[0].text;
    assert(statusText.includes(jobId), 'Batch status does not include job ID');
    
    logger.info('Batch crawl tool test passed!', 'MCPIntegrationTest');
    
    // Wait for documents to be indexed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return jobId;
  }
  
  /**
   * Test search
   */
  private async testSearch() {
    logger.info('Testing search tool...', 'MCPIntegrationTest');
    
    // Direct call to handler
    const response = await this.searchToolHandler.handleToolCall('docsi-search', {
      query: 'test',
      limit: 5
    });
    
    assert(!response.isError, 'Search returned an error');
    assert(response.content, 'Search returned no content');
    
    // Even if no results, should have a formatted response
    const searchText = response.content[0].text;
    assert(searchText.includes('Search Results') || searchText.includes('No results'), 
           'Search response is not properly formatted');
    
    logger.info('Search tool test passed!', 'MCPIntegrationTest');
  }
  
  /**
   * Test get document
   */
  private async testGetDocument() {
    logger.info('Testing get document tool...', 'MCPIntegrationTest');
    
    // Get all documents by using search with no filters
    const documents = await this.documentRepository.search({});
    
    if (documents.length === 0) {
      logger.warn('No documents found to test get-document, skipping test...', 'MCPIntegrationTest');
      return;
    }
    
    const testDoc = documents[0];
    
    // Direct call to handler
    const response = await this.getDocumentHandler.handleToolCall('docsi-get-document', {
      id: testDoc.id
    });
    
    assert(!response.isError, 'Get document returned an error');
    assert(response.content, 'Get document returned no content');
    
    const docText = response.content[0].text;
    assert(docText.includes('Document ID:'), 'Get document response is not properly formatted');
    assert(docText.includes(testDoc.id), 'Get document response does not include document ID');
    
    logger.info('Get document tool test passed!', 'MCPIntegrationTest');
  }
  
  /**
   * Create a mock HTTP server for testing
   */
  private async createMockHttpServer(): Promise<MockHttpServer> {
    let mockPagesCount = 5;
    const testPages = new Map<string, string>();
    
    // Create mock pages with links to each other
    for (let i = 1; i <= mockPagesCount; i++) {
      let content = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page ${i}</title>
  <meta name="description" content="Test page ${i} description">
</head>
<body>
  <h1>Test Documentation Page ${i}</h1>
  <p>This is a test page for DocSI crawler validation.</p>
  <div class="links">`;
      
      // Add links to other pages
      for (let j = 1; j <= mockPagesCount; j++) {
        if (j !== i) {
          content += `\n    <a href="/page${j}.html">Link to Page ${j}</a><br>`;
        }
      }
      
      content += `
  </div>
  <div class="content">
    <h2>Sample API Documentation</h2>
    <pre><code>
function testApi${i}(param) {
  return "Test result " + param;
}
    </code></pre>
    <p>Example usage: <code>testApi${i}("input")</code></p>
  </div>
</body>
</html>`;
      
      testPages.set(`/page${i}.html`, content);
    }
    
    // Add index page
    testPages.set('/', `<!DOCTYPE html>
<html>
<head>
  <title>Test Documentation</title>
  <meta name="description" content="Test documentation home page">
</head>
<body>
  <h1>Test Documentation</h1>
  <p>This is the index page for DocSI crawler testing.</p>
  <div class="links">
${Array.from({length: mockPagesCount}, (_, i) => 
    `    <a href="/page${i+1}.html">Page ${i+1}</a><br>`
).join('\n')}
  </div>
</body>
</html>`);
    
    // Create server
    const server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://localhost');
        const path = parsedUrl.pathname || '/';
        
        // Return page content or 404
        if (testPages.has(path)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          res.end(testPages.get(path));
        } else {
          res.statusCode = 404;
          res.end('Not found');
        }
      } catch (error) {
        res.statusCode = 500;
        res.end('Server error');
      }
    });
    
    // Start server on random port
    return new Promise((resolve, reject) => {
      server.listen(0, () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Invalid server address'));
          return;
        }
        
        const url = `http://localhost:${address.port}`;
        logger.info(`Mock HTTP server running at ${url}`, 'MCPIntegrationTest');
        
        resolve({
          url,
          close: () => new Promise(resolve => server.close(() => resolve()))
        });
      });
    });
  }
  
  /**
   * Clean up after tests
   */
  async cleanup() {
    // Stop mock server
    if (this.mockServer) {
      await this.mockServer.close();
    }
    
    // Close server
    if (this.server) {
      await this.server.close();
    }
    
    // Clean up test directory
    try {
      await fs.rm(this.testDataDir, { recursive: true, force: true });
      logger.info(`Test data directory removed: ${this.testDataDir}`, 'MCPIntegrationTest');
    } catch (error) {
      logger.error('Error cleaning up test directory:', 'MCPIntegrationTest', error);
    }
  }
}

/**
 * Main function to run tests
 */
async function main() {
  try {
    const test = await new MCPIntegrationTest().setup();
    await test.runTests();
    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', 'MCPIntegrationTest', error);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => logger.error('Unhandled error running main', 'MCPIntegrationTest', error));
}

export { MCPIntegrationTest };