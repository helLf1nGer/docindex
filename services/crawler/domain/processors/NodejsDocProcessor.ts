/**
 * Node.js documentation processor
 * 
 * This processor specializes in handling the Node.js documentation website,
 * with knowledge of its structure, navigation patterns, and content organization.
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { BaseDocumentProcessor, DocumentProcessorOptions } from './DocumentProcessor.js';
import { ProcessedContent } from '../ContentProcessor.js';
import { extractUnifiedContent } from '../../../../shared/infrastructure/UnifiedContentExtractor.js';

const logger = getLogger();

/**
 * Node.js documentation processor
 */
export class NodejsDocProcessor extends BaseDocumentProcessor {
  // Common Node.js documentation URL patterns
  private readonly urlPatterns = [
    /https?:\/\/nodejs\.org\/(?:api|docs|en|dist)/i,
    /https?:\/\/(?:www\.)?node\.js\.org/i
  ];
  
  // API documentation section headers
  private readonly apiSectionPatterns = [
    'Class:', 'Method:', 'Event:', 'Module:', 'Constructor:'
  ];
  
  /**
   * Create a new Node.js documentation processor
   */
  constructor() {
    super('NodejsDocProcessor');
    logger.debug('NodejsDocProcessor initialized', 'NodejsDocProcessor');
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
    
    // If HTML is provided, check for Node.js-specific content patterns
    if (html) {
      // Look for Node.js specific markers in the content
      if (html.includes('Node.js JavaScript runtime') ||
          html.includes('nodejs.org') ||
          html.includes('id="apicontent"')) {
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
    logger.debug(`Processing Node.js documentation for URL: ${url}`, 'NodejsDocProcessor');
    
    try {
      // Configure extraction options for Node.js docs
      const extractionOptions = {
        comprehensive: true,
        debug: options?.debug || false,
        contentSelectors: [
          // Specific selectors for Node.js documentation
          '#column2', // Main content area in Node.js docs
          '#apicontent', // API documentation content
          '.api_stability', // API stability notices
          'pre.api_metadata', // API metadata
          'pre.js', // Code examples
          '#toc', // Table of contents
        ],
        excludeSelectors: [
          // Elements to exclude from extraction
          'footer',
          '.toolbar',
          '#column4', // Right sidebar
        ]
      };
      
      // Extract content using specialized options
      let extracted = extractUnifiedContent(html, url, extractionOptions);
      let textContent = extracted.textContent || '';
      
      // Special handling for API documentation
      if (url.includes('/api/')) {
        textContent = this.processApiDocumentation(textContent, extracted.headings || []);
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
      
      // Extract specific Node.js version information
      const nodeVersion = this.extractNodeVersion(html, url);
      
      // Enhance keywords with Node.js specific terms
      const keywords = (extracted.metadata.keywords || []).concat(['node.js', 'nodejs', 'javascript', 'runtime']);
      
      // Create processed content with Node.js-specific enhancements
      const processed: ProcessedContent = {
        title: this.enhanceTitle(extracted.metadata.title || '', url),
        htmlContent: html,
        textContent: textContent,
        headings: extracted.headings,
        codeBlocks: this.enhanceCodeBlocks(extracted.codeBlocks || []),
        links: extracted.links || [],
        metadata: {
          description: extracted.metadata.description,
          keywords: keywords,
          author: extracted.metadata.author || 'Node.js Foundation',
          publishedDate: extracted.metadata.publishedDate,
          modifiedDate: extracted.metadata.modifiedDate
        }
      };
       
     // Store Node.js specific information in tags instead of custom metadata
      if (nodeVersion) {
        processed.metadata.keywords = [
          ...(processed.metadata.keywords || []),
          `node-version:${nodeVersion}`
        ];
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing Node.js documentation for ${url}`, 'NodejsDocProcessor', error);
      
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

   * Special processing for Node.js API documentation
   * @param content Original content
   * @param headings Extracted headings
   * @returns Enhanced content
   */
  private processApiDocumentation(content: string, headings: { text: string, level: number, id?: string }[]): string {
    // Add section markers for important API sections
    let enhancedContent = content;
    
    // Annotate stability information
    enhancedContent = enhancedContent.replace(
      /(Stability: [0-9] - (?:Deprecated|Experimental|Stable|Legacy))/g,
      '### $1 ###'
    );
    
    // Improve formatting of method signatures
    enhancedContent = enhancedContent.replace(
      /\`([^`]+\((?:[^`])*\))\`/g,
      '### Method: `$1` ###'
    );
    
    return enhancedContent;
  }
  
  /**
   * Extract Node.js version information from the page
   * @param html HTML content
   * @param url Page URL
   * @returns Node.js version string if found
   */
  private extractNodeVersion(html: string, url: string): string | undefined {
    // Try to extract from URL first
    const urlVersionMatch = url.match(/\/v([0-9]+\.[0-9]+\.[0-9]+)\/|\/v([0-9]+\.[0-9]+)\/|\/([0-9]+\.[0-9]+\.[0-9]+)\/|\/([0-9]+\.[0-9]+)\//);
    if (urlVersionMatch) {
      return urlVersionMatch[1] || urlVersionMatch[2] || urlVersionMatch[3] || urlVersionMatch[4];
    }
    
    // Try to extract from HTML
    const htmlVersionMatch = html.match(/Node\.js v([0-9]+\.[0-9]+\.[0-9]+)|Node\.js v([0-9]+\.[0-9]+)/);
    if (htmlVersionMatch) {
      return htmlVersionMatch[1] || htmlVersionMatch[2];
    }
    
    return undefined;
  }
  
  /**
   * Enhance the title with additional context if needed
   * @param title Original title
   * @param url Page URL
   * @returns Enhanced title
   */
  private enhanceTitle(title: string, url: string): string {
    if (!title.includes('Node.js') && !title.includes('nodejs')) {
      // Add Node.js context to the title if not present
      if (url.includes('/api/')) {
        const apiNameMatch = url.match(/\/api\/([^/#?]+)/);
        if (apiNameMatch) {
          return `Node.js API: ${apiNameMatch[1]} - ${title}`;
        }
        return `Node.js API - ${title}`;
      }
      return `Node.js - ${title}`;
    }
    return title;
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
      
      // Try to detect JavaScript/Node.js code
      if (block.code.includes('require(') || 
          block.code.includes('import ') || 
          block.code.includes('module.exports') ||
          block.code.includes('console.log') ||
          block.code.includes('process.') ||
          block.code.includes('async ') ||
          block.code.includes('await ')) {
        return { ...block, language: 'javascript' };
      }
      
      // Try to detect shell commands
      if (block.code.includes('node ') || 
          block.code.includes('npm ') ||
          block.code.includes('$ ')) {
        return { ...block, language: 'bash' };
      }
      
      return block;
    });
  }
}