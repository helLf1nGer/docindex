/**
 * MDN Web Docs documentation processor
 * 
 * This processor specializes in handling the Mozilla Developer Network (MDN) Web Docs,
 * with knowledge of its structure, navigation patterns, and content organization.
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { BaseDocumentProcessor, DocumentProcessorOptions } from './DocumentProcessor.js';
import { ProcessedContent } from '../ContentProcessor.js';
import { extractUnifiedContent } from '../../../../shared/infrastructure/UnifiedContentExtractor.js';

const logger = getLogger();

/**
 * MDN Web Docs documentation processor
 */
export class MDNDocProcessor extends BaseDocumentProcessor {
  // Common MDN Web Docs URL patterns
  private readonly urlPatterns = [
    /https?:\/\/(?:www\.)?developer\.mozilla\.org\/(?:\w{2,3}(?:-\w{2})?\/)?docs/i
  ];
  
  // Common MDN sections
  private readonly sectionPatterns = [
    'Syntax', 'Parameters', 'Return value', 'Examples', 'Browser compatibility',
    'See also', 'Specifications', 'Notes'
  ];
  
  /**
   * Create a new MDN Web Docs documentation processor
   */
  constructor() {
    super('MDNDocProcessor');
    logger.debug('MDNDocProcessor initialized', 'MDNDocProcessor');
  }
  
  /**
   * Check if the processor can handle a specific source
   * @param url The source URL to check
   * @param html HTML content of the page (optional)
   * @returns True if the processor can handle the source
   */
  canHandle(url: string, html?: string): boolean {
    // Check URL patterns
    for (const pattern of this.urlPatterns) {
      if (pattern.test(url)) {
        return true;
      }
    }
    
    // If HTML is provided, check for MDN-specific content patterns
    if (html) {
      // Look for MDN specific markers in the content
      if (html.includes('MDN Web Docs') ||
          html.includes('mozilla.org') ||
          html.includes('mdn.mozillademos.org') ||
          html.includes('class="page-content"')) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Process the document content
   * @param html HTML content of the page
   * @param url The source URL
   * @param options Processing options
   * @returns Processed content
   */
  process(html: string, url: string, options?: DocumentProcessorOptions): ProcessedContent {
    logger.debug(`Processing MDN documentation for URL: ${url}`, 'MDNDocProcessor');
    
    try {
      // Configure extraction options for MDN docs
      const extractionOptions = {
        comprehensive: true,
        debug: options?.debug || false,
        contentSelectors: [
          // Specific selectors for MDN documentation
          'article', // Main content area in MDN docs
          '.page-content', // Main content container
          '.main-content', // Main content in newer MDN
          '.article__intro', // Introduction
          '.section-content', // Section content
          '.syntaxbox', // Syntax examples
          '.example-code', // Code examples
          '.browserCompatibility' // Browser compatibility tables
        ],
        excludeSelectors: [
          // Elements to exclude from extraction
          '.on-github',
          '.document-actions',
          '.dropdown',
          '.newsletter-box',
          '.metadata',
          '.navigation-skip-links'
        ]
      };
      
      // Extract content using specialized options
      let extracted = extractUnifiedContent(html, url, extractionOptions);
      let textContent = extracted.textContent || '';
      
      // Apply processing pipeline based on options
      const processingOptions = options?.processing || {};
      
      // Apply HTML to Markdown conversion if requested
      if (processingOptions.convertToMarkdown) {
        textContent = this.convertToMarkdown(extracted.textContent || '');
      }
      
      // Apply deduplication if requested
      if (processingOptions.deduplicate) {
        textContent = this.deduplicateContent(textContent);
      }
      
      // Apply chunking if requested
      let chunks: string[] = [textContent];
      if (processingOptions.chunk) {
        chunks = this.chunkContent(textContent, processingOptions.maxChunkSize || 500);
      }
      
      // Extract technology category from URL
      const techCategory = this.extractTechCategory(url);
      
      // Extract language from URL (en, fr, etc.)
      const language = this.extractLanguage(url);
      
      // Enhance keywords with MDN-specific terms and category
      let keywords = extracted.metadata.keywords || [];
      if (techCategory) {
        keywords = keywords.concat([techCategory, `mdn:${techCategory}`]);
      }
      keywords = keywords.concat(['mdn', 'mozilla', 'web', 'documentation']);
      
      // Create processed content with MDN-specific enhancements
      const processed: ProcessedContent = {
        title: extracted.metadata.title || this.extractTitleFromUrl(url),
        htmlContent: html,
        textContent: textContent,
        headings: extracted.headings,
        codeBlocks: this.enhanceCodeBlocks(extracted.codeBlocks || [], techCategory),
        links: extracted.links || [],
        metadata: {
          description: extracted.metadata.description,
          keywords: keywords,
          author: extracted.metadata.author || 'Mozilla Contributors',
          publishedDate: extracted.metadata.publishedDate,
          modifiedDate: extracted.metadata.modifiedDate
        }
      };
      
      // Add language information as a tag if available
      if (language) {
        processed.metadata.keywords = [
          ...(processed.metadata.keywords || []),
          `lang:${language}`
        ];
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing MDN documentation for ${url}`, 'MDNDocProcessor', error);
      
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
   * Extract technology category from MDN URL
   * @param url URL to process
   * @returns Extracted technology category (JavaScript, CSS, HTML, etc.)
   */
  private extractTechCategory(url: string): string | undefined {
    const patterns = [
      { regex: /\/JavaScript\//i, value: 'javascript' },
      { regex: /\/CSS\//i, value: 'css' },
      { regex: /\/HTML\//i, value: 'html' },
      { regex: /\/Web\/API\//i, value: 'web-api' },
      { regex: /\/WebAssembly\//i, value: 'webassembly' },
      { regex: /\/HTTP\//i, value: 'http' },
      { regex: /\/Web\/Accessibility\//i, value: 'accessibility' }
    ];
    
    for (const pattern of patterns) {
      if (pattern.regex.test(url)) {
        return pattern.value;
      }
    }
    
    return undefined;
  }
  
  /**
   * Extract language code from MDN URL
   * @param url URL to process
   * @returns Language code (en, fr, ja, etc.)
   */
  private extractLanguage(url: string): string | undefined {
    const langMatch = url.match(/developer\.mozilla\.org\/(\w{2}(?:-\w{2})?)\//i);
    if (langMatch) {
      return langMatch[1].toLowerCase();
    }
    return undefined;
  }
  
  /**
   * Extract title from URL when metadata title is not available
   * @param url URL to process
   * @returns Extracted title
   */
  private extractTitleFromUrl(url: string): string {
    // Extract the last part of the URL as the title
    const titleMatch = url.match(/\/([^/]+)\/?(?:\?.*)?$/);
    if (titleMatch) {
      // Clean up the title: replace hyphens with spaces and capitalize
      return titleMatch[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
    return url;
  }
  
  /**
   * Enhance code blocks with language information based on context
   * @param codeBlocks Original code blocks
   * @param techCategory Technology category (javascript, css, html, etc.)
   * @returns Enhanced code blocks
   */
  private enhanceCodeBlocks(
    codeBlocks: { code: string, language?: string }[],
    techCategory?: string
  ): { code: string, language?: string }[] {
    return codeBlocks.map(block => {
      // If language is already specified, keep it
      if (block.language) {
        return block;
      }
      
      // Try to detect language based on content
      if (block.code.includes('<html') || 
          block.code.includes('<body') || 
          block.code.includes('<div')) {
        return { ...block, language: 'html' };
      }
      
      if (block.code.includes('{') && 
          (block.code.includes(':') || block.code.includes('@media'))) {
        return { ...block, language: 'css' };
      }
      
      if (block.code.includes('function') || 
          block.code.includes('var ') || 
          block.code.includes('let ') || 
          block.code.includes('const ') || 
          block.code.includes('return ') || 
          block.code.includes('=>')){
        return { ...block, language: 'javascript' };
      }
      
      // Use technology category as fallback
      if (techCategory) {
        return { ...block, language: techCategory };
      }
      
      return block;
    });
  }
}