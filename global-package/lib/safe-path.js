/**
 * Safe path utilities for DocSI MCP
 * 
 * This module provides security utilities for safe file path handling,
 * preventing path traversal attacks and ensuring paths remain within
 * allowed directories.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

// Regular expression for validating path components (alphanumeric, underscore, hyphen)
const SAFE_PATH_COMPONENT_REGEX = /^[a-zA-Z0-9_\-]+$/;

// Suspicious path patterns that might indicate path traversal attempts
const SUSPICIOUS_PATH_PATTERNS = [
  // Relative path traversal attempts
  /\.\.\//g, /\.\.\\/g, // ../  or ..\
  
  // Encoded path traversal attempts
  /%2e%2e\//gi, /%2e%2e\\/gi, // %2e%2e/ or %2e%2e\
  
  // Unicode path traversal attempts
  /\u002e\u002e\//g, /\u002e\u002e\\/g, // Unicode encoded ../ or ..\
  
  // Absolute path references
  /^\//, /^[A-Za-z]:\\/, // Leading / or C:\
];

/**
 * Determines if a directory is within the allowed boundaries
 * 
 * @param {string} targetPath - The path to check
 * @param {string[]} allowedDirectories - List of allowed parent directories
 * @returns {boolean} - True if the path is allowed, false otherwise
 */
function isAllowedDirectory(targetPath, allowedDirectories = []) {
  // Default if no allowed directories specified - we'll use the baseDir
  if (!allowedDirectories.length) {
    const homeDir = os.homedir();
    const defaultDataDir = path.join(homeDir, '.docindex');
    allowedDirectories = [defaultDataDir];
  }

  const resolvedPath = path.resolve(targetPath);
  
  return allowedDirectories.some(dir => {
    const resolvedDir = path.resolve(dir);
    return resolvedPath === resolvedDir || resolvedPath.startsWith(resolvedDir + path.sep);
  });
}

/**
 * Check if a path contains suspicious patterns that might indicate
 * a path traversal attempt
 * 
 * @param {string} pathToCheck - The path to check for suspicious patterns
 * @returns {boolean} - True if suspicious patterns found, false otherwise
 */
function hasSuspiciousPatterns(pathToCheck) {
  return SUSPICIOUS_PATH_PATTERNS.some(pattern => pattern.test(pathToCheck));
}

/**
 * Validates a single path component (filename or directory name)
 * 
 * @param {string} component - The path component to validate
 * @returns {boolean} - True if the component is valid, false otherwise
 */
function isValidPathComponent(component) {
  // Skip validation for '.' which is often used to refer to current directory
  if (component === '.') return true;
  
  return SAFE_PATH_COMPONENT_REGEX.test(component);
}

/**
 * Validate all components in a path
 * 
 * @param {string} inputPath - The path to validate
 * @returns {boolean} - True if all components are valid, false otherwise
 */
function validatePathComponents(inputPath) {
  // Split the path into components based on platform separators
  const components = inputPath.split(/[\\/]/);
  
  // Check each component against the validation regex
  return components.every(component => {
    // Skip empty components (which can occur with trailing slashes)
    if (!component) return true;
    return isValidPathComponent(component);
  });
}

/**
 * Creates a safe, validated path that cannot escape the base directory
 * 
 * @param {string} baseDir - The base directory that paths must remain within
 * @param {string} userPath - The user-provided path
 * @param {object} options - Additional options
 * @param {boolean} options.throwOnError - Whether to throw on error (default: true) 
 * @param {boolean} options.create - Whether to create the directory if it doesn't exist
 * @returns {string|null} - The safe path or null if validation failed and throwOnError is false
 * @throws {Error} - If path validation fails and throwOnError is true
 */
function safePath(baseDir, userPath, options = { throwOnError: true, create: false }) {
  try {
    // Ensure baseDir is absolute
    const absoluteBaseDir = path.resolve(baseDir);
    
    // Verify base directory exists
    if (!fs.existsSync(absoluteBaseDir)) {
      if (options.create) {
        fs.mkdirSync(absoluteBaseDir, { recursive: true });
      } else {
        throw new Error(`Base directory does not exist: ${absoluteBaseDir}`);
      }
    }
    
    // Check for suspicious patterns in user path
    if (hasSuspiciousPatterns(userPath)) {
      throw new Error(`Path contains suspicious pattern: ${userPath}`);
    }
    
    // Validate path components
    if (!validatePathComponents(userPath)) {
      throw new Error(`Path contains invalid components: ${userPath}`);
    }
    
    // Normalize to remove any ../ sequences
    const normalizedPath = path.normalize(userPath);
    
    // Join with base dir and resolve to absolute path
    const resolvedPath = path.resolve(absoluteBaseDir, normalizedPath);
    
    // Verify the path stays within the base directory
    if (!resolvedPath.startsWith(absoluteBaseDir + path.sep) && 
        resolvedPath !== absoluteBaseDir) {
      throw new Error(`Path traversal detected: ${userPath}`);
    }
    
    return resolvedPath;
  } catch (error) {
    if (options.throwOnError) {
      throw error;
    }
    
    // Return null if we shouldn't throw
    return null;
  }
}

/**
 * Creates a safe file path for writing
 * Ensures the parent directory exists
 * 
 * @param {string} baseDir - The base directory that paths must remain within
 * @param {string} userPath - The user-provided path
 * @param {object} options - Additional options
 * @returns {string} - The safe path for writing
 */
function safeWritePath(baseDir, userPath, options = { throwOnError: true }) {
  const filePath = safePath(baseDir, userPath, options);
  
  if (!filePath) return null;
  
  // Create parent directory if it doesn't exist
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  return filePath;
}

/**
 * Safely read a file within allowed directories
 * 
 * @param {string} baseDir - The base directory that paths must remain within
 * @param {string} userPath - The user-provided path
 * @param {object} options - Additional options
 * @returns {string|null} - The file contents or null if error
 */
function safeReadFile(baseDir, userPath, options = { encoding: 'utf8', throwOnError: true }) {
  try {
    const filePath = safePath(baseDir, userPath, { throwOnError: true });
    return fs.readFileSync(filePath, { encoding: options.encoding });
  } catch (error) {
    if (options.throwOnError) {
      throw error;
    }
    return null;
  }
}

/**
 * Safely write to a file within allowed directories
 * 
 * @param {string} baseDir - The base directory that paths must remain within
 * @param {string} userPath - The user-provided path
 * @param {string} content - Content to write
 * @param {object} options - Additional options
 * @returns {boolean} - True if successful, false otherwise
 */
function safeWriteFile(baseDir, userPath, content, options = { encoding: 'utf8', throwOnError: true }) {
  try {
    const filePath = safeWritePath(baseDir, userPath, { throwOnError: true });
    fs.writeFileSync(filePath, content, { encoding: options.encoding });
    return true;
  } catch (error) {
    if (options.throwOnError) {
      throw error;
    }
    return false;
  }
}

export {
  safePath,
  safeWritePath,
  safeReadFile,
  safeWriteFile,
  isAllowedDirectory,
  hasSuspiciousPatterns,
  validatePathComponents,
  isValidPathComponent
};