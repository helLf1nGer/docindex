/**
 * Document search functionality
 */

import Fuse from 'fuse.js';
import { Document } from '../../../../shared/domain/models/Document.js';
import { DocumentSearchQuery } from '../../../../shared/domain/repositories/DocumentRepository.js';
import { getLogger } from '../../../infrastructure/logging.js';
import { MatchIndices } from './DocumentTypes.js';

const logger = getLogger();

/**
 * Document search helper
 */
export class DocumentSearch {
  /**
   * Find documents that match the given query
   * @param documents Array of documents to search
   * @param query Search query parameters
   * @returns Array of matching documents
   */
  executeSearch(documents: Document[], query: DocumentSearchQuery): Document[] {
    logger.info(`Searching ${documents.length} documents with query: ${JSON.stringify(query)}`, 'DocumentSearch');
    
    // Filter by source IDs if provided
    let results = documents;
    if (query.sourceIds && query.sourceIds.length > 0) {
      logger.info(`Filtering by source IDs: ${query.sourceIds.join(', ')}`, 'DocumentSearch');
      results = results.filter(doc => 
        query.sourceIds!.includes(doc.sourceId)
      );
      logger.info(`After source filter: ${results.length} documents`, 'DocumentSearch');
    }
    
    // Filter by tags if provided
    if (query.tags && query.tags.length > 0) {
      logger.info(`Filtering by tags: ${query.tags.join(', ')}`, 'DocumentSearch');
      results = results.filter(doc => 
        query.tags!.every(tag => doc.tags && doc.tags.includes(tag))
      );
      logger.info(`After tag filter: ${results.length} documents`, 'DocumentSearch');
    }
    
    // Filter by indexed date if provided
    if (query.indexedAfter) {
      results = results.filter(doc => 
        new Date(doc.indexedAt) >= query.indexedAfter!
      );
    }
    
    if (query.indexedBefore) {
      results = results.filter(doc => 
        new Date(doc.indexedAt) <= query.indexedBefore!
      );
    }
    
    // Text search if provided
    if (query.text) {
      logger.info(`Performing text search for: "${query.text}"`, 'DocumentSearch');
      results = this.performTextSearch(results, query.text);
    }
    
    // Apply pagination
    if (query.offset) {
      results = results.slice(query.offset);
    }
    
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    logger.info(`Search returned ${results.length} results`, 'DocumentSearch');
    return results;
  }
  
  /**
   * Perform text search using Fuse.js
   * @param documents Documents to search
   * @param searchText Search text
   * @returns Matching documents
   */
  private performTextSearch(documents: Document[], searchText: string): Document[] {
    const fuse = new Fuse(documents, {
      keys: [
        { name: 'title', weight: 2 }, // Title is twice as important
        { name: 'textContent', weight: 1 },
        { name: 'metadata.description', weight: 1.5 } // Description is also important
      ],
      includeScore: true,
      // Lower threshold means more strict matching
      // 0.0 = perfect match, 1.0 = anything matches
      threshold: 0.4, 
      // Include matches information so we can highlight relevant sections
      includeMatches: true,
      ignoreLocation: true
    });
    
    const results = fuse.search(searchText);
    logger.info(`Fuse search returned ${results.length} results`, 'DocumentSearch');
    
    // Log the top results for debugging
    if (results.length > 0) {
      results.slice(0, 3).forEach((result, index) => {
        logger.info(`Result ${index+1}: "${result.item.title}" (score: ${result.score || 'unknown'})`, 'DocumentSearch');
        
        // Add match information to the document
        // This can be used by the client to highlight relevant sections
        if (result.matches) {
          // Find text content matches
          const textMatches = result.matches.filter(match => match.key === 'textContent');
          if (textMatches.length > 0 && textMatches[0].indices.length > 0) {
            // Add content snippet to document metadata for retrieval
            result.item.metadata = result.item.metadata || {};
            result.item.metadata.searchSnippets = this.extractSnippets(
              result.item.textContent, 
              textMatches[0].indices, 
              150
            );
          }
        }
      });
    }
    
    return results.map(result => result.item);
  }
  
  /**
   * Extract text snippets from content based on match indices
   * @param text Full text content
   * @param matches Array of index pairs from Fuse.js
   * @param snippetLength Maximum length of each snippet
   * @returns Array of snippets
   */
  extractSnippets(text: string, matches: MatchIndices, snippetLength: number): string[] {
    if (!text) return [];

    return matches.slice(0, 3).map(([start, end]) => {
      // Calculate snippet boundaries with context
      const snippetStart = Math.max(0, start - snippetLength / 2);
      const snippetEnd = Math.min(text.length, end + snippetLength / 2);
      
      // Extract snippet
      return text.substring(Math.floor(snippetStart), Math.ceil(snippetEnd)) + '...';
    });
  }
}