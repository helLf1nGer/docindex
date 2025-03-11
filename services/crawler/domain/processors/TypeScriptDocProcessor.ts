/**
 * TypeScript documentation processor
 * 
 * This processor specializes in handling the TypeScript documentation website,
 * understanding its structure, navigation patterns, and content organization.
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { BaseDocumentProcessor, DocumentProcessorOptions } from './DocumentProcessor.js';
import { ProcessedContent } from '../ContentProcessor.js';
import { extractUnifiedContent } from '../../../../shared/infrastructure/UnifiedContentExtractor.js';

const logger = getLogger();

/**
 * TypeScript documentation processor
 */
export class TypeScriptDocProcessor extends BaseDocumentProcessor {
  // Common TypeScript documentation URL patterns
  private readonly urlPatterns = [
    /https?:\/\/(?:www\.)?typescriptlang\.org\/(?:docs|play)/i,
    /https?:\/\/(?:www\.)?typescript(?:lang)?\.org/i
  ];
  
  // Important TypeScript documentation sections
  private readonly sectionPatterns = [
    'Interface', 'Type', 'Class', 'Enum', 'Function', 
    'Namespace', 'Declaration', 'Generic', 'Parameter', 'Module'
  ];
  
  /**
   * Create a new TypeScript documentation processor
   */
  constructor() {
    super('TypeScriptDocProcessor');
    logger.debug('TypeScriptDocProcessor initialized', 'TypeScriptDocProcessor');
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
    
    // If HTML is provided, check for TypeScript-specific content patterns
    if (html) {
      // Look for TypeScript specific markers in the content
      if (html.includes('TypeScript') ||
          html.includes('typescriptlang.org') ||
          html.includes('Microsoft Corporation') && 
          (html.includes('type') || html.includes('interface'))) {
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
    logger.debug(`Processing TypeScript documentation for URL: ${url}`, 'TypeScriptDocProcessor');
    
    try {
      // Configure extraction options for TypeScript docs
      const extractionOptions = {
        comprehensive: true,
        debug: options?.debug || false,
        contentSelectors: [
          // Specific selectors for TypeScript documentation
          'article', // Main content area
          '.documentation', // Documentation container
          '.main-content', // Main content container
          '.markdown', // Markdown content
          '.tsconfig', // TSConfig reference
          '.handbook-content', // TypeScript handbook content
          'pre', // Code blocks
          '.signature-code', // TypeScript signatures
        ],
        excludeSelectors: [
          // Elements to exclude from extraction
          '.toc',
          '.tabs',
          '.sidebar',
          '.site-footer',
          '.announcement',
          '.docs-footer',
          '.docs-actions'
        ]
      };
      
      // Extract content using specialized options
      let extracted = extractUnifiedContent(html, url, extractionOptions);
      let textContent = extracted.textContent || '';
      
      // Special handling for TypeScript specific pages
      if (url.includes('/tsconfig/')) {
        textContent = this.enhanceTSConfigContent(textContent);
      } else if (url.includes('/handbook/')) {
        textContent = this.enhanceHandbookContent(textContent);
      }
      
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
      
      // Extract TypeScript version information
      const tsVersion = this.extractTypeScriptVersion(html, url);
      
      // Enhance keywords with TypeScript specific terms
      const keywords = (extracted.metadata.keywords || []).concat(['typescript', 'ts', 'static typing', 'javascript']);
      
      // Extract document category (handbook, reference, etc.)
      const category = this.extractDocumentCategory(url);
      if (category) {
        keywords.push(category, `ts:${category}`);
      }
      
      // Create processed content with TypeScript-specific enhancements
      const processed: ProcessedContent = {
        title: extracted.metadata.title || this.extractTitleFromUrl(url),
        htmlContent: html,
        textContent: textContent,
        headings: extracted.headings,
        codeBlocks: this.enhanceCodeBlocks(extracted.codeBlocks || []),
        links: extracted.links || [],
        metadata: {
          description: extracted.metadata.description,
          keywords: keywords,
          author: extracted.metadata.author || 'Microsoft Corporation',
          publishedDate: extracted.metadata.publishedDate,
          modifiedDate: extracted.metadata.modifiedDate
        }
      };
      
      // Add TypeScript version as a keyword if available
      if (tsVersion) {
        processed.metadata.keywords = [
          ...(processed.metadata.keywords || []),
          `ts-version:${tsVersion}`
        ];
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing TypeScript documentation for ${url}`, 'TypeScriptDocProcessor', error);
      
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
   * Enhance TSConfig reference content
   * @param content Original content
   * @returns Enhanced content
   */
  private enhanceTSConfigContent(content: string): string {
    // Format TSConfig properties and options
    let enhanced = content;
    
    // Highlight option names
    enhanced = enhanced.replace(/("[\w.-]+"):\s/g, '### Option: $1 ###\n');
    
    // Format descriptions of boolean options
    enhanced = enhanced.replace(/(true|false) -\s+([^.]+)/g, '$1 - **$2**');
    
    return enhanced;
  }
  
  /**
   * Enhance TypeScript handbook content
   * @param content Original content
   * @returns Enhanced content
   */
  private enhanceHandbookContent(content: string): string {
    // Format TypeScript handbook content
    let enhanced = content;
    
    // Highlight TypeScript keywords
    for (const keyword of ['interface', 'type', 'class', 'enum', 'namespace', 'module', 'declare', 'extends', 'implements']) {
      const regex = new RegExp(`\\b${keyword}\\b(?=\\s+\\w+)`, 'g');
      enhanced = enhanced.replace(regex, `**${keyword}**`);
    }
    
    return enhanced;
  }
  
  /**
   * Extract TypeScript version information from the page
   * @param html HTML content
   * @param url Page URL
   * @returns TypeScript version string if found
   */
  private extractTypeScriptVersion(html: string, url: string): string | undefined {
    // Try to extract from URL first
    const urlVersionMatch = url.match(/\/v([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
    if (urlVersionMatch) {
      return urlVersionMatch[1];
    }
    
    // Try to extract from HTML
    const htmlVersionMatch = html.match(/TypeScript\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
    if (htmlVersionMatch) {
      return htmlVersionMatch[1];
    }
    
    return undefined;
  }
  
  /**
   * Extract document category from URL
   * @param url URL to process
   * @returns Document category
   */
  private extractDocumentCategory(url: string): string | undefined {
    if (url.includes('/handbook/')) {
      return 'handbook';
    } else if (url.includes('/reference/')) {
      return 'reference';
    } else if (url.includes('/tsconfig/')) {
      return 'tsconfig';
    } else if (url.includes('/release-notes/')) {
      return 'release-notes';
    } else if (url.includes('/play/')) {
      return 'playground';
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
   * Enhance code blocks with language information
   * @param codeBlocks Original code blocks
   * @returns Enhanced code blocks
   */
  private enhanceCodeBlocks(codeBlocks: { code: string, language?: string }[]): { code: string, language?: string }[] {
    return codeBlocks.map(block => {
      // If language is already specified, keep it
      if (block.language) {
        return block;
      }
      
      // Check for TypeScript code patterns
      if (block.code.includes(':') && 
          (block.code.includes('interface') || 
           block.code.includes('type ') || 
           block.code.includes('class ') ||
           block.code.includes('function ') ||
           block.code.includes('const ') ||
           block.code.includes('let '))) {
        return { ...block, language: 'typescript' };
      }
      
      // Check for JSON (likely tsconfig)
      if (block.code.includes('{') && 
          block.code.includes('}') && 
          block.code.includes(':') && 
          block.code.includes('"')) {
        return { ...block, language: 'json' };
      }
      
      // Check for shell commands
      if (block.code.includes('tsc ') || 
          block.code.includes('npm ') ||
          block.code.includes('$ ')) {
        return { ...block, language: 'bash' };
      }
      
      // Default to typescript for code blocks in TypeScript docs
      return { ...block, language: 'typescript' };
    });
  }
}