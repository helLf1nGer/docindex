/**
 * SimpleUrlProcessor
 * 
 * A straightforward URL processing utility for the simplified crawler.
 * Handles URL normalization, validation, and filtering with minimal complexity.
 */

import { URL } from 'url';
import * as path from 'path';
import { getLogger } from '../../shared/infrastructure/logging.js';
const logger = getLogger();

export interface UrlProcessorOptions {
  /** Base URL for resolving relative URLs */
  baseUrl: string;
  /** File extensions to exclude */
  excludeExtensions?: string[];
  /** URL patterns to exclude (regex strings) */
  excludePatterns?: string[];
  /** URL patterns to include (regex strings) - if provided, only matching URLs will be processed */
  includePatterns?: string[];
  /** Whether to follow only same-domain links */
  sameDomainOnly?: boolean;
}

export interface ProcessedUrl {
  /** The normalized URL */
  url: string;
  /** The URL normalized for deduplication (no trailing slash, etc.) */
  normalizedUrl: string;
  /** The depth of this URL relative to the starting point */
  depth: number;
  /** The parent URL that led to this URL */
  parentUrl?: string;
}

export class SimpleUrlProcessor {
  private baseUrl: URL;
  private excludeExtensions: string[];
  private excludePatterns: RegExp[];
  private includePatterns: RegExp[];
  private sameDomainOnly: boolean;
  private baseDomain: string;

  constructor(options: UrlProcessorOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.baseDomain = this.baseUrl.hostname;
    this.excludeExtensions = options.excludeExtensions || [
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', 
      '.mp4', '.webm', '.mp3', '.wav', '.ogg',
      '.pdf', '.zip', '.tar', '.gz', '.rar'
    ];
    this.excludePatterns = (options.excludePatterns || []).map(p => new RegExp(p));
    this.includePatterns = (options.includePatterns || []).map(p => new RegExp(p));
    this.sameDomainOnly = options.sameDomainOnly !== undefined ? options.sameDomainOnly : true;
  }

  /**
   * Normalizes a URL for consistent processing
   */
  normalizeUrl(url: string): string {
    try {
      // Handle relative URLs
      const normalizedUrl = new URL(url, this.baseUrl.href);
      
      // Remove fragments
      normalizedUrl.hash = '';
      
      return normalizedUrl.href;
    } catch (error) {
      return '';
    }
  }

  /**
   * Normalizes a URL for deduplication (removes trailing slashes, etc.)
   */
  normalizeForDeduplication(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      // Remove trailing slash from pathname
      let pathname = parsedUrl.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }
      
      // For deduplication, we consider http and https as the same
      return `${parsedUrl.hostname}${pathname}${parsedUrl.search}`;
    } catch (error) {
      return '';
    }
  }

  /**
   * Checks if a URL should be processed based on configured filters
   */
  shouldProcessUrl(url: string): boolean {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      if (!normalizedUrl) {
        logger.debug(`[UrlProcessor] Rejecting URL (normalize failed): ${url}`, 'SimpleUrlProcessor');
        return false;
      }
      
      const parsedUrl = new URL(normalizedUrl);
      
      // Check domain constraint
      if (this.sameDomainOnly && parsedUrl.hostname !== this.baseDomain) {
        logger.debug(`[UrlProcessor] Rejecting URL (different domain): ${normalizedUrl}`, 'SimpleUrlProcessor');
        return false;
      }
      
      // Check file extension
      const extension = path.extname(parsedUrl.pathname).toLowerCase();
      if (this.excludeExtensions.includes(extension)) {
        logger.debug(`[UrlProcessor] Rejecting URL (excluded extension: ${extension}): ${normalizedUrl}`, 'SimpleUrlProcessor');
        return false;
      }
      
      // Check exclude patterns
      if (this.excludePatterns.some(pattern => pattern.test(normalizedUrl))) {
        logger.debug(`[UrlProcessor] Rejecting URL (exclude pattern): ${normalizedUrl}`, 'SimpleUrlProcessor');
        return false;
      }
      
      // Check include patterns - if specified, URL must match one
      if (this.includePatterns.length > 0 &&
          !this.includePatterns.some(pattern => pattern.test(normalizedUrl))) {
        logger.debug(`[UrlProcessor] Rejecting URL (does not match include patterns): ${normalizedUrl}`, 'SimpleUrlProcessor');
        return false;
      }
      
      logger.debug(`[UrlProcessor] Accepting URL: ${normalizedUrl}`, 'SimpleUrlProcessor');
      return true;
    } catch (error) {
      logger.debug(`[UrlProcessor] Rejecting URL (exception): ${url} | ${error}`, 'SimpleUrlProcessor');
      return false;
    }
  }

  /**
   * Processes a URL and returns a structured result
   */
  processUrl(url: string, parentUrl?: string, parentDepth = 0): ProcessedUrl | null {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      if (!normalizedUrl || !this.shouldProcessUrl(url)) {
        return null;
      }
      
      return {
        url: normalizedUrl,
        normalizedUrl: this.normalizeForDeduplication(normalizedUrl),
        depth: parentDepth + 1,
        parentUrl
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract URLs from HTML content
   */
  extractUrlsFromHtml(html: string, baseUrl: string, parentDepth = 0): ProcessedUrl[] {
    const urls: ProcessedUrl[] = [];
    const linkRegex = /href=["'](.*?)["']/g;
    const matches = html.matchAll(linkRegex);
    
    for (const match of matches) {
      const url = match[1];
      const processed = this.processUrl(url, baseUrl, parentDepth);
      if (processed) {
        urls.push(processed);
      }
    }
    
    return urls;
  }
}