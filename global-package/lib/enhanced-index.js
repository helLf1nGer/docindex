const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { parse } = require('node-html-parser');
const os = require('os');
const crypto = require('crypto');

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.docindex');
const DATA_DIR = path.join(CONFIG_DIR, 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure directories exist
function ensureDirectoriesExist() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load configuration
function loadConfig() {
  ensureDirectoriesExist();
  
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
      sources: [],
      customLinks: [],
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
  
  const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(configData);
}

// Save configuration
function saveConfig(config) {
  ensureDirectoriesExist();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Add a documentation source
async function addDocumentationSource(url, name, tags = [], maxDepth = 3, maxPages = 100) {
  const config = loadConfig();
  
  // Check if source already exists
  const existingSourceIndex = config.sources.findIndex(source => source.name === name);
  
  if (existingSourceIndex !== -1) {
    throw new Error(`Documentation source with name "${name}" already exists`);
  }
  
  // Create new source
  const newSource = {
    id: Date.now().toString(),
    name,
    url,
    tags,
    addedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  
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
}

// Add a custom documentation link
function addCustomLink(url, name, tags = []) {
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
}

// Main crawling function
async function crawlDocumentation(source, maxPages = 100, maxDepth = 3) {
  // Ensure maxPages and maxDepth are numbers
  maxPages = parseInt(maxPages) || 100;
  maxDepth = parseInt(maxDepth) || 3;
  
  const visitedUrls = new Set();
  const queue = [{ url: source.url, depth: 0 }];
  const allPages = [];
  
  console.log(`Starting breadth-first crawl of ${source.url} (max ${maxPages} pages, depth ${maxDepth})`);
  
  try {
    while (queue.length > 0 && visitedUrls.size < maxPages) {
      const { url, depth } = queue.shift();
      
      if (visitedUrls.has(url) || depth > maxDepth) {
        continue;
      }
      
      console.log(`Crawling ${url} (depth: ${depth}, pages indexed: ${visitedUrls.size})`);
      
      try {
        // Add delay for rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
  
  return allPages;
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

// Enhanced page processing
async function fetchAndProcessPage(url, source) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'DocIndex/0.2.0 (https://github.com/yourusername/docindex)'
      },
      timeout: 10000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract content
    const title = $('title').text().trim();
    const headings = extractHeadings($);
    const paragraphs = extractParagraphs($);
    const codeBlocks = extractCodeBlocks($);
    const links = extractLinks($, url);
    
    return {
      url,
      title,
      headings,
      paragraphs,
      codeBlocks,
      links,
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
      sourceId: source.id,
      indexedAt: new Date().toISOString(),
      error: error.message
    };
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

// Save multiple pages from a source
async function saveIndexedPages(pages, source) {
  // Create a directory for this source
  const sourceDir = path.join(DATA_DIR, source.id);
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
  
  return indexFile;
}

// Helper to create a page ID from URL
function createPageId(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Index documentation from a source
async function indexDocumentation(source, maxDepth = 3, maxPages = 100) {
  try {
    console.log(`Indexing documentation from ${source.url}...`);
    
    // Ensure maxPages and maxDepth are numbers
    maxPages = parseInt(maxPages) || 100;
    maxDepth = parseInt(maxDepth) || 3;
    
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
    
    console.log(`Successfully indexed ${pages.length} pages from ${source.url}`);
    return indexResult;
  } catch (error) {
    console.error(`Error indexing documentation from ${source.url}:`, error);
    throw error;
  }
}

// Update documentation for a source
async function updateDocumentation(sourceName, maxDepth = 3, maxPages = 100) {
  const config = loadConfig();
  const source = config.sources.find(s => s.name === sourceName);
  
  if (!source) {
    throw new Error(`Documentation source "${sourceName}" not found`);
  }
  
  return await indexDocumentation(source, maxDepth, maxPages);
}

// Enhanced search function
function searchDocumentation(query) {
  const config = loadConfig();
  const results = [];
  
  // Search in indexed documentation
  for (const source of config.sources) {
    const sourceDir = path.join(DATA_DIR, source.id);
    
    if (fs.existsSync(sourceDir)) {
      const indexPath = path.join(sourceDir, 'index.json');
      
      if (fs.existsSync(indexPath)) {
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const pageMatches = [];
        
        // Search through each page
        for (const pageInfo of indexData.pages) {
          const pagePath = path.join(sourceDir, `${pageInfo.id}.json`);
          
          if (fs.existsSync(pagePath)) {
            const pageData = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
            const matches = {
              headings: [],
              paragraphs: [],
              codeBlocks: []
            };
            
            // Search in headings
            matches.headings = pageData.headings.filter(heading => 
              heading.text.toLowerCase().includes(query.toLowerCase())
            );
            
            // Search in paragraphs
            matches.paragraphs = pageData.paragraphs.filter(paragraph => 
              paragraph.toLowerCase().includes(query.toLowerCase())
            ).map(paragraph => ({
              text: paragraph,
              // Add context by including a snippet
              snippet: paragraph.length > 150 ? 
                paragraph.substring(0, 150) + '...' : 
                paragraph
            }));
            
            // Search in code blocks
            matches.codeBlocks = pageData.codeBlocks.filter(block => 
              block.code.toLowerCase().includes(query.toLowerCase())
            );
            
            if (matches.headings.length > 0 || 
                matches.paragraphs.length > 0 || 
                matches.codeBlocks.length > 0) {
              pageMatches.push({
                page: {
                  url: pageData.url,
                  title: pageData.title
                },
                matches
              });
            }
          }
        }
        
        if (pageMatches.length > 0) {
          results.push({
            source: {
              id: source.id,
              name: source.name,
              url: source.url
            },
            pageMatches
          });
        }
      }
    }
  }
  
  // Search in custom links
  const matchingCustomLinks = config.customLinks.filter(link => 
    link.name.toLowerCase().includes(query.toLowerCase()) ||
    (link.tags && link.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
  );
  
  return {
    documentationMatches: results,
    customLinkMatches: matchingCustomLinks
  };
}

// List all documentation sources
function listDocumentationSources() {
  const config = loadConfig();
  return config.sources;
}

// List all custom links
function listCustomLinks() {
  const config = loadConfig();
  return config.customLinks;
}

// Remove a documentation source
function removeDocumentationSource(sourceName) {
  const config = loadConfig();
  const sourceIndex = config.sources.findIndex(source => source.name === sourceName);
  
  if (sourceIndex === -1) {
    throw new Error(`Documentation source "${sourceName}" not found`);
  }
  
  const source = config.sources[sourceIndex];
  
  // Remove from config
  config.sources.splice(sourceIndex, 1);
  saveConfig(config);
  
  // Remove source directory with all indexed pages
  const sourceDir = path.join(DATA_DIR, source.id);
  if (fs.existsSync(sourceDir)) {
    fs.rmSync(sourceDir, { recursive: true, force: true });
  }
  
  return source;
}

// Remove a custom link
function removeCustomLink(linkName) {
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

module.exports = {
  addDocumentationSource,
  addCustomLink,
  indexDocumentation,
  updateDocumentation,
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks,
  removeDocumentationSource,
  removeCustomLink,
  loadConfig,
  saveConfig
};