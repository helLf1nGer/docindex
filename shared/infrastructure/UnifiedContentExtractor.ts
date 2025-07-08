/**
 * Unified Content Extractor
 * 
 * This module provides a comprehensive content extraction solution that combines
 * the best approaches for different document types.
 * It offers robust handling of various document types and edge cases.
 */

import { getLogger } from './logging.js';
import { JSDOM } from 'jsdom';
import { ContentExtractionOptions, ContentExtractionResult, DocumentMetadata } from './ContentExtractor.js';
import { extractContent as baseExtractContent } from './ContentExtractor.js';

const logger = getLogger();

/**
 * Options for unified content extraction
 */
export interface UnifiedExtractionOptions {
  /** Whether to perform comprehensive extraction (more thorough but slower) */
  comprehensive?: boolean;
  
  /** Whether to enable detailed debugging */
  debug?: boolean;
  
  /** Content extraction options from base extractor */
  baseOptions?: ContentExtractionOptions;
  
  /** Content type hint to help with extraction */
  contentType?: string;
  
  /** Document source for special handling of known sources */
  sourceType?: 'generic' | 'github' | 'readthedocs' | 'swagger' | 'mdn';
}

/**
 * Extended document metadata with additional properties for specialized document types
 */
interface ExtendedDocumentMetadata extends DocumentMetadata {
  /** Whether the document has live code examples (specific to MDN) */
  hasLiveExamples?: boolean;
  
  /** Document type classification */
  documentType?: string;
  
  /** Any additional metadata fields */
  [key: string]: any;
}

/**
 * Extract content using the unified content extractor
 * 
 * @param html HTML content to extract from
 * @param url URL of the document (used for resolving relative links)
 * @param options Unified extraction options
 * @returns ContentExtractionResult with the extracted content
 */
export function extractUnifiedContent(
  html: string,
  url: string,
  options: UnifiedExtractionOptions = {}
): ContentExtractionResult {
  try {
    if (options.debug) {
      logger.info(`Starting unified content extraction for ${url}`, 'UnifiedContentExtractor');
    }
    
    // Skip extraction for empty content
    if (!html || html.trim().length === 0) {
      logger.warn(`Empty HTML content for ${url}`, 'UnifiedContentExtractor');
      return {
        textContent: '',
        htmlContent: html,
        metadata: { title: url }
      };
    }
    
    // Determine document type for specialized extraction
    const documentType = determineDocumentType(html, url, options.sourceType);
    
    // For specialized document types, use targeted extraction
    if (documentType !== 'generic') {
      try {
        const specializedResult = extractSpecializedContent(html, url, documentType);
        
        if (specializedResult) {
          if (options.debug) {
            logger.info(
              `Specialized extraction (${documentType}) completed for ${url}. Text length: ${specializedResult.textContent.length}`,
              'UnifiedContentExtractor'
            );
          }
          
          return specializedResult;
        }
      } catch (error) {
        logger.warn(`Error in specialized extraction, falling back to basic: ${error}`, 'UnifiedContentExtractor');
        // Fall back to basic extraction
      }
    }
    
    // Standard extraction as fallback
    try {
      const result = baseExtractContent(html, url, options.baseOptions);
      
      if (options.debug) {
        logger.info(
          `Basic extraction completed for ${url}. Text length: ${result.textContent.length}`,
          'UnifiedContentExtractor'
        );
      }
      
      return result;
    } catch (error) {
      logger.error(`All extraction methods failed for ${url}: ${error}`, 'UnifiedContentExtractor');
      
      // Return minimal content as last resort
      return {
        textContent: `Failed to extract content from ${url}`,
        htmlContent: html,
        metadata: { title: url }
      };
    }
  } catch (error) {
    logger.error(`Fatal error in content extraction for ${url}: ${error}`, 'UnifiedContentExtractor');
    
    // Return minimal content
    return {
      textContent: '',
      htmlContent: html,
      metadata: { title: url }
    };
  }
}

/**
 * Determine the type of document for specialized extraction
 */
function determineDocumentType(
  html: string,
  url: string,
  hintType?: string
): 'generic' | 'github' | 'readthedocs' | 'swagger' | 'mdn' {
  try {
    // Use hint if provided
    if (hintType && hintType !== 'generic') {
      return hintType as any;
    }
    
    // Check URL patterns
    if (url.includes('github.com') || url.includes('githubusercontent.com')) {
      return 'github';
    }
    
    if (url.includes('readthedocs.io') || url.includes('rtfd.io')) {
      return 'readthedocs';
    }
    
    if (url.includes('developer.mozilla.org')) {
      return 'mdn';
    }
    
    // Check content patterns
    if (html.includes('<div id="swagger-ui">') || html.includes('swagger-ui')) {
      return 'swagger';
    }
    
    // Default to generic
    return 'generic';
  } catch (error) {
    logger.warn(`Error determining document type: ${error}`, 'UnifiedContentExtractor');
    return 'generic';
  }
}

/**
 * Extract content using specialized extractors for different document types
 */
function extractSpecializedContent(
  html: string,
  url: string,
  documentType: string
): ContentExtractionResult | null {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  
  // Default extraction result structure
  const result: ContentExtractionResult = {
    textContent: '',
    htmlContent: html,
    metadata: {
      title: document.title || url
    }
  };
  
  switch (documentType) {
    case 'github':
      // For GitHub, focus on README or repository content
      const readmeContent = document.querySelector('.markdown-body');
      if (readmeContent) {
        result.textContent = readmeContent.textContent || '';
        
        // Extract headings
        const headings = Array.from(readmeContent.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(el => ({
            text: el.textContent || '',
            level: parseInt(el.tagName.substring(1)),
            id: el.id
          }));
        
        result.headings = headings;
        
        // Extract code blocks
        const codeBlocks = Array.from(readmeContent.querySelectorAll('pre > code'))
          .map(el => {
            const langClass = Array.from(el.classList).find(c => c.startsWith('language-'));
            return {
              code: el.textContent || '',
              language: langClass ? langClass.substring(9) : undefined
            };
          });
        
        result.codeBlocks = codeBlocks;
        
        return result;
      }
      break;
      
    case 'readthedocs':
      // For ReadTheDocs, focus on the main documentation content
      const rtdContent = document.querySelector('.document') || document.querySelector('article');
      if (rtdContent) {
        result.textContent = rtdContent.textContent || '';
        
        // Extract headings
        const headings = Array.from(rtdContent.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(el => ({
            text: el.textContent || '',
            level: parseInt(el.tagName.substring(1)),
            id: el.id
          }));
        
        result.headings = headings;
        
        // Extract code blocks
        const codeBlocks = Array.from(rtdContent.querySelectorAll('pre > code, div.highlight > pre'))
          .map(el => {
            // Try to determine language from class or data attribute
            let language;
            if (el.parentElement) {
              const parentClasses = Array.from(el.parentElement.classList);
              const langClass = parentClasses.find(c => c.startsWith('language-') || c.startsWith('highlight-'));
              if (langClass) {
                language = langClass.includes('language-') ? 
                  langClass.substring(9) : 
                  langClass.substring(10);
              }
            }
            
            return {
              code: el.textContent || '',
              language
            };
          });
        
        result.codeBlocks = codeBlocks;
        
        return result;
      }
      break;
      
    case 'swagger':
      // For Swagger, extract API operations
      const apiOperations = document.querySelectorAll('.opblock');
      if (apiOperations.length > 0) {
        let apiText = '';
        
        // Title from Swagger info
        const apiTitle = document.querySelector('.info .title')?.textContent;
        if (apiTitle) {
          result.metadata.title = apiTitle;
          apiText += `API: ${apiTitle}\n\n`;
        }
        
        // Description from Swagger info
        const apiDescription = document.querySelector('.info .markdown')?.textContent;
        if (apiDescription) {
          result.metadata.description = apiDescription;
          apiText += `Description: ${apiDescription}\n\n`;
        }
        
        // Extract API operations
        apiOperations.forEach(op => {
          const method = op.querySelector('.opblock-summary-method')?.textContent;
          const path = op.querySelector('.opblock-summary-path')?.textContent;
          const description = op.querySelector('.opblock-description-wrapper')?.textContent;
          
          if (method && path) {
            apiText += `${method} ${path}\n`;
            if (description) {
              apiText += `${description.trim()}\n`;
            }
            apiText += '\n';
          }
        });
        
        result.textContent = apiText;
        return result;
      }
      break;
      
    case 'mdn':
      // For MDN, focus on the main article content
      const mdnContent = document.querySelector('article') || document.querySelector('#content');
      if (mdnContent) {
        result.textContent = mdnContent.textContent || '';
        
        // Extract headings
        const headings = Array.from(mdnContent.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .map(el => ({
            text: el.textContent || '',
            level: parseInt(el.tagName.substring(1)),
            id: el.id
          }));
        
        result.headings = headings;
        
        // Extract code blocks
        const codeBlocks = Array.from(mdnContent.querySelectorAll('pre > code, pre.example-code'))
          .map(el => {
            let language;
            
            // Check for explicit language class
            if (el.className) {
              const match = el.className.match(/language-(\w+)/);
              if (match) {
                language = match[1];
              }
            }
            
            // If no language found yet, try to determine from content (MDN specific)
            if (!language && el.textContent) {
              if (el.textContent.includes('function') || el.textContent.includes('var ') || 
                  el.textContent.includes('const ') || el.textContent.includes('let ')) {
                language = 'javascript';
              } else if (el.textContent.includes('<div') || el.textContent.includes('<span')) {
                language = 'html';
              } else if (el.textContent.includes('.class') || el.textContent.includes('#id')) {
                language = 'css';
              }
            }
            
            return {
              code: el.textContent || '',
              language
            };
          });
        
        result.codeBlocks = codeBlocks;
        
        // Extract any example code in interactive editors
        const liveExamples = Array.from(document.querySelectorAll('.live-sample-frame'));
        if (liveExamples.length > 0) {
          (result.metadata as ExtendedDocumentMetadata).hasLiveExamples = true;
        }
        
        return result;
      }
      break;
  }
  
  // Return null if specialized extraction failed
  return null;
}