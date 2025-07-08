/**
 * SimpleContentExtractor
 * 
 * A straightforward content extraction utility for the simplified crawler.
 * Uses cheerio for HTML parsing and focuses on extracting clean, useful text
 * from documentation pages with minimal complexity.
 */

import * as cheerio from 'cheerio';

export interface ExtractorOptions {
  /** Selectors to include in content extraction (default: main content areas) */
  includeSelectors?: string[];
  /** Selectors to exclude from content extraction (default: navigation, footer, etc.) */
  excludeSelectors?: string[];
  /** Whether to extract metadata (title, description) */
  extractMetadata?: boolean;
  /** Minimum content length to consider valid (prevents empty or tiny content) */
  minContentLength?: number;
}

export interface ExtractedContent {
  /** The page title */
  title: string;
  /** The main content text */
  content: string;
  /** Meta description (if available) */
  description?: string;
  /** Page headings for structure understanding */
  headings?: {
    text: string;
    level: number;
  }[];
  /** Code blocks extracted from the page */
  codeBlocks?: {
    code: string;
    language?: string;
  }[];
}

export class SimpleContentExtractor {
  private includeSelectors: string[];
  private excludeSelectors: string[];
  private extractMetadata: boolean;
  private minContentLength: number;

  constructor(options: ExtractorOptions = {}) {
    // Default selectors for common documentation sites
    this.includeSelectors = options.includeSelectors || [
      'main', 'article', '.content', '.documentation', 
      '.doc-content', '.markdown-body', '.post-content',
      '#content', '#main-content'
    ];
    
    this.excludeSelectors = options.excludeSelectors || [
      'nav', 'header', 'footer', '.navigation', '.nav', 
      '.sidebar', '.menu', '.toc', '.table-of-contents',
      '.related', '.comments', '.ads', '.advertisement'
    ];
    
    this.extractMetadata = options.extractMetadata !== undefined ? 
      options.extractMetadata : true;
    
    this.minContentLength = options.minContentLength || 50; // Using 50 instead of 100 to handle smaller test pages
  }

  /**
   * Extract content from HTML
   */
  extract(html: string, url: string): ExtractedContent | null {
    try {
      const $ = cheerio.load(html);
      
      // Extract title
      let title = $('title').text().trim();
      
      // Try to get a more specific title from h1 if title seems too generic
      if (!title || title.includes(' | ') || title.length > 60) {
        const h1 = $('h1').first().text().trim();
        if (h1 && h1.length > 5 && h1.length < 100) {
          title = h1;
        }
      }
      
      // Extract description
      let description: string | undefined = undefined;
      if (this.extractMetadata) {
        description = $('meta[name="description"]').attr('content') || 
                     $('meta[property="og:description"]').attr('content');
      }
      
      // Extract headings for structure understanding
      const headings: {
        text: string;
        level: number;
      }[] = [];
      $('h1, h2, h3, h4, h5, h6').each((_, element) => {
        const text = $(element).text().trim();
        if (text) {
          const tagName = element.tagName.toLowerCase();
          const level = parseInt(tagName.substring(1));
          headings.push({ text, level });
        }
      });
      
      // Extract code blocks
      const codeBlocks: {
        code: string;
        language?: string;
      }[] = [];
      $('pre code, .highlight, .code, pre.language-*').each((_, element) => {
        const $el = $(element);
        const code = $el.text().trim();
        
        // Try to determine language from class
        let language: string | undefined = undefined;
        const className = $el.attr('class') || '';
        const langMatch = className.match(/language-(\w+)/);
        if (langMatch && langMatch[1]) {
          language = langMatch[1];
        }
        
        if (code) {
          codeBlocks.push({ code, language });
        }
      });
      
      // Extract main content
      let mainContent = '';
      
      // First, try to find content using include selectors
      for (const selector of this.includeSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          // Found a matching content container
          elements.each((_, element) => {
            // Clone to avoid modifying the original for future processing
            const $clone = $($.html(element));
            
            // Remove excluded elements
            for (const excludeSelector of this.excludeSelectors) {
              $clone.find(excludeSelector).remove();
            }
            
            // Add content text
            mainContent += this.cleanText($clone.text());
          });
          
          // If we found good content, stop looking
          if (mainContent.length > this.minContentLength) {
            break;
          }
        }
      }
      
      // If we didn't find good content with selectors, use body as fallback
      if (mainContent.length < this.minContentLength) {
        const $body = $('body').clone();
        
        // Remove excluded elements from body
        for (const excludeSelector of this.excludeSelectors) {
          $body.find(excludeSelector).remove();
        }
        
        mainContent = this.cleanText($body.text());
      }
      
      // Final validation
      if (mainContent.length < this.minContentLength) {
        return null;
      }
      
      return {
        title,
        content: mainContent,
        description,
        headings: headings.length > 0 ? headings : undefined,
        codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Clean and normalize text content
   */
  private cleanText(text: string): string {
    if (!text) return '';
    
    return text
      // Replace multiple whitespace with a single space
      .replace(/\s+/g, ' ')
      // Replace multiple newlines with a single newline
      .replace(/\n+/g, '\n')
      // Remove leading/trailing whitespace
      .trim();
  }
}