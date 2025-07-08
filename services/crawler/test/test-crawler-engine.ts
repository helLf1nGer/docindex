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
import { getLogger } from '../../../shared/infrastructure/logging.js'; // Use getLogger

// Mock document repository for testing
class MockDocumentRepository implements IDocumentRepository {
  private documents = new Map<string, Document>();
  
  async findById(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  async findByIds(ids: string[]): Promise<Document[]> {
    // Basic mock implementation: filter documents by ID
    return ids
      .map(id => this.documents.get(id))
      .filter((doc): doc is Document => doc !== undefined);
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

const logger = getLogger(); // Get logger instance at a higher scope

// Set up test environment
async function runTest(): Promise<void> {
  logger.info('Testing CrawlerEngine', 'CrawlerEngineTest');
  logger.info('====================', 'CrawlerEngineTest');
  
  // Create components
  const documentRepository = new MockDocumentRepository();
  const httpClient = new HttpClient();
  const contentProcessor = new ContentProcessor();
  const storageManager = new StorageManager(documentRepository, {} as any, {} as any);
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
    logger.debug(`Crawled: ${event.data.url}`, 'CrawlerEngineTest');
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
  
  logger.info(`Starting test crawl of ${source.name} (${source.baseUrl})`, 'CrawlerEngineTest');
  logger.info(`Max depth: ${config.maxDepth}, Max pages: ${config.maxPages}`, 'CrawlerEngineTest');
  
  try {
    // Run the crawler
    const result = await crawlerEngine.crawl(source, config);
    
    logger.info('\nCrawl complete!', 'CrawlerEngineTest');
    logger.info(`Pages crawled: ${result.pagesCrawled}`, 'CrawlerEngineTest');
    logger.info(`Pages discovered: ${result.pagesDiscovered}`, 'CrawlerEngineTest');
    logger.info(`Max depth reached: ${result.maxDepthReached}`, 'CrawlerEngineTest');
    logger.info(`Runtime: ${result.runtime}ms`, 'CrawlerEngineTest');
    
    // Get all stored documents
    const documents = documentRepository.getAll();
    logger.info(`\nStored documents: ${documents.length}`, 'CrawlerEngineTest');
    
    // Print document info
    documents.forEach((doc, index) => {
      logger.debug(`\nDocument ${index + 1}:`, 'CrawlerEngineTest');
      logger.debug(`  Title: ${doc.title}`, 'CrawlerEngineTest');
      logger.debug(`  URL: ${doc.url}`, 'CrawlerEngineTest');
      logger.debug(`  Text content length: ${doc.textContent.length} chars`, 'CrawlerEngineTest');
      logger.debug(`  Tags: ${doc.tags.join(', ')}`, 'CrawlerEngineTest');
    });
    
    logger.info('\nTest completed successfully!', 'CrawlerEngineTest');
  } catch (error) {
    logger.error('Error during test:', 'CrawlerEngineTest', error); // Pass error as metadata
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => {
  logger.error('Fatal error:', 'CrawlerEngineTest', error); // Use logger and pass error as metadata
  process.exit(1);
});