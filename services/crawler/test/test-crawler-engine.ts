#!/usr/bin/env node

/**
 * Test script for the refactored CrawlerEngine
 * 
 * This script tests the CrawlerEngine with a sample documentation source
 * to verify that it correctly crawls, extracts content, and stores documents.
 */

import { CrawlerEngine, CrawlerEngineConfig } from '../domain/CrawlerEngine.js';
import { ContentProcessor } from '../domain/ContentProcessor.js';
import { StorageManager } from '../domain/StorageManager.js';
import { UrlProcessor } from '../domain/UrlProcessor.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { Document, DocumentSource } from '../../../shared/domain/models/Document.js';
import { DocumentSearchQuery, IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';

// Mock document repository for testing
class MockDocumentRepository implements IDocumentRepository {
  private documents = new Map<string, Document>();
  
  async findById(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }
  
  async findByUrl(url: string): Promise<Document | null> {
    for (const doc of this.documents.values()) {
      if (doc.url === url) {
        return doc;
      }
    }
    return null;
  }
  
  async save(document: Document): Promise<void> {
    this.documents.set(document.id, document);
    // Return void to match interface
  }
  
  async delete(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }
  
  async search(_query: DocumentSearchQuery): Promise<Document[]> {
    return Array.from(this.documents.values());
  }
  
  async findBySourceId(_sourceId: string, _limit?: number, _offset?: number): Promise<Document[]> {
    return Array.from(this.documents.values());
  }
  
  async findByTag(_tag: string, _limit?: number, _offset?: number): Promise<Document[]> {
    return Array.from(this.documents.values());
  }
  
  async count(_query?: DocumentSearchQuery): Promise<number> {
    return this.documents.size;
  }
  
  getAll(): Document[] {
    return Array.from(this.documents.values());
  }
}

// Set up test environment
async function runTest(): Promise<void> {
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
  const source: DocumentSource = {
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
  
  // Define crawler config with properly typed strategy
  const config: CrawlerEngineConfig = {
    maxDepth: 2,
    maxPages: 5,
    force: false,
    crawlDelay: 1000,
    strategy: 'hybrid', // Now correctly typed as 'hybrid' | 'depth' | 'breadth' | undefined
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