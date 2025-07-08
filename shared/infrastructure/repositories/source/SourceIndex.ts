/**
 * Source repository indexing
 */

import { SourceIndex } from './SourceTypes.js';
import { DocumentSource } from '../../../../shared/domain/models/Document.js';
import { getLogger } from '../../../infrastructure/logging.js';

const logger = getLogger();

/**
 * In-memory source index implementation
 */
export class InMemorySourceIndex implements SourceIndex {
  private sources: Map<string, DocumentSource> = new Map();
  
  /**
   * Get all source IDs
   * @returns Array of source IDs
   */
  getAllIds(): string[] {
    return Array.from(this.sources.keys());
  }
  
  /**
   * Get size of the index
   * @returns Number of sources in the index
   */
  get size(): number {
    return this.sources.size;
  }
  
  /**
   * Add source to index
   * @param source Document source
   */
  addSource(source: DocumentSource): void {
    this.sources.set(source.id, source);
    logger.debug(`Added source to index: ${source.id} (${source.name})`, 'SourceIndex');
  }
  
  /**
   * Remove source from index
   * @param id Source ID
   */
  removeSource(id: string): void {
    this.sources.delete(id);
    logger.debug(`Removed source from index: ${id}`, 'SourceIndex');
  }
  
  /**
   * Find source by name
   * @param name Source name
   * @returns Document source or undefined if not found
   */
  findByName(name: string): DocumentSource | undefined {
    for (const source of this.sources.values()) {
      if (source.name === name) {
        return source;
      }
    }
    
    return undefined;
  }
  
  /**
   * Find source by base URL
   * @param baseUrl Source base URL
   * @returns Document source or undefined if not found
   */
  findByBaseUrl(baseUrl: string): DocumentSource | undefined {
    for (const source of this.sources.values()) {
      if (source.baseUrl === baseUrl) {
        return source;
      }
    }
    
    return undefined;
  }
  
  /**
   * Clear the index
   */
  clear(): void {
    this.sources.clear();
    logger.info('Source index cleared', 'SourceIndex');
  }
  
  /**
   * Get a source by ID
   * @param id Source ID
   * @returns Document source or undefined if not found
   */
  getById(id: string): DocumentSource | undefined {
    return this.sources.get(id);
  }
}