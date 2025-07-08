/**
 * StorageManager for managing document storage
 * 
 * This class handles document saving, updating, and retrieval,
 * providing a clean interface for other components to interact with document storage.
 */

import { getLogger } from '../../../shared/infrastructure/logging.js';
import { Document } from '../../../shared/domain/models/Document.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import EventEmitter from 'events';

const logger = getLogger();

/**
 * Document storage event payload
 */
export interface DocumentStorageEvent {
  /** Document ID */
  documentId: string;
  
  /** Document URL */
  url: string;
  
  /** Source ID */
  sourceId: string;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Event type */
  type: 'stored' | 'updated' | 'failed';
  
  /** Error message if storage failed */
  error?: string;
}

/**
 * Storage options
 */
export interface StorageOptions {
  /** Overwrite existing documents */
  overwrite?: boolean;
  
  /** Update only if document has changed */
  updateOnlyIfChanged?: boolean;
  
  /** Skip validation */
  skipValidation?: boolean;
}

/**
 * Manager for document storage
 */
export class StorageManager {
  /** Event emitter for storage events */
  private eventEmitter = new EventEmitter();
  
  /**
   * Create a new storage manager
   * @param documentRepository Repository for document storage
   */
  constructor(
    private readonly documentRepository: IDocumentRepository
,
    private readonly embeddingService: import('../../../shared/infrastructure/EmbeddingService.js').EmbeddingService,
    private readonly vectorRepository: import('../../../shared/domain/repositories/VectorRepository.js').VectorRepository
  ) {
    logger.debug('StorageManager initialized', 'StorageManager');
  }
  
  /**
   * Store a document
   * @param document Document to store
   * @param options Storage options
   * @returns Promise resolving to the stored document
   */
  async storeDocument(document: Document, options: StorageOptions = {}): Promise<Document> {
    try {
      logger.debug(`Storing document: ${document.url}`, 'StorageManager');
      
      // Validate document if not skipped
      if (!options.skipValidation) {
        this.validateDocument(document);
      }
      
      // Check if document already exists
      const existingDocument = await this.documentRepository.findByUrl(document.url);
      
      // Determine if we should update
      if (existingDocument) {
        if (!options.overwrite) {
          // Skip update if overwrite is false
          logger.debug(`Document already exists and overwrite=false: ${document.url}`, 'StorageManager');
          this.emitStorageEvent(existingDocument.id, document.url, document.sourceId, 'updated');
          return existingDocument;
        }
        
        if (options.updateOnlyIfChanged && this.documentsEqual(existingDocument, document)) {
          // Skip update if documents are equal and updateOnlyIfChanged=true
          logger.debug(`Document unchanged, skipping update: ${document.url}`, 'StorageManager');
          return existingDocument;
        }
        
        // Update existing document
        const updatedDocument = {
          ...document,
          id: existingDocument.id,
          indexedAt: existingDocument.indexedAt, // Preserve original indexedAt
          updatedAt: new Date() // Update updatedAt
        };
        
// Generate embedding and store vector
const embeddingUpdate = await this.embeddingService.generateEmbedding(updatedDocument.textContent);
await this.vectorRepository.upsertVector(updatedDocument.id, embeddingUpdate);
        // Save document
        await this.documentRepository.save(updatedDocument);
        logger.info(`Updated document: ${updatedDocument.title} (${updatedDocument.id})`, 'StorageManager');
        
        // Emit storage event
        this.emitStorageEvent(updatedDocument.id, updatedDocument.url, updatedDocument.sourceId, 'updated');
        
        return updatedDocument;
      } else {
        // Create new document with current date for indexedAt and updatedAt
        const newDocument = {
          ...document,
          indexedAt: new Date(),
          updatedAt: new Date()
        };
        
// Generate embedding and store vector
const embeddingNew = await this.embeddingService.generateEmbedding(newDocument.textContent);
await this.vectorRepository.upsertVector(newDocument.id, embeddingNew);
        // Save document
        await this.documentRepository.save(newDocument);
        logger.info(`Stored new document: ${newDocument.title} (${newDocument.id})`, 'StorageManager');
        
        // Emit storage event
        this.emitStorageEvent(newDocument.id, newDocument.url, newDocument.sourceId, 'stored');
        
        return newDocument;
      }
    } catch (error) {
      logger.error(`Error storing document: ${document.url}`, 'StorageManager', error);
      
      // Emit storage failed event
      this.emitStorageEvent(
        document.id, 
        document.url, 
        document.sourceId, 
        'failed', 
        error instanceof Error ? error.message : String(error)
      );
      
      throw error;
    }
  }
  
  /**
   * Get a document by URL
   * @param url Document URL
   * @returns Promise resolving to the document or null if not found
   */
  async getDocumentByUrl(url: string): Promise<Document | null> {
    return this.documentRepository.findByUrl(url);
  }
  
  /**
   * Get a document by ID
   * @param id Document ID
   * @returns Promise resolving to the document or null if not found
   */
  async getDocumentById(id: string): Promise<Document | null> {
    return this.documentRepository.findById(id);
  }
  
  /**
   * Get the event emitter for storage events
   * @returns Event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Compare two documents for equality
   * @param doc1 First document
   * @param doc2 Second document
   * @returns Whether the documents are equal
   */
  private documentsEqual(doc1: Document, doc2: Document): boolean {
    // Quick shallow comparison of essential content
    // In a real app, you might want a more sophisticated comparison
    return (
      doc1.title === doc2.title &&
      doc1.textContent === doc2.textContent &&
      // Compare HTML content length instead of full content to avoid memory issues with large documents
      doc1.content.length === doc2.content.length
    );
  }
  
  /**
   * Validate a document
   * @param document Document to validate
   * @throws Error if validation fails
   */
  private validateDocument(document: Document): void {
    // Check for required fields
    if (!document.id) throw new Error('Document ID is required');
    if (!document.url) throw new Error('Document URL is required');
    if (!document.sourceId) throw new Error('Document source ID is required');
    
    // Validate content - either HTML or text content should be present
    if (!document.content && !document.textContent) {
      throw new Error('Document must have either HTML content or text content');
    }
    
    // In a real app, you might want more sophisticated validation
  }
  
  /**
   * Emit a storage event
   * @param documentId Document ID
   * @param url Document URL
   * @param sourceId Source ID
   * @param type Event type
   * @param error Optional error message
   */
  private emitStorageEvent(
    documentId: string,
    url: string,
    sourceId: string,
    type: 'stored' | 'updated' | 'failed',
    error?: string
  ): void {
    const event: DocumentStorageEvent = {
      documentId,
      url,
      sourceId,
      timestamp: new Date(),
      type,
      error
    };
    
    this.eventEmitter.emit(`document-${type}`, event);
  }
}