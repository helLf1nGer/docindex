#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import { initEmbeddingUtils, cleanupEmbeddingUtils } from './lib/embedding-utils.js';
import { getAllTools } from './lib/tool-definitions.js';
import { createDefaultSecureDocumentationManager } from './lib/secure-documentation-manager.js';
import config from './lib/config.js';

// Import handlers
import { 
  handleSearch, 
  handleSemanticSearch, 
  handleApiSearch, 
  handleRelatedContent 
} from './lib/handlers/search-handlers.js';

import {
  handleGetDocument,
  handleListPages,
  handleGetDataDir,
  handleAddSource,
  handleRefreshSource,
  handleRefreshAll,
  handleAddLink,
  handleListSources,
  handleListLinks
} from './lib/handlers/source-handlers.js';

import {
  handleGetSemanticDocument,
  handleGetApiSpec,
  handleGetRelationships
} from './lib/handlers/semantic-handlers.js';

// Get the directory name - for module resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Display environment information
console.error(chalk.yellow(`Using configuration:`));
console.error(chalk.blue(`Base directory: ${config.baseDir}`));
console.error(chalk.blue(`Data directory: ${config.dataDir}`));
console.error(chalk.blue(`Config file: ${config.configPath}`));

// Initialize embedding utilities with the configured path
initEmbeddingUtils(config.modelDir);

// Create secure documentation manager
const docManager = createDefaultSecureDocumentationManager();

// Create the MCP server
const server = new Server({
  name: "docindex-mcp",
  version: "0.2.0",
}, {
  capabilities: {
    tools: {},
  },
});

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    
    // Validate input before passing to handlers
    const sanitizedArgs = sanitizeInputArgs(args);
    
    switch (name) {
      // Search handlers
      case "search":
        return await handleSearch(sanitizedArgs, docManager);
      case "semantic-search":
        return await handleSemanticSearch(sanitizedArgs, docManager);
      case "api-search":
        return await handleApiSearch(sanitizedArgs, docManager);
      case "related-content":
        return await handleRelatedContent(sanitizedArgs, docManager);
        
      // Source handlers
      case "get-document":
        return await handleGetDocument(sanitizedArgs, docManager);
      case "list-pages":
        return await handleListPages(sanitizedArgs, docManager);
      case "get-data-dir":
        return await handleGetDataDir(docManager);
      case "add-source":
        return await handleAddSource(sanitizedArgs, docManager);
      case "refresh-source":
        return await handleRefreshSource(sanitizedArgs, docManager);
      case "refresh-all":
        return await handleRefreshAll(sanitizedArgs, docManager);
      case "add-link":
        return await handleAddLink(sanitizedArgs, docManager);
      case "list-sources":
        return await handleListSources(docManager);
      case "list-links":
        return await handleListLinks(docManager);
        
      // Semantic handlers
      case "get-semantic-document":
        return await handleGetSemanticDocument(sanitizedArgs, docManager);
      case "get-api-spec":
        return await handleGetApiSpec(sanitizedArgs, docManager);
      case "get-relationships":
        return await handleGetRelationships(sanitizedArgs, docManager);
        
      default:
        return {
          content: [{
            type: "text",
            text: `Unknown tool: ${name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    console.error(`Error handling request: ${error.message}`);
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

/**
 * Sanitize input arguments to prevent injection attacks
 * 
 * @param {object} args - Input arguments
 * @returns {object} - Sanitized arguments
 */
function sanitizeInputArgs(args) {
  if (!args || typeof args !== 'object') {
    return {};
  }
  
  // Create a new object to avoid modifying the original
  const sanitized = {};
  
  // Process each property
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // String values - sanitize to prevent path traversal and injection
      sanitized[key] = value
        // Remove path traversal sequences
        .replace(/\.\.\//g, '')
        .replace(/\.\.\\/g, '')
        // Remove control characters
        .replace(/[\x00-\x1F\x7F]/g, '')
        // Limit string length
        .slice(0, 10000);
    } else if (typeof value === 'number') {
      // Numbers - ensure they're within reasonable bounds
      sanitized[key] = Math.min(Math.max(value, -1000000), 1000000);
    } else if (Array.isArray(value)) {
      // Arrays - recursively sanitize each item (for simple arrays)
      sanitized[key] = value
        .filter(item => typeof item === 'string' || typeof item === 'number')
        .map(item => typeof item === 'string' 
          ? item.replace(/\.\.\//g, '').replace(/\.\.\\/g, '').slice(0, 1000)
          : Math.min(Math.max(item, -1000000), 1000000)
        )
        .slice(0, 100); // Limit array length
    } else if (value === null) {
      sanitized[key] = null;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
    // Drop other types (objects, functions, etc.) for security
  }
  
  return sanitized;
}

// Start the server
async function runServer() {
  console.error(chalk.green('Starting DocIndex MCP Server...'));
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error(chalk.green('DocIndex MCP Server running on stdio'));
  console.error(chalk.blue('Basic search: DocIndex > search?query=your_query'));
  console.error(chalk.blue('Semantic search: DocIndex > semantic-search?query=your_query'));
  console.error(chalk.blue('API search: DocIndex > api-search?query=your_query&type=function'));
  console.error(chalk.blue('Get document: DocIndex > get-document?url_or_id=URL_OR_ID'));
  console.error(chalk.blue('Get semantic document: DocIndex > get-semantic-document?url_or_id=URL_OR_ID'));
  console.error(chalk.blue('Find related content: DocIndex > related-content?url_or_id=URL_OR_ID'));
  console.error(chalk.blue(`Indexed documentation is stored in: ${config.dataDir}`));
  console.error(chalk.yellow(`To override data location, set DOCSI_DATA_DIR environment variable`));
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.error(chalk.yellow('Shutting down DocIndex MCP Server...'));
  cleanupEmbeddingUtils();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error(chalk.yellow('Shutting down DocIndex MCP Server...'));
  cleanupEmbeddingUtils();
  process.exit(0);
});

// Run the server
runServer().catch((error) => {
  console.error(chalk.red(`Fatal error running server: ${error.message}`));
  cleanupEmbeddingUtils();
  process.exit(1);
});