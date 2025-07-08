/**
 * UnifiedContentExtractor for DocSI
 * 
 * This module provides a comprehensive solution for extracting content from HTML
 * documents, consolidating functionality from separate extractors and providing
 * a robust, extensible approach to content extraction.
 */

import { JSDOM } from 'jsdom';
import { getLogger } from './logging.js';

const logger = getLogger();

/**
 * Options for content extraction
 */
export const ExtractionOptions = {
  /**
   * Extract as much content as possible, including headings, code blocks, etc.
   */
  comprehensive: true,

  /**
   * Clean up HTML artifacts like excessive whitespace
   */
  cleanupText: true,

  /**
   * Extract metadata from HTML (title, description, etc.)
   */
  extractMetadata: true,

  /**
   * Extract headings and their structure
   */
  extractHeadings: true,

  /**
   * Extract code blocks
   */
  extractCodeBlocks: true,

  /**
   * Extract API specifications if available
   */
  extractApiSpecs: true,

  /**
   * Enable debug logging
   */
  debug: false
};

/**
 * Unified content extractor for HTML documents
 * 
 * This function extracts text content and metadata from HTML content, handling
 * various document structures and content types.
 * 
 * @param {string} htmlContent - Raw HTML content to extract from
 * @param {string} url - URL of the document for context
 * @param {object} options - Extraction options
 * @returns {object} Extracted content and metadata
 */
export function extractUnifiedContent(htmlContent, url, options = {}) {
  try {
    // Start time for performance tracking
    const startTime = Date.now();
    
    // Merge default options
    const extractionOptions = { ...ExtractionOptions, ...options };
    const { debug } = extractionOptions;
    
    if (debug) {
      logger.debug(`Starting content extraction for ${url}`, 'UnifiedContentExtractor');
    }
    
    // Return early if no HTML content
    if (!htmlContent || htmlContent.trim().length === 0) {
      logger.warn(`No HTML content to extract from for ${url}`, 'UnifiedContentExtractor');
      return { textContent: '', title: '', metadata: {} };
    }
    
    // Parse HTML with jsdom
    const dom = new JSDOM(htmlContent, { url });
    const document = dom.window.document;
    
    // Extract basic metadata
    const metadata = extractMetadata(document, extractionOptions);
    
    // Extract headings if enabled
    if (extractionOptions.extractHeadings) {
      metadata.headings = extractHeadings(document);
    }
    
    // Extract code blocks if enabled
    if (extractionOptions.extractCodeBlocks) {
      metadata.codeBlocks = extractCodeBlocks(document);
    }
    
    // Extract API specs if enabled
    if (extractionOptions.extractApiSpecs) {
      metadata.apiSpecs = extractApiSpecifications(document, url);
    }
    
    // Extract main text content
    const textContent = extractMainContent(document, extractionOptions);
    
    // Log performance
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (debug) {
      logger.debug(
        `Content extraction completed for ${url} in ${duration}ms - ` +
        `Text length: ${textContent.length}, ` +
        `Headings: ${metadata.headings ? metadata.headings.length : 0}, ` +
        `Code blocks: ${metadata.codeBlocks ? metadata.codeBlocks.length : 0}`,
        'UnifiedContentExtractor'
      );
    }
    
    return {
      textContent,
      title: metadata.title || '',
      metadata
    };
  } catch (error) {
    logger.error(`Error extracting content from ${url}: ${error.message}`, 'UnifiedContentExtractor', error);
    
    // Return empty content on error, but don't fail completely
    return { 
      textContent: `Failed to extract content: ${error.message}`,
      title: '',
      metadata: { error: error.message }
    };
  }
}

/**
 * Extract metadata from HTML document
 * @param {Document} document - DOM document
 * @param {object} options - Extraction options
 * @returns {object} Extracted metadata
 */
function extractMetadata(document, options) {
  const metadata = {};
  
  // Extract title
  const titleElement = document.querySelector('title');
  if (titleElement) {
    metadata.title = titleElement.textContent.trim();
  }
  
  // Extract description
  const descriptionElement = document.querySelector('meta[name="description"]');
  if (descriptionElement) {
    metadata.description = descriptionElement.getAttribute('content');
  }
  
  // Extract keywords
  const keywordsElement = document.querySelector('meta[name="keywords"]');
  if (keywordsElement) {
    const keywords = keywordsElement.getAttribute('content');
    if (keywords) {
      metadata.keywords = keywords.split(',').map(k => k.trim());
    }
  }
  
  // Extract canonical URL
  const canonicalElement = document.querySelector('link[rel="canonical"]');
  if (canonicalElement) {
    metadata.canonicalUrl = canonicalElement.getAttribute('href');
  }
  
  // Extract author
  const authorElement = document.querySelector('meta[name="author"]');
  if (authorElement) {
    metadata.author = authorElement.getAttribute('content');
  }
  
  return metadata;
}

/**
 * Extract headings from HTML document
 * @param {Document} document - DOM document
 * @returns {Array<object>} Extracted headings with level, text, and id
 */
function extractHeadings(document) {
  const headings = [];
  
  // Select all heading elements (h1-h6)
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headingElements.forEach(heading => {
    const level = parseInt(heading.tagName.substring(1), 10);
    const text = heading.textContent.trim();
    const id = heading.id || '';
    
    headings.push({ level, text, id });
  });
  
  return headings;
}

/**
 * Extract code blocks from HTML document
 * @param {Document} document - DOM document
 * @returns {Array<object>} Extracted code blocks with language and content
 */
function extractCodeBlocks(document) {
  const codeBlocks = [];
  
  // Select all code blocks (pre > code)
  const codeElements = document.querySelectorAll('pre > code');
  
  codeElements.forEach(code => {
    // Try to determine language from class (e.g., "language-javascript")
    let language = '';
    const classList = Array.from(code.classList);
    const languageClass = classList.find(c => c.startsWith('language-'));
    
    if (languageClass) {
      language = languageClass.substring('language-'.length);
    }
    
    const content = code.textContent;
    
    codeBlocks.push({ language, content });
  });
  
  return codeBlocks;
}

/**
 * Extract API specifications from HTML document
 * @param {Document} document - DOM document
 * @param {string} url - URL of the document
 * @returns {Array<object>} Extracted API specifications
 */
function extractApiSpecifications(document, url) {
  const apiSpecs = [];
  
  // Look for common API documentation patterns
  // This is a basic implementation that can be extended for specific documentation formats
  
  // Look for method definitions in various formats
  const methodPatterns = [
    'div.method', // Generic
    '.api-method', // Common in many docs
    '.endpoint', // Swagger/OpenAPI style
    '.function-signature', // Function docs
  ];
  
  methodPatterns.forEach(pattern => {
    const elements = document.querySelectorAll(pattern);
    
    elements.forEach(element => {
      // Extract method details
      let name = '';
      let description = '';
      let signature = '';
      let returnType = '';
      
      // Try to find name
      const nameElement = element.querySelector('.name, .method-name, h3, h4');
      if (nameElement) {
        name = nameElement.textContent.trim();
      }
      
      // Try to find description
      const descElement = element.querySelector('.description, .method-description, p');
      if (descElement) {
        description = descElement.textContent.trim();
      }
      
      // Try to find signature
      const signatureElement = element.querySelector('.signature, .method-signature, code');
      if (signatureElement) {
        signature = signatureElement.textContent.trim();
      }
      
      // Try to find return type
      const returnElement = element.querySelector('.returns, .return-type');
      if (returnElement) {
        returnType = returnElement.textContent.trim();
      }
      
      if (name || signature) {
        apiSpecs.push({ name, description, signature, returnType });
      }
    });
  });
  
  return apiSpecs;
}

/**
 * Extract main content from HTML document
 * @param {Document} document - DOM document
 * @param {object} options - Extraction options
 * @returns {string} Extracted text content
 */
function extractMainContent(document, options) {
  // Try to identify main content area
  const mainContentSelectors = [
    'main',
    'article',
    '.main-content',
    '.article-content',
    '.content',
    '.documentation',
    '.markdown-body', // GitHub style
    '.post-content',
    '#content',
    '.container' // Fallback
  ];
  
  let contentElement = null;
  
  // Try each selector until we find a content element
  for (const selector of mainContentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      contentElement = element;
      break;
    }
  }
  
  // If no specific content element found, use body
  if (!contentElement) {
    contentElement = document.body;
  }
  
  // Extract text with proper formatting
  let textContent = '';
  
  if (options.comprehensive) {
    // For comprehensive extraction, we want to maintain some structure
    textContent = extractStructuredText(contentElement);
  } else {
    // For basic extraction, just get the text
    textContent = contentElement.textContent;
  }
  
  // Clean up text if enabled
  if (options.cleanupText) {
    textContent = cleanupText(textContent);
  }
  
  return textContent;
}

/**
 * Extract structured text from an element, maintaining basic formatting
 * @param {Element} element - DOM element to extract from
 * @returns {string} Extracted structured text
 */
function extractStructuredText(element) {
  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true);
  
  // Remove script and style elements
  const scriptsAndStyles = clone.querySelectorAll('script, style, noscript, iframe');
  scriptsAndStyles.forEach(el => el.remove());
  
  // Handle specific elements for better formatting
  const result = [];
  processNodeForStructuredText(clone, result);
  
  return result.join('');
}

/**
 * Process a node for structured text extraction
 * @param {Node} node - DOM node to process
 * @param {Array<string>} result - Array to accumulate result
 */
function processNodeForStructuredText(node, result) {
  if (node.nodeType === 3) { // Text node
    result.push(node.textContent);
    return;
  }
  
  if (node.nodeType !== 1) { // Not an element node
    return;
  }
  
  const tagName = node.tagName.toLowerCase();
  
  // Add newlines and formatting for block elements
  switch (tagName) {
    case 'p':
    case 'div':
    case 'section':
    case 'article':
      if (result.length > 0 && !result[result.length - 1].endsWith('\n')) {
        result.push('\n');
      }
      break;
      
    case 'br':
      result.push('\n');
      return; // No children to process
      
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      if (result.length > 0 && !result[result.length - 1].endsWith('\n\n')) {
        result.push('\n\n');
      }
      break;
      
    case 'li':
      if (result.length > 0 && !result[result.length - 1].endsWith('\n')) {
        result.push('\n');
      }
      result.push('- ');
      break;
      
    case 'pre':
      if (result.length > 0 && !result[result.length - 1].endsWith('\n\n')) {
        result.push('\n\n');
      }
      break;
      
    case 'table':
    case 'figure':
      if (result.length > 0 && !result[result.length - 1].endsWith('\n\n')) {
        result.push('\n\n');
      }
      break;
  }
  
  // Process children
  Array.from(node.childNodes).forEach(child => {
    processNodeForStructuredText(child, result);
  });
  
  // Add trailing newlines
  switch (tagName) {
    case 'p':
    case 'div':
    case 'section':
    case 'article':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'li':
    case 'pre':
    case 'table':
    case 'figure':
      if (!result[result.length - 1].endsWith('\n')) {
        result.push('\n');
      }
      break;
  }
}

/**
 * Clean up extracted text
 * @param {string} text - Text to clean up
 * @returns {string} Cleaned text
 */
function cleanupText(text) {
  // Remove excessive whitespace
  let cleaned = text.replace(/\s+/g, ' ');
  
  // Fix newlines
  cleaned = cleaned.replace(/ \n/g, '\n');
  cleaned = cleaned.replace(/\n /g, '\n');
  
  // Remove excessive newlines (more than 2)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned.trim();
}

/**
 * Extract from specialized documentation platforms
 * @param {string} htmlContent - Raw HTML content
 * @param {string} url - URL of the document
 * @param {object} options - Extraction options
 * @returns {object} Extracted content and metadata
 */
export function extractPlatformSpecific(htmlContent, url, options = {}) {
  // Detect documentation platform based on URL or content patterns
  if (isGitHubDocs(url, htmlContent)) {
    return extractGitHubDocs(htmlContent, url, options);
  } else if (isReadTheDocs(url, htmlContent)) {
    return extractReadTheDocs(htmlContent, url, options);
  } else if (isSwaggerDocs(url, htmlContent)) {
    return extractSwaggerDocs(htmlContent, url, options);
  } else {
    // Fall back to unified extractor
    return extractUnifiedContent(htmlContent, url, options);
  }
}

/**
 * Check if the document is GitHub documentation
 */
function isGitHubDocs(url, htmlContent) {
  return url.includes('github.com') || 
         url.includes('github.io') || 
         htmlContent.includes('class="markdown-body"');
}

/**
 * Extract content from GitHub documentation
 */
function extractGitHubDocs(htmlContent, url, options) {
  // GitHub-specific extraction logic would go here
  // For now, we'll use the unified extractor with some GitHub-specific selectors
  
  const githubOptions = { 
    ...options,
    mainContentSelector: '.markdown-body'
  };
  
  return extractUnifiedContent(htmlContent, url, githubOptions);
}

/**
 * Check if the document is ReadTheDocs documentation
 */
function isReadTheDocs(url, htmlContent) {
  return url.includes('readthedocs.io') || 
         url.includes('rtfd.io') || 
         htmlContent.includes('class="rst-content"');
}

/**
 * Extract content from ReadTheDocs documentation
 */
function extractReadTheDocs(htmlContent, url, options) {
  // ReadTheDocs-specific extraction logic would go here
  const rtdOptions = { 
    ...options,
    mainContentSelector: '.rst-content'
  };
  
  return extractUnifiedContent(htmlContent, url, rtdOptions);
}

/**
 * Check if the document is Swagger/OpenAPI documentation
 */
function isSwaggerDocs(url, htmlContent) {
  return url.includes('swagger') || 
         url.includes('api-docs') || 
         htmlContent.includes('class="swagger-ui"');
}

/**
 * Extract content from Swagger/OpenAPI documentation
 */
function extractSwaggerDocs(htmlContent, url, options) {
  // Swagger-specific extraction logic would go here
  const swaggerOptions = { 
    ...options,
    extractApiSpecs: true,
    mainContentSelector: '.swagger-ui'
  };
  
  return extractUnifiedContent(htmlContent, url, swaggerOptions);
}