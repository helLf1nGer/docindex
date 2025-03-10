/**
 * Repository interface for DocumentSource entities
 * Provides an abstraction layer over the storage mechanism
 */
import { DocumentSource } from '../models/Document.js';

/**
 * Interface for DocumentSource search queries
 */
export interface DocumentSourceSearchQuery {
  /** Text to search for in source name and URL */
  text?: string;
  
  /** Tags to filter by (must have ALL specified tags) */
  tags?: string[];
  
  /** Minimum added date */
  addedAfter?: Date;
  
  /** Maximum added date */
  addedBefore?: Date;
  
  /** Maximum number of results to return */
  limit?: number;
  
  /** Number of results to skip (for pagination) */
  offset?: number;
}

/**
 * DocumentSource repository interface
 */
export interface IDocumentSourceRepository {
  /**
   * Find a document source by its ID
   * @param id Source ID
   * @returns Promise resolving to the source or null if not found
   */
  findById(id: string): Promise<DocumentSource | null>;
  
  /**
   * Find a document source by its name
   * @param name Source name
   * @returns Promise resolving to the source or null if not found
   */
  findByName(name: string): Promise<DocumentSource | null>;
  
  /**
   * Find a document source by its base URL
   * @param baseUrl Source base URL
   * @returns Promise resolving to the source or null if not found
   */
  findByBaseUrl(baseUrl: string): Promise<DocumentSource | null>;
  
  /**
   * Find document sources that match the given query
   * @param query Search query parameters
   * @returns Promise resolving to array of matching sources
   */
  search(query: DocumentSourceSearchQuery): Promise<DocumentSource[]>;
  
  /**
   * Find document sources by tag
   * @param tag Tag to search for
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching sources
   */
  findByTag(tag: string, limit?: number, offset?: number): Promise<DocumentSource[]>;
  
  /**
   * Get all document sources
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of all sources
   */
  findAll(limit?: number, offset?: number): Promise<DocumentSource[]>;
  
  /**
   * Save a document source (create or update)
   * @param source Source to save
   * @returns Promise that resolves when the operation is complete
   */
  save(source: DocumentSource): Promise<void>;
  
  /**
   * Delete a document source by its ID
   * @param id Source ID
   * @returns Promise that resolves to true if the source was deleted
   */
  delete(id: string): Promise<boolean>;
  
  /**
   * Count document sources matching a query
   * @param query Search query parameters
   * @returns Promise resolving to the count
   */
  count(query?: DocumentSourceSearchQuery): Promise<number>;
  
  /**
   * Update the lastCrawledAt timestamp for a source
   * @param id Source ID
   * @param timestamp New lastCrawledAt timestamp
   * @returns Promise that resolves when the operation is complete
   */
  updateLastCrawledAt(id: string, timestamp: Date): Promise<void>;
}