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
}

/**
 * Parameters for prioritization strategies
 */
export interface PrioritizationParams {
  /** URL or title patterns to prioritize */
  patterns?: string[];
  
  /** Number of concurrent requests */
  concurrency?: number;
  
  /** Additional strategy-specific parameters */
  [key: string]: any;
}

/**
 * Abstract base class for prioritization strategies
 */
export abstract class BasePrioritizationStrategy implements PrioritizationStrategy {
  protected patterns: string[];
  
  /**
   * Create a new prioritization strategy
   * 
   * @param params Prioritization parameters
   */
  constructor(protected params: PrioritizationParams = {}) {
    this.patterns = params.patterns || [];
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
   * Check if a URL matches any of the prioritization patterns
   * 
   * @param url URL to check
   * @returns Score adjustment based on pattern matches
   */
  protected getPatternMatchScore(url: string): number {
    let patternScore = 0;
    
    // Check against patterns
    for (const pattern of this.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          // Match found, boost priority by reducing score
          patternScore -= 20;
        }
      } catch (error) {
        // Invalid regex, skip
        console.warn(`Invalid regex pattern: ${pattern}`);
      }
    }
    
    // Special boost for important page indicators in URLs
    if (/\b(api|reference|doc|guide|tutorial|example|manual|handbook)\b/i.test(url)) {
      patternScore -= 15;
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
}