/**
 * Repository interface for Document entities
 * Provides an abstraction layer over the storage mechanism
 */
import { Document } from '../models/Document.js';

/**
 * Interface for Document search queries
 */
export interface DocumentSearchQuery {
  /** Text to search for in document content and title */
  text?: string;
  
  /** Source IDs to filter by */
  sourceIds?: string[];
  
  /** Tags to filter by (must have ALL specified tags) */
  tags?: string[];
  
  /** Minimum indexed date */
  indexedAfter?: Date;
  
  /** Maximum indexed date */
  indexedBefore?: Date;
  
  /** Maximum number of results to return */
  limit?: number;
  
  /** Number of results to skip (for pagination) */
  offset?: number;
}

/**
 * Document repository interface
 */
export interface IDocumentRepository {
  /**
   * Find a document by its ID
   * @param id Document ID
   * @returns Promise resolving to the document or null if not found
   */
  findById(id: string): Promise<Document | null>;
  
  /**
   * Find a document by its URL
   * @param url Document URL
   * @returns Promise resolving to the document or null if not found
   */
  findByUrl(url: string): Promise<Document | null>;
  
  /**
   * Find documents that match the given query
   * @param query Search query parameters
   * @returns Promise resolving to array of matching documents
   */
  search(query: DocumentSearchQuery): Promise<Document[]>;
  
  /**
   * Find documents by source ID
   * @param sourceId Source ID
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching documents
   */
  findBySourceId(sourceId: string, limit?: number, offset?: number): Promise<Document[]>;
  
  /**
   * Find documents by tag
   * @param tag Tag to search for
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching documents
   */
  findByTag(tag: string, limit?: number, offset?: number): Promise<Document[]>;
  
  /**
   * Save a document (create or update)
   * @param document Document to save
   * @returns Promise that resolves when the operation is complete
   */
  save(document: Document): Promise<void>;
  
  /**
   * Delete a document by its ID
   * @param id Document ID
   * @returns Promise that resolves to true if the document was deleted
   */
  delete(id: string): Promise<boolean>;
  
  /**
   * Count documents matching a query
   * @param query Search query parameters
   * @returns Promise resolving to the count
   */
  count(query?: DocumentSearchQuery): Promise<number>;
}