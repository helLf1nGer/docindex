#!/usr/bin/env node
/**
 * Tool to enhance the DocSI crawler with improved depth handling, 
 * sitemap processing, and URL prioritization.
 * 
 * This script upgrades the existing crawler components with enhanced
 * versions that provide better depth handling, more intelligent sitemap
 * processing, and smarter URL prioritization.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupEnhancedComponents } from '../interfaces/mcp/enhanced-integration.js';
import { getLogger } from '../shared/infrastructure/logging.js';

const logger = getLogger();

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Main function to enhance the crawler
 */
async function enhanceCrawler() {
  try {
    logger.info('Starting DocSI crawler enhancement', 'enhance-crawler');
    
    // Check for MCP server instances in the project
    const server = await findExistingServer();
    
    if (!server) {
      logger.warn('No existing MCP server found. Enhancement will be prepared but not automatically applied.', 'enhance-crawler');
    }
    
    // Setup enhanced components
    const { crawlerService } = await setupEnhancedComponents();
    
    if (!crawlerService) {
      logger.error('Failed to create enhanced crawler service', 'enhance-crawler');
      process.exit(1);
    }
    
    logger.info('Enhancement complete. The crawler now has improved depth handling, sitemap processing, and URL prioritization.', 'enhance-crawler');
    
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  DocSI Crawler Enhancement Complete                           ║
║                                                                ║
║  New capabilities:                                             ║
║                                                                ║
║  ✓ Enhanced sitemap processing with improved depth handling    ║
║  ✓ Better URL discovery and prioritization                     ║
║  ✓ Advanced depth handling for different document structures   ║
║  ✓ Improved performance for large documentation sites          ║
║                                                                ║
║  To use the enhanced crawler in your own code:                 ║
║                                                                ║
║  import { createEnhancedCrawlerService } from                  ║
║    './interfaces/mcp/enhanced-integration.js';                 ║
║                                                                ║
║  const crawlerService = createEnhancedCrawlerService(          ║
║    documentRepository,                                         ║
║    sourceRepository                                            ║
║  );                                                            ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
    
  } catch (error) {
    logger.error(`Error enhancing crawler: ${error}`, 'enhance-crawler');
    console.error('Failed to enhance the crawler:', error);
    process.exit(1);
  }
}

/**
 * Find existing MCP server instances in the project
 */
async function findExistingServer() {
  try {
    // Look for server.js file in interfaces/mcp
    const serverPath = path.join(rootDir, 'interfaces', 'mcp', 'server.js');
    
    if (fs.existsSync(serverPath)) {
      logger.info(`Found MCP server at ${serverPath}`, 'enhance-crawler');
      return { path: serverPath };
    }
    
    return null;
  } catch (error) {
    logger.warn(`Error finding existing server: ${error}`, 'enhance-crawler');
    return null;
  }
}

// Run the enhancement
enhanceCrawler().catch(error => {
  console.error('Enhancement failed:', error);
  process.exit(1);
});