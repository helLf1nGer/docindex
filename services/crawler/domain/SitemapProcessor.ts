/**
 * SitemapProcessor for handling sitemap discovery and parsing
 * 
 * This class is responsible for discovering and parsing XML sitemaps,
 * which are crucial for efficient URL discovery in documentation sites.
 * It handles both standard sitemaps and sitemap index files.
 * 
 * This facade maintains the original interface but uses the new modular components
 * internally for better organization and maintainability.
 */

import { URL } from 'url';
import { HttpClient } from '../../../shared/infrastructure/HttpClient.js';
import { SitemapProcessor as ModularSitemapProcessor } from './sitemap/SitemapProcessor.js';
import { SitemapEntry } from './sitemap/SitemapTypes.js';
import { SitemapDiscovery } from './sitemap/SitemapDiscovery.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';

const logger = getLogger();

// Re-export the SitemapEntry type for backwards compatibility
export { SitemapEntry } from './sitemap/SitemapTypes.js';

/**
 * Processor for XML sitemaps
 */
export class SitemapProcessor {
  private processor: ModularSitemapProcessor;
  private discovery: SitemapDiscovery;
  
  /**
   * Create a new sitemap processor
   * @param httpClient HTTP client for fetching sitemaps
   */
  constructor(
    private readonly httpClient: HttpClient
  ) {
    this.processor = new ModularSitemapProcessor(httpClient);
    this.discovery = new SitemapDiscovery(httpClient); // Create our own instance
    logger.info('SitemapProcessor facade initialized', 'SitemapProcessor');
  }
  
  /**
   * Discover sitemaps for a domain from robots.txt
   * @param domain Domain to discover sitemaps for
   * @returns Array of sitemap URLs
   */
  async discoverSitemaps(domain: string): Promise<string[]> {
    // Convert domain to a full URL for the new implementation
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    return this.discovery.discoverSitemaps(url);
  }
  
  /**
   * Process a sitemap URL, handling both regular sitemaps and sitemap indexes
   * @param sitemapUrl URL of the sitemap
   * @returns Array of URLs found in the sitemap
   */
  async processSitemap(sitemapUrl: string): Promise<SitemapEntry[]> {
    return this.processor.processSitemap(sitemapUrl);
  }
  
  /**
   * Discover and process all sitemaps for a URL
   * @param url URL to process (used to extract domain)
   * @returns Array of discovered URLs
   */
  async discoverAndProcessSitemaps(url: string): Promise<SitemapEntry[]> {
    return this.processor.discoverAndProcessSitemaps(url);
  }
  
  /**
   * Filter sitemap entries by path patterns
   * @param entries Sitemap entries to filter
   * @param includePatterns Regex patterns to include
   * @param excludePatterns Regex patterns to exclude
   * @returns Filtered sitemap entries
   */
  filterEntries(
    entries: SitemapEntry[],
    includePatterns?: string[],
    excludePatterns?: string[]
  ): SitemapEntry[] {
    return this.processor.filterEntries(entries, includePatterns, excludePatterns);
  }
  
  /**
   * Sort sitemap entries by priority
   * @param entries Sitemap entries to sort
   * @returns Sorted sitemap entries
   */
  sortEntriesByPriority(entries: SitemapEntry[]): SitemapEntry[] {
    return this.processor.sortEntriesByPriority(entries);
  }
}