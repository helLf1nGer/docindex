/**
 * Type definitions for document repository
 */

import { Document } from '../../../../shared/domain/models/Document.js';
import { DocumentSearchQuery } from '../../../../shared/domain/repositories/DocumentRepository.js';

/**
 * Document cache key type (document ID)
 */
export type DocumentCacheKey = string;

/**
 * Document cache value type (document)
 */
export type DocumentCacheValue = Document;

/**
 * Document repository configuration
 */
export interface DocumentRepositoryConfig {
  /** Base directory for document storage */
  baseDir: string;
  
  /** Cache configuration */
  cache: {
    /** Maximum number of documents to keep in cache */
    maxSize: number;
    
    /** Time to live in milliseconds */
    ttl: number;
  };
}

/**
 * Document index interface
 */
export interface DocumentIndex {
  /** Clear the index */
  clear(): void;
  
  /** Get file path by document ID */
  getPathById(id: string): string | undefined;
  
  /** Get file path by document URL */
  getPathByUrl(url: string): string | undefined;
  
  /** Set path for document ID */
  setPathForId(id: string, path: string): void;
  
  /** Set path for document URL */
  setPathForUrl(url: string, path: string): void;
  
  /** Remove document ID from index */
  removeId(id: string): void;
  
  /** Remove document URL from index */
  removeUrl(url: string): void;
  
  /** Get size of the index */
  get size(): number;
  
  /** Get all document IDs */
  getAllIds(): string[];
}

/**
 * Search snippet helper types
 */
export type MatchIndices = ReadonlyArray<ReadonlyArray<number>>;

/**
 * Document index entry
 */
export interface IndexEntry {
  /** Document ID */
  id: string;
  
  /** Document URL */
  url: string;
  
  /** File path */
  path: string;
}