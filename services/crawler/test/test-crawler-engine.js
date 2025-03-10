#!/usr/bin/env node

/**
 * Test script for the refactored CrawlerEngine
 * 
 * This script tests the CrawlerEngine with a sample documentation source
 * to verify that it correctly crawls, extracts content, and stores documents.
 */

const { CrawlerEngine } = require('../domain/CrawlerEngine.js');
const { ContentProcessor } = require('../domain/ContentProcessor.js');
const { StorageManager } = require('../domain/StorageManager.js');
const { UrlProcessor } = require('../domain/UrlProcessor.js');
const { HttpClient } = require('../../../shared/infrastructure/HttpClient.js');

// Mock document repository for testing
class MockDocumentRepository {
  constructor() {
    this.documents = new Map();
  }
  
  async findById(id) {
    return this.documents.get(id) || null;
  }
  
  async findByUrl(url) {
    for (const doc of this.documents.values()) {
      if (doc.url === url) {
        return doc;
      }
    }
    return null;
  }
  
  async save(document) {
    this.documents.set(document.id, document);
    return document;
  }
  
  async delete(id) {
    return this.documents.delete(id);
  }
  
  getAll() {
    return Array.from(this.documents.values());
  }
}

// Set up test environment
async function runTest() {
  console.log('Testing CrawlerEngine');
  console.log('====================');
  
  // Create components
  const documentRepository = new MockDocumentRepository();
  const httpClient = new HttpClient();
  const contentProcessor = new ContentProcessor();
  const storageManager = new StorageManager(documentRepository);
  const urlProcessor = new UrlProcessor();
  
  // Create crawler engine
  const crawlerEngine = new CrawlerEngine(
    httpClient,
    contentProcessor,
    storageManager,
    urlProcessor
  );
  
  // Set up event listeners for crawler engine
  crawlerEngine.getEventEmitter().on('page-crawled', (event) => {
    console.log(`Crawled: ${event.data.url}`);
  });
  
  // Define test source (MDN JavaScript documentation)
  const source = {
    id: 'test-mdn',
    name: 'MDN JavaScript',
    baseUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    addedAt: new Date(),
    crawlConfig: {
      maxDepth: 2,
      maxPages: 5,
      respectRobotsTxt: true,
      crawlDelay: 1000,
      includePatterns: ['/JavaScript/Guide'],
      excludePatterns: []
    },
    tags: ['javascript', 'mdn', 'test']
  };
  
  // Define crawler config
  const config = {
    maxDepth: 2,
    maxPages: 5,
    force: false,
    crawlDelay: 1000,
    strategy: 'hybrid',
    prioritizationPatterns: ['introduction', 'functions', 'objects'],
    concurrency: 2,
    debug: true
  };
  
  console.log(`Starting test crawl of ${source.name} (${source.baseUrl})`);
  console.log(`Max depth: ${config.maxDepth}, Max pages: ${config.maxPages}`);
  
  try {
    // Run the crawler
    const result = await crawlerEngine.crawl(source, config);
    
    console.log('\nCrawl complete!');
    console.log(`Pages crawled: ${result.pagesCrawled}`);
    console.log(`Pages discovered: ${result.pagesDiscovered}`);
    console.log(`Max depth reached: ${result.maxDepthReached}`);
    console.log(`Runtime: ${result.runtime}ms`);
    
    // Get all stored documents
    const documents = documentRepository.getAll();
    console.log(`\nStored documents: ${documents.length}`);
    
    // Print document info
    documents.forEach((doc, index) => {
      console.log(`\nDocument ${index + 1}:`);
      console.log(`  Title: ${doc.title}`);
      console.log(`  URL: ${doc.url}`);
      console.log(`  Text content length: ${doc.textContent.length} chars`);
      console.log(`  Tags: ${doc.tags.join(', ')}`);
    });
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});