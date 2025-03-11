/**
 * Source search functionality
 */

import Fuse from 'fuse.js';
import { DocumentSource } from '../../../../shared/domain/models/Document.js';
import { DocumentSourceSearchQuery } from '../../../../shared/domain/repositories/DocumentSourceRepository.js';
import { getLogger } from '../../../infrastructure/logging.js';

const logger = getLogger();

/**
 * Source search helper
 */
export class SourceSearch {
  /**
   * Find sources that match the given query
   * @param sources Array of sources to search
   * @param query Search query parameters
   * @returns Array of matching sources
   */
  executeSearch(sources: DocumentSource[], query: DocumentSourceSearchQuery): DocumentSource[] {
    logger.info(`Searching ${sources.length} sources with query: ${JSON.stringify(query)}`, 'SourceSearch');
    
    // Filter by tags if provided
    let results = sources;
    if (query.tags && query.tags.length > 0) {
      logger.info(`Filtering by tags: ${query.tags.join(', ')}`, 'SourceSearch');
      results = results.filter(source => 
        query.tags!.every(tag => source.tags.includes(tag))
      );
      logger.info(`After tag filter: ${results.length} sources`, 'SourceSearch');
    }
    
    // Filter by added date if provided
    if (query.addedAfter) {
      results = results.filter(source => 
        new Date(source.addedAt) >= query.addedAfter!
      );
    }
    
    if (query.addedBefore) {
      results = results.filter(source => 
        new Date(source.addedAt) <= query.addedBefore!
      );
    }
    
    // Text search if provided
    if (query.text) {
      logger.info(`Performing text search for: "${query.text}"`, 'SourceSearch');
      results = this.performTextSearch(results, query.text);
    }
    
    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    logger.info(`Search returned ${results.length} results`, 'SourceSearch');
    return results;
  }
  
  /**
   * Perform text search using Fuse.js
   * @param sources Sources to search
   * @param searchText Search text
   * @returns Matching sources
   */
  private performTextSearch(sources: DocumentSource[], searchText: string): DocumentSource[] {
    const fuse = new Fuse(sources, {
      keys: ['name', 'baseUrl', 'description'],
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true
    });
    
    const results = fuse.search(searchText);
    logger.info(`Fuse search returned ${results.length} results`, 'SourceSearch');
    
    // Log the top results for debugging
    if (results.length > 0) {
      results.slice(0, 3).forEach((result, index) => {
        logger.info(`Result ${index+1}: "${result.item.name}" (score: ${result.score || 'unknown'})`, 'SourceSearch');
      });
    }
    
    return results.map(result => result.item);
  }
}