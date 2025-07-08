/**
 * Document repository caching
 */

import { DocumentCacheKey, DocumentCacheValue } from './DocumentTypes.js';
import { getLogger } from '../../../infrastructure/logging.js';

const logger = getLogger();

/**
 * Document cache interface
 */
export interface IDocumentCache {
  /** Check if document is in cache */
  has(key: DocumentCacheKey): boolean;
  
  /** Get document from cache */
  get(key: DocumentCacheKey): DocumentCacheValue | undefined;
  
  /** Add document to cache */
  set(key: DocumentCacheKey, value: DocumentCacheValue): void;
  
  /** Remove document from cache */
  delete(key: DocumentCacheKey): boolean;
  
  /** Clear the cache */
  clear(): void;
}

/**
 * Simple cache entry with expiration
 */
interface CacheEntry<T> {
  value: T;
  expires: number;
}

/**
 * Document cache implementation using LRU cache
 */
export class DocumentCache implements IDocumentCache {
  private cache: Map<DocumentCacheKey, CacheEntry<DocumentCacheValue>>;
  private maxSize: number;
  private ttl: number;
  private keys: DocumentCacheKey[] = [];
  
  /**
   * Simple LRU cache implementation to avoid dependency issues
   * Create a new document cache
   * @param maxSize Maximum number of documents to keep in cache
   * @param ttl Time to live in milliseconds
   */
  constructor(maxSize: number = 100, ttl: number = 1000 * 60 * 30) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    
    
    logger.info(`Document cache initialized (maxSize=${maxSize}, ttl=${ttl}ms)`, 'DocumentCache');
  }
  
  /**
   * Check if document is in cache
   * @param key Document ID
   * @returns True if document is in cache
   */
  has(key: DocumentCacheKey): boolean {
    if (!this.cache.has(key)) {
      return false;
    }
    const entry = this.cache.get(key)!;
    const now = Date.now();
    const isExpired = entry.expires < now;
    return !isExpired;
  }
  
  /**
   * Get document from cache
   * @param key Document ID
   * @returns Document or undefined if not found
   */
  get(key: DocumentCacheKey): DocumentCacheValue | undefined {
    if (!this.has(key)) {
      return undefined;
    }
    
    // Move key to the end of the keys array (most recently used)
    this.keys = this.keys.filter(k => k !== key);
    this.keys.push(key);
    
    const entry = this.cache.get(key)!;
    
    return entry.value;
  }
  
  /**
   * Add document to cache
   * @param key Document ID
   * @param value Document
   */
  set(key: DocumentCacheKey, value: DocumentCacheValue): void {
    // Check if key already exists
    if (this.cache.has(key)) {
      this.keys = this.keys.filter(k => k !== key);
    }
    
    // Add to the end of the keys array (most recently used)
    this.keys.push(key);
    
    // Set the cache entry with expiration
    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttl
    });
    
    // Evict oldest entry if we're over capacity
    this.evictIfNeeded();
  }
  
  /**
   * Remove document from cache
   * @param key Document ID
   * @returns True if document was removed
   */
  delete(key: DocumentCacheKey): boolean {
    if (!this.cache.has(key)) {
      return false;
    }
    this.cache.delete(key);
    this.keys = this.keys.filter(k => k !== key);
    return true;
  }
  
  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.keys = [];
  }
  
  /**
   * Evict the least recently used entry if we're over capacity
   */
  private evictIfNeeded(): void {
    while (this.keys.length > this.maxSize) {
      const oldestKey = this.keys.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug(`Evicted document from cache: ${oldestKey}`, 'DocumentCache');
      } else {
        break;
      }
    }
  }
}