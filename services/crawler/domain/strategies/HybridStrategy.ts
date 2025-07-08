import { BasePrioritizationStrategy, PrioritizationParams, DOC_PATTERNS } from './PrioritizationStrategy.js';
import { getLogger } from '../../../../shared/infrastructure/logging.js';

/**
 * Enhanced hybrid prioritization strategy
 * 
 * This strategy provides a balanced approach between breadth-first and depth-first,
 * with a strong emphasis on pattern matching to prioritize important content regardless of depth.
 * It uses content indicators, URL structure, domain importance, and depth information 
 * to make intelligent prioritization decisions.
 */
export class HybridStrategy extends BasePrioritizationStrategy {
  // Constants for priority calculations
  private readonly DEPTH_PENALTY = 5; // Base depth penalty (points per level)
  private readonly PATTERN_MATCH_BONUS = 25; // Points to reduce for pattern matches
  private readonly API_DOCS_BONUS = 30; // Bonus for API documentation
  private readonly GUIDE_TUTORIAL_BONUS = 25; // Bonus for guides and tutorials
  private readonly INDEX_PAGE_BONUS = 20; // Bonus for index/overview pages
  private readonly PARENT_CONTINUATION_BONUS = 8; // Bonus for continuing from parent URL
  private readonly NOISE_PAGE_PENALTY = 15; // Penalty for likely noise pages
  
  /**
   * Create a new hybrid prioritization strategy
   * 
   * @param params Prioritization parameters
   */
  constructor(params: PrioritizationParams = {}) {
    super(params);
    // Use the logger from the base class
    const logger = getLogger();
    logger.debug(`Created HybridStrategy with ${this.patterns.length} patterns`, 'HybridStrategy');
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
    let score = depth * this.DEPTH_PENALTY;
    
    // Apply pattern matching score adjustment (has more weight in hybrid strategy)
    const patternScore = this.getPatternMatchScore(url);
    score += patternScore;
    
    // Extract domain for domain-based scoring
    let domain = '';
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
      const pathname = urlObj.pathname;
      
      // Analyze path structure for better scoring
      const pathSegments = pathname.split('/').filter(Boolean);
      
      // URLs with fewer path segments often are more important (section landing pages)
      if (pathSegments.length <= 2 && pathname.length > 1) {
        score -= 10; // Boost for potential section landing pages
      }
      
      // Penalize very deep paths unless they match important patterns
      if (pathSegments.length > 4 && patternScore > -15) {
        score += pathSegments.length * 2; // Additional penalty for deep paths
      }
    } catch (error) {
      // Invalid URL, can't extract domain
      this.logger.warn(`Invalid URL for domain extraction: ${url}`, 'HybridStrategy');
    }
    
    // Hybrid strategy uses more sophisticated content type detection
    
    // API documentation typically has high value
    if (DOC_PATTERNS.API.test(url)) {
      score -= this.API_DOCS_BONUS;
    }
    
    // Getting started guides and tutorials are valuable
    if (url.match(/\b(getting[-\s]?started|tutorial|guide|example)\b/i)) {
      score -= this.GUIDE_TUTORIAL_BONUS;
    }
    
    // Index pages often contain valuable navigation
    if (url.match(/\b(index|contents|toc|overview)\b/i)) {
      score -= this.INDEX_PAGE_BONUS;
    }
    
    // Prioritize by file extension/type
    if (url.match(/\.(html|htm)(\?|#|$)/i)) {
      score -= 5; // HTML content is typically most valuable
    } else if (url.match(/\.(md|mdx|txt)(\?|#|$)/i)) {
      score -= 8; // Markdown/text files often contain documentation
    } else if (url.match(/\.(pdf|docx?)(\?|#|$)/i)) {
      score -= 3; // Document files may contain useful content
    } else if (url.match(/\.(json|yaml|yml)(\?|#|$)/i)) {
      score -= 6; // Configuration and data files may contain API specs
    }
    
    // For parent URL continuation, use a moderate boost
    // This promotes continuity of related content
    if (parentUrl && url.startsWith(parentUrl)) {
      score -= this.PARENT_CONTINUATION_BONUS;
    }
    
    // Check for versioned documentation
    const versionMatch = url.match(/\/v(\d+)(\.(\d+))?\//);
    if (versionMatch) {
      // Newer versions get higher priority
      const majorVersion = parseInt(versionMatch[1], 10);
      if (majorVersion >= 2) {
        score -= 10 + Math.min(majorVersion, 5); // Boost newer versions more
      }
    }
    
    // Boost for README files which often contain important overview information
    if (url.match(/readme\.md/i)) {
      score -= 15;
    }
    
    // Deprioritize certain patterns common in documentation sites
    if (url.match(/\b(print|pdf|download|version|archive|legacy)\b/i)) {
      score += this.NOISE_PAGE_PENALTY; // Lower priority for secondary content
    }
    
    // Deprioritize URLs with query parameters (often search or filtering)
    // But maintain priority if it's a key documentation page
    if (url.includes('?') && !this.isDocumentationUrl(url)) {
      score += 10;
    }
    
    // Deprioritize URLs with hash fragments (often same-page navigation)
    // But maintain priority if the hash looks like an API endpoint reference
    if (url.includes('#') && !url.match(/#(api|method|function|endpoint|class|interface)/i)) {
      score += 5;
    }
    
    // If we have strong pattern matches, the URL gets high priority regardless of depth
    if (patternScore < -30) {
      // For very important content, reduce the depth penalty
      score -= Math.min(30, Math.abs(patternScore) / 2); // Partial depth penalty reduction
    }
    
    // Apply adaptive depth handling for very high value content
    if (this.isHighValueDocumentationUrl(url)) {
      // High value content gets reduced depth penalty
      const depthPenaltyReduction = Math.min(depth * 3, 15);
      score -= depthPenaltyReduction;
    }
    
    // Log detailed scoring for debugging (if debug enabled, to be checked at runtime via config)
    // We don't use isDebugEnabled since it's not available in our Logger
    if (this.params.debug) {
      const logger = getLogger();
      logger.debug(
        `Score for ${url} (depth: ${depth}): ${score} = ` +
        `${depth * this.DEPTH_PENALTY} (depth) + ${patternScore} (patterns)`,
        'HybridStrategy'
      );
    }
    
    return score;
  }
  
  /**
   * Check if a URL is likely a high-value documentation page
   * 
   * @param url URL to check
   * @returns True if likely high-value documentation
   */
  private isHighValueDocumentationUrl(url: string): boolean {
    // Check for indicators of high-value documentation
    return (
      // API documentation
      DOC_PATTERNS.API.test(url) ||
      
      // Getting started guides
      url.match(/\b(getting[-\s]?started|quickstart|setup|installation)\b/i) !== null ||
      
      // Important reference material
      url.match(/\b(reference|specification|schema|models|endpoints)\b/i) !== null ||
      
      // README files
      url.match(/readme\.md/i) !== null ||
      
      // Index/overview pages at root or major sections
      (url.match(/\b(index|overview)\b/i) !== null && url.split('/').filter(Boolean).length <= 3)
    );
  }
  
  /**
   * Compare two queue items to determine their relative priority
   * 
   * @param a First queue item
   * @param b Second queue item
   * @returns Negative if a has higher priority, positive if b has higher priority
   */
  compareItems(a: {url: string, depth: number, parentUrl: string, score: number}, 
               b: {url: string, depth: number, parentUrl: string, score: number}): number {
    // First compare by score (lower score = higher priority)
    const scoreDiff = a.score - b.score;
    
    // If scores are very close, we might use other factors to break ties
    if (Math.abs(scoreDiff) < 5) {
      // For close scores, prefer less deep URLs as a tie-breaker
      return a.depth - b.depth;
    }
    
    return scoreDiff;
  }
  
  /**
   * Name of the strategy
   */
  get name(): string {
    return 'hybrid';
  }
}