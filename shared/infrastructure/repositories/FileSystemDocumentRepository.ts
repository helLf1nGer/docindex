/**
 * File system implementation of the DocumentRepository interface
 * Stores documents as JSON files in a directory structure
 */

import path from 'path';
import { createHash } from 'crypto';
import {
  FileSystemError,
  DocumentNotFoundError,
  ValidationError,
  SerializationError, // Added SerializationError
  isDocsiError
} from '../../../shared/domain/errors.js';
import {
  IDocumentRepository,
  DocumentSearchQuery
} from '../../../shared/domain/repositories/DocumentRepository.js';
import { Document } from '../../../shared/domain/models/Document.js';
import { config } from '../config.js';
import { extractUnifiedContent, UnifiedExtractionOptions } from '../UnifiedContentExtractor.js';
import { Logger, getLogger } from '../logging.js'; // Import Logger type
import { InMemoryDocumentIndex } from './document/DocumentIndex.js';
import { DocumentCache } from './document/DocumentCache.js';
import { DocumentFileStorage } from './document/DocumentFileStorage.js';
import { DocumentSearch } from './document/DocumentSearch.js';
import { DocumentValidator } from './document/DocumentValidator.js';

// Removed global logger instance

/**
 * File system-based document repository
 */
export class FileSystemDocumentRepository implements IDocumentRepository {
  private baseDir: string;
  private index: InMemoryDocumentIndex;
  private cache: DocumentCache;
  private storage: DocumentFileStorage;
  private searchService: DocumentSearch;
  private logger: Logger; // Added logger property
  
  /**
   * Create a new file system document repository
   * @param baseDir Base directory for storing documents
   */
  constructor(baseDir?: string, loggerInstance?: Logger) { // Added optional logger parameter
    this.baseDir = baseDir || path.join(config.dataDir, 'documents');
    
    // Initialize components
    this.index = new InMemoryDocumentIndex(this.baseDir); // Pass baseDir for index persistence
    this.cache = new DocumentCache(100, 1000 * 60 * 30); // 100 docs, 30 minute TTL
    this.storage = new DocumentFileStorage(this.baseDir);
    this.searchService = new DocumentSearch();
    
    this.logger = loggerInstance || getLogger(); // Use injected logger or fallback to global
    this.logger.info(`FileSystemDocumentRepository initialized with base directory: ${this.baseDir}`, 'FileSystemDocumentRepository');
    this.logger.info(`[DEBUG] FileSystemDocumentRepository constructed with baseDir: ${this.baseDir}`, 'FileSystemDocumentRepository.constructor');
  }
  
  /**
   * Initialize the repository (create directories and build indices)
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing document repository...', 'FileSystemDocumentRepository');
      
      // Initialize storage (already logs internally)
      await this.storage.initialize();

      // Initialize the index (load from file) BEFORE building indices
      this.logger.info('Initializing document index...', 'FileSystemDocumentRepository.initialize');
      await this.index.initialize(); // Await index loading
      this.logger.info('Document index initialized.', 'FileSystemDocumentRepository.initialize');
      
      // Build indices (now safe to use the index)
      await this.buildIndices();
      
      this.logger.info(`Document repository initialized. Indexed ${await this.index.size()} documents.`, 'FileSystemDocumentRepository');
    } catch (error: unknown) {
      const message = `Failed to initialize document repository: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'FileSystemDocumentRepository.initialize', error);
      throw new FileSystemError(message, this.baseDir, error instanceof Error ? error : undefined);
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
    this.logger.info('Building document indices...', 'FileSystemDocumentRepository.buildIndices');
    
    // Clear existing indices
    await this.index.clear();
    
    // Count of indexed documents
    let count = 0;
    
    // Process each file in the document store
    await this.storage.walkDirectory(this.storage.getBaseDir(), async (filePath: string) => { // Added baseDir and type annotation
      try {
        // Read document metadata
        const document = await this.storage.readDocument(filePath);
        
        // Add to indices
        await this.index.setPathForId(document.id, filePath);
        await this.index.setPathForUrl(document.url, filePath);
        
        count++;
      } catch (error: unknown) {
        this.logger.warn(`Error indexing document file ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.buildIndices');
        this.logger.error(`[DEBUG] Error indexing file at path: ${filePath}`, 'FileSystemDocumentRepository.buildIndices', error);
      }
    });
    
    this.logger.info(`Indexed ${count} documents.`, 'FileSystemDocumentRepository.buildIndices');
  }
  
  /**
   * Find a document by its ID
   * @param id Document ID
   * @returns Promise resolving to the document or null if not found
   */
  async findById(id: string): Promise<Document | null> {
    this.logger.debug(`[FileSystemDocumentRepository] findById called with id: ${id}`, 'findById');
    this.logger.debug(`[FileSystemDocumentRepository] Entering findById for ID: ${id}`, 'findById');
    let filePath: string | undefined; // Declare filePath outside the try block
    try {
      // Check if the document is in the cache
      if (this.cache.has(id)) {
        const cachedDoc = this.cache.get(id);
        if (cachedDoc) {
          this.logger.debug(`Cache hit for document ${id}`, 'FileSystemDocumentRepository.findById');
          return cachedDoc;
        }
      }
      
      // Get file path from index or calculate it
      filePath = await this.index.getPathById(id); // Assign to the outer scope variable
        this.logger.debug(`[FileSystemDocumentRepository] ID ${id} not found in index.`, 'findById');
      if (!filePath) {
        // Not in index, calculate path
        filePath = this.storage.getFilePath(id);
        
        // Check if the file exists before proceeding
        this.logger.debug(`[DEBUG] findById(${id}): Checking existence of calculated path: ${filePath}`, 'FileSystemDocumentRepository.findById');
        if (!await this.storage.fileExists(filePath)) {
          return null;
          this.logger.warn(`[FileSystemDocumentRepository] Calculated path ${filePath} for ID ${id} does not exist. Returning null.`, 'findById');
        }
      }
      
      // Double-check file exists (in case index is stale)
      this.logger.debug(`[DEBUG] findById(${id}): Checking existence of indexed path: ${filePath}`, 'FileSystemDocumentRepository.findById');
      if (!await this.storage.fileExists(filePath)) {
        // File doesn't exist, remove from index
        await this.index.removeId(id);
        return null;
        this.logger.warn(`[FileSystemDocumentRepository] Indexed path ${filePath} for ID ${id} does not exist. Removing from index and returning null.`, 'findById');
      }
      
      this.logger.debug(`Loading document ${id} from disk: ${filePath}`, 'FileSystemDocumentRepository.findById');
      
      // Read document
      this.logger.debug(`[FileSystemDocumentRepository] Attempting to read document from filePath: ${filePath}`, 'findById');
      const document = await this.storage.readDocument(filePath);
      this.logger.debug(`[FileSystemDocumentRepository] Reading document from path: ${filePath}`, 'findById');
      
      // Ensure the document has text content
      if (!document.textContent && document.content) {
        await this.processDocumentContent(document);
      }
      
      // Add to cache
      this.cache.set(id, document);
      
      this.logger.debug(`[FileSystemDocumentRepository] Successfully read document ${id} from ${filePath}. Adding to cache.`, 'findById');
      return document;
    } catch (error: unknown) {
      // Log error and return null (don't expose specific file system errors to clients via return)
      this.logger.error(`Error finding document by ID ${id}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.findById', error);
      return null;
      this.logger.error(`[FileSystemDocumentRepository] Error in findById for ID ${id}. Path: ${filePath ?? 'N/A'}`, 'findById', error); // Use nullish coalescing
    }
  }
  
  /**
   * Find multiple documents by their IDs
   * @param ids Array of Document IDs
   * @returns Promise resolving to an array of found documents
   */
  async findByIds(ids: string[]): Promise<Document[]> {
    this.logger.debug(`[FileSystemDocumentRepository] Entering findByIds for ${ids.length} IDs`, 'findByIds');
    
    // Use Promise.all to fetch documents concurrently
    const loadPromises = ids.map(id =>
      this.findById(id).catch(error => {
        // Log individual errors but don't let one failure stop others
        this.logger.error(`Error fetching document ${id} within findByIds: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.findByIds', error);
        return null; // Return null for failed fetches
      })
    );
    
    const results = await Promise.all(loadPromises);
    
    // Filter out null results (documents not found or failed to load)
    const foundDocuments = results.filter((doc): doc is Document => doc !== null);
    
    this.logger.debug(`[FileSystemDocumentRepository] findByIds completed. Found ${foundDocuments.length} out of ${ids.length} requested documents.`, 'findByIds');
    return foundDocuments;
  }

  /**
   * Process document content to extract text
   * @param document Document to process
   */
  private async processDocumentContent(document: Document): Promise<void> {
    this.logger.info(`Processing content for document ${document.id}`, 'FileSystemDocumentRepository.processDocumentContent');
    
    try {
      // Extract text content from HTML content
      const extractionOptions: UnifiedExtractionOptions = {
        comprehensive: true,
        debug: true
      };
      
      const extractedContent = extractUnifiedContent(document.content, document.url, extractionOptions);
      
      if (extractedContent.textContent) {
        document.textContent = extractedContent.textContent;
        this.logger.info(`Extracted ${document.textContent.length} chars of text content for ${document.id}`, 'FileSystemDocumentRepository.processDocumentContent');
        
        // Update document metadata
        document.metadata = document.metadata || {};
        Object.assign(document.metadata, extractedContent.metadata);
        
        // The initial save() call will handle writing the updated document.
        // No need to call save() recursively here.
      }
    } catch (error) {
      this.logger.warn(`Failed to extract text content for ${document.id}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.processDocumentContent', error);
    }
  }
  
  /**
   * Find a document by its URL
   * @param url Document URL
   * @returns Promise resolving to the document or null if not found
   */
  async findByUrl(url: string): Promise<Document | null> {
    this.logger.debug(`[FileSystemDocumentRepository] findByUrl called with url: ${url}`, 'findByUrl');
    this.logger.debug(`[FileSystemDocumentRepository] Entering findByUrl for URL: ${url}`, 'findByUrl');
    try {
      // Check if URL is in the index
      const filePath = await this.index.getPathByUrl(url);
      this.logger.debug(`[FileSystemDocumentRepository] findByUrl: Index lookup for URL '${url}' returned path: ${filePath}`, 'findByUrl'); // Log index lookup result
      if (filePath) {
      this.logger.debug(`[FileSystemDocumentRepository] Found path in URL index for ${url}: ${filePath}`, 'findByUrl');
        if (await this.storage.fileExists(filePath)) {
          // Read file to get document ID
          const document = await this.storage.readDocument(filePath);
          return this.findById(document.id);
          this.logger.debug(`[FileSystemDocumentRepository] Reading document from indexed path ${filePath} to get ID.`, 'findByUrl');
          this.logger.debug(`[FileSystemDocumentRepository] Found path in URL index: ${filePath}`, 'findByUrl');
          this.logger.debug(`[FileSystemDocumentRepository] Found document ID ${document.id} from indexed path. Calling findById(${document.id}).`, 'findByUrl');
        } else {
          // File doesn't exist, remove from index
          await this.index.removeUrl(url);
        }
          this.logger.warn(`[FileSystemDocumentRepository] Indexed path ${filePath} for URL ${url} does not exist. Removing from index.`, 'findByUrl');
      }
      
      // Fall back to ID-based lookup
      const id = this.urlToId(url);
      this.logger.debug(`[FileSystemDocumentRepository] URL not in index or file missing. Falling back to ID lookup with calculated ID: ${id}`, 'findByUrl');
      this.logger.debug(`[FileSystemDocumentRepository] Calling findById with fallback ID: ${id}`, 'findByUrl'); // Log the ID used in fallback
      return this.findById(id);
    } catch (error) {
      this.logger.error(`Error finding document by URL ${url}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.findByUrl', error);
      return null;
      this.logger.error(`[FileSystemDocumentRepository] Error in findByUrl for URL ${url}.`, 'findByUrl', error);
    }
  }
  
  /**
   * Save a document (create or update)
   * @param document Document to save
   * @returns Promise that resolves when the operation is complete
   */
  async save(document: Document): Promise<void> {
    const correctId = this.urlToId(document.url);
    this.logger.debug(`[FileSystemDocumentRepository] Entering save() for URL: ${document.url}. Calculated ID: ${correctId}. Received ID: ${document?.id || 'MISSING_ID'}`, 'save');
    if (document.id && document.id !== correctId) {
      this.logger.warn(`[FileSystemDocumentRepository] Document received with ID ${document.id} but calculated ID based on URL ${document.url} is ${correctId}. Using calculated ID.`, 'save');
    }
    // Ensure the document object uses the correct ID going forward
    document.id = correctId;

    this.logger.debug(`save() called for document ID: ${document.id}`, 'FileSystemDocumentRepository.save');
    // Ensure the document object itself uses the correct ID going forward
    document.id = correctId; // This line was already present, reinforcing its importance
 
    // DEBUG LOG: Log entire document object received by save() (now with enforced correct ID)
    this.logger.debug(`[FileSystemDocumentRepository] Document object for save (ID enforced):`, 'FileSystemDocumentRepository.save', { document: JSON.stringify(document) }); // Stringify for logging
    try {
      // Validate document before saving (using the document object with the correct ID)
      const validationResult = DocumentValidator.validateForStorage(document);
      // DEBUG LOG: Log validation result (using correctId for clarity)
      this.logger.debug(`[FileSystemDocumentRepository] Validation result for ${correctId}: ${JSON.stringify(validationResult)}`, 'FileSystemDocumentRepository.save');
      if (!validationResult.isValid) {
        const messages = validationResult.messages.join('; ');
        this.logger.error(`Document ${correctId} failed validation before save: ${messages}`, 'FileSystemDocumentRepository.save');
        // Throw a ValidationError to prevent saving invalid data
        throw new ValidationError(`Document validation failed: ${messages}`, validationResult.messages);
      }
      
      // Ensure document has proper content
      if (!document.textContent && document.content) {
        await this.processDocumentContent(document);
      }
      
      this.logger.info(`Saving document: ${document.title} (${correctId})`, 'FileSystemDocumentRepository.save');
  
      // Get file path using the correct ID
      const filePath = this.storage.getFilePath(correctId);
  
      this.logger.debug(`[FileSystemDocumentRepository] Calculated file path for ID ${correctId}: ${filePath}`, 'save');
      // Update indices using the correct ID
      await this.index.setPathForId(correctId, filePath);
      await this.index.setPathForUrl(document.url, filePath);
      // Log index update using correctId
      this.logger.debug(`[InMemoryDocumentIndex] setPathForId called via save: ID '${correctId}' to path '${filePath}'`, 'FileSystemDocumentRepository.save');
      this.logger.debug(`[InMemoryDocumentIndex] setPathForUrl called via save: URL '${document.url}' to path '${filePath}'`, 'FileSystemDocumentRepository.save');
      this.logger.debug(`Index paths set for ID ${correctId} and URL ${document.url} to ${filePath}`, 'FileSystemDocumentRepository.save');
      
      // --- BEGIN ADDED PRE-STORAGE VALIDATION ---
      // Explicitly check for non-empty textContent before attempting storage
      if (!document || !document.textContent || typeof document.textContent !== 'string' || document.textContent.trim().length === 0) {
        const errorMsg = `Cannot save document ${correctId} with invalid or missing textContent.`;
        this.logger.error(errorMsg, 'FileSystemDocumentRepository.save');
        throw new ValidationError(errorMsg);
      }
      this.logger.debug(`Pre-storage validation passed for document ${correctId}. textContent length: ${document.textContent.length}`, 'FileSystemDocumentRepository.save');
      // --- END ADDED PRE-STORAGE VALIDATION ---

      // Log structure before passing to storage (using correctId and the document with the correct ID)
      this.logger.debug(`[FileSystemDocumentRepository] Passing document to storage.writeDocument:`, 'FileSystemDocumentRepository.save', { id: correctId, url: document.url, title: document.title, sourceId: document.sourceId, textContentLength: document.textContent?.length });
  
      // Write document to file (storage layer handles logging, ensure passing the document object with the correct ID)
      await this.storage.writeDocument(filePath, document); // document.id is already correctId here
      this.logger.debug(`[FileSystemDocumentRepository] Calling storage.writeDocument for path: ${filePath} with document ID: ${document.id}`, 'save');

      this.logger.debug(`Returned from writeDocument for doc ID: ${correctId}`, 'FileSystemDocumentRepository.save');
      // Update cache using the correct ID and the document object with the correct ID
      this.cache.set(correctId, document);
      this.logger.debug(`[FileSystemDocumentRepository] Document ${correctId} added to cache after save.`, 'save');

      this.logger.info(`Document saved successfully: ${document.title} (${correctId})`, 'FileSystemDocumentRepository.save');
    } catch (error: unknown) {
      this.logger.error(`SAVE FAILED for document ID ${correctId}:`, 'FileSystemDocumentRepository.save', error);
      // Remove from indices on error using the correct ID
      if (correctId) { // Check if correctId was successfully calculated
        await this.index.removeId(correctId);
      }
      // Re-throw specific errors, wrap others
      if (isDocsiError(error)) {
        throw error; // Propagate known Docsi errors (like ValidationError, FileSystemError from storage)
      }
      // Removed filePath as it's not in scope here
      throw new FileSystemError(`Failed to save document: ${error instanceof Error ? error.message : String(error)}`, undefined, error instanceof Error ? error : undefined);
    }
  }
  
  /**
   * Validate document content and add placeholder if needed
   * @param document Document to validate
   */
  private validateDocumentContent(document: Document): void {
    // Use the new DocumentValidator for comprehensive validation
    const validationResult = DocumentValidator.validateForStorage(document);
    
    // Log validation messages
    if (validationResult.messages.length > 0) {
      validationResult.messages.forEach(message => {
        this.logger.warn(`Document ${document.id} validation: ${message}`, 'FileSystemDocumentRepository.validateDocumentContent');
      });
    }
    
    // Handle missing text content case
    if (!document.textContent || document.textContent.trim().length === 0) {
      this.logger.warn(`Document ${document.id} has no text content!`, 'FileSystemDocumentRepository.validateDocumentContent');
      
      // If we can't extract text content but have html content, use a placeholder
      if (document.content && document.content.length > 0) {
        this.logger.info(`Using placeholder text content for ${document.id}`, 'FileSystemDocumentRepository.validateDocumentContent');
        document.textContent = `[Content available but not extracted: ${document.title}]`;
      } else {
        // No content at all
        this.logger.warn(`Document ${document.id} has no HTML content either!`, 'FileSystemDocumentRepository.validateDocumentContent');
        document.textContent = `[No content available: ${document.title}]`;
      }
    }
    
    // If validation failed completely, log detailed error
    if (!validationResult.isValid && validationResult.error) {
      this.logger.error(
        `Document ${document.id} failed validation: ${validationResult.error.message}`,
        'FileSystemDocumentRepository.validateDocumentContent'
      );
      // We still continue with best-effort approach to save what we can
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
      const filePath = await this.index.getPathById(id) || this.storage.getFilePath(id);
      
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
        this.logger.warn(`Error reading document ${id} before deletion: ${error}`, 'FileSystemDocumentRepository.delete', error);
      }
      
      // Delete the file
      const result = await this.storage.deleteDocument(filePath);
      
      // Remove from indices
      await this.index.removeId(id);
      if (documentUrl) {
        await this.index.removeUrl(documentUrl);
      }
      
      // Remove from cache
      this.cache.delete(id);
      
      return result;
    } catch (error: unknown) {
      this.logger.error(`Error deleting document ${id}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.delete', error);
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
      this.logger.info(`Search query received: ${JSON.stringify(query)}`, 'FileSystemDocumentRepository.search');
      
      // Load all documents
      const documents = await this.loadAllDocuments();
      
      // Perform search
      this.logger.debug(`[DEBUG] Passing ${documents.length} documents to searchService.executeSearch.`, 'FileSystemDocumentRepository.search');

      return this.searchService.executeSearch(documents, query);
    } catch (error: unknown) {
      this.logger.error(`Error searching documents: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentRepository.search', error);
      return [];
    }
  }
  
  /**
   * Load all documents from the file system
   * @returns Promise resolving to array of all documents
   */
  private async loadAllDocuments(): Promise<Document[]> {
    this.logger.info(`Loading all documents from ${this.baseDir}`, 'FileSystemDocumentRepository.loadAllDocuments');
    
    const documents: Document[] = [];
    const allIds = await this.index.getAllIds();
    
    // Load all documents using their IDs
    const loadPromises = allIds.map(id => 
      this.findById(id).catch(() => null)
    );
    
    const loadedDocs = await Promise.all(loadPromises);
    this.logger.debug(`[DEBUG] loadAllDocuments loaded ${loadedDocs.length} documents from index.`, 'FileSystemDocumentRepository.loadAllDocuments');

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
      return await this.index.size();
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