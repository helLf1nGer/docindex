/**
 * Document file system operations
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { getLogger } from '../../../infrastructure/logging.js';
import { Document } from '../../../../shared/domain/models/Document.js';
import { readFile, writeFile, rename, access, unlink } from 'fs/promises';

const logger = getLogger();

/**
 * Document file system operations helper
 */
export class DocumentFileStorage {
  private baseDir: string;
  
  /**
   * Create a new document file storage
   * @param baseDir Base directory for document storage
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }
  
  /**
   * Initialize the storage (create base directory)
   */
  async initialize(): Promise<void> {
    await this.createDirectory(this.baseDir);
    logger.info(`Document storage initialized at ${this.baseDir}`, 'DocumentFileStorage');
  }
  
  /**
   * Get the file path for a document
   * @param id Document ID
   * @returns File path
   */
  getFilePath(id: string): string {
    // Use SHA-256 for consistent path structure and to avoid path traversal
    const hash = createHash('sha256').update(id).digest('hex');
    // Split the hash into directory levels to avoid too many files in one directory
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    
    // Ensure path is within our base directory to prevent path traversal
    const dirPath = path.join(this.baseDir, dir1, dir2);
    
    // Verify the path is still within our base directory
    if (!path.normalize(dirPath).startsWith(path.normalize(this.baseDir))) {
      throw new Error('Security error: attempted path traversal');
    }
    
    return path.join(dirPath, `${hash}.json`);
  }
  
  /**
   * Create a directory if it doesn't exist
   * @param dirPath Directory path
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: unknown) {
      throw new Error(`Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check if a file exists
   * @param filePath File path
   * @returns True if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Read a document from file
   * @param filePath File path
   * @returns Document
   */
  async readDocument(filePath: string): Promise<Document> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Document;
    } catch (error: unknown) {
      throw new Error(`Failed to read document from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Write a document to file
 using an atomic write-verify-commit pattern
   * @param filePath File path
   * @param document Document
   */
  async writeDocument(filePath: string, document: Document): Promise<void> {
    try {
      logger.debug(`Writing document to ${filePath}`, 'DocumentFileStorage');
      
      // 1. Create directory if it doesn't exist
      const dirPath = path.dirname(filePath);
      await this.createDirectory(dirPath);
      
      // 2. Prepare document data with proper serialization
      const documentData = JSON.stringify(document, null, 2);
      
      // 3. Create a temporary file with unique name
      const tempFilePath = `${filePath}.${randomUUID()}.tmp`;
      
      // 4. Write to temporary file first
      await writeFile(tempFilePath, documentData, 'utf-8');
      
      // 5. Verify that the written content is valid JSON and matches expected structure
      let isValid = false;
      try {
        const content = await readFile(tempFilePath, 'utf-8');
        const parsedContent = JSON.parse(content);
        
        // Basic validation - ensure id and url are present and match
        isValid = parsedContent && 
                 parsedContent.id === document.id && 
                 parsedContent.url === document.url;
                 
        if (!isValid) {
          logger.warn(`Document validation failed for ${filePath}`, 'DocumentFileStorage');
        }
      } catch (validationError) {
        logger.error(`Document validation error for ${filePath}: ${validationError}`, 'DocumentFileStorage');
        // Cleanup temp file on validation error
        await this.safeUnlink(tempFilePath);
        throw new Error(`Document validation failed: ${validationError}`);
      }
      
      // 6. If valid, atomically rename the temp file to the target file
      if (isValid) {
        try {
          // Remove existing file if it exists to avoid issues on some platforms
          await this.safeUnlink(filePath);
          // Atomic operation - either completes fully or not at all
          await rename(tempFilePath, filePath);
          logger.debug(`Document successfully saved to ${filePath}`, 'DocumentFileStorage');
        } catch (renameError) {
          logger.error(`Failed to rename temp file ${tempFilePath} to ${filePath}: ${renameError}`, 'DocumentFileStorage');
          // Cleanup temp file on rename error
          await this.safeUnlink(tempFilePath);
          throw renameError;
        }
      }
    } catch (error: unknown) {
      throw new Error(`Failed to write document to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete a document file
   * @param filePath File path
   * @returns True if file was deleted
   */
  async deleteDocument(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Walk through the directory structure and process files
   * @param callback Function to call for each file
   */
  async walkDirectory(callback: (filePath: string) => Promise<void>): Promise<void> {
    // Recursive function to process each directory and its files
    const processDirectory = async (dirPath: string): Promise<void> => {
      let entries;
      
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch (error) {
        logger.warn(`Error reading directory ${dirPath}: ${error}`, 'DocumentFileStorage');
        return;
      }
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip special directories
          if (entry.name === 'index' || entry.name === '.git') continue;
          
          // Recursively process subdirectories
          await processDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          // Process file
          await callback(fullPath);
        }
      }
    };
    
    // Start processing from base directory
    await processDirectory(this.baseDir);
  }
  
  /**
   * Safely delete a file if it exists
   * @param filePath File path to delete
   */
  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await access(filePath);
      await unlink(filePath);
    } catch (error) {
      // File doesn't exist or is inaccessible, which is fine
      logger.debug(`File ${filePath} doesn't exist or can't be accessed for deletion`, 'DocumentFileStorage');
    }
  }
}