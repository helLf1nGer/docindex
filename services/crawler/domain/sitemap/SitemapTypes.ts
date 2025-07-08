/**
 * Type definitions for sitemap processing
 */

/**
 * Interface for sitemap entry
 */
export interface SitemapEntry {
  /** URL of the page */
  url: string;
  
  /** Last modified date (if available) */
  lastmod?: Date;
  
  /** Change frequency (if available) */
  changefreq?: string;
  
  /** Priority (if available) */
  priority?: number;
  
  /** Whether this entry was found in a sitemap */
  fromSitemap?: boolean;
  
  /** Score assigned during prioritization */
  score?: number;
  
  /** Content type, if known */
  contentType?: string;
  
  /** Calculated depth for this URL (for crawler) */
  calculatedDepth?: number;
  
  /** Flag to indicate this URL came from a sitemap */
  isFromSitemap?: boolean;
}

/**
 * Raw sitemap URL data extracted from XML
 */
export interface RawSitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Raw sitemap data extracted from XML
 */
export interface RawSitemap {
  loc: string;
  lastmod?: string;
}

/**
 * Sitemap index structure with child sitemaps
 */
export interface SitemapIndex {
  /** URLs of child sitemaps */
  sitemaps: string[];
  
  /** Last modified date of the index (if available) */
  lastmod?: Date;
}