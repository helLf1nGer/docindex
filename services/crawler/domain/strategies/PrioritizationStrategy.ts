/**
 * Enhanced prioritization strategy interface with improved pattern matching,
 * content-type recognition, and domain-specific scoring capabilities.
 */
/**
 * Interface for URL prioritization strategies
 * 
 * This interface defines the contract for different URL prioritization strategies
 * that can be used by the crawler to determine the order in which URLs are processed.
 */
export interface PrioritizationStrategy {
  /**
   * Calculate a priority score for a URL
   * 
   * Lower scores have higher priority
   * 
   * @param url URL to score
   * @param depth Depth level of the URL in the crawl tree
   * @param parentUrl URL that linked to this URL
   * @returns Priority score (lower is higher priority)
   */
  scoreUrl(url: string, depth: number, parentUrl: string): number;
  
  /**
   * Name of the strategy
   */
  readonly name: string;
  
  /**
   * Sort a queue of URLs based on their priority scores
   * 
   * @param queue Queue of URLs with priority scores
   */
  sortQueue(queue: Array<{url: string, depth: number, parentUrl: string, score: number}>): void;
  
  /**
   * Compare two queue items to determine their relative priority
   * 
   * @param a First queue item
   * @param b Second queue item
   * @returns Negative if a has higher priority, positive if b has higher priority
   */
  compareItems(a: {url: string, depth: number, parentUrl: string, score: number}, 
               b: {url: string, depth: number, parentUrl: string, score: number}): number;
}

/**
 * Parameters for prioritization strategies
 */
export interface PrioritizationParams {
  /** URL or title patterns to prioritize */
  patterns?: string[];
  
  /** Weight patterns (for weighted prioritization) */
  patternWeights?: {
    [pattern: string]: number;
  };
  
  /** Number of concurrent requests */
  concurrency?: number;
  
  /** Domain-specific priorities */
  domainPriorities?: {
    [domain: string]: number;
  };
  
  /** Content type priorities */
  contentTypePriorities?: {
    [contentType: string]: number;
  };
  
  /** Extension priorities (file types) */
  extensionPriorities?: {
    [extension: string]: number;
  };
  
  /** Custom scoring function */
  customScoringFunction?: (url: string, depth: number, parentUrl: string) => number;
  
  /** Additional strategy-specific parameters */
  [key: string]: any;
}

/**
 * Patterns that identify documentation-focused content
 */
export const DOC_PATTERNS = {
  // Documentation sections
  DOCUMENTATION: /\b(docs?|documentation|manual|reference|guide|tutorial|learn|help|support|faq|readme|wiki)\b/i,
  
  // API references
  API: /\b(api|apis|methods|functions|reference|endpoints?|interfaces?|classes|modules|namespaces?|sdk)\b/i,
  
  // Examples and tutorials
  EXAMPLES: /\b(examples?|tutorials?|quickstart|how-to|howto|get-started|learn|playground|demo|sample)\b/i
};

/**
 * Abstract base class for prioritization strategies
 */
export abstract class BasePrioritizationStrategy implements PrioritizationStrategy {
  protected patterns: string[];
  protected patternWeights: {[pattern: string]: number};
  protected domainPriorities: {[domain: string]: number};
  protected contentTypePriorities: {[contentType: string]: number};
  protected extensionPriorities: {[extension: string]: number};
  protected customScoringFunction?: (url: string, depth: number, parentUrl: string) => number;
  protected logger = console;
  
  /**
   * Create a new prioritization strategy
   * 
   * @param params Prioritization parameters
   */
  constructor(protected params: PrioritizationParams = {}) {
    this.patterns = params.patterns || [];
    this.patternWeights = params.patternWeights || {};
    this.domainPriorities = params.domainPriorities || {};
    this.contentTypePriorities = params.contentTypePriorities || {};
    this.extensionPriorities = params.extensionPriorities || {};
    this.customScoringFunction = params.customScoringFunction;
  }
  
  /**
   * Calculate a priority score for a URL
   * 
   * @param url URL to score
   * @param depth Depth level of the URL
   * @param parentUrl URL that linked to this URL
   */
  abstract scoreUrl(url: string, depth: number, parentUrl: string): number;
  
  /**
   * Name of the strategy
   */
  abstract get name(): string;
  
  /**
   * Compare two queue items to determine their relative priority
   * 
   * @param a First queue item
   * @param b Second queue item
   * @returns Negative if a has higher priority, positive if b has higher priority
   */
  compareItems(a: {url: string, depth: number, parentUrl: string, score: number}, 
               b: {url: string, depth: number, parentUrl: string, score: number}): number {
    return a.score - b.score;
  }
  
  /**
   * Check if a URL matches any of the prioritization patterns
   * 
   * @param url URL to check
   * @returns Score adjustment based on pattern matches
   */
  protected getPatternMatchScore(url: string): number {
    let patternScore = 0;
    let domain = '';
    
    // Extract domain for domain-based prioritization
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
      
      // Apply domain-specific priority if configured
      if (domain in this.domainPriorities) {
        patternScore += this.domainPriorities[domain];
      }
      
      // Extract file extension for extension-based prioritization
      const pathname = urlObj.pathname;
      const extension = pathname.split('.').pop()?.toLowerCase();
      
      if (extension && extension in this.extensionPriorities) {
        patternScore += this.extensionPriorities[extension];
      }
    } catch (error) {
      // Invalid URL, can't extract domain
      this.logger.warn(`Invalid URL for domain extraction: ${url}`);
    }
    
    // Check against configured patterns
    // Patterns are regular expressions that match URLs
    for (const pattern of this.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          // Match found, boost priority by reducing score
          patternScore -= 20;
        }
      } catch (error) {
        // Invalid regex, skip
        this.logger.warn(`Invalid regex pattern: ${pattern}`);
      }
    }
    
    // Apply weighted patterns
    if (Object.keys(this.patternWeights).length > 0) {
      for (const [pattern, weight] of Object.entries(this.patternWeights)) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(url)) {
            patternScore += weight;
          }
        } catch (error) {
          this.logger.warn(`Invalid weighted pattern: ${pattern}`);
        }
      }
    }
    
    // Detect documentation-focused content
    if (DOC_PATTERNS.DOCUMENTATION.test(url)) {
      patternScore -= 20; // Boost documentation
    }
    
    if (DOC_PATTERNS.API.test(url)) {
      patternScore -= 25; // Boost API docs even more
    }
    
    if (DOC_PATTERNS.EXAMPLES.test(url)) {
      patternScore -= 20; // Boost examples and tutorials
    }
    
    // Detect and prioritize important file types
    if (url.endsWith('.md') || url.endsWith('.mdx')) {
      patternScore -= 15; // Markdown files likely contain documentation
    }
    
    if (url.endsWith('.html') || url.endsWith('.htm')) {
      patternScore -= 5; // HTML files might contain documentation
    }
    
    // Deprioritize certain file types
    if (/\.(css|js|png|jpg|jpeg|gif|svg|woff|ttf|eot)$/i.test(url)) {
      patternScore += 30; // Lower priority for assets
    }
    
    // Apply custom scoring function if provided
    if (this.customScoringFunction) {
      try {
        patternScore += this.customScoringFunction(url, 0, '');
      } catch (error) {
        this.logger.warn(`Error in custom scoring function: ${error}`);
      }
    }
    
    return patternScore;
  }
  
  /**
   * Sort a queue of URLs based on their priority scores
   * 
   * @param queue Queue of URLs with priority scores
   */
  sortQueue(queue: Array<{url: string, depth: number, parentUrl: string, score: number}>): void {
    queue.sort((a, b) => a.score - b.score);
  }
  
  /**
   * Detect if a URL seems to be part of a documentation site
   * 
   * @param url URL to check
   * @returns True if the URL likely points to documentation
   */
  protected isDocumentationUrl(url: string): boolean {
    // Check for common documentation path patterns
    return (
      DOC_PATTERNS.DOCUMENTATION.test(url) ||
      DOC_PATTERNS.API.test(url) ||
      DOC_PATTERNS.EXAMPLES.test(url) ||
      /\/(docs?|api|reference|guide|tutorial|manual|handbook|help)\//i.test(url) ||
      /\.(md|mdx|rst|asciidoc|adoc|txt)$/i.test(url)
    );
  }
}