/**
 * UrlProcessor for processing URLs during crawling
 * 
 * This class handles URL normalization, filtering, and processing
 * to ensure proper crawling behavior and depth tracking.
 */

import { URL } from 'url';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { JSDOM } from 'jsdom';
import { DocumentSource } from '../../../shared/domain/models/Document.js';

const logger = getLogger();

/**
 * URL processing result
 */
export interface ProcessedUrl {
  /** Normalized URL */
  url: string;
  
  /** Whether the URL was accepted */
  accepted: boolean;
  
  /** Reason for rejection if not accepted */
  rejectionReason?: string;
}

/**
 * Processor for URLs
 */
export class UrlProcessor {
  /**
   * Create a new URL processor
   */
  constructor() {
    logger.info('Enhanced UrlProcessor initialized', 'UrlProcessor');
  }
  
  /**
   * Process a URL for crawling
   * @param url URL to process
   * @param source Documentation source
   * @param parentUrl Parent URL that linked to this URL
   * @param currentDepth Current crawl depth
   * @returns Processed URL result
   */
  processUrl(
    url: string,
    source: DocumentSource,
    parentUrl: string,
    currentDepth: number
  ): ProcessedUrl {
    try {
      logger.info(`Processing URL: ${url} (depth: ${currentDepth}, maxDepth: ${source.crawlConfig.maxDepth})`, 'UrlProcessor');
      
      // Normalize URL
      const normalizedUrl = this.normalizeUrl(url, parentUrl);
      if (!normalizedUrl) {
        return {
          url,
          accepted: false,
          rejectionReason: 'Invalid URL'
        };
      }
      
      logger.debug(`Normalized URL: ${normalizedUrl}`, 'UrlProcessor');
      // Check if URL is within allowed depth
      // Note: We're comparing against maxDepth here, not maxDepth-1, to ensure we get to maxDepth level
      if (currentDepth > source.crawlConfig.maxDepth) {
        return {
          url: normalizedUrl,
          accepted: false,
          rejectionReason: `Exceeds maximum depth (${source.crawlConfig.maxDepth})`
        };
      }
      
      // Check if URL is same hostname as source
      const urlObj = new URL(normalizedUrl);
      const sourceUrlObj = new URL(source.baseUrl);
      logger.debug(`URL hostname: ${urlObj.hostname}, source hostname: ${sourceUrlObj.hostname}`, 'UrlProcessor');
      
      if (urlObj.hostname !== sourceUrlObj.hostname) {
        return {
          url: normalizedUrl,
          accepted: false,
          rejectionReason: 'Different hostname'
        };
      }
      
      // Check URL against include patterns
      if (source.crawlConfig.includePatterns && source.crawlConfig.includePatterns.length > 0) {
        const isIncluded = source.crawlConfig.includePatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern);
            return regex.test(normalizedUrl);
          } catch (error) {
            logger.warn(`Invalid include pattern regex: ${pattern}`, 'UrlProcessor');
            return false;
          }
        });
        
        if (!isIncluded) {
          return {
            url: normalizedUrl,
            accepted: false,
            rejectionReason: 'Does not match include patterns'
          };
        }
      }
      
      // Check URL against exclude patterns
      if (source.crawlConfig.excludePatterns && source.crawlConfig.excludePatterns.length > 0) {
        const isExcluded = source.crawlConfig.excludePatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern);
            return regex.test(normalizedUrl);
          } catch (error) {
            logger.warn(`Invalid exclude pattern regex: ${pattern}`, 'UrlProcessor');
            return false;
          }
        });
        
        if (isExcluded) {
          return {
            url: normalizedUrl,
            accepted: false,
            rejectionReason: 'Matches exclude patterns'
          };
        }
      }
      
      // Skip URLs with file extensions that are typically not HTML content
      const nonHtmlExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.css', '.js',
        '.pdf', '.zip', '.tar', '.gz', '.rar', '.exe', '.dmg', '.iso',
        '.mp3', '.mp4', '.avi', '.mov', '.wav', '.ogg', '.webm'
      ];
      
      const hasNonHtmlExtension = nonHtmlExtensions.some(ext => 
        normalizedUrl.toLowerCase().endsWith(ext)
      );
      
      if (hasNonHtmlExtension) {
        return {
          url: normalizedUrl,
          accepted: false,
          rejectionReason: 'Non-HTML file extension'
        };
      }
      
      // URL is accepted
      logger.info(`URL accepted: ${normalizedUrl} (depth: ${currentDepth})`, 'UrlProcessor');
      return {
        url: normalizedUrl,
        accepted: true
      };
    } catch (error) {
      logger.error(`Error processing URL ${url}`, 'UrlProcessor', error);
      
      return {
        url,
        accepted: false,
        rejectionReason: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Extract links from HTML content
   * @param html HTML content
   * @param baseUrl Base URL for resolving relative links
   * @returns Array of extracted links
   */
  extractLinks(html: string, baseUrl: string): string[] {
    try {
      logger.info(`Extracting links from content at ${baseUrl}`, 'UrlProcessor');
      
      const links: string[] = [];
      
      try {
        // Use JSDOM to properly parse HTML and extract links
        const dom = new JSDOM(html, { url: baseUrl });
        const document = dom.window.document;
        
        // Get all anchor elements
        const anchors = document.querySelectorAll('a');
        logger.debug(`Found ${anchors.length} anchor elements`, 'UrlProcessor');
        
        // Extract href attributes
        for (const anchor of Array.from(anchors)) {
          try {
            const href = anchor.getAttribute('href');
            
            // Skip empty, null, or undefined hrefs
            if (!href) {
              continue;
            }
            
            // Skip fragment-only URLs, javascript: URLs, and mailto: links
            if (href.startsWith('#') || 
                href.startsWith('javascript:') || 
                href.startsWith('mailto:') ||
                href.startsWith('tel:')) {
              continue;
            }
            
            // Resolve relative URLs
            try {
              const normalizedUrl = this.normalizeUrl(href, baseUrl);
              if (normalizedUrl) {
                links.push(normalizedUrl);
              }
            } catch (error) {
              // Skip invalid URLs
              logger.debug(`Skipping invalid URL: ${href}`, 'UrlProcessor');
              continue;
            }
          } catch (error) {
            // Skip problematic links
            logger.debug(`Error processing anchor: ${error}`, 'UrlProcessor');
            continue;
          }
        }
      } catch (error) {
        logger.error(`Error parsing HTML with JSDOM: ${error}`, 'UrlProcessor');
        // Fallback to empty links array
      }
      
      // Remove duplicates
      const uniqueLinks = Array.from(new Set(links));
      
      logger.info(`Extracted ${uniqueLinks.length} unique links from ${baseUrl}`, 'UrlProcessor');
      return uniqueLinks;
    } catch (error) {
      logger.error(`Error extracting links from ${baseUrl}`, 'UrlProcessor', error);
      return [];
    }
  }
  
  /**
   * Normalize a URL
   * @param url URL to normalize
   * @param baseUrl Base URL for resolving relative URLs
   * @returns Normalized URL or null if invalid
   */
  normalizeUrl(url: string, baseUrl: string): string | null {
    try {
      logger.debug(`Normalizing URL: ${url} with base: ${baseUrl}`, 'UrlProcessor');
      // Handle relative URLs
      const absoluteUrl = new URL(url, baseUrl);
      let normalized = absoluteUrl.href;
      
      // Remove trailing slash
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      
      // Remove hash fragments (they don't change the page content)
      const hashIndex = normalized.indexOf('#');
      if (hashIndex !== -1) {
        normalized = normalized.slice(0, hashIndex);
      }
      
      // Handle common variations
      // Remove index.html, index.php, etc.
      normalized = normalized.replace(/\/index\.(html|php|aspx|jsp)$/i, '/');
      
      // Ensure protocol is consistent
      if (normalized.startsWith('http:')) {
        // Try to upgrade to https if it's the same domain as the base URL
        const baseUrlObj = new URL(baseUrl);
        if (baseUrlObj.protocol === 'https:') {
          const normalizedObj = new URL(normalized);
          if (normalizedObj.hostname === baseUrlObj.hostname) {
            normalized = normalized.replace(/^http:/, 'https:');
          }
        }
      }
      
      logger.debug(`Normalized result: ${normalized}`, 'UrlProcessor');
      return normalized;
    } catch (error) {
      // Invalid URL
      return null;
    }
  }
  
  /**
   * Calculate the crawl depth based on URL path structure
   * @param url URL to analyze
   * @param baseUrl Base URL of the documentation source
   * @returns Calculated depth
   */
  calculateCrawlDepth(url: string, baseUrl: string): number {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);
      
      // If different hostname, treat as external
      if (urlObj.hostname !== baseUrlObj.hostname) {
        return Infinity;
      }
      
      // Get path segments
      const urlPath = urlObj.pathname;
      const basePath = baseUrlObj.pathname;
      
      // If URL is base or has same/shorter path, depth is 0
      if (urlPath === basePath || urlPath === '/') {
        return 0;
      }
      
      // Calculate relative depth from base path
      const urlSegments = urlPath.split('/').filter(Boolean);
      const baseSegments = basePath.split('/').filter(Boolean);
      
      // Remove common prefix segments
      let commonPrefixLength = 0;
      for (let i = 0; i < baseSegments.length && i < urlSegments.length; i++) {
        if (baseSegments[i] === urlSegments[i]) {
          commonPrefixLength++;
        } else {
          break;
        }
      }

      // Calculate depth based on additional segments
      // beyond the base path
      // This provides a structure-based depth calculation
      let pathBasedDepth = urlSegments.length - commonPrefixLength;
      return pathBasedDepth > 0 ? pathBasedDepth : 0;
    } catch (error) {
      logger.warn(`Error calculating crawl depth for ${url}`, 'UrlProcessor', error);
      return 0;
    }
  }

  /**
   * Calculate parent-child depth relationship for use in crawling
   * This provides a more accurate crawl depth than path-based calculation
   * @param url The URL to calculate depth for
   * @param parentUrl The parent URL that linked to this URL
   * @param parentDepth The depth of the parent URL
   * @param baseUrl The base URL of the documentation source
   * @returns The calculated crawl depth
   */
  calculateCrawlDepthFromParent(
    url: string, 
    parentUrl: string, 
    parentDepth: number,
    baseUrl: string
  ): number {
    logger.debug(`Calculating crawl depth for ${url} from parent ${parentUrl} (depth: ${parentDepth})`, 'UrlProcessor');
    // If URL is same as parent or base, keep same depth
    if (url === parentUrl || url === baseUrl) {
      return parentDepth;
    }
    logger.debug(`Incrementing depth for ${url} to ${parentDepth + 1}`, 'UrlProcessor');
    
    // Otherwise, increment from parent depth - this is the key to proper depth tracking
    return parentDepth + 1;
  }
}