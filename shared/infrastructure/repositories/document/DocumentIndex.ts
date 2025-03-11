/**
 * Document repository indexing
 */

import { DocumentIndex, IndexEntry } from './DocumentTypes.js';
import { getLogger } from '../../../infrastructure/logging.js';

const logger = getLogger();

/**
 * In-memory document index implementation
 */
export class InMemoryDocumentIndex implements DocumentIndex {
  private idToPathMap: Map<string, string> = new Map();
  private urlToPathMap: Map<string, string> = new Map();
  
  /**
   * Clear the index
   */
  clear(): void {
    this.idToPathMap.clear();
    this.urlToPathMap.clear();
    logger.info('Document index cleared', 'DocumentIndex');
  }
  
  /**
   * Get file path by document ID
   * @param id Document ID
   * @returns File path or undefined if not found
   */
  getPathById(id: string): string | undefined {
    return this.idToPathMap.get(id);
  }
  
  /**
   * Get file path by document URL
   * @param url Document URL
   * @returns File path or undefined if not found
   */
  getPathByUrl(url: string): string | undefined {
    return this.urlToPathMap.get(url);
  }
  
  /**
   * Set path for document ID
   * @param id Document ID
   * @param path File path
   */
  setPathForId(id: string, path: string): void {
    this.idToPathMap.set(id, path);
  }
  
  /**
   * Set path for document URL
   * @param url Document URL
   * @param path File path
   */
  setPathForUrl(url: string, path: string): void {
    this.urlToPathMap.set(url, path);
  }
  
  /**
   * Remove document ID from index
   * @param id Document ID
   */
  removeId(id: string): void {
    this.idToPathMap.delete(id);
  }
  
  /**
   * Remove document URL from index
   * @param url Document URL
   */
  removeUrl(url: string): void {
    this.urlToPathMap.delete(url);
  }
  
  /**
   * Get size of the index
   */
  get size(): number {
    return this.idToPathMap.size;
  }
  
  /**
   * Get all document IDs
   * @returns Array of document IDs
   */
  getAllIds(): string[] {
    return Array.from(this.idToPathMap.keys());
  }
  
  /**
   * Add a document to the index
   * @param id Document ID
   * @param url Document URL
   * @param path File path
   */
  addDocument(id: string, url: string, path: string): void {
    this.setPathForId(id, path);
    this.setPathForUrl(url, path);
  }
  
  /**
   * Remove a document from the index
   * @param id Document ID
   * @param url Document URL
   */
  removeDocument(id: string, url: string): void {
    this.removeId(id);
    this.removeUrl(url);
  }
}