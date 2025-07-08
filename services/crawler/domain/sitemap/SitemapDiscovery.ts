/**
 * SitemapDiscovery module for discovering sitemaps on websites
 */

import { URL } from 'url';
import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { JSDOM } from 'jsdom';
import { HttpClient } from '../../../../shared/infrastructure/HttpClient.js';

const logger = getLogger();

/**
 * Handles discovery of sitemaps across different website structures
 */
export class SitemapDiscovery {
  // Common sitemap locations to check
  private readonly COMMON_SITEMAP_PATHS = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap.php',
    '/sitemap.json',
    '/sitemaps/sitemap.xml',
    '/docs/sitemap.xml',
    '/api/sitemap.xml',
    '/documentation/sitemap.xml',
    '/wp-sitemap.xml', // WordPress
    '/sitemap/sitemap.xml',
    '/sitemap-index.xml'
  ];

  /**
   * Create a new sitemap discovery instance
   * @param httpClient HTTP client for fetching sitemaps
   */
  constructor(
    private readonly httpClient: HttpClient
  ) {
    logger.info('SitemapDiscovery initialized', 'SitemapDiscovery');
  }
  
  /**
   * Discover sitemaps for a domain from robots.txt and common locations
   * @param baseUrl Base URL to discover sitemaps for
   * @returns Array of sitemap URLs
   */
  async discoverSitemaps(baseUrl: string): Promise<string[]> {
    try {
      // Parse the URL to get the domain and protocol
      const urlObj = new URL(baseUrl);
      const domain = urlObj.hostname;
      const protocol = urlObj.protocol;
      const baseUrlWithSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      
      logger.info(`Discovering sitemaps for ${baseUrl}`, 'SitemapDiscovery');
      
      // Check robots.txt for Sitemap directives
      const robotsTxtUrl = `${protocol}//${domain}/robots.txt`;
      const foundSitemaps = new Set<string>();
      
      // Try to fetch robots.txt
      await this.discoverFromRobotsTxt(robotsTxtUrl, foundSitemaps);
      
      // If no sitemaps found in robots.txt, check common locations
      if (foundSitemaps.size === 0) {
        await this.discoverFromCommonLocations(protocol, domain, baseUrlWithSlash, foundSitemaps);
      }
      
      // Look for sitemap hints in HTML if we still haven't found any
      if (foundSitemaps.size === 0) {
        await this.discoverFromHtml(baseUrl, protocol, domain, foundSitemaps);
      }
      
      return Array.from(foundSitemaps);
    } catch (error) {
      logger.error(`Error discovering sitemaps: ${error}`, 'SitemapDiscovery');
      return [];
    }
  }

  /**
   * Attempt to discover sitemaps listed in robots.txt
   * @param robotsTxtUrl URL to robots.txt
   * @param foundSitemaps Set to store discovered sitemap URLs
   */
  private async discoverFromRobotsTxt(robotsTxtUrl: string, foundSitemaps: Set<string>): Promise<void> {
    try {
      // Fetch robots.txt
      const response = await this.httpClient.get(robotsTxtUrl, {
        timeout: 10000
      });
      
      const robotsTxt = response.body;
      
      // Extract sitemap URLs from robots.txt using regex
      const sitemapRegex = /Sitemap:\s*(.+)/gi;
      const matches = [...robotsTxt.matchAll(sitemapRegex)];
      
      for (const match of matches) {
        const sitemapUrl = match[1].trim();
        logger.info(`Found sitemap in robots.txt: ${sitemapUrl}`, 'SitemapDiscovery');
        foundSitemaps.add(sitemapUrl);
      }
    } catch (error) {
      logger.warn(`Could not fetch robots.txt: ${error}`, 'SitemapDiscovery');
    }
  }

  /**
   * Check common locations for sitemaps
   * @param protocol URL protocol
   * @param domain Domain name
   * @param baseUrlWithSlash Base URL with trailing slash
   * @param foundSitemaps Set to store discovered sitemap URLs
   */
  private async discoverFromCommonLocations(
    protocol: string, 
    domain: string, 
    baseUrlWithSlash: string, 
    foundSitemaps: Set<string>
  ): Promise<void> {
    logger.info(`No sitemaps found in robots.txt, checking common locations`, 'SitemapDiscovery');
    
    // Try both domain-based and baseUrl-based sitemap locations
    const locationsToCheck = [
      // Domain-based locations
      ...this.COMMON_SITEMAP_PATHS.map(path => `${protocol}//${domain}${path}`),
      // Base URL-based locations (for subdirectory sites)
      ...this.COMMON_SITEMAP_PATHS.map(path => `${baseUrlWithSlash.replace(/\/+$/, '')}${path}`)
    ];
    
    // Filter out duplicates
    const uniqueLocations = [...new Set(locationsToCheck)];
    
    // Try to fetch each location in parallel with a limit
    const checkPromises = uniqueLocations.map(async (location) => {
      try {
        const response = await this.httpClient.get(location, {
          timeout: 5000,
          headers: {
            'Accept': 'application/xml, text/xml, application/json, */*'
          }
        });
        
        if (response.statusCode >= 200 && response.statusCode < 300) {
          logger.info(`Found sitemap at common location: ${location}`, 'SitemapDiscovery');
          return location;
        }
      } catch (error) {
        // Ignore errors, just try the next location
      }
      return null;
    });
    
    // Wait for all requests to complete
    const results = await Promise.all(checkPromises);
    
    // Add valid sitemap URLs to the set
    for (const result of results) {
      if (result) {
        foundSitemaps.add(result);
      }
    }
  }

  /**
   * Attempt to discover sitemaps from HTML page content
   * @param baseUrl Base URL to check
   * @param protocol URL protocol
   * @param domain Domain name
   * @param foundSitemaps Set to store discovered sitemap URLs
   */
  private async discoverFromHtml(
    baseUrl: string, 
    protocol: string, 
    domain: string, 
    foundSitemaps: Set<string>
  ): Promise<void> {
    try {
      const response = await this.httpClient.get(baseUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (compatible; DocSI/1.0; +https://docsi.example.com)'
        }
      });
      
      // Parse HTML to look for sitemap links
      const html = response.body;
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      
      // Look for links containing "sitemap" in href or text
      const links = doc.querySelectorAll('a');
      for (const link of links) {
        const href = link.getAttribute('href');
        const text = link.textContent?.toLowerCase() || '';
        
        if (href && (href.includes('sitemap') || text.includes('sitemap'))) {
          // Resolve relative URLs
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `${protocol}//${domain}${href}`;
          } else if (!href.startsWith('http')) {
            fullUrl = new URL(href, baseUrl).toString();
          }
          
          logger.info(`Found potential sitemap link in HTML: ${fullUrl}`, 'SitemapDiscovery');
          foundSitemaps.add(fullUrl);
        }
      }
      
      // Also check for alternate link rel="sitemap"
      const alternateLinks = doc.querySelectorAll('link[rel="sitemap"]');
      for (const link of alternateLinks) {
        const href = link.getAttribute('href');
        if (href) {
          // Resolve relative URLs
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `${protocol}//${domain}${href}`;
          } else if (!href.startsWith('http')) {
            fullUrl = new URL(href, baseUrl).toString();
          }
          
          logger.info(`Found sitemap link rel: ${fullUrl}`, 'SitemapDiscovery');
          foundSitemaps.add(fullUrl);
        }
      }
    } catch (error) {
      logger.warn(`Could not check HTML for sitemap hints: ${error}`, 'SitemapDiscovery');
    }
  }
}