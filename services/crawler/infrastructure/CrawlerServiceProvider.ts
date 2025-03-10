/**
 * Implementation of the crawler service
 * This connects the domain interfaces to concrete implementations
 */

import { ICrawlerService, CrawlerService, PageCrawledEvent } from '../domain/CrawlerService.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { FileSystemDocumentRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { config } from '../../../shared/infrastructure/config.js';
import { Document } from '../../../shared/domain/models/Document.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { extractContent } from '../../../shared/infrastructure/ContentExtractor.js';
import { createHash } from 'crypto';

/**
 * Factory class for creating crawler service instance with all dependencies
 */
export class CrawlerServiceProvider {
  private static instance: ICrawlerService | null = null;
  private static logger = getLogger();
  
  /**
   * Get the crawler service singleton instance
   * Creates the instance with all dependencies on first call
   */
  static async getInstance(): Promise<ICrawlerService> {
    if (!this.instance) {
      // Create repositories
      const sourceRepository = new FileSystemDocumentSourceRepository();
      const documentRepository = new FileSystemDocumentRepository();
      
      // Initialize repositories
      await sourceRepository.initialize();
      await documentRepository.initialize();
      
      // Create HTTP client
      const httpClient = new HttpClient({
        userAgent: config.crawler.userAgent,
        timeout: 10000,
        retries: 3,
        respectRobotsTxt: false, // Disable robots.txt respect to allow more comprehensive crawling
        rateLimit: 60 // requests per minute
      });
      
      // Create the crawler service
      this.instance = new CrawlerService(
        documentRepository,
        sourceRepository as any, // Cast to any to bypass type checking temporarily
        httpClient
      );
      
      // Setup event listeners to process crawled pages
      this.setupEventListeners(this.instance, documentRepository);
    }
    
    return this.instance;
  }
  
  /**
   * Set up event listeners for crawler events
   * This connects the crawler service to the document repository
   */
  private static setupEventListeners(
    crawlerService: ICrawlerService,
    documentRepository: IDocumentRepository
  ): void {
    const eventEmitter = crawlerService.getEventEmitter();
    
    // Listen for page-crawled events
    eventEmitter.on('page-crawled', async (event: PageCrawledEvent) => {
      try {
        // Log the event for debugging
        this.logger.debug(`Received page-crawled event for URL: ${event?.data?.url || 'unknown'}`, 'CrawlerServiceProvider');
        
        if (!event || !event.data || !event.data.url) {
          this.logger.error('Invalid page-crawled event received', 'CrawlerServiceProvider', event);
          return;
        }
        
        // Create document from crawled page
        const document: Document = {
          id: this.generateDocumentId(event.data.url),
          url: event.data.url,
          title: event.data.title || 'Untitled Document',
          content: event.data.content || '',
          textContent: this.extractTextContent(event.data.content || '', event.data.url),
          indexedAt: new Date(),
          updatedAt: new Date(),
          sourceId: event.sourceId,
          tags: [],
          metadata: {
            statusCode: event.data.statusCode,
            contentType: event.data.contentType,
            contentSize: event.data.contentSize,
            fetchTime: event.data.fetchTime,
            crawlJobId: event.jobId
          }
        };
        
        // Save document to repository
        await documentRepository.save(document);
        
        // Log document saved
        this.logger.info(`Saved document: ${document.url}`, 'CrawlerServiceProvider');
      } catch (error: unknown) {
        this.logger.error('Error processing crawled page', 'CrawlerServiceProvider', error instanceof Error ? error.message : String(error));
      }
    });
    
    // More event listeners could be added here (job-completed, page-discovered, etc.)
  }
  
  /**
   * Generate a document ID from a URL
   */
  private static generateDocumentId(url: string): string {
    // Create a stable, URL-safe ID from the URL
    return createHash('sha256').update(url).digest('hex');
  }
  
  /**
   * Extract plain text content from HTML
   * Uses the new robust content extractor
   */
  private static extractTextContent(html: string, url: string): string {
    if (!html || html.trim() === '') {
      return '';
    }
    
    try {
      // Use our robust content extractor
      const extractionResult = extractContent(html, url, {
        extractMetadata: true,
        extractHeadings: true,
        extractCodeBlocks: true
      });
      
      // Return the extracted text content
      return extractionResult.textContent;
    } catch (error) {
      this.logger.error(`Error extracting text content from ${url}`, 'CrawlerServiceProvider', error);
      
      // Fallback to the simpler implementation if the extractor fails
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
}