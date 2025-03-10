/**
 * Enhanced Content Extraction Module for DocSI
 * 
 * This module provides improved content extraction specifically targeting common
 * documentation sites like Node.js, React, etc. It extends the basic content
 * extractor with more specialized extraction capabilities.
 */

import { getLogger } from './logging.js';
import { JSDOM } from 'jsdom';
import { extractContent, ContentExtractionResult, DocumentMetadata } from './ContentExtractor.js';

const logger = getLogger();

/**
 * Options for enhanced content extraction
 */
export interface EnhancedExtractionOptions {
  /** Whether to apply special handling for specific doc platforms */
  detectPlatform?: boolean;
  
  /** Whether to apply readability algorithms for better text extraction */
  useReadability?: boolean;
  
  /** Whether to extract and structure API documentation specifically */
  extractApiDocs?: boolean;
  
  /** Whether to process code blocks with syntax highlighting info */
  processCodeBlocks?: boolean;
  
  /** Whether to extract table of contents */
  extractToc?: boolean;
}

/**
 * Enhanced content extraction result
 */
export interface EnhancedExtractionResult extends ContentExtractionResult {
  /** Detected documentation platform */
  platform?: string;
  
  /** Extracted table of contents */
  tableOfContents?: TocEntry[];
  
  /** Extracted API documentation */
  apiDocs?: ApiDocumentation[];
}

/**
 * Table of contents entry
 */
export interface TocEntry {
  /** Entry title */
  title: string;
  
  /** Entry level in TOC hierarchy */
  level: number;
  
  /** Link to section */
  href?: string;
  
  /** Child entries */
  children?: TocEntry[];
}

/**
 * API documentation entry
 */
export interface ApiDocumentation {
  /** API name */
  name: string;
  
  /** API type (function, class, method, property, etc.) */
  type: string;
  
  /** API signature */
  signature?: string;
  
  /** API description */
  description?: string;
  
  /** API parameters */
  parameters?: ApiParameter[];
  
  /** API return value */
  returns?: string;
  
  /** API examples */
  examples?: string[];
}

/**
 * API parameter
 */
export interface ApiParameter {
  /** Parameter name */
  name: string;
  
  /** Parameter type */
  type?: string;
  
  /** Parameter description */
  description?: string;
  
  /** Whether parameter is optional */
  optional?: boolean;
  
  /** Default value if any */
  defaultValue?: string;
}

/**
 * Extract content with enhanced capabilities
 * 
 * @param html HTML content
 * @param url URL of the document
 * @param options Extraction options
 * @returns Enhanced extraction result
 */
export function extractEnhancedContent(
  html: string,
  url: string,
  options: EnhancedExtractionOptions = {}
): EnhancedExtractionResult {
  // First use the base extractor
  const baseResult = extractContent(html, url);
  
  // Initialize enhanced result
  const result: EnhancedExtractionResult = {
    ...baseResult
  };
  
  try {
    // Parse HTML
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Detect platform
    if (options.detectPlatform !== false) {
      result.platform = detectPlatform(document, url);
    }
    
    // Apply platform-specific extraction
    if (result.platform) {
      enhanceByPlatform(result, document, result.platform);
    }
    
    // Extract TOC if enabled
    if (options.extractToc !== false) {
      result.tableOfContents = extractTableOfContents(document);
    }
    
    // Extract API docs if enabled
    if (options.extractApiDocs !== false) {
      result.apiDocs = extractApiDocumentation(document, result.platform);
    }
    
    // Apply readability if enabled
    if (options.useReadability !== false) {
      improveTextContent(result, document);
    }
    
    return result;
  } catch (error) {
    logger.warn(`Enhanced extraction failed: ${error}`, 'ContentExtractorEnhanced');
    return result;
  }
}

/**
 * Detect documentation platform from the document
 * 
 * @param document DOM document
 * @param url URL of the document
 * @returns Platform name or undefined
 */
function detectPlatform(document: Document, url: string): string | undefined {
  // Check URL patterns
  if (url.includes('nodejs.org')) {
    return 'nodejs';
  } else if (url.includes('reactjs.org') || url.includes('react.dev')) {
    return 'react';
  } else if (url.includes('docs.google.com')) {
    return 'google';
  }
  
  // Check meta tags
  const generator = document.querySelector('meta[name="generator"]');
  if (generator) {
    const content = generator.getAttribute('content') || '';
    if (content.includes('Docusaurus')) {
      return 'docusaurus';
    } else if (content.includes('Jekyll')) {
      return 'jekyll';
    } else if (content.includes('Hugo')) {
      return 'hugo';
    } else if (content.includes('MkDocs')) {
      return 'mkdocs';
    }
  }
  
  // Check for common patterns in HTML
  if (document.querySelector('.docusaurus-')) {
    return 'docusaurus';
  } else if (document.querySelector('.md-content')) {
    return 'mkdocs';
  } else if (document.querySelector('.swagger-ui')) {
    return 'swagger';
  } else if (document.querySelector('.typedoc')) {
    return 'typedoc';
  }
  
  return undefined;
}

/**
 * Apply platform-specific enhancements
 * 
 * @param result Extraction result
 * @param document DOM document
 * @param platform Platform name
 */
function enhanceByPlatform(
  result: EnhancedExtractionResult,
  document: Document,
  platform: string
): void {
  switch (platform) {
    case 'nodejs':
      enhanceNodejsDocs(result, document);
      break;
    case 'react':
      enhanceReactDocs(result, document);
      break;
    case 'docusaurus':
      enhanceDocusaurusDocs(result, document);
      break;
    case 'swagger':
      enhanceSwaggerDocs(result, document);
      break;
  }
}

/**
 * Enhance Node.js documentation
 * 
 * @param result Extraction result
 * @param document DOM document
 */
function enhanceNodejsDocs(
  result: EnhancedExtractionResult,
  document: Document
): void {
  // Find main content
  const mainContent = document.querySelector('#column2') || document.querySelector('main');
  
  if (mainContent) {
    // Extract improved text
    const clone = mainContent.cloneNode(true) as Element;
    
    // Clean up navigation and other elements
    const elementsToRemove = clone.querySelectorAll('nav, .api_stability, #toc, .toolbar, #scrollToTop');
    for (const el of Array.from(elementsToRemove)) {
      el.parentNode?.removeChild(el);
    }
    
    // Get text content
    const textContent = extractTextContent(clone);
    if (textContent.trim().length > 0) {
      result.textContent = textContent;
    }
    
    // Extract API stability information
    const stability = document.querySelector('.api_stability');
    if (stability) {
      const stabilityText = stability.textContent?.trim();
      if (stabilityText) {
        if (!result.metadata) {
          const newMetadata: DocumentMetadata = {
            title: document.title || 'Node.js Documentation'
          };
          result.metadata = newMetadata;
        }
        // Add stability as a custom property to metadata
        (result.metadata as any).stability = stabilityText;
      }
    }
  }
}

/**
 * Enhance React documentation
 * 
 * @param result Extraction result
 * @param document DOM document
 */
function enhanceReactDocs(
  result: EnhancedExtractionResult,
  document: Document
): void {
  // Find main content
  const mainContent = document.querySelector('article') || document.querySelector('main');
  
  if (mainContent) {
    // Extract improved text
    const clone = mainContent.cloneNode(true) as Element;
    
    // Clean up navigation and other elements
    const elementsToRemove = clone.querySelectorAll('nav, .sidebar, .hash-link, .edit-page-link');
    for (const el of Array.from(elementsToRemove)) {
      el.parentNode?.removeChild(el);
    }
    
    // Get text content
    const textContent = extractTextContent(clone);
    if (textContent.trim().length > 0) {
      result.textContent = textContent;
    }
  }
}

/**
 * Enhance Docusaurus documentation
 * 
 * @param result Extraction result
 * @param document DOM document
 */
function enhanceDocusaurusDocs(
  result: EnhancedExtractionResult,
  document: Document
): void {
  // Find main content
  const mainContent = document.querySelector('article') || document.querySelector('.docMainContainer');
  
  if (mainContent) {
    // Extract improved text
    const clone = mainContent.cloneNode(true) as Element;
    
    // Clean up navigation and other elements
    const elementsToRemove = clone.querySelectorAll('.tableOfContents, .tocCollapsible, .pagination');
    for (const el of Array.from(elementsToRemove)) {
      el.parentNode?.removeChild(el);
    }
    
    // Get text content
    const textContent = extractTextContent(clone);
    if (textContent.trim().length > 0) {
      result.textContent = textContent;
    }
  }
}

/**
 * Enhance Swagger documentation
 * 
 * @param result Extraction result
 * @param document DOM document
 */
function enhanceSwaggerDocs(
  result: EnhancedExtractionResult,
  document: Document
): void {
  // Process each API endpoint
  const apiDocs: ApiDocumentation[] = [];
  const endpoints = document.querySelectorAll('.opblock');
  
  for (const endpoint of Array.from(endpoints)) {
    const methodElement = endpoint.querySelector('.opblock-summary-method');
    const pathElement = endpoint.querySelector('.opblock-summary-path');
    
    if (methodElement && pathElement) {
      const method = methodElement.textContent?.trim() || '';
      const path = pathElement.textContent?.trim() || '';
      
      const descriptionElement = endpoint.querySelector('.opblock-description');
      const description = descriptionElement?.textContent?.trim() || '';
      
      apiDocs.push({
        name: `${method} ${path}`,
        type: 'endpoint',
        description,
        signature: `${method} ${path}`,
        parameters: []
      });
    }
  }
  
  if (apiDocs.length > 0) {
    result.apiDocs = apiDocs;
  }
}

/**
 * Extract table of contents
 * 
 * @param document DOM document
 * @returns Table of contents entries
 */
function extractTableOfContents(document: Document): TocEntry[] {
  const tocElement = document.querySelector('#toc, .toc, [role="toc"], .table-of-contents, nav.toc');
  if (!tocElement) {
    return [];
  }
  
  const tocEntries: TocEntry[] = [];
  const tocLinks = tocElement.querySelectorAll('a');
  
  for (const link of Array.from(tocLinks)) {
    const href = link.getAttribute('href');
    if (!href) continue;
    
    const title = link.textContent?.trim() || '';
    if (!title) continue;
    
    // Try to determine level from parent element
    let level = 1;
    const parentLi = link.closest('li');
    if (parentLi) {
      // Count parent ULs to determine level
      let parent = parentLi.parentElement;
      while (parent) {
        if (parent.tagName === 'UL' || parent.tagName === 'OL') {
          level++;
        }
        parent = parent.parentElement;
      }
    }
    
    tocEntries.push({ title, level, href });
  }
  
  return tocEntries;
}

/**
 * Extract API documentation
 * 
 * @param document DOM document
 * @param platform Platform name
 * @returns API documentation entries
 */
function extractApiDocumentation(document: Document, platform?: string): ApiDocumentation[] {
  const apiDocs: ApiDocumentation[] = [];
  
  // Platform-specific extraction
  if (platform === 'nodejs') {
    const apiItems = document.querySelectorAll('.api_metadata');
    
    for (const item of Array.from(apiItems)) {
      const parentSection = item.closest('section');
      if (!parentSection) continue;
      
      const header = parentSection.querySelector('h2, h3, h4');
      if (!header) continue;
      
      const name = header.textContent?.trim() || '';
      if (!name) continue;
      
      const description = extractSectionText(parentSection);
      
      apiDocs.push({
        name,
        type: detectApiType(name, description),
        description,
        examples: extractExamples(parentSection)
      });
    }
  }
  
  return apiDocs;
}

/**
 * Extract section text
 * 
 * @param element Element to extract from
 * @returns Extracted text
 */
function extractSectionText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  
  // Remove headers and code blocks (we handle them separately)
  const elementsToRemove = clone.querySelectorAll('h1, h2, h3, h4, h5, h6, pre, code');
  for (const el of Array.from(elementsToRemove)) {
    el.parentNode?.removeChild(el);
  }
  
  return extractTextContent(clone);
}

/**
 * Extract code examples
 * 
 * @param element Element to extract from
 * @returns Array of code examples
 */
function extractExamples(element: Element): string[] {
  const examples: string[] = [];
  const codeBlocks = element.querySelectorAll('pre > code');
  
  for (const codeBlock of Array.from(codeBlocks)) {
    const code = codeBlock.textContent?.trim();
    if (code) {
      examples.push(code);
    }
  }
  
  return examples;
}

/**
 * Detect API type from name and description
 * 
 * @param name API name
 * @param description API description
 * @returns API type
 */
function detectApiType(name: string, description: string): string {
  const nameLC = name.toLowerCase();
  const descLC = description.toLowerCase();
  
  if (nameLC.includes('class') || descLC.startsWith('class') || descLC.includes('this class')) {
    return 'class';
  } else if (nameLC.includes('event') || descLC.includes('event emitted')) {
    return 'event';
  } else if (nameLC.includes('method') || descLC.includes('.prototype.')) {
    return 'method';
  } else if (nameLC.includes('property') || descLC.includes('property of')) {
    return 'property';
  } else if (nameLC.endsWith('()') || descLC.startsWith('function') || descLC.includes('function that')) {
    return 'function';
  } else {
    return 'module';
  }
}

/**
 * Improve text content using advanced text extraction
 * 
 * @param result Extraction result
 * @param document DOM document
 */
function improveTextContent(result: EnhancedExtractionResult, document: Document): void {
  // Find main content area
  const mainContent = document.querySelector('main, article, .content, #content, #main');
  
  if (mainContent) {
    // Extract headings with text
    const sections: {heading: string, level: number, text: string}[] = [];
    const headings = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    for (const heading of Array.from(headings)) {
      const level = parseInt(heading.tagName.substring(1));
      const headingText = heading.textContent?.trim() || '';
      
      // Find all siblings until next heading
      let sibling = heading.nextElementSibling;
      const sectionContent: string[] = [];
      
      while (sibling && !sibling.tagName.match(/^H[1-6]$/)) {
        // Skip known non-content elements
        if (!sibling.matches('nav, aside, .toc, .sidebar, .admonition, .metadata')) {
          sectionContent.push(sibling.textContent?.trim() || '');
        }
        sibling = sibling.nextElementSibling;
      }
      
      sections.push({
        heading: headingText,
        level,
        text: sectionContent.join('\n')
      });
    }
    
    // Combine sections into structured text
    if (sections.length > 0) {
      const structuredText = sections.map(section => 
        `${section.heading}\n${'='.repeat(section.level * 2)}\n${section.text}`
      ).join('\n\n');
      
      // Only replace if we got meaningful content
      if (structuredText.length > result.textContent.length / 2) {
        result.textContent = structuredText;
      }
    }
  }
}

/**
 * Extract text content from an element
 * 
 * @param element Element to extract from
 * @returns Extracted text
 */
function extractTextContent(element: Element | null): string {
  if (!element) {
    return '';
  }
  
  try {
    // Create a clone to manipulate
    const clone = element.cloneNode(true) as Element;
    
    // Remove script, style, and other non-content elements
    const elementsToRemove = clone.querySelectorAll('script, style, noscript, svg, iframe');
    for (const el of Array.from(elementsToRemove)) {
      el.parentNode?.removeChild(el);
    }
    
    // Get text content and normalize whitespace
    let text = clone.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  } catch (error) {
    getLogger().warn(`Failed to extract text content: ${error}`, 'ContentExtractorEnhanced');
    return '';
  }
}