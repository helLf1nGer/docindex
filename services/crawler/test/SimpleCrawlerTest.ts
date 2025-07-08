/**
 * SimpleCrawlerTest
 * 
 * Tests for the SimpleCrawler implementation to verify:
 * - Proper depth tracking
 * - URL processing
 * - Content extraction
 * - Storage integration
 */

import * as http from 'http';
import { URL } from 'url';
import { SimpleCrawler, DocumentStorage } from '../SimpleCrawler.js';
import { Document } from '../../../shared/domain/models/Document.js';
import { Logger, getLogger } from '../../../shared/infrastructure/logging.js';
const logger = getLogger(); // Move logger declaration to module scope

/**
 * Mock document storage for testing
 */
class MockDocumentStorage implements DocumentStorage {
  private documents: Map<string, Document> = new Map();
  
  async saveDocument(document: Document): Promise<boolean> {
    this.documents.set(document.url, document);
    return true;
  }
  
  async documentExists(url: string): Promise<boolean> {
    return this.documents.has(url);
  }
  
  getDocuments(): Document[] {
    return Array.from(this.documents.values());
  }
  
  getDocumentByUrl(url: string): Document | undefined {
    return this.documents.get(url);
  }
  
  clear(): void {
    this.documents.clear();
  }
  
  getDocumentCount(): number {
    return this.documents.size;
  }
  
  getDocumentsByDepth(): Map<number, Document[]> {
    const byDepth = new Map<number, Document[]>();
    
    for (const doc of this.documents.values()) {
      const depth = doc.metadata?.depth || 0;
      if (!byDepth.has(depth)) {
        byDepth.set(depth, []);
      }
      byDepth.get(depth)!.push(doc);
    }
    
    return byDepth;
  }
}

/**
 * Create a simple mock web server for testing crawling with multiple depths
 */
function createMockServer(logger: Logger): http.Server { // Pass logger instance
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    
    logger.debug(`Mock server received request for: ${path}`, 'SimpleCrawlerTest');
    
    // Define different responses based on path
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Test Home Page</title></head>
          <body>
            <h1>Test Home Page (Depth 0)</h1>
            <p>This is the home page for testing the SimpleCrawler.</p>
            <ul>
              <li><a href="/page1.html">Page 1</a></li>
              <li><a href="/page2.html">Page 2</a></li>
              <li><a href="/section1/">Section 1</a></li>
            </ul>
          </body>
        </html>
      `);
    } else if (path === '/page1.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Page 1</title></head>
          <body>
            <h1>Page 1 (Depth 1)</h1>
            <p>This is page 1 at depth 1.</p>
            <ul>
              <li><a href="/page1/subpage1.html">Subpage 1-1</a></li>
              <li><a href="/page1/subpage2.html">Subpage 1-2</a></li>
            </ul>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/page2.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Page 2</title></head>
          <body>
            <h1>Page 2 (Depth 1)</h1>
            <p>This is page 2 at depth 1.</p>
            <ul>
              <li><a href="/page2/subpage1.html">Subpage 2-1</a></li>
            </ul>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/section1/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Section 1</title></head>
          <body>
            <h1>Section 1 (Depth 1)</h1>
            <p>This is section 1 at depth 1.</p>
            <ul>
              <li><a href="/section1/page1.html">Section 1 Page 1</a></li>
              <li><a href="/section1/page2.html">Section 1 Page 2</a></li>
            </ul>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/page1/subpage1.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Subpage 1-1</title></head>
          <body>
            <h1>Subpage 1-1 (Depth 2)</h1>
            <p>This is subpage 1-1 at depth 2.</p>
            <a href="/page1.html">Back to Page 1</a><br>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/page1/subpage2.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Subpage 1-2</title></head>
          <body>
            <h1>Subpage 1-2 (Depth 2)</h1>
            <p>This is subpage 1-2 at depth 2.</p>
            <a href="/page1/subpage2/deep.html">Deep Page</a><br>
            <a href="/page1.html">Back to Page 1</a><br>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/page2/subpage1.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Subpage 2-1</title></head>
          <body>
            <h1>Subpage 2-1 (Depth 2)</h1>
            <p>This is subpage 2-1 at depth 2.</p>
            <a href="/page2.html">Back to Page 2</a><br>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/section1/page1.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Section 1 Page 1</title></head>
          <body>
            <h1>Section 1 Page 1 (Depth 2)</h1>
            <p>This is section 1 page 1 at depth 2.</p>
            <a href="/section1/">Back to Section 1</a><br>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/section1/page2.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Section 1 Page 2</title></head>
          <body>
            <h1>Section 1 Page 2 (Depth 2)</h1>
            <p>This is section 1 page 2 at depth 2.</p>
            <a href="/section1/">Back to Section 1</a><br>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else if (path === '/page1/subpage2/deep.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Deep Page</title></head>
          <body>
            <h1>Deep Page (Depth 3)</h1>
            <p>This is a deep page at depth 3.</p>
            <a href="/page1/subpage2.html">Back to Subpage 1-2</a><br>
            <a href="/page1.html">Back to Page 1</a><br>
            <a href="/">Back to Home</a>
          </body>
        </html>
      `);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });
}

/**
 * Main test function
 */
async function runTest() {
  const logger = getLogger(); // Get logger instance for runTest
  logger.info('Starting SimpleCrawler test...', 'SimpleCrawlerTest');
  
  // Create mock server
  const server = createMockServer(logger); // Pass logger to mock server
  const port = 9876;
  
  server.listen(port, () => {
    logger.info(`Mock server listening on port ${port}`, 'SimpleCrawlerTest');
  });
  
  try {
    // Create storage
    const storage = new MockDocumentStorage();
    const logger = getLogger(); // Get logger instance
    // Removed duplicate logger declaration
    
    // Create crawler with max depth 3
    const crawler = new SimpleCrawler(storage, {
      baseUrl: `http://localhost:${port}`,
      maxDepth: 3,
      maxPages: 20,
      requestDelay: 100,
      concurrency: 2
    }, logger); // Pass logger instance
    
    // Track events
    crawler.on('start', (data) => {
      logger.info(`Crawler started with base URL: ${data.url}`, 'SimpleCrawlerTest');
    }); // Removed incorrect logger argument
    
    crawler.on('processing', (data) => {
      logger.debug(`Processing: ${data.url} (depth: ${data.depth})`, 'SimpleCrawlerTest');
    });
    
    crawler.on('document', (data) => {
      logger.debug(`Document saved: ${data.url}`, 'SimpleCrawlerTest');
    });
    
    crawler.on('complete', (status) => {
      logger.info(`Crawler completed. Processed: ${status.processed}, Succeeded: ${status.succeeded}`, 'SimpleCrawlerTest');
    });
    
    // Start crawling
    const result = await crawler.start();
    
    // Verify results
    logger.info('\nCrawl Results:', 'SimpleCrawlerTest');
    logger.info(`- Pages processed: ${result.processed}`, 'SimpleCrawlerTest');
    logger.info(`- Pages succeeded: ${result.succeeded}`, 'SimpleCrawlerTest');
    logger.info(`- Pages failed: ${result.failed}`, 'SimpleCrawlerTest');
    logger.info(`- Pages skipped: ${result.skipped}`, 'SimpleCrawlerTest');
    
    // Check documents by depth
    const docsByDepth = storage.getDocumentsByDepth();
    logger.info('\nDocuments by depth:', 'SimpleCrawlerTest');
    
    for (const [depth, docs] of docsByDepth.entries()) {
      logger.debug(`- Depth ${depth}: ${docs.length} documents`, 'SimpleCrawlerTest');
      for (const doc of docs) {
        logger.debug(`  - ${doc.title} (${doc.url})`, 'SimpleCrawlerTest');
      }
    }
    
    // Verify we have documents at all depths
    const depth0 = docsByDepth.get(1)?.length || 0;
    const depth1 = docsByDepth.get(2)?.length || 0;
    const depth2 = docsByDepth.get(3)?.length || 0;
    
    logger.info('\nVerification:', 'SimpleCrawlerTest');
    logger.info(`- Depth 1 pages: ${depth0} (expected: 3)`, 'SimpleCrawlerTest');
    logger.info(`- Depth 2 pages: ${depth1} (expected: 5)`, 'SimpleCrawlerTest');
    logger.info(`- Depth 3 pages: ${depth2} (expected: 1)`, 'SimpleCrawlerTest');

    if (depth0 === 3 && depth1 === 5 && depth2 === 1) {
      logger.info('\n✅ TEST PASSED: Correct document count at each depth', 'SimpleCrawlerTest');
    } else {
      logger.error('\n❌ TEST FAILED: Incorrect document count at one or more depths', 'SimpleCrawlerTest');
    }
    
  } catch (error) {
    logger.error('Test error:', 'SimpleCrawlerTest', error);
  } finally {
    // Close server
    server.close(() => {
      logger.info('Mock server closed', 'SimpleCrawlerTest');
    });
  }
}

// Run the test
runTest().catch(error => logger.error('Unhandled error running test', 'SimpleCrawlerTest', error));