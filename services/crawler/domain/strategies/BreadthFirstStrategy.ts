import { BasePrioritizationStrategy, PrioritizationParams } from './PrioritizationStrategy.js';

/**
 * Breadth-first prioritization strategy
 * 
 * This strategy prioritizes URLs with lower depth levels, ensuring that
 * all URLs at a given depth are processed before moving to the next depth.
 * Within the same depth level, pattern matching is used to prioritize important URLs.
 */
export class BreadthFirstStrategy extends BasePrioritizationStrategy {
  /**
   * Create a new breadth-first prioritization strategy
   * 
   * @param params Prioritization parameters
   */
  constructor(params: PrioritizationParams = {}) {
    super(params);
  }
  
  /**
   * Calculate a priority score for a URL using breadth-first strategy
   * 
   * @param url URL to score
   * @param depth Depth level of the URL
   * @param parentUrl URL that linked to this URL
   * @returns Priority score (lower is higher priority)
   */
  scoreUrl(url: string, depth: number, parentUrl: string): number {
    // Base score is depth * 10 (lower depth = higher priority)
    let score = depth * 10;
    
    // Apply pattern matching score adjustment
    score += this.getPatternMatchScore(url);
    
    // URLs with no file extension (likely directory index pages) get a slight boost
    if (!url.match(/\.[a-zA-Z0-9]{2,4}(\?|#|$)/)) {
      score -= 5;
    }
    
    return score;
  }
  
  /**
   * Name of the strategy
   */
  get name(): string {
    return 'breadth-first';
  }
}