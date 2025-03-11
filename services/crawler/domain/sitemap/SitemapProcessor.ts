/**
 * Enhanced SitemapProcessor that coordinates the various sitemap handling modules
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { HttpClient } from '../../../../shared/infrastructure/HttpClient.js';
import { SitemapEntry, RawSitemapUrl } from './SitemapTypes.js';
import { SitemapDiscovery } from './SitemapDiscovery.js';
import { SitemapParser } from './SitemapParser.js';
import { SitemapScorer } from './SitemapScorer.js';
import { URL } from 'url';

const logger = getLogger();

/**
 * Main processor for XML sitemaps - coordinates discovery, parsing, and scoring
 */
export class SitemapProcessor {
  private discovery: SitemapDiscovery;
  private parser: SitemapParser;
  private scorer: SitemapScorer;
  
  /**
   * Create a new sitemap processor
   * @param httpClient HTTP client for fetching sitemaps
   */
  constructor(
    private readonly httpClient: HttpClient
  ) {
    this.discovery = new SitemapDiscovery(httpClient);
    this.parser = new SitemapParser();
    this.scorer = new SitemapScorer();
    
    logger.info('SitemapProcessor initialized', 'SitemapProcessor');
  }
  
  /**
   * Process a sitemap URL, handling both regular sitemaps and sitemap indexes
   * @param sitemapUrl URL of the sitemap
   * @returns Array of URLs found in the sitemap
   */
  async processSitemap(sitemapUrl: string): Promise<SitemapEntry[]> {
    try {
      logger.info(`Processing sitemap: ${sitemapUrl}`, 'SitemapProcessor');
      
      // Extract base domain for scoring
      let baseUrl = '';
      try {
        const urlObj = new URL(sitemapUrl);
        baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      } catch (error) {
        logger.warn(`Invalid URL: ${sitemapUrl}`, 'SitemapProcessor');
        baseUrl = sitemapUrl;
      }
      
      // Fetch sitemap with improved error handling and retry logic
      const maxRetries = 2;
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            logger.info(`Retry ${attempt}/${maxRetries} for sitemap: ${sitemapUrl}`, 'SitemapProcessor');
            // Add exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
          
          // Fetch sitemap
          const response = await this.httpClient.get(sitemapUrl, {
            timeout: 30000,
            headers: {
              'Accept': 'application/xml, text/xml, application/json, */*',
              'Accept-Encoding': 'gzip, deflate',
              'User-Agent': 'Mozilla/5.0 (compatible; DocSI/1.0; +https://docsi.example.com)'
            }
          });
          
          const sitemapContent = response.body;
          const contentType = response.headers['content-type'] || '';
          
          // Check for JSON sitemaps
          if (contentType.includes('json') || sitemapUrl.endsWith('.json')) {
            const entries = this.parser.processJsonSitemap(sitemapContent);
            
            // Score entries
            for (const entry of entries) {
              entry.score = this.scorer.calculateUrlScore(entry.url, baseUrl);
            }
            
            return entries;
          }
          
          // Parse XML
          const parsed = await this.parser.parseXml(sitemapContent);
          
          // Check if this is a sitemap index
          if (parsed.sitemapindex) {
            logger.info(`Detected sitemap index with ${parsed.sitemapindex.sitemap ? (Array.isArray(parsed.sitemapindex.sitemap) ? parsed.sitemapindex.sitemap.length : 1) : 0} sitemaps`, 'SitemapProcessor');
            
            // Convert to array if it's not already
            const sitemaps = Array.isArray(parsed.sitemapindex.sitemap) 
              ? parsed.sitemapindex.sitemap 
              : [parsed.sitemapindex.sitemap].filter(Boolean);
            
            // Process each sitemap in the index
            const allEntries: SitemapEntry[] = [];
            
            for (const sitemap of sitemaps) {
              if (sitemap && sitemap.loc) {
                try {
                  const childEntries = await this.processSitemap(sitemap.loc);
                  allEntries.push(...childEntries);
                } catch (error) {
                  logger.warn(`Error processing child sitemap ${sitemap.loc}: ${error}`, 'SitemapProcessor');
                  // Continue with other sitemaps instead of failing completely
                }
              }
            }
            
            logger.info(`Extracted ${allEntries.length} URLs from sitemap index`, 'SitemapProcessor');
            return allEntries;
          } else if (parsed.urlset) {
            // Regular sitemap
            // Convert to array if it's not already
            const urls = Array.isArray(parsed.urlset.url) 
              ? parsed.urlset.url 
              : [parsed.urlset.url].filter(Boolean);
            
            // Extract URLs and metadata
            const entries: SitemapEntry[] = urls.map((url: RawSitemapUrl) => {
              const entry: SitemapEntry = {
                url: url.loc,
                fromSitemap: true
              };
              
              // Add optional fields if available
              if (url.lastmod) {
                entry.lastmod = new Date(url.lastmod);
              }
              
              if (url.changefreq) {
                entry.changefreq = url.changefreq;
              }
              
              if (url.priority) {
                entry.priority = parseFloat(url.priority);
              }
              
              // Calculate additional score based on URL characteristics
              entry.score = this.scorer.calculateUrlScore(entry.url, baseUrl);
              
              return entry;
            }).filter((entry: SitemapEntry) => entry.url);
            
            logger.info(`Extracted ${entries.length} URLs from sitemap`, 'SitemapProcessor');
            return entries;
          }
          
          logger.warn(`No URLs found in sitemap: ${sitemapUrl}`, 'SitemapProcessor');
          return [];
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.warn(`Attempt ${attempt + 1}/${maxRetries + 1} failed for sitemap ${sitemapUrl}: ${lastError.message}`, 'SitemapProcessor');
          
          if (attempt === maxRetries) {
            throw lastError;
          }
        }
      }
      
      throw lastError || new Error(`Failed to process sitemap: ${sitemapUrl}`);
    } catch (error) {
      logger.error(`Error processing sitemap ${sitemapUrl}: ${error}`, 'SitemapProcessor');
      return [];
    }
  }
  
  /**
   * Discover and process all sitemaps for a URL
   * @param url URL to process (used to extract domain)
   * @returns Array of discovered URLs
   */
  async discoverAndProcessSitemaps(url: string): Promise<SitemapEntry[]> {
    try {
      // Extract base URL for scoring
      let baseUrl = '';
      try {
        const urlObj = new URL(url);
        baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      } catch (error) {
        logger.warn(`Invalid URL: ${url}`, 'SitemapProcessor');
        baseUrl = url;
      }
      
      // Discover sitemaps
      const sitemapUrls = await this.discovery.discoverSitemaps(url);
      
      if (sitemapUrls.length === 0) {
        logger.warn(`No sitemaps found for ${url}`, 'SitemapProcessor');
        return [];
      }
      
      // Process all discovered sitemaps
      const allEntries: SitemapEntry[] = [];
      
      // Process sitemaps in parallel with a limit
      const batchSize = 3; // Process up to 3 sitemaps in parallel
      for (let i = 0; i < sitemapUrls.length; i += batchSize) {
        const batch = sitemapUrls.slice(i, i + batchSize);
        const batchPromises = batch.map(sitemapUrl => 
          this.processSitemap(sitemapUrl).catch(error => {
            logger.error(`Error processing sitemap ${sitemapUrl}: ${error}`, 'SitemapProcessor');
            return [];
          })
        );
        
        const batchResults = await Promise.all(batchPromises);
        for (const entries of batchResults) {
          allEntries.push(...entries);
        }
      }
      
      // Remove duplicates while keeping highest priority entries
      const uniqueUrls = new Map<string, SitemapEntry>();
      
      for (const entry of allEntries) {
        const existingEntry = uniqueUrls.get(entry.url);
        if (!existingEntry || (entry.score !== undefined && existingEntry.score !== undefined && entry.score < existingEntry.score)) {
          uniqueUrls.set(entry.url, entry);
        }
      }
      
      const result = Array.from(uniqueUrls.values());
      logger.info(`Discovered ${result.length} unique URLs from sitemaps for ${url}`, 'SitemapProcessor');
      
      return result;
    } catch (error) {
      logger.error(`Error discovering and processing sitemaps: ${error}`, 'SitemapProcessor');
      return [];
    }
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
    return this.scorer.filterEntries(entries, includePatterns, excludePatterns);
  }
  
  /**
   * Sort sitemap entries by priority
   * @param entries Sitemap entries to sort
   * @returns Sorted sitemap entries
   */
  sortEntriesByPriority(entries: SitemapEntry[]): SitemapEntry[] {
    // Extract base URL from first entry for scoring context
    let baseUrl = '';
    if (entries.length > 0) {
      try {
        const urlObj = new URL(entries[0].url);
        baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      } catch (error) {
        logger.warn(`Invalid URL in entries: ${entries[0].url}`, 'SitemapProcessor');
      }
    }
    
    return this.scorer.sortEntriesByPriority(entries, baseUrl);
  }
}