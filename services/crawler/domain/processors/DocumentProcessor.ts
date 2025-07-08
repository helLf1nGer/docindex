/**
 * Document processor interface for specialized document processors
 * 
 * This interface defines the contract for specialized document processors
 * that can handle different documentation platforms with custom extraction
 * and processing logic.
 */

import { ProcessedContent } from '../ContentProcessor.js';
import { Document } from '../../../../shared/domain/models/Document.js';

/**
 * Options for document processing
 */
export interface DocumentProcessorOptions {
  /** Enable debug mode for verbose logging */
  debug?: boolean;
  
  /** Source-specific configuration */
  sourceConfig?: Record<string, any>;
  
  /** Custom processing options */
  processing?: {
    /** Convert HTML to Markdown */
    convertToMarkdown?: boolean;
    
    /** Apply deduplication */
    deduplicate?: boolean;
    
    /** Apply chunking */
    chunk?: boolean;
    
    /** Maximum chunk size (in tokens) */
    maxChunkSize?: number;
  };
}

/**
 * Document processor interface
 */
export interface IDocumentProcessor {
  /**
   * Get the processor name
   */
  getName(): string;
  
  /**
   * Check if the processor can handle a specific source
   * @param url The source URL to check
   * @param html HTML content of the page (optional)
   * @returns True if the processor can handle the source
   */
  canHandle(url: string, html?: string): boolean;
  
  /**
   * Process the document content
   * @param html HTML content of the page
   * @param url The source URL
   * @param options Processing options
   * @returns Processed content
   */
  process(html: string, url: string, options?: DocumentProcessorOptions): ProcessedContent;
  
  /**
   * Create a document from processed content
   * @param content Processed content
   * @param url Document URL
   * @param sourceId Source ID
   * @param id Optional document ID
   * @returns Document
   */
  createDocument(content: ProcessedContent, url: string, sourceId: string, id?: string): Document;
}

/**
 * Base document processor that provides common functionality
 */
export abstract class BaseDocumentProcessor implements IDocumentProcessor {
  /**
   * Constructor
   * @param name The processor name
   */
  constructor(private readonly name: string) {}
  
  /**
   * Get the processor name
   * @returns The processor name
   */
  getName(): string {
    return this.name;
  }
  
  /**
   * Abstract method to check if the processor can handle a specific source
   * @param url The source URL to check
   * @param html HTML content of the page (optional)
   * @returns True if the processor can handle the source
   */
  abstract canHandle(url: string, html?: string): boolean;
  
  /**
   * Abstract method to process the document content
   * @param html HTML content of the page
   * @param url The source URL
   * @param options Processing options
   * @returns Processed content
   */
  abstract process(html: string, url: string, options?: DocumentProcessorOptions): ProcessedContent;
  
  /**
   * Create a document from processed content - implementation from ContentProcessor
   * @param content Processed content
   * @param url Document URL
   * @param sourceId Source ID
   * @param id Optional document ID
   * @returns Document
   */
  createDocument(content: ProcessedContent, url: string, sourceId: string, id?: string): Document {
    const now = new Date();
    
    return {
      id: id || this.generateDocumentId(url),
      url,
      title: content.title,
      content: content.htmlContent,
      textContent: content.textContent,
      indexedAt: now,
      updatedAt: now,
      sourceId,
      tags: content.metadata.keywords || [],
      metadata: {
        headings: content.headings,
        codeBlocks: content.codeBlocks,
        description: content.metadata.description,
        author: content.metadata.author,
        publishedDate: content.metadata.publishedDate,
        modifiedDate: content.metadata.modifiedDate
      }
    };
  }
  
  /**
   * Generate a document ID from a URL
   * @param url URL
   * @returns Document ID
   */
  protected generateDocumentId(url: string): string {
    // Create a SHA-256 hash of the URL for a stable ID
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(url).digest('hex');
  }
  
  /**
   * Convert HTML content to Markdown
   * @param html HTML content
   * @returns Markdown content
   */
  protected convertToMarkdown(html: string): string {
    // This implementation would use a library like turndown
    // For now, we'll use a placeholder
    return html; // Replace with actual implementation
  }
  
  /**
   * Apply deduplication to content
   * @param content Text content
   * @returns Deduplicated content
   */
  protected deduplicateContent(content: string): string {
    // This implementation would use n-gram based deduplication
    // For now, we'll use a placeholder
    return content; // Replace with actual implementation
  }
  
  /**
   * Split content into chunks
   * @param content Text content
   * @param maxChunkSize Maximum chunk size in tokens
   * @returns Array of content chunks
   */
  protected chunkContent(content: string, maxChunkSize: number = 500): string[] {
    // This implementation would split the content into chunks of approximately maxChunkSize tokens
    // For now, we'll use a placeholder
    return [content]; // Replace with actual implementation
  }
}