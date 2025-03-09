/**
 * Configuration module for DocSI MCP
 * 
 * Centralizes all configuration settings and provides environment variable
 * overrides to eliminate hardcoded paths and improve security.
 */

import os from 'os';
import path from 'path';
import fs from 'fs';

// Default base locations
const DEFAULT_HOME_DIR = os.homedir();
const DEFAULT_BASE_DIR = path.join(DEFAULT_HOME_DIR, '.docindex');
const DEFAULT_DATA_DIR = path.join(DEFAULT_BASE_DIR, 'data');
const DEFAULT_TEMP_DIR = path.join(DEFAULT_BASE_DIR, 'temp');
const DEFAULT_CONFIG_PATH = path.join(DEFAULT_BASE_DIR, 'config.json');
const DEFAULT_CACHE_DIR = path.join(DEFAULT_BASE_DIR, 'cache');
const DEFAULT_MODEL_DIR = path.join(DEFAULT_BASE_DIR, 'models');

/**
 * Load configuration from environment variables with fallbacks to defaults
 * 
 * Using environment variables allows for configuration without modifying code
 * and prevents hardcoded personal paths from being committed to version control.
 */
const config = {
  // Base directories
  baseDir: process.env.DOCSI_BASE_DIR || DEFAULT_BASE_DIR,
  dataDir: process.env.DOCSI_DATA_DIR || DEFAULT_DATA_DIR,
  tempDir: process.env.DOCSI_TEMP_DIR || DEFAULT_TEMP_DIR,
  cacheDir: process.env.DOCSI_CACHE_DIR || DEFAULT_CACHE_DIR,
  modelDir: process.env.DOCSI_MODEL_DIR || DEFAULT_MODEL_DIR,
  configPath: process.env.DOCSI_CONFIG_PATH || DEFAULT_CONFIG_PATH,
  
  // Network settings
  rateLimitDelay: parseInt(process.env.DOCSI_RATE_LIMIT_DELAY || '1000', 10),
  timeout: parseInt(process.env.DOCSI_TIMEOUT || '10000', 10),
  
  // Crawling limits
  maxCrawlDepth: parseInt(process.env.DOCSI_MAX_CRAWL_DEPTH || '3', 10),
  maxCrawlPages: parseInt(process.env.DOCSI_MAX_CRAWL_PAGES || '100', 10),
  
  // Feature flags
  enableSemanticSearch: process.env.DOCSI_ENABLE_SEMANTIC_SEARCH !== 'false',
  enableRelationships: process.env.DOCSI_ENABLE_RELATIONSHIPS !== 'false',
  enableApiExtraction: process.env.DOCSI_ENABLE_API_EXTRACTION !== 'false',
  
  // Security settings
  allowedDirectories: process.env.DOCSI_ALLOWED_DIRS ? 
    process.env.DOCSI_ALLOWED_DIRS.split(',') : 
    [DEFAULT_BASE_DIR],
};

/**
 * Ensure required directories exist
 * Creates any missing directories to prevent errors during operation
 */
function ensureDirectoriesExist() {
  const dirsToCheck = [
    config.baseDir,
    config.dataDir,
    config.tempDir,
    config.cacheDir,
    config.modelDir
  ];
  
  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Load user configuration from config file if it exists
 * This allows for persistent custom settings
 * 
 * @returns {Object} The merged configuration
 */
function loadUserConfig() {
  try {
    if (fs.existsSync(config.configPath)) {
      const userConfig = JSON.parse(fs.readFileSync(config.configPath, 'utf8'));
      return { ...config, ...userConfig };
    }
  } catch (error) {
    console.error(`Error loading user config: ${error.message}`);
  }
  
  return config;
}

/**
 * Save current configuration to config file
 * 
 * @param {Object} configToSave - Configuration to save (defaults to current config)
 * @returns {boolean} True if successful, false otherwise
 */
function saveConfig(configToSave = config) {
  try {
    // Ensure parent directory exists
    const configDir = path.dirname(config.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Write config file
    fs.writeFileSync(
      config.configPath, 
      JSON.stringify(configToSave, null, 2), 
      'utf8'
    );
    
    return true;
  } catch (error) {
    console.error(`Error saving config: ${error.message}`);
    return false;
  }
}

/**
 * Get source-specific data directory
 * 
 * @param {string} sourceName - Name of the documentation source
 * @returns {string} Path to the source data directory
 */
function getSourceDataDir(sourceName) {
  // Sanitize source name to prevent path traversal
  const safeSourceName = sourceName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(config.dataDir, safeSourceName);
}

// Initialize: ensure directories exist and load user config
ensureDirectoriesExist();
const mergedConfig = loadUserConfig();

// Export the configuration
export default {
  ...mergedConfig,
  ensureDirectoriesExist,
  saveConfig,
  getSourceDataDir,
  
  // Export defaults for reference
  defaults: {
    BASE_DIR: DEFAULT_BASE_DIR,
    DATA_DIR: DEFAULT_DATA_DIR,
    TEMP_DIR: DEFAULT_TEMP_DIR,
    CACHE_DIR: DEFAULT_CACHE_DIR,
    MODEL_DIR: DEFAULT_MODEL_DIR,
    CONFIG_PATH: DEFAULT_CONFIG_PATH,
  }
};