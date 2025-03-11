/**
 * File system implementation of the DocumentRepository interface
 * Stores documents as JSON files in a directory structure
 */

import path from 'path';
import { createHash } from 'crypto';
import {
  IDocumentRepository,
  DocumentSearchQuery
} from '../../../shared/domain/repositories/DocumentRepository.js';
import { Document } from '../../../shared/domain/models/Document.js';
import { config } from '../config.js';
import { extractUnifiedContent, UnifiedExtractionOptions } from '../UnifiedContentExtractor.js';
import { getLogger } from '../logging.js';
import { InMemoryDocumentIndex } from './document/DocumentIndex.js';
import { DocumentCache } from './document/DocumentCache.js';
import { DocumentFileStorage } from './document/DocumentFileStorage.js';
import { DocumentSearch } from './document/DocumentSearch.js';

const logger = getLogger();

/**
 * File system-based document repository
 */
export class FileSystemDocumentRepository implements IDocumentRepository {
  private baseDir: string;
  private index: InMemoryDocumentIndex;
  private cache: DocumentCache;
  private storage: DocumentFileStorage;
  private searchService: DocumentSearch;
  
  /**
   * Create a new file system document repository
   * @param baseDir Base directory for storing documents
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(config.dataDir, 'documents');
    
    // Initialize components
    this.index = new InMemoryDocumentIndex();
    this.cache = new DocumentCache(100, 1000 * 60 * 30); // 100 docs, 30 minute TTL
    this.storage = new DocumentFileStorage(this.baseDir);
    this.searchService = new DocumentSearch();
    
    logger.info(`FileSystemDocumentRepository initialized with base directory: ${this.baseDir}`, 'FileSystemDocumentRepository');
  }
  
  /**
   * Initialize the repository (create directories and build indices)
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing document repository...', 'FileSystemDocumentRepository');
      
      // Initialize storage
      await this.storage.initialize();
      
      // Build indices
      await this.buildIndices();
      
      logger.info(`Document repository initialized. Indexed ${this.index.size} documents.`, 'FileSystemDocumentRepository');
    } catch (error: unknown) {
      throw new Error(`Failed to initialize document repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Convert a URL to a document ID
   * @param url Document URL
   * @returns Document ID
   */
  private urlToId(url: string): string {
    // Create a stable, URL-safe ID from the URL
    return createHash('sha256').update(url).digest('hex');
  }

  /**
   * Build indices for existing documents
   * This creates in-memory maps from URL to file path and ID to file path
   */
  private async buildIndices(): Promise<void> {
    logger.info('Building document indices...', 'FileSystemDocumentRepository');
    
    // Clear existing indices
    this.index.clear();
    
    // Count of indexed documents
    let count = 0;
    
    // Process each file in the document store
    await this.storage.walkDirectory(async (filePath) => {
      try {
        // Read document metadata
        const document = await this.storage.readDocument(filePath);
        
        // Add to indices
        this.index.setPathForId(document.id, filePath);
        this.index.setPathForUrl(document.url, filePath);
        
        count++;
      } catch (error: unknown) {
        logger.warn(`Error indexing document file ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
      }
    });
    
    logger.info(`Indexed ${count} documents.`, 'FileSystemDocumentRepository');
  }
  
  /**
   * Find a document by its ID
   * @param id Document ID
   * @returns Promise resolving to the document or null if not found
   */
  async findById(id: string): Promise<Document | null> {
    try {
      // Check if the document is in the cache
      if (this.cache.has(id)) {
        const cachedDoc = this.cache.get(id);
        if (cachedDoc) {
          logger.debug(`Cache hit for document ${id}`, 'FileSystemDocumentRepository');
          return cachedDoc;
        }
      }
      
      // Get file path from index or calculate it
      let filePath = this.index.getPathById(id);
      if (!filePath) {
        // Not in index, calculate path
        filePath = this.storage.getFilePath(id);
        
        // Check if the file exists before proceeding
        if (!await this.storage.fileExists(filePath)) {
          return null;
        }
      }
      
      // Double-check file exists (in case index is stale)
      if (!await this.storage.fileExists(filePath)) {
        // File doesn't exist, remove from index
        this.index.removeId(id);
        return null;
      }
      
      logger.debug(`Loading document ${id} from disk: ${filePath}`, 'FileSystemDocumentRepository');
      
      // Read document
      const document = await this.storage.readDocument(filePath);
      
      // Ensure the document has text content
      if (!document.textContent && document.content) {
        await this.processDocumentContent(document);
      }
      
      // Add to cache
      this.cache.set(id, document);
      
      return document;
    } catch (error: unknown) {
      // Log error and return null (don't expose file system errors to clients)
      logger.error(`Error finding document by ID: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
      return null;
    }
  }
  
  /**
   * Process document content to extract text
   * @param document Document to process
   */
  private async processDocumentContent(document: Document): Promise<void> {
    logger.info(`Processing content for document ${document.id}`, 'FileSystemDocumentRepository');
    
    try {
      // Extract text content from HTML content
      const extractionOptions: UnifiedExtractionOptions = {
        comprehensive: true,
        debug: true
      };
      
      const extractedContent = extractUnifiedContent(document.content, document.url, extractionOptions);
      
      if (extractedContent.textContent) {
        document.textContent = extractedContent.textContent;
        logger.info(`Extracted ${document.textContent.length} chars of text content for ${document.id}`, 'FileSystemDocumentRepository');
        
        // Update document metadata
        document.metadata = document.metadata || {};
        Object.assign(document.metadata, extractedContent.metadata);
        
        // Save the updated document
        await this.save(document);
      }
    } catch (error) {
      logger.warn(`Failed to extract text content for ${document.id}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
    }
  }
  
  /**
   * Find a document by its URL
   * @param url Document URL
   * @returns Promise resolving to the document or null if not found
   */
  async findByUrl(url: string): Promise<Document | null> {
    try {
      // Check if URL is in the index
      const filePath = this.index.getPathByUrl(url);
      if (filePath) {
        if (await this.storage.fileExists(filePath)) {
          // Read file to get document ID
          const document = await this.storage.readDocument(filePath);
          return this.findById(document.id);
        } else {
          // File doesn't exist, remove from index
          this.index.removeUrl(url);
        }
      }
      
      // Fall back to ID-based lookup
      const id = this.urlToId(url);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error finding document by URL: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
      return null;
    }
  }
  
  /**
   * Save a document (create or update)
   * @param document Document to save
   * @returns Promise that resolves when the operation is complete
   */
  async save(document: Document): Promise<void> {
    try {
      // Ensure document has proper content
      if (!document.textContent && document.content) {
        await this.processDocumentContent(document);
      }
      
      logger.info(`Saving document: ${document.title} (${document.id})`, 'FileSystemDocumentRepository');
      
      // Get file path
      const filePath = this.storage.getFilePath(document.id);
      
      // Update indices
      this.index.setPathForId(document.id, filePath);
      this.index.setPathForUrl(document.url, filePath);
      
      // Ensure document has text content
      this.validateDocumentContent(document);
      
      // Write document to file
      await this.storage.writeDocument(filePath, document);
      
      // Update cache
      this.cache.set(document.id, document);
      
      logger.info(`Document saved successfully: ${document.title} (${document.id})`, 'FileSystemDocumentRepository');
    } catch (error: unknown) {
      // Remove from indices on error to force reload
      if (document && document.id) {
        this.index.removeId(document.id);
      }
      logger.error(`Failed to save document: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
      throw new Error(`Failed to save document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate document content and add placeholder if needed
   * @param document Document to validate
   */
  private validateDocumentContent(document: Document): void {
    if (!document.textContent || document.textContent.trim().length === 0) {
      logger.warn(`Document ${document.id} has no text content!`, 'FileSystemDocumentRepository');
      
      // If we can't extract text content but have html content, use a placeholder
      if (document.content && document.content.length > 0) {
        logger.info(`Using placeholder text content for ${document.id}`, 'FileSystemDocumentRepository');
        document.textContent = `[Content available but not extracted: ${document.title}]`;
      } else {
        // No content at all
        logger.warn(`Document ${document.id} has no HTML content either!`, 'FileSystemDocumentRepository');
        document.textContent = `[No content available: ${document.title}]`;
      }
    }
  }
  
  /**
   * Delete a document by its ID
   * @param id Document ID
   * @returns Promise that resolves to true if the document was deleted
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Get file path from index or calculate it
      const filePath = this.index.getPathById(id) || this.storage.getFilePath(id);
      
      // Check if the file exists
      if (!await this.storage.fileExists(filePath)) {
        return false;
      }
      
      // Get document to find URL (for index cleanup)
      let documentUrl = '';
      try {
        const document = await this.storage.readDocument(filePath);
        documentUrl = document.url;
      } catch (error) {
        logger.warn(`Error reading document before deletion: ${error}`, 'FileSystemDocumentRepository');
      }
      
      // Delete the file
      const result = await this.storage.deleteDocument(filePath);
      
      // Remove from indices
      this.index.removeId(id);
      if (documentUrl) {
        this.index.removeUrl(documentUrl);
      }
      
      // Remove from cache
      this.cache.delete(id);
      
      return result;
    } catch (error: unknown) {
      logger.error(`Error deleting document: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
      return false;
    }
  }
  
  /**
   * Find documents that match the given query
   * @param query Search query parameters
   * @returns Promise resolving to array of matching documents
   */
  async search(query: DocumentSearchQuery): Promise<Document[]> {
    try {
      logger.info(`Search query received: ${JSON.stringify(query, null, 2)}`, 'FileSystemDocumentRepository');
      
      // Load all documents
      const documents = await this.loadAllDocuments();
      
      // Perform search
      return this.searchService.executeSearch(documents, query);
    } catch (error: unknown) {
      logger.error(`Error searching documents: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository');
      return [];
    }
  }
  
  /**
   * Load all documents from the file system
   * @returns Promise resolving to array of all documents
   */
  private async loadAllDocuments(): Promise<Document[]> {
    logger.info(`Loading all documents from ${this.baseDir}`, 'FileSystemDocumentRepository');
    
    const documents: Document[] = [];
    const allIds = this.index.getAllIds();
    
    // Load all documents using their IDs
    const loadPromises = allIds.map(id => 
      this.findById(id).catch(() => null)
    );
    
    const loadedDocs = await Promise.all(loadPromises);
    return loadedDocs.filter(Boolean) as Document[];
  }
  
  /**
   * Find documents by source ID
   * @param sourceId Source ID
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching documents
   */
  async findBySourceId(sourceId: string, limit?: number, offset?: number): Promise<Document[]> {
    return this.search({
      sourceIds: [sourceId],
      limit,
      offset
    });
  }
  
  /**
   * Find documents by tag
   * @param tag Tag to search for
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching documents
   */
  async findByTag(tag: string, limit?: number, offset?: number): Promise<Document[]> {
    return this.search({
      tags: [tag],
      limit,
      offset
    });
  }
  
  /**
   * Count documents matching a query
   * @param query Search query parameters
   * @returns Promise resolving to the count
   */
  async count(query?: DocumentSearchQuery): Promise<number> {
    if (!query) {
      return this.index.size;
    }
    
    const documents = await this.search({
      ...query,
      limit: undefined,
      offset: undefined
    });
    
    return documents.length;
  }
  
  /**
   * Get a document with content snippet by ID
   * @param id Document ID
   * @returns Promise resolving to document with content snippet or null
   */
  async getDocumentWithSnippet(id: string): Promise<Document | null> {
    const document = await this.findById(id);
    if (!document) return null;
    
    // Create a version with just the essential fields and a snippet
    return {
      ...document,
      // Truncate full content to save bandwidth
      content: '', 
      // Keep a snippet of text content
      textContent: document.textContent?.substring(0, 500) + '...'
    };
  }
}