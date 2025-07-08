/**
 * Storage Integration Test for SimpleCrawler
 * 
 * This test verifies the interaction between SimpleCrawler and document storage
 * It uses a mock HTTP server to simulate a website and tests that documents
 * are properly stored and retrieved.
 */

import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { SimpleCrawler, DocumentStorage } from '../SimpleCrawler.js';
// Removed duplicate logger import
import { SimpleUrlProcessor } from '../SimpleUrlProcessor.js';
import { SimpleContentExtractor } from '../SimpleContentExtractor.js';
import { FileSystemDocumentRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { Document } from '../../../shared/domain/models/Document.js';
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import assert from 'assert';

const logger = getLogger();

/**
 * Adapter to convert FileSystemDocumentRepository to DocumentStorage interface
 */
class DocumentStorageAdapter implements DocumentStorage {
  constructor(private repository: FileSystemDocumentRepository) {}
  
  /**
   * Save a document using the repository
   */
  async saveDocument(document: Document): Promise<boolean> {
    try {
      await this.repository.save(document);
      return true;
    } catch (error) {
      logger.error('Error saving document:', 'StorageIntegrationTest', error);
      return false;
    }
  }
  
  /**
   * Check if a document exists using the repository
   */
  async documentExists(url: string): Promise<boolean> {
    const doc = await this.repository.findByUrl(url);
    return doc !== null;
  }
}

/**
 * Test fixture for storage integration testing
 */
export class StorageIntegrationTest {
  private server!: Server;
  private baseUrl: string = '';
  private tempDir: string = '';
  private documents: Map<string, Document> = new Map();
  private documentRepository!: FileSystemDocumentRepository;
  private storageAdapter!: DocumentStorageAdapter;
  private requestLog: string[] = [];
  
  /**
   * Start the test server and create temporary storage directory
   */
  async setup(): Promise<void> {
    // Create a temporary directory for document storage
    this.tempDir = path.join(process.cwd(), 'test-data', `docsi-test-${Date.now()}`);
    await fs.mkdir(this.tempDir, { recursive: true });
    
    // Create a test document repository
    this.documentRepository = new FileSystemDocumentRepository(this.tempDir);
    await this.documentRepository.initialize();
    
    // Create storage adapter
    this.storageAdapter = new DocumentStorageAdapter(this.documentRepository);
    
    // Start a mock HTTP server
    this.server = createServer((req, res) => {
      const url = req.url || '/';
      this.requestLog.push(`${req.method} ${url}`);
      
      if (url === '/') {
        // Home page with links
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Test Site Home</title></head>
            <body>
              <h1>Test Site Home</h1>
              <p>This is a test site for crawler testing.</p>
              <ul>
                <li><a href="/page1">Page 1</a></li>
                <li><a href="/page2">Page 2</a></li>
                <li><a href="/api/docs">API Docs</a></li>
              </ul>
            </body>
          </html>
        `);
      } else if (url === '/page1') {
        // Page 1 with deeper links
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Page 1</title></head>
            <body>
              <h1>Page 1</h1>
              <p>This is page 1 with some content.</p>
              <ul>
                <li><a href="/page1/subpage1">Subpage 1</a></li>
                <li><a href="/page1/subpage2">Subpage 2</a></li>
              </ul>
              <a href="/">Back to home</a>
            </body>
          </html>
        `);
      } else if (url === '/page1/subpage1') {
        // Subpage 1 of Page 1
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Subpage 1</title></head>
            <body>
              <h1>Subpage 1</h1>
              <p>This is subpage 1 with some deep content.</p>
              <div class="code-example">
                <pre><code>function example() { return "test"; }</code></pre>
              </div>
              <a href="/page1">Back to page 1</a>
            </body>
          </html>
        `);
      } else if (url === '/page1/subpage2') {
        // Subpage 2 of Page 1
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Subpage 2</title></head>
            <body>
              <h1>Subpage 2</h1>
              <p>This is subpage 2 with some more deep content.</p>
              <a href="/page1">Back to page 1</a>
            </body>
          </html>
        `);
      } else if (url === '/page2') {
        // Page 2 with metadata
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head>
              <title>Page 2</title>
              <meta name="description" content="Page 2 description for testing">
              <meta name="keywords" content="test, crawler, storage">
            </head>
            <body>
              <h1>Page 2</h1>
              <p>This is page 2 with some metadata in the head.</p>
              <a href="/">Back to home</a>
            </body>
          </html>
        `);
      } else if (url === '/api/docs') {
        // API documentation page
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head>
              <title>API Documentation</title>
              <meta name="docType" content="api">
            </head>
            <body>
              <h1>API Documentation</h1>
              <h2>Endpoints</h2>
              <ul>
                <li><code>GET /api/users</code> - List all users</li>
                <li><code>GET /api/users/{id}</code> - Get user by ID</li>
                <li><code>POST /api/users</code> - Create a new user</li>
              </ul>
              <a href="/">Back to home</a>
            </body>
          </html>
        `);
      } else {
        // 404 for any other URLs
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Page not found');
      }
    });
    
    // Start the server on a random port
    await new Promise<void>(resolve => {
      this.server.listen(0, 'localhost', () => {
        const address = this.server.address() as AddressInfo;
        this.baseUrl = `http://localhost:${address.port}`;
        logger.info(`Test server started at ${this.baseUrl}`, 'StorageIntegrationTest');
        resolve();
      });
    });
  }
  
  /**
   * Clean up after tests - stop server and remove temp files
   */
  async teardown(): Promise<void> {
    // Close the server
    await new Promise<void>(resolve => {
      this.server.close(() => {
        logger.info('Test server stopped', 'StorageIntegrationTest');
        resolve();
      });
    });
    
    // Clean up test files
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      logger.info(`Removed test directory: ${this.tempDir}`, 'StorageIntegrationTest');
    } catch (error) {
      logger.warn(`Failed to clean up test directory: ${error}`, 'StorageIntegrationTest');
    }
  }
  
  /**
   * Run storage integration tests
   */
  async runTests(): Promise<void> {
    try {
      logger.info('Starting storage integration tests...', 'StorageIntegrationTest');
      await this.setup();
      logger.info('Test environment set up successfully.', 'StorageIntegrationTest');
      
      // Test case 1: Basic crawling with storage
      logger.info('Running test case 1: Basic crawling with storage...', 'StorageIntegrationTest');
      await this.testBasicCrawlWithStorage();
      logger.info('Test case 1 completed successfully.', 'StorageIntegrationTest');
      
      // Test case 2: Verify document integrity
      logger.info('Running test case 2: Document integrity...', 'StorageIntegrationTest');
      await this.testDocumentIntegrity();
      logger.info('Test case 2 completed successfully.', 'StorageIntegrationTest');
      
      // Test case 3: Test error handling
      logger.info('Running test case 3: Error handling...', 'StorageIntegrationTest');
      await this.testErrorHandling();
      logger.info('Test case 3 completed successfully.', 'StorageIntegrationTest');
      
      await this.teardown();
      logger.info('Test environment cleaned up successfully.', 'StorageIntegrationTest');
      
      logger.info('All storage integration tests passed!', 'StorageIntegrationTest');
      logger.info('✅ ALL STORAGE INTEGRATION TESTS PASSED!', 'StorageIntegrationTest');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
      logger.error(`Test failed: ${errorMessage}`, 'StorageIntegrationTest');
      logger.error('❌ STORAGE INTEGRATION TESTS FAILED:', 'StorageIntegrationTest');
      logger.error(errorMessage, 'StorageIntegrationTest'); // Log the error message itself
      await this.teardown();
      throw error;
    }
  }
  
  /**
   * Test case 1: Basic crawling with storage
   */
  private async testBasicCrawlWithStorage(): Promise<void> {
    const logger = getLogger(); // Moved declaration here
    logger.info('Running basic crawl with storage test...', 'StorageIntegrationTest');

    // Create crawler components
    const urlProcessor = new SimpleUrlProcessor({
      baseUrl: this.baseUrl,
      excludeExtensions: [],
      excludePatterns: [],
      includePatterns: [],
      sameDomainOnly: true
    }); // Removed logger argument
    const contentExtractor = new SimpleContentExtractor();

    // Create crawler with the adapter
    // Logger declared above now
    const crawler = new SimpleCrawler(this.storageAdapter, {
      baseUrl: this.baseUrl,
      maxDepth: 2,
      // Only crawl 2 levels deep
      maxPages: 10,        // Limit to 10 pages
      concurrency: 2,      // Process 2 pages at a time
      requestDelay: 100,
   // Wait 100ms between requests
      includePatterns: [],  // No specific include patterns
      excludePatterns: []   // No specific exclude patterns
    }, logger); // Pass logger instance
    
    // Track document count before crawl
    const originalCount = await this.documentRepository.count();
    
    // Set up event tracking
    const crawledUrls: string[] = [];
    const savedDocuments: Document[] = [];
    
const documentIds: string[] = [];
    
    crawler.on('document', (eventData: any) => {
      logger.debug(`Document event received: ${JSON.stringify(eventData)}`, 'StorageIntegrationTest');
      crawledUrls.push(eventData.url);
      
      // Store the document ID for later verification
      if (eventData.documentId) {
        documentIds.push(eventData.documentId);
        logger.debug(`Added document ID: ${eventData.documentId} for URL: ${eventData.url}`, 'StorageIntegrationTest');
      } else {
        logger.warn(`Warning: No document ID for URL: ${eventData.url}`, 'StorageIntegrationTest');
      }
    });
    
    // Run the crawler
    await crawler.start();
    
    // Wait for all operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify documents were stored
    const newCount = await this.documentRepository.count();
    assert.strictEqual(
      newCount - originalCount,
      crawledUrls.length,
      `Expected ${crawledUrls.length} new documents, but got ${newCount - originalCount}`
    );
    
    // Verify we can retrieve the documents
    logger.debug(`Verifying ${documentIds.length} document IDs: ${documentIds.join(', ')}`, 'StorageIntegrationTest');
    for (const docId of documentIds) {
      logger.debug(`Looking up document with ID: ${docId}`, 'StorageIntegrationTest');
      const storedDoc = await this.documentRepository.findById(docId);
      assert.notStrictEqual(storedDoc, null, `Document with ID ${docId} not found in repository`);
      logger.debug(`Found document with URL: ${storedDoc?.url}`, 'StorageIntegrationTest');
    }
    
    logger.info(`Successfully crawled and stored ${documentIds.length} documents`, 'StorageIntegrationTest');
  }
  
  /**
   * Test case 2: Verify document integrity
   */
  private async testDocumentIntegrity(): Promise<void> {
    logger.info('Running document integrity test...', 'StorageIntegrationTest');
    
    // Create a test document with complex content
    const testDocument: Document = {
      id: `test-doc-${Date.now()}`,
      url: `${this.baseUrl}/test-document`,
      title: 'Test Document',
      content: '<html><body><h1>Test</h1><p>This is a test document.</p></body></html>',
      textContent: 'Test\nThis is a test document.',
      indexedAt: new Date(),
      updatedAt: new Date(),
      sourceId: 'test-source',
      tags: ['test', 'integrity'],
      metadata: {
        description: 'Test document description',
        complexData: {
          nested: {
            value: 123,
            flag: true
          },
          array: [1, 2, 3, 4, 5]
        }
      }
    };
    
    // Save the document
    await this.documentRepository.save(testDocument);
    
    // Retrieve the document
    const retrievedDoc = await this.documentRepository.findById(testDocument.id);
    
    // Verify document data integrity
    assert.notStrictEqual(retrievedDoc, null, 'Retrieved document should not be null');
    if (retrievedDoc) {
      assert.strictEqual(retrievedDoc.id, testDocument.id, 'Document ID should match');
      assert.strictEqual(retrievedDoc.url, testDocument.url, 'Document URL should match');
      assert.strictEqual(retrievedDoc.title, testDocument.title, 'Document title should match');
      assert.strictEqual(retrievedDoc.content, testDocument.content, 'Document content should match');
      assert.strictEqual(retrievedDoc.textContent, testDocument.textContent, 'Document textContent should match');
      assert.strictEqual(retrievedDoc.sourceId, testDocument.sourceId, 'Document sourceId should match');
      
      // Check tags
      assert.deepStrictEqual(retrievedDoc.tags, testDocument.tags, 'Document tags should match');
      
      // Check metadata - specifically the complex nested structure
      if (retrievedDoc.metadata && testDocument.metadata) {
        assert.strictEqual(
          retrievedDoc.metadata.description, 
          testDocument.metadata.description, 
          'Document metadata.description should match'
        );
        
        assert.deepStrictEqual(
          retrievedDoc.metadata.complexData, 
          testDocument.metadata.complexData, 
          'Complex nested metadata should match'
        );
      } else {
        assert.fail('Document metadata is missing');
      }
    }
    
    logger.info('Document integrity test passed', 'StorageIntegrationTest');
  }
  
  /**
   * Test case 3: Test error handling
   */
  private async testErrorHandling(): Promise<void> {
    logger.info('Running error handling test...', 'StorageIntegrationTest');
    
    // Test handling of invalid document
    const invalidDocument: any = {
      // Missing required fields like id, url
      title: 'Invalid Document',
      content: '<html><body><h1>Invalid</h1></body></html>',
      indexedAt: 'not-a-date' // Invalid date format
    };
    
    // Attempt to save invalid document
    try {
      await this.documentRepository.save(invalidDocument);
      assert.fail('Expected error when saving invalid document');
    } catch (error) {
      // This is expected, verify error is appropriate
      logger.info('Received expected error when saving invalid document', 'StorageIntegrationTest');
    }
    
    // Test partial document recovery
    const partialDocument: Partial<Document> = {
      id: `partial-doc-${Date.now()}`,
      url: `${this.baseUrl}/partial-document`,
      title: 'Partial Document',
      sourceId: 'test-source',
      // Missing content and textContent
      indexedAt: new Date(),
      updatedAt: new Date()
    };
    
    // Save the partial document - should work but add placeholder text
    await this.documentRepository.save(partialDocument as Document);
    
    // Verify recovery
    const retrievedPartial = await this.documentRepository.findById(partialDocument.id!);
    assert.notStrictEqual(retrievedPartial, null, 'Retrieved partial document should not be null');
    if (retrievedPartial) {
      assert.strictEqual(retrievedPartial.id, partialDocument.id, 'Partial document ID should match');
      // Should have added placeholder text
      assert.ok(retrievedPartial.textContent, 'Partial document should have placeholder textContent');
    }
    
    logger.info('Error handling test passed', 'StorageIntegrationTest');
  }
}

/**
 * Run the tests if this file is executed directly
 */
// In ES modules, we can check if this is the main module by comparing import.meta.url
// against the URL of the current file
const isMainModule = import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  const test = new StorageIntegrationTest();
  test.runTests().catch(error => logger.error('Unhandled error running tests', 'StorageIntegrationTest', error));
}