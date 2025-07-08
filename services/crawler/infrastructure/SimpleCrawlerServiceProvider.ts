/**
 * SimpleCrawlerServiceProvider
 * 
 * Service provider that creates a SimpleCrawlerService instance
 * and registers it with the necessary dependencies.
 */

import { SimpleCrawlerService } from '../SimpleCrawlerService.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { ICrawlerService } from '../domain/CrawlerService.js';
import { Browser } from 'playwright'; // Added Browser import
import { getLogger } from '../../../shared/infrastructure/logging.js';
const logger = getLogger();

/**
 * Creates and configures a SimpleCrawlerService instance
 */
export class SimpleCrawlerServiceProvider {
  /**
   * Create a new SimpleCrawlerService instance
   * @param documentRepository Repository for documents
   * @param sourceRepository Repository for document sources
   * @param browser Playwright Browser instance
   * @returns A configured SimpleCrawlerService instance
   */
  public static createService(
    documentRepository: IDocumentRepository,
    sourceRepository: IDocumentSourceRepository,
    browser: Browser // Added browser parameter
  ): ICrawlerService {
    logger.info('Creating SimpleCrawlerService instance...', 'SimpleCrawlerServiceProvider');
    
    // Create the service
    const service = new SimpleCrawlerService(
      documentRepository,
      sourceRepository,
      browser, // Pass browser instance
      logger // Pass logger instance
    );
    
    logger.info('SimpleCrawlerService created successfully.', 'SimpleCrawlerServiceProvider');
    
    return service;
  }
}