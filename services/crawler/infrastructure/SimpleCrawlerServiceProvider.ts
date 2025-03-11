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

/**
 * Creates and configures a SimpleCrawlerService instance
 */
export class SimpleCrawlerServiceProvider {
  /**
   * Create a new SimpleCrawlerService instance
   * @param documentRepository Repository for documents
   * @param sourceRepository Repository for document sources
   * @returns A configured SimpleCrawlerService instance
   */
  public static createService(
    documentRepository: IDocumentRepository,
    sourceRepository: IDocumentSourceRepository
  ): ICrawlerService {
    console.log('Creating SimpleCrawlerService instance...');
    
    // Create the service
    const service = new SimpleCrawlerService(
      documentRepository,
      sourceRepository
    );
    
    console.log('SimpleCrawlerService created successfully.');
    
    return service;
  }
}