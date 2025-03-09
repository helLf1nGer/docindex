const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { parse } = require('node-html-parser');
const os = require('os');

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
async function addDocumentationSource(url, name, tags = []) {
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
  await indexDocumentation(newSource);
  
  return newSource;
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

// Index documentation from a source
async function indexDocumentation(source) {
  try {
    console.log(`Indexing documentation from ${source.url}...`);
    
    // Fetch the HTML content
    const response = await axios.get(source.url);
    const html = response.data;
    
    // Parse the HTML
    const $ = cheerio.load(html);
    const root = parse(html);
    
    // Extract content (this is a simplified example)
    // In a real implementation, you would need more sophisticated parsing
    // based on the structure of the documentation site
    const title = $('title').text();
    const headings = [];
    
    $('h1, h2, h3').each((i, el) => {
      headings.push({
        text: $(el).text(),
        level: parseInt(el.tagName.substring(1)),
        id: $(el).attr('id') || `heading-${i}`
      });
    });
    
    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({
          text: $(el).text(),
          url: new URL(href, source.url).toString()
        });
      }
    });
    
    // Extract code examples
    const codeBlocks = [];
    $('pre code').each((i, el) => {
      codeBlocks.push({
        code: $(el).text(),
        language: $(el).attr('class') || 'text'
      });
    });
    
    // Create the index
    const index = {
      id: source.id,
      name: source.name,
      url: source.url,
      title,
      headings,
      links,
      codeBlocks,
      indexedAt: new Date().toISOString()
    };
    
    // Save the index
    const indexPath = path.join(DATA_DIR, `${source.id}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    
    // Update the source's lastUpdated timestamp
    const config = loadConfig();
    const sourceIndex = config.sources.findIndex(s => s.id === source.id);
    
    if (sourceIndex !== -1) {
      config.sources[sourceIndex].lastUpdated = new Date().toISOString();
      saveConfig(config);
    }
    
    console.log(`Successfully indexed documentation from ${source.url}`);
    return index;
  } catch (error) {
    console.error(`Error indexing documentation from ${source.url}:`, error);
    throw error;
  }
}

// Update documentation for a source
async function updateDocumentation(sourceName) {
  const config = loadConfig();
  const source = config.sources.find(s => s.name === sourceName);
  
  if (!source) {
    throw new Error(`Documentation source "${sourceName}" not found`);
  }
  
  return await indexDocumentation(source);
}

// Search documentation
function searchDocumentation(query) {
  const config = loadConfig();
  const results = [];
  
  // Search in indexed documentation
  for (const source of config.sources) {
    const indexPath = path.join(DATA_DIR, `${source.id}.json`);
    
    if (fs.existsSync(indexPath)) {
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      
      // Search in headings
      const matchingHeadings = indexData.headings.filter(heading => 
        heading.text.toLowerCase().includes(query.toLowerCase())
      );
      
      // Search in code blocks
      const matchingCodeBlocks = indexData.codeBlocks.filter(block => 
        block.code.toLowerCase().includes(query.toLowerCase())
      );
      
      if (matchingHeadings.length > 0 || matchingCodeBlocks.length > 0) {
        results.push({
          source: {
            id: source.id,
            name: source.name,
            url: source.url
          },
          matches: {
            headings: matchingHeadings,
            codeBlocks: matchingCodeBlocks
          }
        });
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
  
  // Remove index file
  const indexPath = path.join(DATA_DIR, `${source.id}.json`);
  if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
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