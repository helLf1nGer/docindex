/**
 * Source file system operations
 */

import fs from 'fs/promises';
import path from 'path';
import { getLogger } from '../../../infrastructure/logging.js';
import { DocumentSource } from '../../../../shared/domain/models/Document.js';

const logger = getLogger();

/**
 * Source file system operations helper
 */
export class SourceFileStorage {
  private baseDir: string;
  
  /**
   * Create a new source file storage
   * @param baseDir Base directory for source storage
   */
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }
  
  /**
   * Initialize the storage (create base directory)
   */
  async initialize(): Promise<void> {
    await this.createDirectory(this.baseDir);
    logger.info(`Source storage initialized at ${this.baseDir}`, 'SourceFileStorage');
  }
  
  /**
   * Get the file path for a source
   * @param id Source ID
   * @returns File path
   */
  getFilePath(id: string): string {
    // Use a simpler structure for sources since we expect fewer of them
    const safeName = id.replace(/[^a-zA-Z0-9-]/g, '_');
    
    // Ensure path is within our base directory to prevent path traversal
    const filePath = path.join(this.baseDir, `${safeName}.json`);
    
    // Verify the path is still within our base directory
    if (!path.normalize(filePath).startsWith(path.normalize(this.baseDir))) {
      throw new Error('Security error: attempted path traversal');
    }
    
    return filePath;
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
   * Read a source from file
   * @param filePath File path
   * @returns Source
   */
  async readSource(filePath: string): Promise<DocumentSource> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as DocumentSource;
    } catch (error: unknown) {
      throw new Error(`Failed to read source from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Write a source to file
   * @param filePath File path
   * @param source Source
   */
  async writeSource(filePath: string, source: DocumentSource): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const dirPath = path.dirname(filePath);
      await this.createDirectory(dirPath);
      
      // Write source to file
      await fs.writeFile(filePath, JSON.stringify(source, null, 2), 'utf-8');
    } catch (error: unknown) {
      throw new Error(`Failed to write source to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete a source file
   * @param filePath File path
   * @returns True if file was deleted
   */
  async deleteSource(filePath: string): Promise<boolean> {
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
    // Read all files in the directory
    try {
      const files = await fs.readdir(this.baseDir);
      
      // Process each JSON file
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.baseDir, file);
            await callback(filePath);
          } catch (error: unknown) {
            logger.warn(`Error processing source file ${file}: ${error instanceof Error ? error.message : String(error)}`, 'SourceFileStorage');
          }
        }
      }
    } catch (error: unknown) {
      logger.warn(`Error reading source directory: ${error instanceof Error ? error.message : String(error)}`, 'SourceFileStorage');
    }
  }
}