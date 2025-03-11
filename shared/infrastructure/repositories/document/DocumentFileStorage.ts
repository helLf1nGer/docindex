/**
 * Document file system operations
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { getLogger } from '../../../infrastructure/logging.js';
import { Document } from '../../../../shared/domain/models/Document.js';

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
   * @param filePath File path
   * @param document Document
   */
  async writeDocument(filePath: string, document: Document): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const dirPath = path.dirname(filePath);
      await this.createDirectory(dirPath);
      
      // Write document to file
      await fs.writeFile(filePath, JSON.stringify(document, null, 2), 'utf-8');
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
}