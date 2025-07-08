#!/usr/bin/env node
/**
 * DocSI MCP setup script
 * 
 * This script helps set up the DocSI MCP server in the user's environment by:
 * 1. Creating/updating the MCP settings
 * 2. Providing instructions for using the DocSI MCP server
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Constants
const DOCSI_VERSION = '1.0.0';
const DOCS_URL = 'https://github.com/docsi/docsi#readme';
const NODE_PATH = process.execPath;
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SERVER_SCRIPT = path.join(SCRIPT_DIR, '..', 'dist', 'interfaces', 'mcp', 'server.js');
const MCP_SERVER_NAME = 'docsi';

// Define interfaces for configuration objects
interface ConfigPaths {
  vscode: {
    dir: string;
    file: string;
  };
  claude: {
    dir: string;
    file: string;
  };
}

interface McpServerConfig {
  command: string;
  args: string[];
  disabled: boolean;
  alwaysAllow: string[];
  env: Record<string, string>;
}

interface McpSettings {
  mcpServers: Record<string, McpServerConfig>;
  [key: string]: any;
}

// Initialize logger to console
const logger = console;

// Get config paths based on platform
function getConfigPaths(): ConfigPaths {
  const homedir = os.homedir();
  
  // VSCode Cline config path
  let vscodeDir: string;
  if (process.platform === 'win32') {
    vscodeDir = path.join(homedir, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
  } else if (process.platform === 'darwin') {
    vscodeDir = path.join(homedir, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
  } else {
    vscodeDir = path.join(homedir, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings');
  }
  
  // Claude desktop config path
  let claudeDir: string;
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
function ensureDirectory(dir: string): void {
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
function readJsonFile<T>(filePath: string, defaultValue: T = {} as T): T {
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
function writeJsonFile(filePath: string, content: any): boolean {
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
function updateMcpSettings(configPath: string, serverScriptPath: string): boolean {
  // Ensure the config directory exists
  ensureDirectory(path.dirname(configPath));
  
  // Read existing config or create new one
  const config = readJsonFile<McpSettings>(configPath, { mcpServers: {} });
  
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

// Check if DocSI is already built
function isDocSIBuilt(serverScriptPath: string): boolean {
  return fs.existsSync(serverScriptPath);
}

// Build DocSI if needed
function buildDocSI(): boolean {
  try {
    logger.info('Building DocSI...');
    execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(SCRIPT_DIR, '..') });
    logger.info('DocSI built successfully');
    return true;
  } catch (error) {
    logger.error('Error building DocSI:', error);
    return false;
  }
}

// Main function
async function main(): Promise<void> {
  logger.info('DocSI MCP Setup');
  logger.info('==============');
  
  // Check if DocSI is built
  const serverJsPath = path.resolve(SERVER_SCRIPT);
  if (!isDocSIBuilt(serverJsPath)) {
    logger.info('DocSI needs to be built first');
    if (!buildDocSI()) {
      logger.error('Failed to build DocSI. Setup aborted.');
      process.exit(1);
    }
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