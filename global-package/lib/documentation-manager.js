import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import os from 'os';
import { 
  createSearchIndex,
  prepareDocumentsForIndexing,
  buildDocumentHierarchy,
  formatSearchResultsForMCP,
  extractDocumentStructure,
  createPageId,
  formatSearchResults
} from './documentation-manager-utils.js';

// Constants for crawling
const MAX_CRAWL_DEPTH = 15;  // Maximum depth for crawling
const MAX_CRAWL_PAGES = 2000; // Maximum pages to crawl
const REQUEST_TIMEOUT = 15000; // 15 seconds timeout for HTTP requests
const CRAWL_TIMEOUT = 20 * 60 * 1000; // 20 minutes timeout for entire crawl

/**
 * Creates a documentation manager
 * @param {string} configFile - Path to the configuration file
 * @param {string} dataDir - Path to the data directory
 * @returns {object} - Documentation manager object
 */
export function createDocumentationManager(configFile, dataDir) {
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // In-memory cache for search indexes and document lookups
  const searchIndexes = {};
  const documentLookups = {};
  const hierarchies = {};
  
  // Load configuration
  function loadConfig() {
    if (!fs.existsSync(configFile)) {
      const defaultConfig = {
        sources: [],
        customLinks: [],
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
    
    const configData = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(configData);
  }
  
  // Save configuration
  function saveConfig(config) {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  }
  
  // Get source data directory
  function getSourceDataDir(sourceId) {
    return path.join(dataDir, sourceId);
  }

  // Helper function to check if a URL is from the same domain
  function isSameDomain(url, baseUrl) {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);
      return urlObj.hostname === baseUrlObj.hostname;
    } catch (error) {
      return false;
    }
  }

  // Content extraction helpers
  function extractHeadings($) {
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      headings.push({
        text: $(el).text().trim(),
        level: parseInt(el.tagName.substring(1)),
        id: $(el).attr('id') || `heading-${i}`
      });
    });
    return headings;
  }

  function extractParagraphs($) {
    const paragraphs = [];
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        paragraphs.push(text);
      }
    });
    return paragraphs;
  }

  function extractCodeBlocks($) {
    const codeBlocks = [];
    $('pre code').each((i, el) => {
      codeBlocks.push({
        code: $(el).text().trim(),
        language: $(el).attr('class') || 'text'
      });
    });
    return codeBlocks;
  }

  function extractLinks($, baseUrl) {
    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          links.push({
            text: $(el).text().trim(),
            url: new URL(href, baseUrl).toString()
          });
        } catch (error) {
          // Skip invalid URLs
        }
      }
    });
    return links;
  }

  // Enhanced page processing
  async function fetchAndProcessPage(url, source) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'DocIndex/0.2.0 (https://github.com/yourusername/docindex)'
        },
        timeout: REQUEST_TIMEOUT
      });
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      // Extract content
      const title = $('title').text().trim();
      const headings = extractHeadings($);
      const paragraphs = extractParagraphs($);
      const codeBlocks = extractCodeBlocks($);
      const links = extractLinks($, url);
      const structure = extractDocumentStructure($);
      
      // Extract main content area if possible
      let mainContent = '';
      $('main, article, .content, .documentation, #content, #main').each((i, el) => {
        if (!mainContent) {
          mainContent = $(el).text().trim();
        }
      });
      
      // Extract full HTML content of the main content area
      let fullHtmlContent = '';
      $('main, article, .content, .documentation, #content, #main').each((i, el) => {
        if (!fullHtmlContent) {
          fullHtmlContent = $(el).html() || '';
        }
      });
      
      // If no main content area found, use the body
      if (!fullHtmlContent) {
        fullHtmlContent = $('body').html() || '';
      }
      
      return {
        url,
        title,
        headings,
        paragraphs,
        codeBlocks,
        links,
        structure,
        mainContent,
        fullHtmlContent,
        sourceId: source.id,
        indexedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      // Return a minimal page object to avoid breaking the crawl
      return {
        url,
        title: url,
        headings: [],
        paragraphs: [],
        codeBlocks: [],
        links: [],
        structure: [],
        mainContent: '',
        fullHtmlContent: '',
        sourceId: source.id,
        indexedAt: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Main crawling function
  async function crawlDocumentation(source, maxPages = MAX_CRAWL_PAGES, maxDepth = MAX_CRAWL_DEPTH) {
    // Ensure maxPages and maxDepth are numbers and within limits
    maxPages = Math.min(parseInt(maxPages) || MAX_CRAWL_PAGES, MAX_CRAWL_PAGES);
    maxDepth = Math.min(parseInt(maxDepth) || MAX_CRAWL_DEPTH, MAX_CRAWL_DEPTH);
    
    const visitedUrls = new Set();
    const queue = [{ url: source.url, depth: 0 }];
    const allPages = [];
    
    console.error(chalk.blue(`Starting breadth-first crawl of ${source.url} (max ${maxPages} pages, depth ${maxDepth})`));
    console.error(chalk.blue(`Crawl will timeout after ${CRAWL_TIMEOUT/60000} minutes if not completed`));
    
    // Set up crawl timeout
    const crawlStartTime = Date.now();
    
    try {
      while (queue.length > 0 && visitedUrls.size < maxPages) {
        // Check if we've exceeded the crawl timeout
        if (Date.now() - crawlStartTime > CRAWL_TIMEOUT) {
          console.error(chalk.yellow(`Crawl timeout reached after ${CRAWL_TIMEOUT/60000} minutes. Stopping with ${visitedUrls.size} pages indexed.`));
          break;
        }
        
        const { url, depth } = queue.shift();
        
        if (visitedUrls.has(url) || depth > maxDepth) {
          continue;
        }
        
        console.error(chalk.blue(`Crawling ${url} (depth: ${depth}, pages indexed: ${visitedUrls.size}/${maxPages})`));
        
        try {
          // Add delay for rate limiting (adaptive based on depth)
          const delay = Math.min(1000 + (depth * 200), 3000); // Increase delay with depth, max 3 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Fetch and process the page
          const pageData = await fetchAndProcessPage(url, source);
          allPages.push(pageData);
          visitedUrls.add(url);
          
          // Add all links from this page to the queue
          if (depth < maxDepth) {
            for (const link of pageData.links) {
              if (!visitedUrls.has(link.url) && isSameDomain(link.url, source.url)) {
                queue.push({ url: link.url, depth: depth + 1 });
              }
            }
          }
        } catch (error) {
          console.error(`Error crawling ${url}:`, error.message);
        }
      }
    } catch (error) {
      console.error("Error in crawling process:", error.message);
    }
    
    console.error(chalk.green(`Crawl completed with ${allPages.length} pages indexed.`));
    return allPages;
  }

  // Save multiple pages from a source
  async function saveIndexedPages(pages, source) {
    // Create a directory for this source
    const sourceDir = getSourceDataDir(source.id);
    if (!fs.existsSync(sourceDir)) {
      fs.mkdirSync(sourceDir, { recursive: true });
    }
    
    // Save each page
    for (const page of pages) {
      const pageId = createPageId(page.url);
      const pagePath = path.join(sourceDir, `${pageId}.json`);
      fs.writeFileSync(pagePath, JSON.stringify(page, null, 2));
    }
    
    // Create an index file with metadata
    const indexFile = {
      id: source.id,
      name: source.name,
      url: source.url,
      pageCount: pages.length,
      pages: pages.map(page => ({
        url: page.url,
        title: page.title,
        id: createPageId(page.url)
      })),
      indexedAt: new Date().toISOString()
    };
    
    const indexPath = path.join(sourceDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(indexFile, null, 2));
    
    // Prepare documents for indexing
    const documents = prepareDocumentsForIndexing(pages, source.name, source.url, source.tags || []);
    
    // Build document hierarchy
    const hierarchy = buildDocumentHierarchy(pages, source.name);
    
    // Save document lookup
    const documentLookupPath = path.join(sourceDir, 'document-lookup.json');
    fs.writeFileSync(documentLookupPath, JSON.stringify(documents), 'utf8');
    
    // Save hierarchy
    const hierarchyPath = path.join(sourceDir, 'hierarchy.json');
    fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchy), 'utf8');
    
    // Update in-memory cache
    documentLookups[source.id] = documents;
    hierarchies[source.name] = hierarchy;
    
    return indexFile;
  }

  // Index documentation from a source
  async function indexDocumentation(source, maxDepth = MAX_CRAWL_DEPTH, maxPages = MAX_CRAWL_PAGES) {
    try {
      console.error(chalk.blue(`Indexing documentation from ${source.url}...`));
      
      // Ensure maxPages and maxDepth are numbers and within limits
      maxPages = Math.min(parseInt(maxPages) || MAX_CRAWL_PAGES, MAX_CRAWL_PAGES);
      maxDepth = Math.min(parseInt(maxDepth) || MAX_CRAWL_DEPTH, MAX_CRAWL_DEPTH);
      
      console.error(chalk.blue(`Using max depth: ${maxDepth}, max pages: ${maxPages}`));
      
      // Crawl the documentation site
      const pages = await crawlDocumentation(source, maxPages, maxDepth);
      
      // Save the indexed pages
      const indexResult = await saveIndexedPages(pages, source);
      
      // Update the source's lastUpdated timestamp
      const config = loadConfig();
      const sourceIndex = config.sources.findIndex(s => s.id === source.id);
      
      if (sourceIndex !== -1) {
        config.sources[sourceIndex].lastUpdated = new Date().toISOString();
        config.sources[sourceIndex].pageCount = pages.length;
        saveConfig(config);
      }
      
      console.error(chalk.green(`Successfully indexed ${pages.length} pages from ${source.url}`));
      return indexResult;
    } catch (error) {
      console.error(`Error indexing documentation from ${source.url}:`, error);
      throw error;
    }
  }
  
  // Load document lookup for a source
  function loadDocumentLookup(sourceId) {
    if (documentLookups[sourceId]) {
      return documentLookups[sourceId];
    }
    
    const sourceDir = getSourceDataDir(sourceId);
    const documentLookupPath = path.join(sourceDir, 'document-lookup.json');
    
    if (fs.existsSync(documentLookupPath)) {
      const documentLookupJson = fs.readFileSync(documentLookupPath, 'utf8');
      const documentLookup = JSON.parse(documentLookupJson);
      documentLookups[sourceId] = documentLookup;
      return documentLookup;
    }
    
    return [];
  }
  
  // Load hierarchy for a source
  function loadHierarchy(sourceName, sourceId) {
    if (hierarchies[sourceName]) {
      return hierarchies[sourceName];
    }
    
    const sourceDir = getSourceDataDir(sourceId);
    const hierarchyPath = path.join(sourceDir, 'hierarchy.json');
    
    if (fs.existsSync(hierarchyPath)) {
      const hierarchyJson = fs.readFileSync(hierarchyPath, 'utf8');
      const hierarchy = JSON.parse(hierarchyJson);
      hierarchies[sourceName] = hierarchy;
      return hierarchy;
    }
    
    return null;
  }
  
  // Get full document content by URL or ID
  function getFullDocumentContent(urlOrId) {
    const config = loadConfig();
    
    // Try to find the document by URL or ID
    for (const source of config.sources) {
      const sourceDir = getSourceDataDir(source.id);
      
      // If it's an ID, try to load directly
      if (urlOrId.length === 32 && /^[a-f0-9]+$/.test(urlOrId)) {
        const pagePath = path.join(sourceDir, `${urlOrId}.json`);
        if (fs.existsSync(pagePath)) {
          const pageData = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
          return {
            title: pageData.title,
            url: pageData.url,
            content: formatFullDocumentContent(pageData),
            source: source.name
          };
        }
      }
      
      // If it's a URL, compute the ID and try to load
      const pageId = createPageId(urlOrId);
      const pagePath = path.join(sourceDir, `${pageId}.json`);
      
      if (fs.existsSync(pagePath)) {
        const pageData = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
        return {
          title: pageData.title,
          url: pageData.url,
          content: formatFullDocumentContent(pageData),
          source: source.name
        };
      }
    }
    
    return null;
  }
  
  // Format full document content as markdown
  function formatFullDocumentContent(pageData) {
    let markdown = `# ${pageData.title}\n\n`;
    
    // Add headings and paragraphs in order
    if (pageData.structure && pageData.structure.length > 0) {
      pageData.structure.forEach(section => {
        const headingLevel = '#'.repeat(section.level);
        markdown += `${headingLevel} ${section.text}\n\n`;
        
        section.children.forEach(child => {
          if (child.type === 'paragraph') {
            markdown += `${child.text}\n\n`;
          } else if (child.type === 'code') {
            markdown += `\`\`\`\n${child.text}\n\`\`\`\n\n`;
          } else if (child.type === 'unordered-list') {
            child.items.forEach(item => {
              markdown += `- ${item}\n`;
            });
            markdown += '\n';
          } else if (child.type === 'ordered-list') {
            child.items.forEach((item, i) => {
              markdown += `${i+1}. ${item}\n`;
            });
            markdown += '\n';
          }
        });
      });
    } else {
      // Fallback to using headings and paragraphs directly
      let currentHeadingLevel = 0;
      
      pageData.headings.forEach(heading => {
        const headingLevel = '#'.repeat(heading.level);
        markdown += `${headingLevel} ${heading.text}\n\n`;
        currentHeadingLevel = heading.level;
      });
      
      pageData.paragraphs.forEach(paragraph => {
        markdown += `${paragraph}\n\n`;
      });
      
      // Add code blocks
      if (pageData.codeBlocks && pageData.codeBlocks.length > 0) {
        markdown += `## Code Examples\n\n`;
        pageData.codeBlocks.forEach(block => {
          markdown += `\`\`\`${block.language || ''}\n${block.code}\n\`\`\`\n\n`;
        });
      }
    }
    
    // Add source link
    markdown += `---\n[View Original Documentation](${pageData.url})\n`;
    
    return markdown;
  }
  
  // Get all indexed pages for a source
  function getIndexedPages(sourceName) {
    const config = loadConfig();
    const source = config.sources.find(s => s.name === sourceName);
    
    if (!source) {
      throw new Error(`Documentation source "${sourceName}" not found`);
    }
    
    const sourceDir = getSourceDataDir(source.id);
    const indexPath = path.join(sourceDir, 'index.json');
    
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Index file for source "${sourceName}" not found`);
    }
    
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // Sort pages by title for better readability
    indexData.pages.sort((a, b) => {
      if (a.title && b.title) {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
    
    return {
      name: source.name,
      url: source.url,
      pageCount: indexData.pages.length,
      indexedAt: indexData.indexedAt,
      pages: indexData.pages
    };
  }
  
  return {
    /**
     * Add a documentation source
     * @param {string} url - URL of the documentation
     * @param {string} name - Name of the documentation source
     * @param {string[]} tags - Tags for the documentation source
     * @param {number} maxDepth - Maximum crawl depth
     * @param {number} maxPages - Maximum pages to crawl
     * @returns {Promise<object>} - The added source
     */
    addDocumentationSource: async function(url, name, tags = [], maxDepth = MAX_CRAWL_DEPTH, maxPages = MAX_CRAWL_PAGES) {
      console.error(chalk.blue(`Adding documentation source: ${name} (${url})`));
      
      const config = loadConfig();
      
      // Check if source already exists
      const existingSourceIndex = config.sources.findIndex(source => source.name === name);
      
      if (existingSourceIndex !== -1) {
        throw new Error(`Documentation source with name "${name}" already exists`);
      }
      
      // Create new source
      const sourceId = Date.now().toString();
      const newSource = {
        id: sourceId,
        name,
        url,
        tags,
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      // Create source data directory
      const sourceDataDir = getSourceDataDir(sourceId);
      if (!fs.existsSync(sourceDataDir)) {
        fs.mkdirSync(sourceDataDir, { recursive: true });
      }
      
      // Add to config
      config.sources.push(newSource);
      saveConfig(config);
      
      // Index the documentation
      const indexResult = await indexDocumentation(newSource, maxDepth, maxPages);
      
      // Update source with page count
      const updatedConfig = loadConfig();
      const sourceIndex = updatedConfig.sources.findIndex(s => s.id === newSource.id);
      if (sourceIndex !== -1) {
        updatedConfig.sources[sourceIndex].pageCount = indexResult.pageCount;
        saveConfig(updatedConfig);
      }
      
      return { ...newSource, pageCount: indexResult.pageCount };
    },
    
    /**
     * Add a custom documentation link
     * @param {string} url - URL of the documentation
     * @param {string} name - Name of the link
     * @param {string[]} tags - Tags for the link
     * @returns {object} - The added link
     */
    addCustomLink: function(url, name, tags = []) {
      console.error(chalk.blue(`Adding custom link: ${name} (${url})`));
      
      const config = loadConfig();
      
      // Check if link already exists
      const existingLinkIndex = config.customLinks.findIndex(link => link.name === name);
      
      if (existingLinkIndex !== -1) {
        throw new Error(`Custom link with name "${name}" already exists`);
      }
      
      // Create new link
      const newLink = {
        id: Date.now().toString(),
        name,
        url,
        tags,
        addedAt: new Date().toISOString()
      };
      
      // Add to config
      config.customLinks.push(newLink);
      saveConfig(config);
      
      return newLink;
    },
    
    /**
     * Update documentation for a source
     * @param {string} sourceName - Name of the documentation source
     * @param {number} maxDepth - Maximum crawl depth
     * @param {number} maxPages - Maximum pages to crawl
     * @returns {Promise<object>} - The updated source
     */
    updateDocumentation: async function(sourceName, maxDepth = MAX_CRAWL_DEPTH, maxPages = MAX_CRAWL_PAGES) {
      console.error(chalk.blue(`Updating documentation for source: ${sourceName}`));
      
      const config = loadConfig();
      const source = config.sources.find(s => s.name === sourceName);
      
      if (!source) {
        throw new Error(`Documentation source "${sourceName}" not found`);
      }
      
      return await indexDocumentation(source, maxDepth, maxPages);
    },
    
    /**
     * Search documentation
     * @param {string} query - The search query
     * @returns {Promise<object>} - Search results
     */
    searchDocumentation: async function(query) {
      console.error(chalk.blue(`Searching documentation for: ${query}`));
      
      const config = loadConfig();
      const allDocuments = [];
      const allHierarchies = {};
      
      // Collect all documents and hierarchies
      for (const source of config.sources) {
        const documents = loadDocumentLookup(source.id);
        const hierarchy = loadHierarchy(source.name, source.id);
        
        if (documents && documents.length > 0) {
          allDocuments.push(...documents);
          
          // Store hierarchy
          if (hierarchy) {
            allHierarchies[source.name] = hierarchy;
          }
        }
      }
      
      // Create a Fuse.js instance for searching
      const fuse = createSearchIndex(allDocuments);
      
      // Perform the search
      const searchResults = fuse.search(query);
      
      // Format results
      const formattedResults = formatSearchResultsForMCP(
        formatSearchResults(searchResults, allHierarchies, query)
      );
      
      // Search in custom links
      const matchingCustomLinks = config.customLinks.filter(link => 
        link.name.toLowerCase().includes(query.toLowerCase()) ||
        (link.tags && link.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
      );
      
      return {
        documentationMatches: formattedResults,
        customLinkMatches: matchingCustomLinks
      };
    },
    
    /**
     * Get full document content
     * @param {string} urlOrId - URL or ID of the document
     * @returns {object} - The document content
     */
    getFullDocument: function(urlOrId) {
      console.error(chalk.blue(`Getting full document content for: ${urlOrId}`));
      
      const document = getFullDocumentContent(urlOrId);
      
      if (!document) {
        throw new Error(`Document not found: ${urlOrId}`);
      }
      
      return document;
    },
    
    /**
     * Get all indexed pages for a source
     * @param {string} sourceName - Name of the documentation source
     * @returns {object} - The indexed pages
     */
    getIndexedPages: function(sourceName) {
      console.error(chalk.blue(`Getting indexed pages for source: ${sourceName}`));
      
      return getIndexedPages(sourceName);
    },
    
    /**
     * List all documentation sources
     * @returns {object[]} - List of documentation sources
     */
    listDocumentationSources: function() {
      console.error(chalk.blue('Listing documentation sources'));
      
      const config = loadConfig();
      return config.sources;
    },
    
    /**
     * List all custom links
     * @returns {object[]} - List of custom links
     */
    listCustomLinks: function() {
      console.error(chalk.blue('Listing custom links'));
      
      const config = loadConfig();
      return config.customLinks;
    },
    
    /**
     * Get data directory path
     * @returns {string} - Path to the data directory
     */
    getDataDirectory: function() {
      return dataDir;
    },
    
    /**
     * Remove a documentation source
     * @param {string} sourceName - Name of the documentation source
     * @returns {object} - The removed source
     */
    removeDocumentationSource: function(sourceName) {
      console.error(chalk.blue(`Removing documentation source: ${sourceName}`));
      
      const config = loadConfig();
      const sourceIndex = config.sources.findIndex(source => source.name === sourceName);
      
      if (sourceIndex === -1) {
        throw new Error(`Documentation source "${sourceName}" not found`);
      }
      
      const source = config.sources[sourceIndex];
      
      // Remove source data directory
      const sourceDataDir = getSourceDataDir(source.id);
      if (fs.existsSync(sourceDataDir)) {
        fs.rmSync(sourceDataDir, { recursive: true, force: true });
      }
      
      // Remove from config
      config.sources.splice(sourceIndex, 1);
      saveConfig(config);
      
      // Remove from in-memory cache
      delete searchIndexes[source.id];
      delete documentLookups[source.id];
      delete hierarchies[source.name];
      
      return source;
    },
    
    /**
     * Remove a custom link
     * @param {string} linkName - Name of the custom link
     * @returns {object} - The removed link
     */
    removeCustomLink: function(linkName) {
      console.error(chalk.blue(`Removing custom link: ${linkName}`));
      
      const config = loadConfig();
      const linkIndex = config.customLinks.findIndex(link => link.name === linkName);
      
      if (linkIndex === -1) {
        throw new Error(`Custom link "${linkName}" not found`);
      }
      
      const link = config.customLinks[linkIndex];
      
      // Remove from config
      config.customLinks.splice(linkIndex, 1);
      saveConfig(config);
      
      return link;
    }
  };
}
