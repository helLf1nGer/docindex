#!/usr/bin/env node

const http = require('http');
const url = require('url');
const {
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks
} = require('./enhanced-index');

// Default port
const DEFAULT_PORT = 3000;

// Get port from command line arguments or use default
const port = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT;

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
      
      const results = searchDocumentation(query);
      res.writeHead(200);
      res.end(JSON.stringify(results));
      return;
    }
    
    // List sources endpoint
    if (pathname === '/sources') {
      const sources = listDocumentationSources();
      res.writeHead(200);
      res.end(JSON.stringify(sources));
      return;
    }
    
    // List custom links endpoint
    if (pathname === '/links') {
      const links = listCustomLinks();
      res.writeHead(200);
      res.end(JSON.stringify(links));
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
  console.log(`DocIndex simple server running on port ${port}`);
  console.log(`API endpoints:`);
  console.log(`- GET /search?q=query - Search documentation`);
  console.log(`- GET /sources - List documentation sources`);
  console.log(`- GET /links - List custom links`);
  console.log(`- GET /health - Health check`);
});

// Handle server errors
server.on('error', (error) => {
  console.error(`Server error: ${error.message}`);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try a different port.`);
  }
});

module.exports = server;