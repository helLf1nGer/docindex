#!/usr/bin/env node

/**
 * DocIndex MCP Server
 * 
 * This is a simple HTTP server that provides access to the DocIndex functionality.
 * It's designed to be run as a standalone server that can be accessed by MCP-enabled IDEs.
 */

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.docindex');
const DATA_DIR = path.join(CONFIG_DIR, 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure directories exist
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default port
const DEFAULT_PORT = 3000;

// Get port from command line arguments or use default
const port = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT;

// Import DocIndex functionality
let docIndex;
try {
  // Try to load the enhanced index module
  docIndex = require('./enhanced-index');
} catch (error) {
  // If not found, create a minimal implementation
  docIndex = createMinimalDocIndex();
  console.log('Using minimal DocIndex implementation. For full functionality, install the complete package.');
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Parse URL
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Health check endpoint
    if (pathname === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    
    // Search endpoint
    if (pathname === '/search') {
      const query = parsedUrl.query.q;
      
      if (!query) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Query parameter "q" is required' }));
        return;
      }
      
      const results = docIndex.searchDocumentation(query);
      res.writeHead(200);
      res.end(JSON.stringify(results));
      return;
    }
    
    // List sources endpoint
    if (pathname === '/sources') {
      if (req.method === 'GET') {
        const sources = docIndex.listDocumentationSources();
        res.writeHead(200);
        res.end(JSON.stringify(sources));
        return;
      } else if (req.method === 'POST') {
        // Add documentation source
        let body = '';
        
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            
            if (!data.url || !data.name) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'URL and name are required' }));
              return;
            }
            
            const source = await docIndex.addDocumentationSource(
              data.url,
              data.name,
              data.tags || [],
              parseInt(data.depth) || 3,
              parseInt(data.pages) || 100
            );
            
            res.writeHead(201);
            res.end(JSON.stringify(source));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        
        return;
      }
    }
    
    // Update documentation endpoint
    if (pathname.startsWith('/sources/') && req.method === 'PUT') {
      const name = decodeURIComponent(pathname.substring('/sources/'.length));
      
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          
          const result = await docIndex.updateDocumentation(
            name,
            parseInt(data.depth) || 3,
            parseInt(data.pages) || 100
          );
          
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      
      return;
    }
    
    // Remove documentation source endpoint
    if (pathname.startsWith('/sources/') && req.method === 'DELETE') {
      const name = decodeURIComponent(pathname.substring('/sources/'.length));
      
      try {
        const source = docIndex.removeDocumentationSource(name);
        res.writeHead(200);
        res.end(JSON.stringify(source));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      
      return;
    }
    
    // List custom links endpoint
    if (pathname === '/links') {
      if (req.method === 'GET') {
        const links = docIndex.listCustomLinks();
        res.writeHead(200);
        res.end(JSON.stringify(links));
        return;
      } else if (req.method === 'POST') {
        // Add custom link
        let body = '';
        
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            
            if (!data.url || !data.name) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'URL and name are required' }));
              return;
            }
            
            const link = docIndex.addCustomLink(
              data.url,
              data.name,
              data.tags || []
            );
            
            res.writeHead(201);
            res.end(JSON.stringify(link));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        
        return;
      }
    }
    
    // Remove custom link endpoint
    if (pathname.startsWith('/links/') && req.method === 'DELETE') {
      const name = decodeURIComponent(pathname.substring('/links/'.length));
      
      try {
        const link = docIndex.removeCustomLink(name);
        res.writeHead(200);
        res.end(JSON.stringify(link));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
      
      return;
    }
    
    // Not found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(`Error handling request: ${error.message}`);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Start the server
server.listen(port, () => {
  console.log(`DocIndex MCP server running on port ${port}`);
  console.log(`API endpoints:`);
  console.log(`- GET /search?q=query - Search documentation`);
  console.log(`- GET /sources - List documentation sources`);
  console.log(`- POST /sources - Add documentation source`);
  console.log(`- PUT /sources/:name - Update documentation`);
  console.log(`- DELETE /sources/:name - Remove documentation source`);
  console.log(`- GET /links - List custom links`);
  console.log(`- POST /links - Add custom link`);
  console.log(`- DELETE /links/:name - Remove custom link`);
  console.log(`- GET /health - Health check`);
});

// Handle server errors
server.on('error', (error) => {
  console.error(`Server error: ${error.message}`);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try a different port.`);
  }
  process.exit(1);
});

// Create a minimal DocIndex implementation
function createMinimalDocIndex() {
  // Load configuration
  function loadConfig() {
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
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
  
  return {
    // Add a documentation source
    addDocumentationSource: async function(url, name, tags = [], maxDepth = 3, maxPages = 100) {
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
        pageCount: 0,
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      // Add to config
      config.sources.push(newSource);
      saveConfig(config);
      
      return newSource;
    },
    
    // Add a custom documentation link
    addCustomLink: function(url, name, tags = []) {
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
    
    // Update documentation for a source
    updateDocumentation: async function(sourceName, maxDepth = 3, maxPages = 100) {
      const config = loadConfig();
      const source = config.sources.find(s => s.name === sourceName);
      
      if (!source) {
        throw new Error(`Documentation source "${sourceName}" not found`);
      }
      
      // Update the source's lastUpdated timestamp
      source.lastUpdated = new Date().toISOString();
      saveConfig(config);
      
      return source;
    },
    
    // Search documentation
    searchDocumentation: function(query) {
      return {
        documentationMatches: [],
        customLinkMatches: []
      };
    },
    
    // List all documentation sources
    listDocumentationSources: function() {
      const config = loadConfig();
      return config.sources;
    },
    
    // List all custom links
    listCustomLinks: function() {
      const config = loadConfig();
      return config.customLinks;
    },
    
    // Remove a documentation source
    removeDocumentationSource: function(sourceName) {
      const config = loadConfig();
      const sourceIndex = config.sources.findIndex(source => source.name === sourceName);
      
      if (sourceIndex === -1) {
        throw new Error(`Documentation source "${sourceName}" not found`);
      }
      
      const source = config.sources[sourceIndex];
      
      // Remove from config
      config.sources.splice(sourceIndex, 1);
      saveConfig(config);
      
      return source;
    },
    
    // Remove a custom link
    removeCustomLink: function(linkName) {
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

// Copy the enhanced-index.js file if it doesn't exist
function copyEnhancedIndex() {
  const sourceFile = path.join(__dirname, '..', '..', 'src', 'enhanced-index.js');
  const destFile = path.join(__dirname, 'enhanced-index.js');
  
  if (fs.existsSync(sourceFile) && !fs.existsSync(destFile)) {
    try {
      fs.copyFileSync(sourceFile, destFile);
      console.log('Copied enhanced-index.js to lib directory.');
    } catch (error) {
      console.error(`Error copying enhanced-index.js: ${error.message}`);
    }
  }
}

// Try to copy the enhanced-index.js file
copyEnhancedIndex();