#!/usr/bin/env node
/**
 * DocSI MCP setup script
 * 
 * IMPORTANT: This file is the compiled JavaScript version of setup-mcp.ts
 * Any changes should be made to the TypeScript source file, not directly to this file.
 * 
 * This script helps set up the DocSI MCP server in the user's environment by:
 * 1. Creating/updating the MCP settings
 * 2. Providing instructions for using the DocSI MCP server
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Constants
const DOCSI_VERSION = '1.0.0';
const DOCS_URL = 'https://github.com/docsi/docsi#readme';
const NODE_PATH = process.execPath;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_DIR = __dirname;
const SERVER_SCRIPT = path.join(SCRIPT_DIR, '..', 'dist', 'interfaces', 'mcp', 'server.js');
const MCP_SERVER_NAME = 'docsi';

// Initialize logger to console
const logger = console;

// Get config paths based on platform
function getConfigPaths() {
  const homedir = os.homedir();
  
  // VSCode Cline config path
  let vscodeDir;
  if (process.platform === 'win32') {
    vscodeDir = path.join(homedir, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
  } else if (process.platform === 'darwin') {
    vscodeDir = path.join(homedir, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
  } else {
    vscodeDir = path.join(homedir, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
  }
  
  // Claude desktop config path
  let claudeDir;
  if (process.platform === 'win32') {
    claudeDir = path.join(homedir, 'AppData', 'Roaming', 'Claude');
  } else if (process.platform === 'darwin') {
    claudeDir = path.join(homedir, 'Library', 'Application Support', 'Claude');
  } else {
    claudeDir = path.join(homedir, '.config', 'Claude');
  }
  
  return {
    vscode: {
      dir: vscodeDir,
      file: path.join(vscodeDir, 'cline_mcp_settings.json'),
    },
    claude: {
      dir: claudeDir,
      file: path.join(claudeDir, 'claude_desktop_config.json'),
    }
  };
}

// Create directory if it doesn't exist
function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    } catch (error) {
      logger.error(`Error creating directory ${dir}:`, error);
    }
  }
}

// Read JSON file or return default object if it doesn't exist
function readJsonFile(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logger.error(`Error reading ${filePath}:`, error);
  }
  return defaultValue;
}

// Write JSON file
function writeJsonFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    logger.info(`Updated ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Error writing ${filePath}:`, error);
    return false;
  }
}

// Add or update DocSI MCP server settings
function updateMcpSettings(configPath, serverScriptPath) {
  // Ensure the config directory exists
  ensureDirectory(path.dirname(configPath));
  
  // Read existing config or create new one
  const config = readJsonFile(configPath, { mcpServers: {} });
  
  // Ensure mcpServers object exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  
  // Create DocSI MCP server configuration
  config.mcpServers[MCP_SERVER_NAME] = {
    command: NODE_PATH,
    args: [serverScriptPath],
    disabled: false,
    alwaysAllow: [],
    env: {
      // Environment variables for DocSI MCP server
      DOCSI_VERSION: DOCSI_VERSION,
      DOCSI_SETUP_TIME: new Date().toISOString(),
      NODE_ENV: 'production'
    }
  };
  
  // Write updated config
  return writeJsonFile(configPath, config);
}


// Main function
async function main() {
  logger.info('DocSI MCP Setup');
  logger.info('==============');
  
  // Check if server.js exists
  const serverJsPath = path.resolve(SERVER_SCRIPT);
  if (!fs.existsSync(serverJsPath)) {
    logger.error(`Server script not found at: ${serverJsPath}`);
    logger.info('Make sure to run "npm run build" first to compile the TypeScript code');
    logger.info('Run the following command:');
    logger.info('  cd docindex && npm run build');
    process.exit(1);
  }
  
  // Get config paths
  const configPaths = getConfigPaths();
  
  // Update VSCode Cline settings
  logger.info('Updating VSCode Cline MCP settings...');
  const vscodeUpdated = updateMcpSettings(configPaths.vscode.file, serverJsPath);
  
  // Update Claude Desktop settings
  logger.info('Updating Claude Desktop MCP settings...');
  const claudeUpdated = updateMcpSettings(configPaths.claude.file, serverJsPath);
  
  // Print results
  logger.info('\nSetup Results:');
  logger.info('-------------');
  logger.info(`VSCode Cline: ${vscodeUpdated ? 'Updated' : 'Failed'}`);
  logger.info(`Claude Desktop: ${claudeUpdated ? 'Updated' : 'Failed'}`);
  
  // Print next steps
  logger.info('\nNext Steps:');
  logger.info('-----------');
  logger.info('1. Restart VSCode and/or Claude Desktop to apply the changes');
  logger.info('2. In Cline, you can now use DocSI MCP tools with these commands:');
  logger.info('   - docsi-check: Test if DocSI is working properly');
  logger.info('   - docsi-info: Get information about your DocSI installation');
  logger.info(`\nFor more information, visit: ${DOCS_URL}`);
}

// Run the main function
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});