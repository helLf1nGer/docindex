/**
 * Type definitions for document source repository
 */

import { DocumentSource } from '../../../../shared/domain/models/Document.js';
import { DocumentSourceSearchQuery } from '../../../../shared/domain/repositories/DocumentSourceRepository.js';

/**
 * Document source cache key type (source ID)
 */
export type SourceCacheKey = string;

/**
 * Document source cache value type (source)
 */
export type SourceCacheValue = DocumentSource;

/**
 * Document source repository configuration
 */
export interface SourceRepositoryConfig {
  /** Base directory for source storage */
  baseDir: string;
}

/**
 * Document source index interface
 */
export interface SourceIndex {
  /** Get all source IDs */
  getAllIds(): string[];
  
  /** Get size of the index */
  get size(): number;
  
  /** Add source to index */
  addSource(source: DocumentSource): void;
  
  /** Remove source from index */
  removeSource(id: string): void;
  
  /** Find source by name */
  findByName(name: string): DocumentSource | undefined;
  
  /** Find source by base URL */
  findByBaseUrl(baseUrl: string): DocumentSource | undefined;
  
  /** Clear the index */
  clear(): void;
}