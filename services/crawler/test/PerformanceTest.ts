/**
 * Performance Test for SimpleCrawler
 * 
 * This test evaluates the performance of the SimpleCrawler implementation
 * under different load conditions and configurations.
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import http from 'http';
import { URL } from 'url';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

// Import SimpleCrawler and related components
import { SimpleCrawler } from '../SimpleCrawler.js';
import { FileSystemDocumentRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';

// A simple document storage adapter for testing
class TestDocumentStorage {
  private storedDocuments: Map<string, any> = new Map();
  private duplicateCount = 0;
  private savedCount = 0;
  
  constructor(private documentRepository?: FileSystemDocumentRepository) {}
  
  async saveDocument(document: any): Promise<boolean> {
    // Check if document already exists
    if (this.storedDocuments.has(document.url)) {
      this.duplicateCount++;
      return true;
    }
    
    // Store document in memory
    this.storedDocuments.set(document.url, document);
    this.savedCount++;
    
    // Also save to repository if available
    if (this.documentRepository) {
      try {
        await this.documentRepository.save(document);
      } catch (error) {
        console.error(`Error saving document to repository: ${error}`);
      }
    }
    
    return true;
  }
  
  async documentExists(url: string): Promise<boolean> {
    return this.storedDocuments.has(url);
  }
  
  getCount(): number {
    return this.savedCount;
  }
  
  getDuplicateCount(): number {
    return this.duplicateCount;
  }
  
  clear(): void {
    this.storedDocuments.clear();
    this.duplicateCount = 0;
    this.savedCount = 0;
  }
}

interface TestResults {
  name: string;
  pagesGenerated: number;
  crawlDuration: number;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesPerSecond: number;
  maxDepthReached: number;
  memoryUsageMB: number;
  concurrency: number;
  requestDelay: number;
}

/**
 * Performance test class
 */
class PerformanceTest {
  private server: http.Server | null = null;
  private serverPort: number = 0;
  private testDataDir: string = '';
  private documentStorage: TestDocumentStorage;
  private testResults: TestResults[] = [];
  
  /**
   * Create a new performance test
   */
  constructor() {
    this.documentStorage = new TestDocumentStorage();
  }
  
  /**
   * Setup the test environment
   */
  async setup() {
    // Create test data directory
    const testId = Date.now().toString();
    this.testDataDir = path.join(os.tmpdir(), `docsi-perf-test-${testId}`);
    
    await fs.mkdir(this.testDataDir, { recursive: true });
    await fs.mkdir(path.join(this.testDataDir, 'documents'), { recursive: true });
    
    console.log(`Test data directory: ${this.testDataDir}`);
    
    // Initialize document repository for persistent storage tests
    const documentRepository = new FileSystemDocumentRepository(
      path.join(this.testDataDir, 'documents')
    );
    
    // Update document storage to use repository
    this.documentStorage = new TestDocumentStorage(documentRepository);
    
    return this;
  }
  
  /**
   * Run performance tests
   */
  async runTests() {
    try {
      console.log('Starting performance tests for SimpleCrawler...');
      
      // Test 1: Small site (50 pages) with default settings
      await this.runTestWithConfig('Small site - default settings', 50, 2, 100);
      
      // Test 2: Medium site (200 pages) with default settings
      await this.runTestWithConfig('Medium site - default settings', 200, 2, 100);
      
      // Test 3: Small site with high concurrency
      await this.runTestWithConfig('Small site - high concurrency', 50, 10, 50);
      
      // Test 4: Medium site with high concurrency
      await this.runTestWithConfig('Medium site - high concurrency', 200, 10, 50);
      
      // Test 5: Medium site with very high concurrency
      await this.runTestWithConfig('Medium site - very high concurrency', 200, 20, 25);
      
      // Test 6: Deep site with many connections
      await this.runTestWithConfig('Deep site test', 100, 5, 50, true);
      
      // Report results
      this.reportResults();
      
      return true;
    } catch (error) {
      console.error('Performance test failed:', error);
      throw error;
    } finally {
      // Clean up
      await this.cleanup();
    }
  }
  
  /**
   * Run a test with specific configuration
   */
  private async runTestWithConfig(
    testName: string, 
    pageCount: number, 
    concurrency: number, 
    requestDelay: number,
    deepStructure: boolean = false
  ) {
    console.log(`\nRunning test: ${testName}`);
    console.log(`Pages: ${pageCount}, Concurrency: ${concurrency}, Delay: ${requestDelay}ms, Deep: ${deepStructure}`);
    
    // Reset storage
    this.documentStorage.clear();
    
    // Start test server
    await this.startTestServer(pageCount, deepStructure);
    
    // Create crawler
    const crawler = new SimpleCrawler(this.documentStorage, {
      baseUrl: `http://localhost:${this.serverPort}`,
      maxDepth: deepStructure ? 8 : 3,
      maxPages: pageCount * 2, // Allow for more pages than we generate
      concurrency,
      requestDelay,
      includePatterns: [],
      excludePatterns: [],
    });
    
    // Track memory before
    const memBefore = process.memoryUsage();
    
    // Time the crawl
    const startTime = performance.now();
    
    // Start crawling
    const result = await crawler.start();
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // in seconds
    
    // Track memory after
    const memAfter = process.memoryUsage();
    const memoryUsage = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024); // in MB
    
    console.log(`Crawl completed in ${duration.toFixed(2)} seconds`);
    console.log(`Discovered: ${result.discovered}, Crawled: ${result.succeeded}, Failed: ${result.failed}`);
    console.log(`Speed: ${(result.succeeded / duration).toFixed(2)} pages/second`);
    console.log(`Memory usage: ${memoryUsage.toFixed(2)} MB`);
    
    // Store results
    this.testResults.push({
      name: testName,
      pagesGenerated: pageCount,
      crawlDuration: parseFloat(duration.toFixed(2)),
      pagesDiscovered: result.discovered,
      pagesCrawled: result.succeeded,
      pagesPerSecond: parseFloat((result.succeeded / duration).toFixed(2)),
      maxDepthReached: deepStructure ? 8 : 3, // Use the configured max depth
      memoryUsageMB: parseFloat(memoryUsage.toFixed(2)),
      concurrency,
      requestDelay
    });
    
    // Stop test server
    await this.stopServer();
  }
  
  /**
   * Start a test server with the specified number of pages
   */
  private async startTestServer(pageCount: number, deepStructure: boolean): Promise<void> {
    // Generate test pages based on structure
    const testPages = this.generateTestPages(pageCount, deepStructure);
    
    // Create server
    this.server = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '/', 'http://localhost');
        const path = parsedUrl.pathname || '/';
        
        // Simulate network delay (variable to be more realistic)
        const delay = Math.floor(Math.random() * 20) + 5;
        
        setTimeout(() => {
          // Return page content or 404
          if (testPages.has(path)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(testPages.get(path));
          } else {
            res.statusCode = 404;
            res.end('Not found');
          }
        }, delay);
      } catch (error) {
        res.statusCode = 500;
        res.end('Server error');
      }
    });
    
    // Start server on random port
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }
      
      this.server.listen(0, () => {
        const address = this.server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Invalid server address'));
          return;
        }
        
        this.serverPort = address.port;
        console.log(`Test server running at http://localhost:${this.serverPort}`);
        resolve();
      });
    });
  }
  
  /**
   * Generate test pages with links
   */
  private generateTestPages(pageCount: number, deepStructure: boolean): Map<string, string> {
    const pages = new Map<string, string>();
    
    if (deepStructure) {
      // Create a deep structure with fewer connections per page
      // This simulates documentation with hierarchical structure
      const maxDepth = Math.min(8, Math.ceil(Math.sqrt(pageCount)));
      const pagesPerLevel = Math.ceil(pageCount / maxDepth);
      
      // Create index page
      let indexContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Documentation</title>
  <meta name="description" content="Test documentation home page">
</head>
<body>
  <h1>Test Documentation</h1>
  <p>This is the index page for DocSI crawler testing.</p>
  <div class="links">
`;
      
      // Add links to first level pages
      for (let i = 1; i <= pagesPerLevel; i++) {
        indexContent += `    <a href="/level1/page${i}.html">Level 1 - Page ${i}</a><br>\n`;
      }
      
      indexContent += `
  </div>
</body>
</html>`;
      
      pages.set('/', indexContent);
      
      // Create pages for each level
      let remainingPages = pageCount - 1; // Subtract index page
      
      for (let level = 1; level <= maxDepth && remainingPages > 0; level++) {
        const levelPagesCount = Math.min(pagesPerLevel, remainingPages);
        
        for (let i = 1; i <= levelPagesCount && remainingPages > 0; i++) {
          const pagePath = `/level${level}/page${i}.html`;
          let content = `<!DOCTYPE html>
<html>
<head>
  <title>Level ${level} - Page ${i}</title>
  <meta name="description" content="Level ${level} page ${i} description">
</head>
<body>
  <h1>Level ${level} - Page ${i}</h1>
  <p>This is a test page for DocSI crawler at level ${level}.</p>
  <div class="links">
    <a href="/">Home</a><br>
`;
          
          // Add some links to pages at the same level
          const sameLevel = Math.min(3, levelPagesCount);
          for (let j = 1; j <= sameLevel; j++) {
            if (j !== i) {
              content += `    <a href="/level${level}/page${j}.html">Level ${level} - Page ${j}</a><br>\n`;
            }
          }
          
          // Add links to next level if not at max depth
          if (level < maxDepth) {
            const nextLevelLinks = Math.min(3, pagesPerLevel);
            for (let j = 1; j <= nextLevelLinks; j++) {
              content += `    <a href="/level${level+1}/page${j}.html">Level ${level+1} - Page ${j}</a><br>\n`;
            }
          }
          
          content += `
  </div>
  <div class="content">
    <h2>Sample API Documentation</h2>
    <pre><code>
function testApi${level}_${i}(param) {
  return "Test result from level ${level}, page ${i}: " + param;
}
    </code></pre>
    <p>Example usage: <code>testApi${level}_${i}("input")</code></p>
  </div>
</body>
</html>`;
          
          pages.set(pagePath, content);
          remainingPages--;
        }
      }
    } else {
      // Create a flat structure with many connections between pages
      // This simulates documentation with lots of cross-references
      
      // Create index page
      let indexContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Documentation</title>
  <meta name="description" content="Test documentation home page">
</head>
<body>
  <h1>Test Documentation</h1>
  <p>This is the index page for DocSI crawler testing.</p>
  <div class="links">
`;
      
      // Add links to all pages from index
      for (let i = 1; i < pageCount; i++) {
        indexContent += `    <a href="/page${i}.html">Page ${i}</a><br>\n`;
      }
      
      indexContent += `
  </div>
</body>
</html>`;
      
      pages.set('/', indexContent);
      
      // Create individual pages with many cross-links
      for (let i = 1; i < pageCount; i++) {
        let content = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page ${i}</title>
  <meta name="description" content="Test page ${i} description">
</head>
<body>
  <h1>Test Documentation Page ${i}</h1>
  <p>This is a test page for DocSI crawler validation.</p>
  <div class="links">
    <a href="/">Home</a><br>
`;
        
        // Add links to other pages (up to 15 random links)
        const maxLinks = Math.min(15, pageCount - 1);
        const linkedPages = new Set<number>();
        
        while (linkedPages.size < maxLinks) {
          const linkTo = Math.floor(Math.random() * (pageCount - 1)) + 1;
          if (linkTo !== i && !linkedPages.has(linkTo)) {
            linkedPages.add(linkTo);
            content += `    <a href="/page${linkTo}.html">Link to Page ${linkTo}</a><br>\n`;
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
        
        pages.set(`/page${i}.html`, content);
      }
    }
    
    console.log(`Generated ${pages.size} test pages`);
    return pages;
  }
  
  /**
   * Report test results
   */
  private reportResults() {
    console.log('\n=== PERFORMANCE TEST RESULTS ===\n');
    console.log('| Test Name | Pages | Duration (s) | Discovered | Crawled | Pages/sec | Max Depth | Memory (MB) | Concurrency | Delay (ms) |');
    console.log('|-----------|-------|--------------|------------|---------|-----------|-----------|-------------|-------------|-----------|');
    
    for (const result of this.testResults) {
      console.log(`| ${result.name.padEnd(10)} | ${result.pagesGenerated.toString().padEnd(6)} | ${result.crawlDuration.toString().padEnd(12)} | ${result.pagesDiscovered.toString().padEnd(10)} | ${result.pagesCrawled.toString().padEnd(7)} | ${result.pagesPerSecond.toString().padEnd(9)} | ${result.maxDepthReached.toString().padEnd(9)} | ${result.memoryUsageMB.toString().padEnd(11)} | ${result.concurrency.toString().padEnd(11)} | ${result.requestDelay.toString().padEnd(10)} |`);
    }
    
    console.log('\n=== ANALYSIS ===\n');
    
    // Calculate averages
    const avgPagesPerSecond = this.testResults.reduce((sum, result) => sum + result.pagesPerSecond, 0) / this.testResults.length;
    console.log(`Average crawl speed: ${avgPagesPerSecond.toFixed(2)} pages/second`);
    
    // Find best concurrency setting
    const concurrencyGroups = new Map<number, TestResults[]>();
    for (const result of this.testResults) {
      if (!concurrencyGroups.has(result.concurrency)) {
        concurrencyGroups.set(result.concurrency, []);
      }
      concurrencyGroups.get(result.concurrency)?.push(result);
    }
    
    console.log('\nPerformance by concurrency setting:');
    for (const [concurrency, results] of concurrencyGroups.entries()) {
      const avgSpeed = results.reduce((sum, result) => sum + result.pagesPerSecond, 0) / results.length;
      console.log(`Concurrency ${concurrency}: ${avgSpeed.toFixed(2)} pages/second`);
    }
    
    // Analyze memory usage
    const avgMemory = this.testResults.reduce((sum, result) => sum + result.memoryUsageMB, 0) / this.testResults.length;
    console.log(`\nAverage memory usage: ${avgMemory.toFixed(2)} MB`);
    
    console.log('\nRecommendations:');
    // Find best overall configuration
    let bestConfig = this.testResults[0];
    for (const result of this.testResults) {
      if (result.pagesPerSecond > bestConfig.pagesPerSecond) {
        bestConfig = result;
      }
    }
    
    console.log(`Best performance configuration: Concurrency ${bestConfig.concurrency}, Delay ${bestConfig.requestDelay}ms`);
    console.log(`(${bestConfig.pagesPerSecond} pages/second)`);
  }
  
  /**
   * Stop the test server
   */
  private async stopServer(): Promise<void> {
    if (!this.server) return;
    
    return new Promise((resolve) => {
      this.server?.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
  
  /**
   * Clean up after tests
   */
  async cleanup(): Promise<void> {
    await this.stopServer();
    
    // Clean up test directory
    try {
      await fs.rm(this.testDataDir, { recursive: true, force: true });
      console.log(`Test data directory removed: ${this.testDataDir}`);
    } catch (error) {
      console.error('Error cleaning up test directory:', error);
    }
  }
}

/**
 * Main function to run performance tests
 */
async function main() {
  try {
    const test = await new PerformanceTest().setup();
    await test.runTests();
    process.exit(0);
  } catch (error) {
    console.error('Performance test failed:', error);
    process.exit(1);
  }
}

// Run tests if script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { PerformanceTest };