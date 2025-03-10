/**
 * Configuration module for DocSI application
 * 
 * Loads configuration from environment variables, config files, and defaults
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
// We use import assertion for dotenv since it's a CommonJS module
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Define configuration schema
export interface DocSIConfig {
  /** Base directory for data storage */
  dataDir: string;
  
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  /** Maximum number of concurrent requests */
  maxConcurrentRequests: number;
  
  /** Default crawler settings */
  crawler: {
    /** Default user agent for crawler */
    userAgent: string;
    
    /** Default maximum depth for crawler */
    maxDepth: number;
    
    /** Default maximum pages for crawler */
    maxPages: number;
    
    /** Default crawl delay in milliseconds */
    crawlDelay: number;
    
    /** Whether to respect robots.txt */
    respectRobotsTxt: boolean;
  };
  
  /** Database settings */
  database: {
    /** Database type */
    type: 'sqlite' | 'postgres' | 'mysql';
    
    /** Database connection string */
    connectionString: string;
  };
  
  /** Vector database settings */
  vectorDatabase: {
    /** Vector database type */
    type: 'qdrant' | 'milvus' | 'redis' | 'sqlite';
    
    /** Vector database connection string */
    connectionString: string;
    
    /** Vector dimension */
    dimension: number;
  };
  
  /** Cache settings */
  cache: {
    /** Whether to enable cache */
    enabled: boolean;
    
    /** Cache TTL in seconds */
    ttl: number;
    
    /** Maximum cache size in MB */
    maxSize: number;
  };
  
  /** MCP server settings */
  mcp: {
    /** Server name */
    name: string;
    
    /** Server version */
    version: string;
  };
  
  /** Security settings */
  security: {
    /** Whether to encrypt stored documents */
    encryptDocuments: boolean;
    
    /** Maximum allowed path depth */
    maxPathDepth: number;
    
    /** Allowed host patterns */
    allowedHosts: string[];
  };
}

// Get home directory
const HOME_DIR = os.homedir();

// Default configuration
const defaultConfig: DocSIConfig = {
  dataDir: process.env.DOCSI_DATA_DIR || path.join(HOME_DIR, '.docsi'),
  logLevel: (process.env.DOCSI_LOG_LEVEL as any) || 'info',
  maxConcurrentRequests: parseInt(process.env.DOCSI_MAX_CONCURRENT_REQUESTS || '5', 10),
  
  crawler: {
    userAgent: process.env.DOCSI_CRAWLER_USER_AGENT || 'DocSI-Bot/1.0 (+https://docsi.io/bot)',
    maxDepth: parseInt(process.env.DOCSI_CRAWLER_MAX_DEPTH || '3', 10),
    maxPages: parseInt(process.env.DOCSI_CRAWLER_MAX_PAGES || '100', 10),
    crawlDelay: parseInt(process.env.DOCSI_CRAWLER_DELAY || '1000', 10),
    respectRobotsTxt: process.env.DOCSI_CRAWLER_RESPECT_ROBOTS !== 'false',
  },
  
  database: {
    type: (process.env.DOCSI_DB_TYPE as any) || 'sqlite',
    connectionString: process.env.DOCSI_DB_CONNECTION_STRING || path.join(
      process.env.DOCSI_DATA_DIR || path.join(HOME_DIR, '.docsi'),
      'docsi.db'
    ),
  },
  
  vectorDatabase: {
    type: (process.env.DOCSI_VECTOR_DB_TYPE as any) || 'sqlite',
    connectionString: process.env.DOCSI_VECTOR_DB_CONNECTION_STRING || path.join(
      process.env.DOCSI_DATA_DIR || path.join(HOME_DIR, '.docsi'),
      'vectors.db'
    ),
    dimension: parseInt(process.env.DOCSI_VECTOR_DIMENSION || '384', 10),
  },
  
  cache: {
    enabled: process.env.DOCSI_CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.DOCSI_CACHE_TTL || '3600', 10),
    maxSize: parseInt(process.env.DOCSI_CACHE_MAX_SIZE || '100', 10),
  },
  
  mcp: {
    name: process.env.DOCSI_MCP_NAME || 'docsi',
    version: process.env.DOCSI_MCP_VERSION || '1.0.0',
  },
  
  security: {
    encryptDocuments: process.env.DOCSI_ENCRYPT_DOCUMENTS === 'true',
    maxPathDepth: parseInt(process.env.DOCSI_MAX_PATH_DEPTH || '5', 10),
    allowedHosts: (process.env.DOCSI_ALLOWED_HOSTS || '*').split(','),
  },
};

// Function to load configuration from a file
function loadConfigFromFile(filePath: string): Partial<DocSIConfig> {
  try {
    if (fs.existsSync(filePath)) {
      const configData = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.warn(`Failed to load configuration from ${filePath}:`, error);
  }
  return {};
}

// Merge configurations with precedence: default < config file < environment variables
let config = { ...defaultConfig };

// Load from global config file
const globalConfigPath = path.join(HOME_DIR, '.docsi', 'config.json');
const globalConfig = loadConfigFromFile(globalConfigPath);
config = { ...config, ...globalConfig };

// Load from local config file (if present)
const localConfigPath = path.join(process.cwd(), 'docsi.config.json');
const localConfig = loadConfigFromFile(localConfigPath);
config = { ...config, ...localConfig };

// Export the final configuration
export { config };

// Also export a function to reload configuration
export function reloadConfig(): DocSIConfig {
  const globalConfig = loadConfigFromFile(globalConfigPath);
  const localConfig = loadConfigFromFile(localConfigPath);
  config = { ...defaultConfig, ...globalConfig, ...localConfig };
  return config;
}

// Create necessary directories
export function ensureDirectories(): void {
  try {
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
      console.info(`Created data directory: ${config.dataDir}`);
    }
    
    const sourcesDir = path.join(config.dataDir, 'sources');
    if (!fs.existsSync(sourcesDir)) {
      fs.mkdirSync(sourcesDir, { recursive: true });
    }
    
    const cacheDir = path.join(config.dataDir, 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const logsDir = path.join(config.dataDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create necessary directories:', error);
    throw error;
  }
}