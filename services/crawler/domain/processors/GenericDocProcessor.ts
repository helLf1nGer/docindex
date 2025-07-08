/**
 * Generic document processor
 * 
 * This processor serves as the fallback for documentation sources that
 * don't have a specialized processor. It applies general-purpose content
 * extraction and processing techniques.
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { BaseDocumentProcessor, DocumentProcessorOptions } from './DocumentProcessor.js';
import { ProcessedContent } from '../ContentProcessor.js';
import { extractUnifiedContent } from '../../../../shared/infrastructure/UnifiedContentExtractor.js';

const logger = getLogger();

/**
 * Generic document processor
 */
export class GenericDocProcessor extends BaseDocumentProcessor {
  /**
   * Create a new generic document processor
   */
  constructor() {
    super('GenericDocProcessor');
    logger.debug('GenericDocProcessor initialized', 'GenericDocProcessor');
  }
  
  /**
   * Check if the processor can handle a specific source
   * @param url The source URL to check
   * @param html HTML content of the page (optional)
   * @returns Always returns true as this is the fallback processor
   */
  canHandle(url: string, html?: string): boolean {
    // This is the fallback processor, so it always returns true
    return true;
  }
  
  /**
   * Process the document content
   * @param html HTML content of the page
   * @param url The source URL
   * @param options Processing options
   * @returns Processed content
   */
  process(html: string, url: string, options?: DocumentProcessorOptions): ProcessedContent {
    logger.debug(`Processing content for URL: ${url}`, 'GenericDocProcessor');
    
    try {
      // Default processing options
      const processingOptions = options?.processing || {};
      
      // Configure extraction options
      const extractionOptions = {
        comprehensive: true,
        debug: options?.debug || false,
      };
      
      // Extract content using UnifiedContentExtractor
      let extracted = extractUnifiedContent(html, url, extractionOptions);
      let textContent = extracted.textContent || '';
      
      // Apply HTML to Markdown conversion if requested
      if (processingOptions.convertToMarkdown) {
        textContent = this.convertToMarkdown(extracted.textContent || '');
        logger.debug(`Converted HTML to Markdown for ${url}`, 'GenericDocProcessor');
      }
      
      // Apply deduplication if requested
      if (processingOptions.deduplicate) {
        textContent = this.deduplicateContent(textContent);
        logger.debug(`Applied deduplication for ${url}`, 'GenericDocProcessor');
      }
      
      // Apply chunking if requested
      let chunks: string[] = [textContent];
      if (processingOptions.chunk) {
        chunks = this.chunkContent(textContent, processingOptions.maxChunkSize || 500);
        logger.debug(`Split content into ${chunks.length} chunks for ${url}`, 'GenericDocProcessor');
      }
      
      // Create processed content
      const processed: ProcessedContent = {
        title: extracted.metadata.title || url,
        htmlContent: html,
        textContent: textContent,
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
        logger.debug(`Successfully processed content for ${url} (${processed.textContent.length} chars)`, 'GenericDocProcessor');
      } else {
        logger.warn(`No content extracted for ${url}`, 'GenericDocProcessor');
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing content for ${url}`, 'GenericDocProcessor', error);
      
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
   * Clean and normalize URL patterns common in documentation sites
   * @param url URL to normalize
   * @returns Normalized URL
   */
  protected normalizeUrl(url: string): string {
    // Remove common tracking parameters
    let normalized = url.replace(/[?&](utm_source|utm_medium|utm_campaign|utm_term|utm_content)=[^&]+/g, '');
    
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    
    // Remove common anchors that don't represent actual content
    normalized = normalized.replace(/#(top|bottom|header|footer|nav|menu|sidebar|toc)$/i, '');
    
    return normalized;
  }
}