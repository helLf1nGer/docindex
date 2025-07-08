/**
 * Enhanced integration module for DocSI MCP server
 * 
 * This module provides enhanced crawling capabilities by integrating
 * the improved components for better depth handling, sitemap processing,
 * and URL prioritization.
 */

import { HttpClient } from '../../shared/infrastructure/HttpClient.js';
import { FileSystemDocumentRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from '../../shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';
import { EnhancedCrawlerService } from '../../services/crawler/domain/EnhancedCrawlerService.js';
import { getLogger } from '../../shared/infrastructure/logging.js';
import { BatchCrawlToolHandler } from './handlers/batch-crawl-tool-handler.js';
import { IDocumentRepository } from '../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../shared/domain/repositories/DocumentSourceRepository.js';

const logger = getLogger();

/**
 * Create an enhanced crawler service
 * @param documentRepository Repository for documents
 * @param sourceRepository Repository for document sources
 * @returns The configured enhanced crawler service
 */
export function createEnhancedCrawlerService(
  documentRepository: IDocumentRepository,
  sourceRepository: IDocumentSourceRepository
): EnhancedCrawlerService {
  logger.info('Creating enhanced crawler service', 'enhanced-integration');
  
  // Initialize HTTP client
  const httpClient = new HttpClient();
  
  // Initialize enhanced crawler service
  const crawlerService = new EnhancedCrawlerService(
    documentRepository,
    sourceRepository,
    httpClient
  );
  
  logger.info('Enhanced crawler service created', 'enhanced-integration');
  
  return crawlerService;
}

/**
 * Wire up enhanced components with existing batch crawler handler
 * @param batchHandler Existing batch crawler handler
 * @returns The configured crawler service
 */
export function enhanceExistingBatchHandler(
  batchHandler: BatchCrawlToolHandler
): EnhancedCrawlerService | null {
  logger.info('Enhancing existing batch handler with improved crawler service', 'enhanced-integration');
  
  try {
    // Extract repositories from the handler
    const documentRepository = batchHandler.getDocumentRepository();
    const sourceRepository = batchHandler.getSourceRepository();
    
    if (!documentRepository || !sourceRepository) {
      logger.warn('Could not access repositories from batch handler', 'enhanced-integration');
      return null;
    }
    
    // Create enhanced crawler service
    const crawlerService = createEnhancedCrawlerService(
      documentRepository,
      sourceRepository
    );
    
    // Connect improved crawler service to existing handler
    batchHandler.setCrawlerService(crawlerService);
    
    logger.info('Batch handler enhanced with improved crawler service', 'enhanced-integration');
    
    return crawlerService;
  } catch (error) {
    logger.error(`Error enhancing batch handler: ${error}`, 'enhanced-integration');
    return null;
  }
}

/**
 * Setup all enhanced components for a new MCP server instance
 * This is a simplified integration that should work with any MCP server
 * @param server MCP server instance
 * @param existingHandlers Optional map of existing handlers
 */
export async function setupEnhancedComponents(
  existingHandlers?: Map<string, any>
): Promise<{
  crawlerService: EnhancedCrawlerService | null;
}> {
  logger.info('Setting up enhanced components', 'enhanced-integration');
  
  try {
    let crawlerService: EnhancedCrawlerService | null = null;
    
    // Check for existing handlers
    if (existingHandlers && existingHandlers.size > 0) {
      // Try to find BatchCrawlToolHandler
      const batchHandler = Array.from(existingHandlers.values())
        .find(h => h instanceof BatchCrawlToolHandler) as BatchCrawlToolHandler | undefined;
      
      if (batchHandler) {
        // Enhance existing handler
        crawlerService = enhanceExistingBatchHandler(batchHandler);
        logger.info('Enhanced existing batch handler', 'enhanced-integration');
      } else {
        logger.warn('No existing BatchCrawlToolHandler found', 'enhanced-integration');
      }
    }
    
    // If no handler was enhanced, create new components
    if (!crawlerService) {
      // Initialize repositories
      const documentRepository = new FileSystemDocumentRepository();
      const sourceRepository = new FileSystemDocumentSourceRepository();
      
      // Create enhanced crawler service
      crawlerService = createEnhancedCrawlerService(
        documentRepository,
        sourceRepository
      );
      
      logger.info('Created new enhanced components', 'enhanced-integration');
    }
    
    return {
      crawlerService
    };
  } catch (error) {
    logger.error(`Error setting up enhanced components: ${error}`, 'enhanced-integration');
    return {
      crawlerService: null
    };
  }
}