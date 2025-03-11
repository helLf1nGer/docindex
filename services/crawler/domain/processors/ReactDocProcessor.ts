/**
 * React documentation processor
 * 
 * This processor specializes in handling the React documentation website,
 * understanding its structure, navigation patterns, and content organization.
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { BaseDocumentProcessor, DocumentProcessorOptions } from './DocumentProcessor.js';
import { ProcessedContent } from '../ContentProcessor.js';
import { extractUnifiedContent } from '../../../../shared/infrastructure/UnifiedContentExtractor.js';

const logger = getLogger();

/**
 * React documentation processor
 */
export class ReactDocProcessor extends BaseDocumentProcessor {
  // Common React documentation URL patterns
  private readonly urlPatterns = [
    /https?:\/\/(?:www\.)?reactjs\.org\/(?:docs|tutorial|blog)/i,
    /https?:\/\/(?:www\.)?react\.dev/i
  ];
  
  // Common React documenation sections
  private readonly sectionPatterns = [
    'Hooks', 'Components', 'API Reference', 'Props',
    'State', 'Context', 'Effects', 'Performance'
  ];
  
  /**
   * Create a new React documentation processor
   */
  constructor() {
    super('ReactDocProcessor');
    logger.debug('ReactDocProcessor initialized', 'ReactDocProcessor');
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
    
    // If HTML is provided, check for React-specific content patterns
    if (html) {
      // Look for React specific markers in the content
      if (html.includes('React') &&
          (html.includes('component') || 
           html.includes('jsx') || 
           html.includes('props') || 
           html.includes('state') ||
           html.includes('hook'))) {
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
    logger.debug(`Processing React documentation for URL: ${url}`, 'ReactDocProcessor');
    
    try {
      // Configure extraction options for React docs
      const extractionOptions = {
        comprehensive: true,
        debug: options?.debug || false,
        contentSelectors: [
          // Specific selectors for React documentation
          'article', // Main content area
          '.markdown', // Markdown content
          '.content', // Main content container
          '.theme-doc-markdown', // Docusaurus markdown
          '.docs-content', // Documentation content
          '.examples', // Examples sections
          'pre', // Code blocks
          '.gatsby-highlight', // Code highlights in Gatsby sites
        ],
        excludeSelectors: [
          // Elements to exclude from extraction
          '.toc',
          '.sidebar',
          '.pagination',
          '.navbar',
          '.hash-link',
          '.breadcrumbs',
          '.footer'
        ]
      };
      
      // Extract content using specialized options
      let extracted = extractUnifiedContent(html, url, extractionOptions);
      let textContent = extracted.textContent || '';
      
      // Special handling for specific types of React docs
      if (url.includes('/api/')) {
        textContent = this.enhanceApiDocumentation(textContent);
      } else if (url.includes('/hooks/')) {
        textContent = this.enhanceHooksDocumentation(textContent);
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
      
      // Extract React version information
      const reactVersion = this.extractReactVersion(html, url);
      
      // Enhance keywords with React specific terms
      const keywords = (extracted.metadata.keywords || []).concat(['react', 'javascript', 'ui', 'frontend', 'component']);
      
      // Extract document category (api, concepts, etc.)
      const category = this.extractDocumentCategory(url);
      if (category) {
        keywords.push(category, `react:${category}`);
      }
      
      // Create processed content with React-specific enhancements
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
          author: extracted.metadata.author || 'React Team',
          publishedDate: extracted.metadata.publishedDate,
          modifiedDate: extracted.metadata.modifiedDate
        }
      };
      
      // Add React version as a keyword if available
      if (reactVersion) {
        processed.metadata.keywords = [
          ...(processed.metadata.keywords || []),
          `react-version:${reactVersion}`
        ];
      }
      
      return processed;
    } catch (error) {
      logger.error(`Error processing React documentation for ${url}`, 'ReactDocProcessor', error);
      
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
   * Enhance API documentation content
   * @param content Original content
   * @returns Enhanced content
   */
  private enhanceApiDocumentation(content: string): string {
    // Format API documentation
    let enhanced = content;
    
    // Highlight function signatures
    enhanced = enhanced.replace(/(\w+)\((.*?)\)/g, '### $1($2) ###');
    
    // Format parameter descriptions
    enhanced = enhanced.replace(/(\w+): \((.*?)\) (.*?)(?=\n|\r|$)/g, 'Parameter $1 ($2): $3');
    
    return enhanced;
  }
  
  /**
   * Enhance documentation for React Hooks
   * @param content Original content
   * @returns Enhanced content
   */
  private enhanceHooksDocumentation(content: string): string {
    // Format Hooks documentation
    let enhanced = content;
    
    // Highlight hook names
    const hookRegex = /(use[A-Z][a-zA-Z]+)(\(.*?\))?/g;
    enhanced = enhanced.replace(hookRegex, '### Hook: $1$2 ###');
    
    return enhanced;
  }
  
  /**
   * Extract React version information from the page
   * @param html HTML content
   * @param url Page URL
   * @returns React version string if found
   */
  private extractReactVersion(html: string, url: string): string | undefined {
    // Try to extract from HTML
    const versionRegex = /React (?:version )?([0-9]+\.[0-9]+\.[0-9]+|[0-9]+\.[0-9]+)/i;
    const versionMatch = html.match(versionRegex);
    if (versionMatch) {
      return versionMatch[1];
    }
    
    // Try to extract from URL
    const urlVersionMatch = url.match(/\/v([0-9]+\.[0-9]+(?:\.[0-9]+)?)\//);
    if (urlVersionMatch) {
      return urlVersionMatch[1];
    }
    
    return undefined;
  }
  
  /**
   * Extract document category from URL
   * @param url URL to process
   * @returns Document category
   */
  private extractDocumentCategory(url: string): string | undefined {
    if (url.includes('/api/')) {
      return 'api';
    } else if (url.includes('/hooks/')) {
      return 'hooks';
    } else if (url.includes('/components/')) {
      return 'components';
    } else if (url.includes('/tutorial/')) {
      return 'tutorial';
    } else if (url.includes('/learn/')) {
      return 'learn';
    } else if (url.includes('/blog/')) {
      return 'blog';
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
      
      // Try to detect JSX/React code
      if (block.code.includes('<') && 
          (block.code.includes('/>') || 
           block.code.includes('</') || 
           block.code.includes('render') || 
           block.code.includes('useState') || 
           block.code.includes('Component'))) {
        return { ...block, language: 'jsx' };
      }
      
      // Try to detect JavaScript
      if (block.code.includes('function') || 
          block.code.includes('const ') || 
          block.code.includes('let ') || 
          block.code.includes('var ') ||
          block.code.includes('=>') ||
          block.code.includes('return ')) {
        return { ...block, language: 'javascript' };
      }
      
      // Try to detect HTML
      if (block.code.includes('<html') || 
          block.code.includes('<div') || 
          block.code.includes('<span')) {
        return { ...block, language: 'html' };
      }
      
      // Try to detect CSS
      if (block.code.includes('{') && 
          block.code.includes(':') && 
          (block.code.includes('px') || 
           block.code.includes('em') || 
           block.code.includes('color') || 
           block.code.includes('margin'))) {
        return { ...block, language: 'css' };
      }
      
      // Default to jsx for code blocks in React docs
      return { ...block, language: 'jsx' };
    });
  }
}