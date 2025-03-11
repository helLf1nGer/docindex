/**
 * Debug URL Discovery Test Script
 * 
 * This script tests the URL discovery and processing functionality of the crawler
 * by crawling a simple test website and logging detailed information about the process.
 */

// Use ES modules import
import { CrawlerEngine } from '../domain/CrawlerEngine.js';
import { ContentProcessor } from '../domain/ContentProcessor.js';
import { StorageManager } from '../domain/StorageManager.js';
import { UrlProcessor } from '../domain/UrlProcessor.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';

// Mock document repository for testing
const mockDocumentRepository = {
  // @ts-ignore - Ignoring TypeScript errors for this test script
  save: async (doc) => {
    console.log(`[MOCK] Saved document: ${doc.url}`);
    return doc;
  },
  // @ts-ignore
  findByUrl: async (url) => null,
  // @ts-ignore
  findById: async (id) => null,
  search: async () => [],
  findBySourceId: async () => [],
  findByTag: async () => [],
  delete: async () => true,
  count: async () => 0
};

// Set up logger
const logger = getLogger();

// Create test document source
const testSource = {
  id: 'test-source',
  name: 'Test Source',
  baseUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  crawlConfig: {
    maxDepth: 2,
    maxPages: 5,
    includePatterns: [],
    excludePatterns: [],
    respectRobotsTxt: true,
    crawlDelay: 1000
  },
  // Add required properties for DocumentSource
  addedAt: new Date(),
  tags: []
};

/**
 * Run the test
 */
async function runTest() {
  console.log('Starting URL discovery debug test...');
  
  // Create components
  const httpClient = new HttpClient({
    timeout: 10000,
    retries: 1,
    respectRobotsTxt: true,
    userAgent: 'DocSI-Debug-Test/1.0'
  });
  
  const contentProcessor = new ContentProcessor();
  const storageManager = new StorageManager(mockDocumentRepository);
  const urlProcessor = new UrlProcessor();
  
  // Create crawler engine with detailed logging
  const crawlerEngine = new CrawlerEngine(
    httpClient,
    contentProcessor,
    storageManager,
    urlProcessor
  );
  
  // Set up event listeners
  crawlerEngine.getEventEmitter().on('page-crawled', (event) => {
    console.log(`[EVENT] Page crawled: ${event.data.url} (depth: ${event.data.depth})`);
  });
  
  // Configure crawl - use a valid strategy value
  const config = {
    maxDepth: 2,
    maxPages: 5,
    // @ts-ignore - TypeScript complains about string type, but these are valid values
    strategy: 'breadth', // Valid values: 'depth', 'breadth', 'hybrid'
    debug: true,
    crawlDelay: 1000 // Be nice to the server
  };
  
  try {
    // Start crawl
    console.log(`Starting crawl of ${testSource.baseUrl} with max depth ${config.maxDepth}, max pages ${config.maxPages}`);
    
    // @ts-ignore - TypeScript errors for this test script
    const result = await crawlerEngine.crawl(testSource, config);
    
    // Log results
    console.log('\nCrawl completed:');
    console.log(`- Pages crawled: ${result.pagesCrawled}`);
    console.log(`- Pages discovered: ${result.pagesDiscovered}`);
    console.log(`- Max depth reached: ${result.maxDepthReached}`);
    console.log(`- Runtime: ${result.runtime}ms`);
    
    if (result.pagesCrawled === 0) {
      console.log('\n⚠️ PROBLEM DETECTED: No pages were crawled!');
      console.log('This indicates an issue with URL discovery or processing.');
    } else {
      console.log('\n✅ SUCCESS: Pages were successfully crawled!');
    }
  } catch (error) {
    console.error('Error during crawl:', error);
  }
}

// Run the test
runTest().catch(console.error);