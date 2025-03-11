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
function createMockServer(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    
    console.log(`Mock server received request for: ${path}`);
    
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
  console.log('Starting SimpleCrawler test...');
  
  // Create mock server
  const server = createMockServer();
  const port = 9876;
  
  server.listen(port, () => {
    console.log(`Mock server listening on port ${port}`);
  });
  
  try {
    // Create storage
    const storage = new MockDocumentStorage();
    
    // Create crawler with max depth 3
    const crawler = new SimpleCrawler(storage, {
      baseUrl: `http://localhost:${port}`,
      maxDepth: 3,
      maxPages: 20,
      requestDelay: 100,
      concurrency: 2
    });
    
    // Track events
    crawler.on('start', (data) => {
      console.log(`Crawler started with base URL: ${data.url}`);
    });
    
    crawler.on('processing', (data) => {
      console.log(`Processing: ${data.url} (depth: ${data.depth})`);
    });
    
    crawler.on('document', (data) => {
      console.log(`Document saved: ${data.url}`);
    });
    
    crawler.on('complete', (status) => {
      console.log(`Crawler completed. Processed: ${status.processed}, Succeeded: ${status.succeeded}`);
    });
    
    // Start crawling
    const result = await crawler.start();
    
    // Verify results
    console.log('\nCrawl Results:');
    console.log(`- Pages processed: ${result.processed}`);
    console.log(`- Pages succeeded: ${result.succeeded}`);
    console.log(`- Pages failed: ${result.failed}`);
    console.log(`- Pages skipped: ${result.skipped}`);
    
    // Check documents by depth
    const docsByDepth = storage.getDocumentsByDepth();
    console.log('\nDocuments by depth:');
    
    for (const [depth, docs] of docsByDepth.entries()) {
      console.log(`- Depth ${depth}: ${docs.length} documents`);
      for (const doc of docs) {
        console.log(`  - ${doc.title} (${doc.url})`);
      }
    }
    
    // Verify we have documents at all depths
    const depth0 = docsByDepth.get(1)?.length || 0;
    const depth1 = docsByDepth.get(2)?.length || 0;
    const depth2 = docsByDepth.get(3)?.length || 0;
    
    console.log('\nVerification:');
    console.log(`- Depth 1 pages: ${depth0} (expected: 3)`);
    console.log(`- Depth 2 pages: ${depth1} (expected: 5)`);
    console.log(`- Depth 3 pages: ${depth2} (expected: 1)`);
    
    if (depth0 === 3 && depth1 === 5 && depth2 === 1) {
      console.log('\n✅ TEST PASSED: Correct document count at each depth');
    } else {
      console.log('\n❌ TEST FAILED: Incorrect document count at one or more depths');
    }
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Close server
    server.close(() => {
      console.log('Mock server closed');
    });
  }
}

// Run the test
runTest().catch(console.error);