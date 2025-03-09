const express = require('express');
const cors = require('cors');
const {
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks,
  addDocumentationSource,
  addCustomLink,
  updateDocumentation,
  removeDocumentationSource,
  removeCustomLink
} = require('./enhanced-index');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Default port
const DEFAULT_PORT = 3000;

// Get port from command line arguments or use default
const port = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT;

// Search endpoint
app.get('/search', (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    const results = searchDocumentation(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List sources endpoint
app.get('/sources', (req, res) => {
  try {
    const sources = listDocumentationSources();
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List custom links endpoint
app.get('/links', (req, res) => {
  try {
    const links = listCustomLinks();
    res.json(links);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add documentation source endpoint
app.post('/sources', async (req, res) => {
  try {
    const { url, name, tags, depth, pages } = req.body;
    
    if (!url || !name) {
      return res.status(400).json({ error: 'URL and name are required' });
    }
    
    const source = await addDocumentationSource(
      url,
      name,
      tags || [],
      parseInt(depth) || 3,
      parseInt(pages) || 100
    );
    
    res.status(201).json(source);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add custom link endpoint
app.post('/links', (req, res) => {
  try {
    const { url, name, tags } = req.body;
    
    if (!url || !name) {
      return res.status(400).json({ error: 'URL and name are required' });
    }
    
    const link = addCustomLink(url, name, tags || []);
    res.status(201).json(link);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update documentation endpoint
app.put('/sources/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { depth, pages } = req.body;
    
    const result = await updateDocumentation(
      name,
      parseInt(depth) || 3,
      parseInt(pages) || 100
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove documentation source endpoint
app.delete('/sources/:name', (req, res) => {
  try {
    const { name } = req.params;
    const source = removeDocumentationSource(name);
    res.json(source);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove custom link endpoint
app.delete('/links/:name', (req, res) => {
  try {
    const { name } = req.params;
    const link = removeCustomLink(name);
    res.json(link);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the server
app.listen(port, () => {
  console.log(`DocIndex server running on port ${port}`);
  console.log(`API endpoints:`);
  console.log(`- GET /search?q=query - Search documentation`);
  console.log(`- GET /sources - List documentation sources`);
  console.log(`- GET /links - List custom links`);
  console.log(`- POST /sources - Add documentation source`);
  console.log(`- POST /links - Add custom link`);
  console.log(`- PUT /sources/:name - Update documentation`);
  console.log(`- DELETE /sources/:name - Remove documentation source`);
  console.log(`- DELETE /links/:name - Remove custom link`);
  console.log(`- GET /health - Health check`);
});

module.exports = app;