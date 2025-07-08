/**
 * SitemapScorer for prioritizing sitemap entries
 * 
 * This class assigns scores to sitemap entries based on various factors
 * to help prioritize crawling order and improve discovery efficiency.
 */

import { URL } from 'url';
import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { SitemapEntry } from './SitemapTypes.js';

const logger = getLogger();

/**
 * SitemapScorer options for fine-tuning priorities
 */
export interface ScoringOptions {
  /** Keywords to prioritize in URLs */
  priorityKeywords?: string[];
  
  /** URL patterns to prioritize (regex-compatible strings) */
  priorityPatterns?: string[];
  
  /** URL patterns to deprioritize (regex-compatible strings) */
  deprioritizePatterns?: string[];
  
  /** Whether to consider sitemap priorities in scoring */
  useSitemapPriorities?: boolean;
  
  /** Base URL for path depth calculations */
  baseUrl?: string;
  
  /** Boost factor for date-based recency (1-10) */
  recencyBoost?: number;
}

/**
 * Scorer for sitemap entries to help prioritize crawling
 */
export class SitemapScorer {
  /**
   * Score sitemap entries for prioritization
   * @param entries Sitemap entries to score
   * @param baseUrl Base URL for the domain
   * @param options Scoring options
   * @returns Scored entries
   */
  scoreEntries(
    entries: SitemapEntry[],
    baseUrl: string,
    options: ScoringOptions = {}
  ): SitemapEntry[] {
    // Configure options with defaults
    const opts = {
      priorityKeywords: options.priorityKeywords || ['index', 'home', 'guide', 'docs', 'documentation', 'api', 'reference'],
      priorityPatterns: options.priorityPatterns || [],
      deprioritizePatterns: options.deprioritizePatterns || [],
      useSitemapPriorities: options.useSitemapPriorities !== false,
      baseUrl: options.baseUrl || baseUrl,
      recencyBoost: options.recencyBoost || 5
    };
    
    // Score each entry
    const scoredEntries = entries.map(entry => {
      // Start with a base score (lower is higher priority)
      let score = 50;
      
      try {
        // Parse URL
        const url = new URL(entry.url);
        
        // Factor 1: Path length/depth (shorter paths are prioritized)
        const pathSegments = url.pathname.split('/').filter(Boolean);
        score += pathSegments.length * 5; // Each segment adds 5 points (lower priority)
        
        // Factor 2: Priority keywords in path
        const pathString = url.pathname.toLowerCase();
        const foundKeywords = opts.priorityKeywords.filter(keyword => 
          pathString.includes(keyword.toLowerCase())
        );
        
        // Reduce score for each priority keyword found (higher priority)
        score -= foundKeywords.length * 10;
        
        // Factor 3: Explicit sitemap priority if available
        if (opts.useSitemapPriorities && entry.priority !== undefined) {
          // Convert sitemap priority (0-1) to score adjustment
          // 1.0 priority -> -50 points (highest priority)
          // 0.0 priority -> 0 points (no adjustment)
          score -= Math.round(entry.priority * 50);
        }
        
        // Factor 4: Recency if lastmod is available
        if (entry.lastmod) {
          const now = new Date();
          const ageInDays = (now.getTime() - entry.lastmod.getTime()) / (1000 * 60 * 60 * 24);
          
          // Recent content gets lower score (higher priority)
          // Newer content (0 days) -> -recencyBoost*5 points
          // Older content (90+ days) -> 0 points (no adjustment)
          const recencyAdjustment = Math.max(0, 90 - ageInDays) / 90 * opts.recencyBoost * 5;
          score -= Math.round(recencyAdjustment);
        }
        
        // Factor 5: Priority patterns (explicit regex patterns)
        if (opts.priorityPatterns.length > 0) {
          for (const pattern of opts.priorityPatterns) {
            try {
              const regex = new RegExp(pattern);
              if (regex.test(entry.url)) {
                // Significant boost for explicit pattern match
                score -= 25;
                break; // Only apply once even if multiple patterns match
              }
            } catch (error) {
              logger.warn(`Invalid priority pattern regex: ${pattern}`, 'SitemapScorer');
            }
          }
        }
        
        // Factor 6: Deprioritize patterns
        if (opts.deprioritizePatterns.length > 0) {
          for (const pattern of opts.deprioritizePatterns) {
            try {
              const regex = new RegExp(pattern);
              if (regex.test(entry.url)) {
                // Significant penalty for deprioritized patterns
                score += 40;
                break; // Only apply once even if multiple patterns match
              }
            } catch (error) {
              logger.warn(`Invalid deprioritize pattern regex: ${pattern}`, 'SitemapScorer');
            }
          }
        }
        
        // Factor 7: Special locations (root, section indices)
        if (url.pathname === '/' || url.pathname === '') {
          // Homepage gets highest priority
          score -= 30;
        } else if (pathSegments.length === 1) {
          // Top-level sections get higher priority
          score -= 15;
        }
        
        // Ensure score doesn't go below minimum threshold
        score = Math.max(0, score);
        
      } catch (error) {
        logger.warn(`Error scoring URL ${entry.url}: ${error}`, 'SitemapScorer');
        // For errors, assign a neutral score
        score = 50;
      }
      
      // Add score to entry
      return {
        ...entry,
        score
      };
    });
    
    // Sort entries by score (lower is higher priority)
    return scoredEntries.sort((a, b) => (a.score || 0) - (b.score || 0));
  }
  
  /**
   * Calculate a score for a URL (for backward compatibility)
   * @param url URL to score
   * @param baseUrl Base URL for the domain
   * @param options Scoring options
   * @returns Score (lower is higher priority)
   */
  calculateUrlScore(
    url: string,
    baseUrl: string,
    options: ScoringOptions = {}
  ): number {
    // Create a simple entry and score it
    const entry: SitemapEntry = { url };
    const scored = this.scoreEntries([entry], baseUrl, options);
    
    // Return the calculated score
    return scored[0].score ?? 50;
  }
  
  /**
   * Filter entries based on patterns (for backward compatibility)
   * @param entries Entries to filter
   * @param includePatterns Patterns to include
   * @param excludePatterns Patterns to exclude
   * @returns Filtered entries
   */
  filterEntries(
    entries: SitemapEntry[],
    includePatterns?: string[],
    excludePatterns?: string[]
  ): SitemapEntry[] {
    // Apply include patterns
    let filteredEntries = entries;
    
    if (includePatterns && includePatterns.length > 0) {
      filteredEntries = filteredEntries.filter(entry => {
        return includePatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern);
            return regex.test(entry.url);
          } catch (error) {
            logger.warn(`Invalid include pattern regex: ${pattern}`, 'SitemapScorer');
            return false;
          }
        });
      });
    }
    
    // Apply exclude patterns
    if (excludePatterns && excludePatterns.length > 0) {
      filteredEntries = filteredEntries.filter(entry => {
        return !excludePatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern);
            return regex.test(entry.url);
          } catch (error) {
            logger.warn(`Invalid exclude pattern regex: ${pattern}`, 'SitemapScorer');
            return false;
          }
        });
      });
    }
    
    return filteredEntries;
  }
  
  /**
   * Sort entries by priority (for backward compatibility)
   * @param entries Entries to sort
   * @param baseUrl Base URL for the domain
   * @param options Scoring options
   * @returns Sorted entries
   */
  sortEntriesByPriority(
    entries: SitemapEntry[],
    baseUrl: string, 
    options: ScoringOptions = {}
  ): SitemapEntry[] {
    return this.scoreEntries(entries, baseUrl, options);
  }
}