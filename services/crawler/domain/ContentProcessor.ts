/**
 * ContentProcessor for processing crawled content
 * 
 * This class handles the extraction, validation, and processing of crawled content,
 * ensuring that meaningful text is properly extracted and prepared for storage.
 */

import { getLogger } from '../../../shared/infrastructure/logging.js';
import { extractUnifiedContent, UnifiedExtractionOptions } from '../../../shared/infrastructure/UnifiedContentExtractor.js';
import { Document } from '../../../shared/domain/models/Document.js';

const logger = getLogger();

/**
 * Result of content processing
 */
export interface ProcessedContent {
  /** Document title */
  title: string;
  
  /** Original HTML content */
  htmlContent: string;
  
  /** Extracted text content */
  textContent: string;
  
  /** Document headings */
  headings?: { text: string, level: number, id?: string }[];
  
  /** Extracted code blocks */
  codeBlocks?: { code: string, language?: string }[];
  
  /** Document links */
  links: string[];
  
  /** Document metadata */
  metadata: {
    description?: string;
    keywords?: string[];
    author?: string;
    publishedDate?: Date;
    modifiedDate?: Date;
  };
}

/**
 * Processor for crawled content
 */
export class ContentProcessor {
  /**
   * Create a new content processor
   */
  constructor() {
    logger.debug('ContentProcessor initialized', 'ContentProcessor');
  }

  /**
   * Process HTML content
   * @param html HTML content
   * @param url URL of the document
   * @param options Extraction options
   * @returns Processed content
   */
  processContent(html: string, url: string, options?: UnifiedExtractionOptions): ProcessedContent {
    logger.debug(`Processing content for URL: ${url}`, 'ContentProcessor');
    
    try {
      // Configure extraction options for comprehensive extraction
      const extractionOptions: UnifiedExtractionOptions = {
        comprehensive: true, // Use comprehensive extraction for better results
        debug: true,        // Enable detailed logging
        ...options
     
     // Include any user-provided options
      };
      
      // Extract content using UnifiedContentExtractor for better results
      const extracted = extractUnifiedContent(html, url, extractionOptions);
      
      
      // Create processed content
      const processed: ProcessedContent = {
        title: extracted.metadata.title || url,
        htmlContent: html,
        textContent: this.validateAndSanitize(extracted.textContent || ''),
        headings: extracted.headings,
        codeBlocks: extracted.codeBlocks,
        links: extracted.links || [],
        metadata: {
          description: extracted.metadata.description,
          keywords: extracted.metadata.keywords,
          author: extracted.metadata.author,
          publishedDate: extracted.metadata.publishedDate,
          modifiedDate: extracted.metadata.modifiedDate
        }
      };
      
      // Log processing status
      const hasContent = !!processed.textContent && processed.textContent.length > 0;
      if (hasContent) {
        logger.debug(`Successfully processed content for ${url} (${processed.textContent.length} chars)`, 'ContentProcessor');
      } else {
        logger.warn(`No content extracted for ${url}`, 'ContentProcessor');
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing content for ${url}`, 'ContentProcessor', error);
      
      // Return minimal content in case of error
      return {
        title: url,
        htmlContent: html,
        textContent: '',
        links: [],
        metadata: {}
      };
    }
  }
  
  /**
   * Create a document from processed content
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
   * Validate and sanitize text content
   * @param content Text content
   * @returns Validated and sanitized content
   */
  private validateAndSanitize(content: string): string {
    if (!content) {
      return '';
    }
    
    try {
      // Remove excess whitespace
      let sanitized = content.replace(/\s+/g, ' ').trim();
      
      // Remove very common boilerplate phrases that add noise
      const boilerplatePatterns = [
        /^Skip to content$/im,
        /^Skip to main content$/im,
        /^Table of contents$/im,
        /^Search$/im,
        /^Loading\.\.\.$/im
      ];
      
      for (const pattern of boilerplatePatterns) {
        sanitized = sanitized.replace(pattern, '');
      }
      
      // Replace repeated newlines with a single newline
      sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
      
      return sanitized;
      
      // If the result is still just whitespace after sanitization
      if (sanitized.trim().length === 0) {
        return '';
      }
      
      return sanitized;
    } catch (error) {
      logger.warn(`Error sanitizing content: ${error}`, 'ContentProcessor');
      return content;
    }
  }
  
  /**
   * Generate a document ID from a URL
   * @param url URL
   * @returns Document ID
   */
  private generateDocumentId(url: string): string {
    // Create a SHA-256 hash of the URL for a stable ID
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(url).digest('hex');
  }
}