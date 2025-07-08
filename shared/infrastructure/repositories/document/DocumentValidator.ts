/**
 * Document validation utilities
 * Provides validation functions for Document objects
 */

import { Document } from '../../../../shared/domain/models/Document.js';
import { getLogger } from '../../../infrastructure/logging.js';

const logger = getLogger();

/**
 * Result of document validation
 */
export interface ValidationResult {
  /** Whether the document is valid */
  isValid: boolean;
  /** Any validation messages */
  messages: string[];
  /** Validation error if any */
  error?: Error;
}

/**
 * Document validator utility
 */
export class DocumentValidator {
  /**
   * Validate a document
   * @param document Document to validate
   * @returns Validation result
   */
  static validate(document: Document): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      messages: []
    };

    try {
      // Required fields
      if (!document.id) {
        result.isValid = false;
        result.messages.push('Document ID is required');
      }
      
      if (!document.url) {
        result.isValid = false;
        result.messages.push('Document URL is required');
      }
      
      if (!document.title) {
        result.isValid = false;
        result.messages.push('Document title is required');
      }
      
      if (!document.sourceId) {
        result.isValid = false;
        result.messages.push('Document source ID is required');
      }
      
      // Either content or textContent should be present
      if (!document.content && !document.textContent) {
        result.isValid = false;
        result.messages.push('Document must have either content or textContent');
      }
      
      // Date fields
      if (!document.indexedAt) {
        result.isValid = false;
        result.messages.push('Document indexedAt date is required');
      }
      
      if (!document.updatedAt) {
        result.isValid = false;
        result.messages.push('Document updatedAt date is required');
      }
      
      // Content size limits
      if (document.content && document.content.length > 10 * 1024 * 1024) { // 10MB limit
        result.messages.push('Warning: Document content exceeds 10MB');
      }
      
      if (document.textContent && document.textContent.length > 5 * 1024 * 1024) { // 5MB limit
        result.messages.push('Warning: Document text content exceeds 5MB');
      }
      
      // URL structure validation
      if (document.url) {
        try {
          new URL(document.url);
        } catch (e) {
          result.isValid = false;
          result.messages.push(`Invalid document URL: ${document.url}`);
        }
      }
      
      // Validate metadata if present
      if (document.metadata) {
        // Check for required metadata fields based on document type
        // This would need to be expanded based on specific requirements
        if (document.metadata.docType === 'api' && !document.metadata.apiVersion) {
          result.messages.push('Warning: API document missing apiVersion in metadata');
        }
      }
      
      // Log validation results
      if (!result.isValid) {
        logger.warn(`Document validation failed: ${result.messages.join(', ')}`, 'DocumentValidator');
      } else if (result.messages.length > 0) {
        logger.info(`Document validation warnings: ${result.messages.join(', ')}`, 'DocumentValidator');
      }
    } catch (error) {
      result.isValid = false;
      result.error = error instanceof Error ? error : new Error(String(error));
      result.messages.push(`Validation error: ${result.error.message}`);
      logger.error(`Document validation error: ${result.error.message}`, 'DocumentValidator');
    }
    
    return result;
  }
  
  /**
   * Check if a document is valid for storage
   * This is a more strict validation focused on storage requirements
   * @param document Document to validate
   * @returns Validation result
   */
  static validateForStorage(document: Document): ValidationResult {
    logger.debug(`[DocumentValidator] validateForStorage called with document: ${JSON.stringify(document, null, 2)}`, 'DocumentValidator');
    const baseResult = this.validate(document);
    
    // Additional storage-specific validations
    if (baseResult.isValid) {
      // Ensure document has at least one of content or textContent
      if (!document.content && !document.textContent) {
        baseResult.isValid = false;
        baseResult.messages.push('Document must have either content or textContent for storage');
      }
      
      // Ensure dates are valid for storage (will be serialized to JSON)
      try {
        // Convert dates to strings and back to ensure they can be serialized
        if (document.indexedAt) {
          const serialized = JSON.stringify(document.indexedAt);
          JSON.parse(serialized);
        }
        
        if (document.updatedAt) {
          const serialized = JSON.stringify(document.updatedAt);
          JSON.parse(serialized);
        }
      } catch (error) {
        baseResult.isValid = false;
        baseResult.messages.push('Document has invalid date formats that cannot be serialized');
        baseResult.error = error instanceof Error ? error : new Error(String(error));
      }
    }
    
    logger.debug(`[DocumentValidator] validateForStorage result: ${JSON.stringify(baseResult, null, 2)}`, 'DocumentValidator');
    return baseResult;
  }
  
  /**
   * Check if a document is valid for searching
   * @param document Document to validate
   * @returns Validation result
   */
  static validateForSearch(document: Document): ValidationResult {
    const baseResult = this.validate(document);
    
    // Additional search-specific validations
    if (baseResult.isValid) {
      // Document should have textContent for searching
      if (!document.textContent || document.textContent.trim().length === 0) {
        baseResult.isValid = false;
        baseResult.messages.push('Document must have textContent for searching');
      }
      
      // Check if the document has searchable fields
      if (!document.title || document.title.trim().length === 0) {
        baseResult.messages.push('Warning: Document has no title for search indexing');
      }
    }
    
    return baseResult;
  }
}