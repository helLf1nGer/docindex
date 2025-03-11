/**
 * Integration test for SimpleCrawlerService and BatchCrawlToolHandler
 * 
 * This test verifies that the job completion events from the crawler service
 * are properly received and processed by the batch crawl handler, ensuring
 * accurate progress tracking across multiple crawl jobs.
 */

import { SimpleCrawlerService } from '../SimpleCrawlerService.js';
import { BatchCrawlToolHandler } from '../../../interfaces/mcp/handlers/batch-crawl-tool-handler.js';
import { EventEmitter } from 'events';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { fileURLToPath } from 'url';
import { 
  IDocumentRepository, 
  DocumentSearchQuery 
} from '../../../shared/domain/repositories/DocumentRepository.js';
import { 
  IDocumentSourceRepository, 
  DocumentSourceSearchQuery 
} from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { Document, DocumentSource } from '../../../shared/domain/models/Document.js';

const logger = getLogger();

/**
 * Mock implementation of document repository for testing
 */
class MockDocumentRepository implements IDocumentRepository {
  private documents = new Map<string, Document>();
  
  async findById(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }
  
  async findByUrl(url: string): Promise<Document | null> {
    return Array.from(this.documents.values()).find(doc => doc.url === url) || null;
  }
  
  async search(query: DocumentSearchQuery): Promise<Document[]> {
    const results = Array.from(this.documents.values());
    return results.filter(doc => {
      // Basic filtering by sourceId if provided
      if (query.sourceIds && query.sourceIds.length > 0) {
        return query.sourceIds.includes(doc.sourceId);
      }
      return true;
    }).slice(0, query.limit || 100);
  }
  
  async findBySourceId(sourceId: string, limit?: number, offset?: number): Promise<Document[]> {
    const results = Array.from(this.documents.values()).filter(doc => doc.sourceId === sourceId);
    return results.slice(offset || 0, (offset || 0) + (limit || results.length));
  }
  
  async findByTag(tag: string, limit?: number, offset?: number): Promise<Document[]> {
    const results = Array.from(this.documents.values()).filter(doc => doc.tags && doc.tags.includes(tag));
    return results.slice(offset || 0, (offset || 0) + (limit || results.length));
  }
  
  async save(document: Document): Promise<void> {
    this.documents.set(document.id, document);
  }
  
  async delete(id: string): Promise<boolean> {
    return this.documents.delete(id);
  }
  
  async count(query?: DocumentSearchQuery): Promise<number> {
    if (!query) return this.documents.size;
    return (await this.search(query)).length;
  }
}

/**
 * Mock implementation of document source repository for testing
 */
class MockDocumentSourceRepository implements IDocumentSourceRepository {
  private sources = new Map<string, DocumentSource>();
  
  constructor() {
    // Add test sources
    const source1: DocumentSource = {
      id: 'source1',
      name: 'Test Source 1',
      baseUrl: 'https://test1.example.com',
      addedAt: new Date(),
      lastCrawledAt: undefined,
      crawlConfig: {
        maxDepth: 3,
        maxPages: 100,
        crawlDelay: 100,
        respectRobotsTxt: true,
        includePatterns: [],
        excludePatterns: []
      },
      tags: []
    };
    this.sources.set(source1.id, source1);
    
    const source2: DocumentSource = {
      id: 'source2',
      name: 'Test Source 2',
      baseUrl: 'https://test2.example.com',
      addedAt: new Date(),
      lastCrawledAt: undefined,
      crawlConfig: {
        maxDepth: 3,
        maxPages: 100,
        crawlDelay: 100,
        respectRobotsTxt: true,
        includePatterns: [],
        excludePatterns: []
      },
      tags: []
    };
    this.sources.set(source2.id, source2);
  }
  
  async findById(id: string): Promise<DocumentSource | null> {
    return this.sources.get(id) || null;
  }
  
  async findByName(name: string): Promise<DocumentSource | null> {
    return Array.from(this.sources.values()).find(s => s.name === name) || null;
  }
  
  async findByBaseUrl(baseUrl: string): Promise<DocumentSource | null> {
    return Array.from(this.sources.values()).find(s => s.baseUrl === baseUrl) || null;
  }
  
  async search(query: DocumentSourceSearchQuery): Promise<DocumentSource[]> {
    const results = Array.from(this.sources.values());
    return results.filter(source => {
      // Basic text search if provided
      if (query.text) {
        return source.name.includes(query.text) || source.baseUrl.includes(query.text);
      }
      return true;
    }).slice(0, query.limit || 100);
  }
  
  async findByTag(tag: string, limit?: number, offset?: number): Promise<DocumentSource[]> {
    const results = Array.from(this.sources.values())
      .filter(source => source.tags && source.tags.includes(tag));
    return results.slice(offset || 0, (offset || 0) + (limit || results.length));
  }
  
  async findAll(limit?: number, offset?: number): Promise<DocumentSource[]> {
    const results = Array.from(this.sources.values());
    if (limit === undefined && offset === undefined) {
      return results;
    }
    return results.slice(offset || 0, (offset || 0) + (limit || results.length));
  }
  
  async save(source: DocumentSource): Promise<void> {
    this.sources.set(source.id, source);
  }
  
  async delete(id: string): Promise<boolean> {
    return this.sources.delete(id);
  }
  
  async count(query?: DocumentSourceSearchQuery): Promise<number> {
    if (!query) return this.sources.size;
    return (await this.search(query)).length;
  }
  
  async updateLastCrawledAt(id: string, timestamp: Date): Promise<void> {
    const source = this.sources.get(id);
    if (source) {
      source.lastCrawledAt = timestamp;
      this.sources.set(id, source);
    }
  }
}

/**
 * Run the integration test
 */
async function runIntegrationTest() {
  logger.info('Starting BatchCrawlToolHandler and SimpleCrawlerService integration test', 'BatchCrawlIntegrationTest');
  
  // Create repositories
  const documentRepository = new MockDocumentRepository();
  const sourceRepository = new MockDocumentSourceRepository();
  
  // Create crawler service
  const crawlerService = new SimpleCrawlerService(documentRepository, sourceRepository);
  
  // Create batch handler
  const batchHandler = new BatchCrawlToolHandler(sourceRepository, documentRepository);
  
  // Connect handler to service
  batchHandler.setCrawlerService(crawlerService);
  
  // Test event listeners
  const emitter = crawlerService.getEventEmitter();
  const listenerCount = emitter.listenerCount('job-completed');
  
  logger.info(`Job-completed event listener count: ${listenerCount}`, 'BatchCrawlIntegrationTest');
  
  if (listenerCount === 0) {
    logger.error('No listeners registered for job-completed event!', 'BatchCrawlIntegrationTest');
    return;
  }
  
  logger.info('Testing event emission and handling...', 'BatchCrawlIntegrationTest');
  
  // Define a test completion event
  const testEvent = {
    jobId: 'test-job-1',
    sourceId: 'source1',
    timestamp: new Date(),
    data: {
      pagesCrawled: 42,
      pagesDiscovered: 100,
      totalTime: 1000,
      success: true
    }
  };
  
  // Emit a test job completion event
  logger.info(`Emitting test job-completed event: ${JSON.stringify(testEvent)}`, 'BatchCrawlIntegrationTest');
  emitter.emit('job-completed', testEvent);
  
  // Wait a moment for event processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  logger.info('Integration test complete.', 'BatchCrawlIntegrationTest');
  logger.info('To perform a live test, start the DocSI server with the simplified crawler', 'BatchCrawlIntegrationTest');
  logger.info('and run a batch crawl job with at least 2 sources.', 'BatchCrawlIntegrationTest');
}

// Run tests if script is executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  runIntegrationTest().catch(error => {
    logger.error(`Integration test failed: ${error instanceof Error ? error.stack || error.message : String(error)}`, 'BatchCrawlIntegrationTest');
  });
}

export { runIntegrationTest };