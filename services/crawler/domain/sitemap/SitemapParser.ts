/**
 * SitemapParser module for parsing XML and JSON sitemaps
 */

import { JSDOM } from 'jsdom';
import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { SitemapEntry, RawSitemap, RawSitemapUrl, SitemapIndex } from './SitemapTypes.js';

const logger = getLogger();

/**
 * Handles parsing of various sitemap formats (XML, JSON)
 */
export class SitemapParser {
  /**
   * Parse XML string into a JavaScript object
   * @param xml XML string to parse
   * @returns Parsed XML as JavaScript object
   */
  async parseXml(xml: string): Promise<any> {
    try {
      // Use JSDOM to parse XML
      const dom = new JSDOM(xml, { contentType: 'text/xml' });
      const xmlDoc = dom.window.document;
      
      // Check for the root element
      const rootElement = xmlDoc.documentElement;
      if (!rootElement) {
        throw new Error('No root element found in XML');
      }
      
      // Determine if this is a sitemap index or a regular sitemap
      if (rootElement.nodeName === 'sitemapindex') {
        return {
          sitemapindex: {
            sitemap: this.extractSitemaps(rootElement)
          }
        };
      } else if (rootElement.nodeName === 'urlset') {
        return {
          urlset: {
            url: this.extractUrls(rootElement)
          }
        };
      } else {
        throw new Error(`Unrecognized XML root element: ${rootElement.nodeName}`);
      }
    } catch (error) {
      logger.error(`Error parsing XML: ${error}`, 'SitemapParser');
      throw error;
    }
  }
  
  /**
   * Check if content is a sitemap index
   * @param content XML content to check
   * @returns True if content is a sitemap index
   */
  isSitemapIndex(content: string): boolean {
    try {
      const dom = new JSDOM(content, { contentType: 'text/xml' });
      const xmlDoc = dom.window.document;
      
      // Check for sitemapindex root element
      const rootElement = xmlDoc.documentElement;
      if (!rootElement) {
        return false;
      }
      
      return rootElement.nodeName === 'sitemapindex';
    } catch (error) {
      logger.warn(`Error checking if content is a sitemap index: ${error}`, 'SitemapParser');
      return false;
    }
  }
  
  /**
   * Parse a sitemap index into a SitemapIndex object
   * @param content XML sitemap index content
   * @returns Parsed sitemap index
   */
  parseSitemapIndex(content: string): SitemapIndex {
    try {
      const dom = new JSDOM(content, { contentType: 'text/xml' });
      const xmlDoc = dom.window.document;
      
      // Check for sitemapindex root element
      const rootElement = xmlDoc.documentElement;
      if (!rootElement || rootElement.nodeName !== 'sitemapindex') {
        throw new Error('Not a valid sitemap index');
      }
      
      // Extract child sitemaps
      const rawSitemaps = this.extractSitemaps(rootElement);
      
      // Convert to URLs array
      const sitemapUrls = rawSitemaps.map(sitemap => sitemap.loc);
      
      // Parse lastmod if available from first sitemap
      let lastmod: Date | undefined = undefined;
      if (rawSitemaps.length > 0 && rawSitemaps[0].lastmod) {
        try {
          lastmod = new Date(rawSitemaps[0].lastmod);
        } catch (error) {
          logger.warn(`Failed to parse lastmod date: ${rawSitemaps[0].lastmod}`, 'SitemapParser');
        }
      }
      
      return {
        sitemaps: sitemapUrls,
        lastmod
      };
    } catch (error) {
      logger.error(`Error parsing sitemap index: ${error}`, 'SitemapParser');
      throw error;
    }
  }
  
  /**
   * Parse a sitemap into an array of sitemap entries
   * @param content XML or JSON sitemap content
   * @returns Array of sitemap entries
   */
  parseSitemap(content: string): SitemapEntry[] {
    try {
      // Detect content type (XML or JSON)
      const trimmedContent = content.trim();
      if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
        // JSON sitemap
        return this.processJsonSitemap(content);
      } else {
        // XML sitemap
        return this.processXmlSitemap(content);
      }
    } catch (error) {
      logger.error(`Error parsing sitemap: ${error}`, 'SitemapParser');
      return [];
    }
  }
  
  /**
   * Process an XML sitemap into sitemap entries
   * @param xml XML sitemap content
   * @returns Array of sitemap entries
   */
  private processXmlSitemap(xml: string): SitemapEntry[] {
    try {
      const dom = new JSDOM(xml, { contentType: 'text/xml' });
      const xmlDoc = dom.window.document;
      
      // Check for urlset root element
      const rootElement = xmlDoc.documentElement;
      if (!rootElement || rootElement.nodeName !== 'urlset') {
        throw new Error('Not a valid sitemap');
      }
      
      // Extract raw URLs
      const rawUrls = this.extractUrls(rootElement);
      
      // Convert to SitemapEntry array
      const entries: SitemapEntry[] = rawUrls.map(rawUrl => {
        const entry: SitemapEntry = {
          url: rawUrl.loc,
          fromSitemap: true
        };
        
        if (rawUrl.lastmod) {
          try {
            entry.lastmod = new Date(rawUrl.lastmod);
          } catch (error) {
            logger.warn(`Failed to parse lastmod date: ${rawUrl.lastmod}`, 'SitemapParser');
          }
        }
        
        if (rawUrl.changefreq) {
          entry.changefreq = rawUrl.changefreq;
        }
        
        if (rawUrl.priority) {
          entry.priority = parseFloat(rawUrl.priority);
          
          // Ensure priority is within valid range
          if (isNaN(entry.priority) || entry.priority < 0 || entry.priority > 1) {
            logger.warn(`Invalid priority value: ${rawUrl.priority}, resetting to default`, 'SitemapParser');
            entry.priority = 0.5;
          }
        }
        
        return entry;
      });
      
      logger.info(`Processed XML sitemap with ${entries.length} URLs`, 'SitemapParser');
      return entries;
    } catch (error) {
      logger.error(`Error processing XML sitemap: ${error}`, 'SitemapParser');
      return [];
    }
  }
  
  /**
   * Extract sitemaps from a sitemapindex element
   * @param sitemapIndex The sitemapindex element
   * @returns Array of sitemap objects
   */
  private extractSitemaps(sitemapIndex: Element): RawSitemap[] {
    const sitemaps: RawSitemap[] = [];
    const sitemapElements = sitemapIndex.getElementsByTagName('sitemap');
    
    for (let i = 0; i < sitemapElements.length; i++) {
      const sitemapElement = sitemapElements[i];
      const locElement = sitemapElement.getElementsByTagName('loc')[0];
      const lastmodElement = sitemapElement.getElementsByTagName('lastmod')[0];
      
      if (locElement && locElement.textContent) {
        const loc = locElement.textContent;
        const lastmod = lastmodElement?.textContent;
        
        sitemaps.push({
          loc,
          lastmod: lastmod || undefined
        });
      }
    }
    
    return sitemaps;
  }
  
  /**
   * Extract URLs from a urlset element
   * @param urlset The urlset element
   * @returns Array of URL objects
   */
  private extractUrls(urlset: Element): RawSitemapUrl[] {
    const urls: RawSitemapUrl[] = [];
    const urlElements = urlset.getElementsByTagName('url');
    
    for (let i = 0; i < urlElements.length; i++) {
      const urlElement = urlElements[i];
      const locElement = urlElement.getElementsByTagName('loc')[0];
      
      if (locElement && locElement.textContent) {
        const loc = locElement.textContent;
        const lastmod = urlElement.getElementsByTagName('lastmod')[0]?.textContent;
        const changefreq = urlElement.getElementsByTagName('changefreq')[0]?.textContent;
        const priority = urlElement.getElementsByTagName('priority')[0]?.textContent;
        
        const url: RawSitemapUrl = { loc };
        if (lastmod) url.lastmod = lastmod;
        if (changefreq) url.changefreq = changefreq;
        if (priority) url.priority = priority;
        
        urls.push(url);
      }
    }
    
    return urls;
  }
  
  /**
   * Process a JSON formatted sitemap
   * @param jsonContent JSON content string
   * @returns Parsed sitemap entries
   */
  processJsonSitemap(jsonContent: string): SitemapEntry[] {
    try {
      const data = JSON.parse(jsonContent);
      const entries: SitemapEntry[] = [];
      
      // Handle different JSON sitemap formats
      
      // Format 1: Array of URL strings
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
        entries.push(...data.map((url: string) => ({
          url,
          fromSitemap: true
        })));
      }
      // Format 2: Array of objects with url/loc property
      else if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        for (const item of data) {
          if (item.url || item.loc) {
            const entry: SitemapEntry = {
              url: item.url || item.loc,
              fromSitemap: true
            };
            
            if (item.lastmod) {
              entry.lastmod = new Date(item.lastmod);
            }
            
            if (item.changefreq) {
              entry.changefreq = item.changefreq;
            }
            
            if (item.priority) {
              entry.priority = parseFloat(item.priority);
            }
            
            entries.push(entry);
          }
        }
      }
      // Format 3: Object with urls property containing array
      else if (data.urls && Array.isArray(data.urls)) {
        return this.processJsonSitemap(JSON.stringify(data.urls));
      }
      // Format 4: Object with urlset property (XML-like structure)
      else if (data.urlset && data.urlset.url && Array.isArray(data.urlset.url)) {
        for (const item of data.urlset.url) {
          if (item.loc) {
            const entry: SitemapEntry = {
              url: item.loc,
              fromSitemap: true
            };
            
            if (item.lastmod) {
              entry.lastmod = new Date(item.lastmod);
            }
            
            if (item.changefreq) {
              entry.changefreq = item.changefreq;
            }
            
            if (item.priority) {
              entry.priority = parseFloat(item.priority);
            }
            
            entries.push(entry);
          }
        }
      }
      
      logger.info(`Processed JSON sitemap with ${entries.length} URLs`, 'SitemapParser');
      return entries;
    } catch (error) {
      logger.error(`Error processing JSON sitemap: ${error}`, 'SitemapParser');
      return [];
    }
  }
}