import { BasePrioritizationStrategy, PrioritizationParams } from './PrioritizationStrategy.js';

/**
 * Hybrid prioritization strategy
 * 
 * This strategy provides a balanced approach between breadth-first and depth-first,
 * with a strong emphasis on pattern matching to prioritize important content regardless of depth.
 * It uses content indicators, URL structure, and depth information to make intelligent prioritization decisions.
 */
export class HybridStrategy extends BasePrioritizationStrategy {
  /**
   * Create a new hybrid prioritization strategy
   * 
   * @param params Prioritization parameters
   */
  constructor(params: PrioritizationParams = {}) {
    super(params);
  }
  
  /**
   * Calculate a priority score for a URL using hybrid strategy
   * 
   * @param url URL to score
   * @param depth Depth level of the URL
   * @param parentUrl URL that linked to this URL
   * @returns Priority score (lower is higher priority)
   */
  scoreUrl(url: string, depth: number, parentUrl: string): number {
    // Start with a moderate depth penalty (5 points per level)
    // This is less aggressive than breadth-first but still maintains some level of breadth priority
    let score = depth * 5;
    
    // Apply pattern matching score adjustment (has more weight in hybrid strategy)
    const patternScore = this.getPatternMatchScore(url);
    score += patternScore;
    
    // Hybrid strategy uses more sophisticated content type detection
    
    // API documentation typically has high value
    if (url.match(/\bapi\b/i) || url.match(/\breference\b/i)) {
      score -= 25;
    }
    
    // Getting started guides and tutorials are valuable
    if (url.match(/\b(getting[-\s]?started|tutorial|guide|example)\b/i)) {
      score -= 20;
    }
    
    // Index pages often contain valuable navigation
    if (url.match(/\b(index|contents|toc|overview)\b/i)) {
      score -= 15;
    }
    
    // Prioritize by file extension/type
    if (url.match(/\.(html|htm)(\?|#|$)/i)) {
      score -= 5; // HTML content is typically most valuable
    } else if (url.match(/\.(md|mdx|txt)(\?|#|$)/i)) {
      score -= 8; // Markdown/text files often contain documentation
    } else if (url.match(/\.(pdf|docx?)(\?|#|$)/i)) {
      score -= 3; // Document files may contain useful content
    }
    
    // For parent URL continuation, use a moderate boost
    // Less aggressive than depth-first but still promotes some continuity
    if (parentUrl && url.startsWith(parentUrl)) {
      score -= 5;
    }
    
    // Deprioritize certain patterns common in documentation sites
    if (url.match(/\b(print|pdf|download|version|archive|legacy)\b/i)) {
      score += 15; // Lower priority for secondary content
    }
    
    // Deprioritize URLs with query parameters (often search or filtering)
    if (url.includes('?')) {
      score += 10;
    }
    
    // Deprioritize URLs with hash fragments (often same-page navigation)
    if (url.includes('#')) {
      score += 5;
    }
    
    // If we have strong pattern matches, the URL gets high priority regardless of depth
    if (patternScore < -30) {
      // For very important content, reduce the depth penalty
      score -= Math.abs(patternScore); // Further boost important content
    }
    
    return score;
  }
  
  /**
   * Name of the strategy
   */
  get name(): string {
    return 'hybrid';
  }
}