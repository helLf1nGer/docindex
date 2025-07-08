/**
 * Content extraction utilities for DocSI
 * 
 * This module provides robust content extraction functionality for HTML documents,
 * ensuring that meaningful text is properly extracted and processed.
 */

import { getLogger } from './logging.js';
import { JSDOM } from 'jsdom';

const logger = getLogger();

/**
 * Options for HTML content extraction
 */
export interface ContentExtractionOptions {
  /** Whether to extract metadata (title, description, etc.) */
  extractMetadata?: boolean;
  
  /** Whether to extract headings with their hierarchy */
  extractHeadings?: boolean;
  
  /** Whether to extract code blocks */
  extractCodeBlocks?: boolean;
  
  /** Whether to preserve some HTML structures for formatting */
  preserveFormatting?: boolean;
  
  /** Whether to extract links as part of the content */
  extractLinks?: boolean;
  
  /** Custom selectors to prioritize for extraction */
  prioritySelectors?: string[];
  
  /** Selectors to ignore during extraction */
  ignoreSelectors?: string[];
}

/**
 * Metadata extracted from a document
 */
export interface DocumentMetadata {
  /** Document title */
  title: string;
  
  /** Document description */
  description?: string;
  
  /** Document keywords */
  keywords?: string[];
  
  /** Document author */
  author?: string;
  
  /** Document published date */
  publishedDate?: Date;
  
  /** Document modified date */
  modifiedDate?: Date;
}

/**
 * Extracted document heading
 */
export interface DocumentHeading {
  /** Heading text */
  text: string;
  
  /** Heading level (1-6) */
  level: number;
  
  /** Heading ID if available */
  id?: string;
}

/**
 * Extracted code block
 */
export interface CodeBlock {
  /** Code content */
  code: string;
  
  /** Programming language if specified */
  language?: string;
}

/**
 * Result of content extraction
 */
export interface ContentExtractionResult {
  /** Plain text content */
  textContent: string;
  
  /** Original HTML content */
  htmlContent: string;
  
  /** Document metadata */
  metadata: DocumentMetadata;
  
  /** Document headings */
  headings?: DocumentHeading[];
  
  /** Extracted code blocks */
  codeBlocks?: CodeBlock[];
  
  /** Document links */
  links?: string[];
}

/**
 * Default options for content extraction
 */
const defaultOptions: ContentExtractionOptions = {
  extractMetadata: true,
  extractHeadings: true,
  extractCodeBlocks: true,
  preserveFormatting: false,
  extractLinks: true,
  prioritySelectors: ['article', 'main', '.content', '.documentation', '.docs-content'],
  ignoreSelectors: [
    'nav',
    'header',
    'footer',
    '.navigation',
    '.menu',
    '.sidebar',
    '.comments',
    '.ads',
    'script',
    'style',
    'noscript'
  ]
};

/**
 * Extract content from HTML
 * @param html HTML content
 * @param url URL of the document
 * @param options Extraction options
 * @returns Extraction result
 */
export function extractContent(
  html: string,
  url: string,
  options: ContentExtractionOptions = {}
): ContentExtractionResult {
  const mergedOptions = { ...defaultOptions, ...options };
  const context = 'ContentExtractor';
  
  try {
    logger.debug(`Starting content extraction for URL: ${url}`, context);
    
    // Parse HTML
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    // Extract metadata
    const metadata = extractMetadata(document, url);
    
    // Find main content area
    const mainContent = findMainContent(document, mergedOptions);
    
    // Extract headings if enabled
    const headings = mergedOptions.extractHeadings 
      ? extractHeadings(document)
      : undefined;
    
    // Extract code blocks if enabled
    const codeBlocks = mergedOptions.extractCodeBlocks
      ? extractCodeBlocks(document)
      : undefined;
    
    // Extract links if enabled
    const links = mergedOptions.extractLinks
      ? extractLinks(document, url)
      : undefined;
    
    // Extract text content
    const textContent = extractTextContent(mainContent || document.body);
    
    // Log successful extraction
    logger.debug(
      `Successfully extracted content from ${url}: ${textContent.length} chars, ${headings?.length || 0} headings, ${codeBlocks?.length || 0} code blocks`,
      context
    );
    
    return {
      textContent,
      htmlContent: html,
      metadata,
      headings,
      codeBlocks,
      links
    };
  } catch (error) {
    logger.error(`Failed to extract content from ${url}`, context, error);
    
    // Return minimal content to ensure we have something
    return {
      textContent: '',
      htmlContent: html,
      metadata: {
        title: url
      }
    };
  }
}

/**
 * Extract metadata from a document
 * @param document DOM document
 * @param url URL of the document
 * @returns Document metadata
 */
function extractMetadata(document: Document, url: string): DocumentMetadata {
  try {
    // Extract title
    const titleElement = document.querySelector('title');
    const title = titleElement?.textContent?.trim() || url;
    
    // Extract description
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const description = descriptionMeta?.getAttribute('content')?.trim();
    
    // Extract keywords
    const keywordsMeta = document.querySelector('meta[name="keywords"]');
    const keywordsStr = keywordsMeta?.getAttribute('content')?.trim();
    const keywords = keywordsStr?.split(',').map(k => k.trim());
    
    // Extract author
    const authorMeta = document.querySelector('meta[name="author"]');
    const author = authorMeta?.getAttribute('content')?.trim();
    
    // Extract dates
    const publishedMeta = document.querySelector('meta[property="article:published_time"]');
    const publishedDate = publishedMeta?.getAttribute('content')
      ? new Date(publishedMeta.getAttribute('content') as string)
      : undefined;
    
    const modifiedMeta = document.querySelector('meta[property="article:modified_time"]');
    const modifiedDate = modifiedMeta?.getAttribute('content')
      ? new Date(modifiedMeta.getAttribute('content') as string)
      : undefined;
    
    return {
      title,
      description,
      keywords,
      author,
      publishedDate,
      modifiedDate
    };
  } catch (error) {
    getLogger().warn(`Failed to extract metadata: ${error}`, 'ContentExtractor');
    return { title: url };
  }
}

/**
 * Find the main content area of a document
 * @param document DOM document
 * @param options Extraction options
 * @returns Main content element or null
 */
function findMainContent(
  document: Document,
  options: ContentExtractionOptions
): Element | null {
  try {
    // Try to find the main content area using priority selectors
    if (options.prioritySelectors) {
      for (const selector of options.prioritySelectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      }
    }
    
    // Try to find article element
    const article = document.querySelector('article');
    if (article) {
      return article;
    }
    
    // Try to find main element
    const main = document.querySelector('main');
    if (main) {
      return main;
    }
    
    // Look for largest text block
    const textBlocks = findLargestTextBlocks(document, options);
    if (textBlocks.length > 0) {
      return textBlocks[0];
    }
    
    // Fallback to body
    return document.body;
  } catch (error) {
    getLogger().warn(`Failed to find main content: ${error}`, 'ContentExtractor');
    return document.body;
  }
}

/**
 * Find the largest text blocks in a document
 * @param document DOM document
 * @param options Extraction options
 * @returns Array of text block elements
 */
function findLargestTextBlocks(
  document: Document,
  options: ContentExtractionOptions
): Element[] {
  const blocks: { element: Element, textLength: number }[] = [];
  const elementsToCheck = document.querySelectorAll('div, section, article, main');
  
  for (const element of Array.from(elementsToCheck)) {
    // Skip elements that should be ignored
    if (options.ignoreSelectors && shouldIgnoreElement(element, options.ignoreSelectors)) {
      continue;
    }
    
    const text = extractTextContent(element);
    blocks.push({
      element,
      textLength: text.length
    });
  }
  
  // Sort by text length (largest first)
  blocks.sort((a, b) => b.textLength - a.textLength);
  
  // Return elements only
  return blocks.map(block => block.element);
}

/**
 * Check if an element should be ignored
 * @param element Element to check
 * @param ignoreSelectors Selectors to ignore
 * @returns Whether the element should be ignored
 */
function shouldIgnoreElement(element: Element, ignoreSelectors: string[]): boolean {
  for (const selector of ignoreSelectors) {
    if (element.matches(selector)) {
      return true;
    }
    
    // Check if element is a child of an ignored element
    let parent = element.parentElement;
    while (parent) {
      if (parent.matches(selector)) {
        return true;
      }
      parent = parent.parentElement;
    }
  }
  
  return false;
}

/**
 * Extract text content from an element
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
    getLogger().warn(`Failed to extract text content: ${error}`, 'ContentExtractor');
    return '';
  }
}

/**
 * Extract headings from a document
 * @param document DOM document
 * @returns Array of document headings
 */
function extractHeadings(document: Document): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  for (const element of Array.from(headingElements)) {
    const level = parseInt(element.tagName.substring(1));
    const id = element.getAttribute('id') || undefined;
    const text = element.textContent?.trim() || '';
    
    if (text) {
      headings.push({
        text,
        level,
        id
      });
    }
  }
  
  return headings;
}

/**
 * Extract code blocks from a document
 * @param document DOM document
 * @returns Array of code blocks
 */
function extractCodeBlocks(document: Document): CodeBlock[] {
  const codeBlocks: CodeBlock[] = [];
  
  // Look for <pre><code> blocks
  const preCodeBlocks = document.querySelectorAll('pre > code');
  for (const element of Array.from(preCodeBlocks)) {
    const pre = element.parentElement;
    if (!pre) continue;
    
    // Try to find language from class
    const classNames = Array.from(element.classList);
    let language: string | undefined;
    
    for (const className of classNames) {
      if (className.startsWith('language-')) {
        language = className.substring(9);
        break;
      }
    }
    
    const code = element.textContent?.trim() || '';
    if (code) {
      codeBlocks.push({
        code,
        language
      });
    }
  }
  
  // Look for other code blocks (fallback)
  const otherCodeBlocks = document.querySelectorAll('code:not(pre > code)');
  for (const element of Array.from(otherCodeBlocks)) {
    const code = element.textContent?.trim() || '';
    if (code && code.length > 20) { // Only include if it's reasonably long
      codeBlocks.push({
        code
      });
    }
  }
  
  return codeBlocks;
}

/**
 * Extract links from a document
 * @param document DOM document
 * @param baseUrl Base URL for resolving relative links
 * @returns Array of links
 */
function extractLinks(document: Document, baseUrl: string): string[] {
  const links: string[] = [];
  const linkElements = document.querySelectorAll('a[href]');
  
  for (const element of Array.from(linkElements)) {
    const href = element.getAttribute('href');
    if (!href) continue;
    
    try {
      // Resolve relative URLs
      const url = new URL(href, baseUrl).href;
      links.push(url);
    } catch (error) {
      // Invalid URL, skip
    }
  }
  
  return links;
}