import { BasePrioritizationStrategy, PrioritizationParams } from './PrioritizationStrategy.js';

/**
 * Depth-first prioritization strategy
 * 
 * This strategy prioritizes URLs with higher depth levels, ensuring that
 * each path is followed to completion before backtracking to explore other paths.
 * This is useful for deep exploration of specific sections of documentation.
 */
export class DepthFirstStrategy extends BasePrioritizationStrategy {
  /**
   * Create a new depth-first prioritization strategy
   * 
   * @param params Prioritization parameters
   */
  constructor(params: PrioritizationParams = {}) {
    super(params);
  }
  
  /**
   * Calculate a priority score for a URL using depth-first strategy
   * 
   * @param url URL to score
   * @param depth Depth level of the URL
   * @param parentUrl URL that linked to this URL
   * @returns Priority score (lower is higher priority)
   */
  scoreUrl(url: string, depth: number, parentUrl: string): number {
    // Base score is -10 * depth (higher depth = higher priority)
    let score = -10 * depth;
    
    // Apply pattern matching score adjustment
    score += this.getPatternMatchScore(url);
    
    // For depth-first, we prioritize URLs that are similar to their parent
    // This helps follow a specific section to completion
    if (parentUrl && url.startsWith(parentUrl)) {
      score -= 10; // Boost for URLs that continue the current path
    }
    
    // Prioritize URLs with file extensions that likely contain documentation
    if (url.match(/\.(html|htm|md|txt|pdf)(\?|#|$)/i)) {
      score -= 5;
    }
    
    return score;
  }
  
  /**
   * Name of the strategy
   */
  get name(): string {
    return 'depth-first';
  }
}