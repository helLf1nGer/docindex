/**
 * Enhanced sitemap processor with improved depth handling
 * and URL prioritization capabilities
 * 
 * This component provides advanced sitemap processing features to improve
 * crawling efficiency and prioritization of important URLs.
 */

import { URL } from 'url';
import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { HttpClient } from '../../../../shared/infrastructure/HttpClient.js';
import { SitemapProcessor } from './SitemapProcessor.js';
import { SitemapEntry } from './SitemapTypes.js';

const logger = getLogger();

/**
 * Options for sitemap processing
 */
export interface SitemapProcessingOptions {
  /** Whether to follow sitemap index links (default: true) */
  followSitemapIndex?: boolean;
  
  /** Maximum entries to process from sitemaps (default: 1000) */
  maxEntries?: number;
  
  /** Whether to assign custom depth to URLs based on path structure */
  assignCustomDepth?: boolean;
  
  /** Base depth for sitemap URLs (default: 0) */
  baseDepth?: number;
  
  /** Treat all sitemap URLs as high priority (default: true) */
  treatAsHighPriority?: boolean;
  
  /** Method to calculate URL depth: 'path', 'semantic', or 'hybrid' */
  depthCalculationMethod?: 'path' | 'semantic' | 'hybrid';
  
  /** Path segments to treat as documentation markers for depth calculation */
  docPathMarkers?: string[];
  
  /** Path segments to treat as API markers for depth calculation */
  apiPathMarkers?: string[];
  
  /** Custom score boost for URLs with certain patterns */
  patternBoosts?: Array<{
    pattern: string;
    scoreAdjustment: number;
  }>;
}

/**
 * Enhanced processor for sitemaps with advanced handling capabilities
 */
export class EnhancedSitemapProcessor {
  private processor: SitemapProcessor;
  
  /**
   * Create a new enhanced sitemap processor
   * @param httpClient HTTP client for fetching sitemaps
   */
  constructor(
    private readonly httpClient: HttpClient
  ) {
    this.processor = new SitemapProcessor(httpClient);
    logger.info('EnhancedSitemapProcessor initialized', 'EnhancedSitemapProcessor');
  }
  
  /**
   * Discover and process all sitemaps for a URL with enhanced handling
   * @param baseUrl Base URL to discover sitemaps for
   * @param options Processing options
   * @returns Discovered and processed sitemap entries
   */
  async discoverAndProcessSitemaps(
    baseUrl: string,
    options: SitemapProcessingOptions = {}
  ): Promise<SitemapEntry[]> {
    try {
      // Apply default options
      const opts = {
        followSitemapIndex: options.followSitemapIndex !== false,
        maxEntries: options.maxEntries || 1000,
        assignCustomDepth: options.assignCustomDepth !== false,
        baseDepth: options.baseDepth || 0,
        treatAsHighPriority: options.treatAsHighPriority !== false,
        depthCalculationMethod: options.depthCalculationMethod || 'hybrid',
        docPathMarkers: options.docPathMarkers || ['docs', 'documentation', 'guide', 'guides', 'tutorial', 'help', 'manual', 'reference'],
        apiPathMarkers: options.apiPathMarkers || ['api', 'apis', 'endpoint', 'endpoints', 'reference'],
        patternBoosts: options.patternBoosts || []
      };
      
      logger.info(`Discovering and processing sitemaps for ${baseUrl} with enhanced options`, 'EnhancedSitemapProcessor');
      
      // Use the regular processor to discover and process sitemaps
      const entries = await this.processor.discoverAndProcessSitemaps(baseUrl);
      logger.info(`Discovered ${entries.length} URLs from sitemaps`, 'EnhancedSitemapProcessor');
      
      // Apply enhanced processing
      const enhancedEntries = this.enhanceSitemapEntries(entries, baseUrl, opts);
      
      // Limit to maximum entries if specified
      const limitedEntries = opts.maxEntries > 0 
        ? enhancedEntries.slice(0, opts.maxEntries)
        : enhancedEntries;
      
      logger.info(`Processed ${limitedEntries.length} sitemap entries with enhanced handling`, 'EnhancedSitemapProcessor');
      return limitedEntries;
    } catch (error) {
      logger.error(`Error in enhanced sitemap processing: ${error}`, 'EnhancedSitemapProcessor');
      return [];
    }
  }
  
  /**
   * Enhance sitemap entries with calculated depth and score adjustments
   * @param entries Original sitemap entries
   * @param baseUrl Base URL of the site
   * @param options Processing options
   * @returns Enhanced sitemap entries
   */
  private enhanceSitemapEntries(
    entries: SitemapEntry[],
    baseUrl: string,
    options: Required<SitemapProcessingOptions>
  ): SitemapEntry[] {
    return entries.map(entry => {
      // Clone the entry to avoid mutating the original
      const enhancedEntry: SitemapEntry = { ...entry };
      
      // Mark as from sitemap
      enhancedEntry.isFromSitemap = true;
      
      // Calculate depth if requested
      if (options.assignCustomDepth) {
        enhancedEntry.calculatedDepth = this.calculateUrlDepth(
          entry.url,
          baseUrl,
          options.baseDepth,
          options.depthCalculationMethod,
          options.docPathMarkers,
          options.apiPathMarkers
        );
      } else {
        enhancedEntry.calculatedDepth = options.baseDepth;
      }
      
      // Apply custom pattern boosts
      if (options.patternBoosts.length > 0) {
        let scoreAdjustment = 0;
        
        for (const boost of options.patternBoosts) {
          try {
            const regex = new RegExp(boost.pattern);
            if (regex.test(entry.url)) {
              scoreAdjustment += boost.scoreAdjustment;
            }
          } catch (error) {
            logger.warn(`Invalid pattern in patternBoosts: ${boost.pattern}`, 'EnhancedSitemapProcessor');
          }
        }
        
        // Apply score adjustment (if there was an original score)
        if (enhancedEntry.score !== undefined) {
          enhancedEntry.score = Math.max(0, enhancedEntry.score + scoreAdjustment);
        }
      }
      
      return enhancedEntry;
    });
  }
  
  /**
   * Calculate URL depth based on various heuristics
   * @param url URL to calculate depth for
   * @param baseUrl Base URL of the site
   * @param baseDepth Base depth to start with
   * @param method Depth calculation method
   * @param docPathMarkers Path segments that indicate docs content
   * @param apiPathMarkers Path segments that indicate API content
   * @returns Calculated depth
   */
  private calculateUrlDepth(
    url: string,
    baseUrl: string,
    baseDepth: number,
    method: 'path' | 'semantic' | 'hybrid',
    docPathMarkers: string[],
    apiPathMarkers: string[]
  ): number {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      
      // Method 1: Path-based depth (simple count of segments)
      if (method === 'path') {
        return baseDepth + pathSegments.length;
      }
      
      // Method 2: Semantic depth (based on content type and importance)
      if (method === 'semantic') {
        // Start with base depth
        let depth = baseDepth;
        
        // Root page is always at base depth
        if (pathSegments.length === 0) {
          return baseDepth;
        }
        
        // Check for documentation-specific paths
        const isDocPath = pathSegments.some(segment => 
          docPathMarkers.includes(segment.toLowerCase())
        );
        
        // Check for API-specific paths
        const isApiPath = pathSegments.some(segment => 
          apiPathMarkers.includes(segment.toLowerCase())
        );
        
        // Documentation and API pages are prioritized (lower depth)
        if (isDocPath || isApiPath) {
          // Add only half the segment count for important paths
          depth += Math.ceil(pathSegments.length / 2);
        } else {
          // Regular content gets full depth increment
          depth += pathSegments.length;
        }
        
        return depth;
      }
      
      // Method 3: Hybrid approach (combination of path and semantic)
      if (method === 'hybrid') {
        // Start with base depth
        let depth = baseDepth;
        
        // Root page is always at base depth
        if (pathSegments.length === 0) {
          return baseDepth;
        }
        
        // Identify content type indicators
        const isDocPath = pathSegments.some(segment => 
          docPathMarkers.includes(segment.toLowerCase())
        );
        
        const isApiPath = pathSegments.some(segment => 
          apiPathMarkers.includes(segment.toLowerCase())
        );
        
        // Find the first occurrence of a content type indicator
        let contentTypeSegmentIndex = -1;
        
        for (let i = 0; i < pathSegments.length; i++) {
          const segment = pathSegments[i].toLowerCase();
          if (docPathMarkers.includes(segment) || apiPathMarkers.includes(segment)) {
            contentTypeSegmentIndex = i;
            break;
          }
        }
        
        // Apply different depth calculations based on content type
        if (isDocPath || isApiPath) {
          if (contentTypeSegmentIndex >= 0) {
            // Add content type indicator index as base
            depth += contentTypeSegmentIndex;
            
            // Add half the remaining depth for segments after the indicator
            const remainingSegments = pathSegments.length - contentTypeSegmentIndex - 1;
            depth += Math.ceil(remainingSegments / 2);
          } else {
            // This shouldn't happen if isDocPath/isApiPath is true,
            // but handle it just in case
            depth += Math.ceil(pathSegments.length / 2);
          }
        } else {
          // Regular content gets full depth increment
          depth += pathSegments.length;
        }
        
        return depth;
      }
      
      // Default fallback to simple path-based depth
      return baseDepth + pathSegments.length;
    } catch (error) {
      logger.warn(`Error calculating URL depth for ${url}: ${error}`, 'EnhancedSitemapProcessor');
      // Default to base depth + 1 on error
      return baseDepth + 1;
    }
  }
  
  /**
   * Filter sitemap entries by patterns
   * @param entries Entries to filter
   * @param includePatterns Patterns to include (if any)
   * @param excludePatterns Patterns to exclude (if any)
   * @returns Filtered entries
   */
  filterEntries(
    entries: SitemapEntry[],
    includePatterns?: string[],
    excludePatterns?: string[]
  ): SitemapEntry[] {
    return this.processor.filterEntries(entries, includePatterns, excludePatterns);
  }
}