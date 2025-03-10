/**
 * File system implementation of the DocumentSourceRepository interface
 * Stores document sources as JSON files in a directory structure
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import {
  IDocumentSourceRepository,
  DocumentSourceSearchQuery
} from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { config } from '../config.js';
import Fuse from 'fuse.js';

/**
 * File system-based document source repository
 */
export class FileSystemDocumentSourceRepository implements IDocumentSourceRepository {
  private baseDir: string;
  
  /**
   * Create a new file system document source repository
   * @param baseDir Base directory for storing document sources
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(config.dataDir, 'sources');
  }
  
  /**
   * Initialize the repository (create directories)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error: unknown) {
      throw new Error(`Failed to initialize document source repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get the file path for a document source
   * @param id Source ID
   * @returns File path
   */
  private getFilePath(id: string): string {
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
   * Find a document source by its ID
   * @param id Source ID
   * @returns Promise resolving to the source or null if not found
   */
  async findById(id: string): Promise<DocumentSource | null> {
    try {
      const filePath = this.getFilePath(id);
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return null;
      }
      
      // Read and parse the file
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as DocumentSource;
    } catch (error: unknown) {
      // Log error and return null (don't expose file system errors to clients)
      console.error(`Error finding document source by ID: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Find a document source by its name
   * @param name Source name
   * @returns Promise resolving to the source or null if not found
   */
  async findByName(name: string): Promise<DocumentSource | null> {
    try {
      const sources = await this.loadAllSources();
      return sources.find(source => source.name === name) || null;
    } catch (error: unknown) {
      console.error(`Error finding document source by name: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Find a document source by its base URL
   * @param baseUrl Source base URL
   * @returns Promise resolving to the source or null if not found
   */
  async findByBaseUrl(baseUrl: string): Promise<DocumentSource | null> {
    try {
      const sources = await this.loadAllSources();
      return sources.find(source => source.baseUrl === baseUrl) || null;
    } catch (error: unknown) {
      console.error(`Error finding document source by base URL: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Save a document source (create or update)
   * @param source Source to save
   * @returns Promise that resolves when the operation is complete
   */
  async save(source: DocumentSource): Promise<void> {
    try {
      const filePath = this.getFilePath(source.id);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // Write source to file
      await fs.writeFile(filePath, JSON.stringify(source, null, 2), 'utf-8');
    } catch (error: unknown) {
      throw new Error(`Failed to save document source: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete a document source by its ID
   * @param id Source ID
   * @returns Promise that resolves to true if the source was deleted
   */
  async delete(id: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(id);
      
      // Check if the file exists
      try {
        await fs.access(filePath);
      } catch {
        return false;
      }
      
      // Delete the file
      await fs.unlink(filePath);
      
      return true;
    } catch (error: unknown) {
      console.error(`Error deleting document source: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Find document sources that match the given query
   * @param query Search query parameters
   * @returns Promise resolving to array of matching sources
   */
  async search(query: DocumentSourceSearchQuery): Promise<DocumentSource[]> {
    try {
      // Load all sources
      const sources = await this.loadAllSources();
      
      // Filter by tags if provided
      let filteredSources = sources;
      if (query.tags && query.tags.length > 0) {
        filteredSources = filteredSources.filter(source => 
          query.tags!.every(tag => source.tags.includes(tag))
        );
      }
      
      // Filter by added date if provided
      if (query.addedAfter) {
        filteredSources = filteredSources.filter(source => 
          new Date(source.addedAt) >= query.addedAfter!
        );
      }
      
      if (query.addedBefore) {
        filteredSources = filteredSources.filter(source => 
          new Date(source.addedAt) <= query.addedBefore!
        );
      }
      
      // Text search if provided
      if (query.text) {
        const fuse = new Fuse(filteredSources, {
          keys: ['name', 'baseUrl'],
          includeScore: true,
          threshold: 0.4
        });
        
        const results = fuse.search(query.text);
        filteredSources = results.map(result => result.item);
      }
      
      // Apply pagination
      let result = filteredSources;
      if (query.offset) {
        result = result.slice(query.offset);
      }
      
      if (query.limit) {
        result = result.slice(0, query.limit);
      }
      
      return result;
    } catch (error: unknown) {
      console.error(`Error searching document sources: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  
  /**
   * Find document sources by tag
   * @param tag Tag to search for
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching sources
   */
  async findByTag(tag: string, limit?: number, offset?: number): Promise<DocumentSource[]> {
    return this.search({
      tags: [tag],
      limit,
      offset
    });
  }
  
  /**
   * Get all document sources
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of all sources
   */
  async findAll(limit?: number, offset?: number): Promise<DocumentSource[]> {
    try {
      const sources = await this.loadAllSources();
      
      // Apply pagination
      let result = sources;
      if (offset) {
        result = result.slice(offset);
      }
      
      if (limit) {
        result = result.slice(0, limit);
      }
      
      return result;
    } catch (error: unknown) {
      console.error(`Error finding all document sources: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  
  /**
   * Count document sources matching a query
   * @param query Search query parameters
   * @returns Promise resolving to the count
   */
  async count(query?: DocumentSourceSearchQuery): Promise<number> {
    if (!query) {
      return this.countAllSources();
    }
    
    const sources = await this.search({
      ...query,
      limit: undefined,
      offset: undefined
    });
    
    return sources.length;
  }
  
  /**
   * Count all document sources in the repository
   * @returns Promise resolving to the count
   */
  private async countAllSources(): Promise<number> {
    try {
      const sources = await this.loadAllSources();
      return sources.length;
    } catch (error: unknown) {
      console.error(`Error counting document sources: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
  
  /**
   * Update the lastCrawledAt timestamp for a source
   * @param id Source ID
   * @param timestamp New lastCrawledAt timestamp
   * @returns Promise that resolves when the operation is complete
   */
  async updateLastCrawledAt(id: string, timestamp: Date): Promise<void> {
    try {
      const source = await this.findById(id);
      if (!source) {
        throw new Error(`Document source with ID ${id} not found`);
      }
      
      // Update the timestamp
      source.lastCrawledAt = timestamp;
      
      // Save the updated source
      await this.save(source);
    } catch (error: unknown) {
      throw new Error(`Failed to update lastCrawledAt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Load all document sources from the file system
   * @returns Promise resolving to array of all sources
   */
  private async loadAllSources(): Promise<DocumentSource[]> {
    const sources: DocumentSource[] = [];
    
    try {
      // Check if base directory exists
      try {
        await fs.access(this.baseDir);
      } catch {
        // Base directory doesn't exist, return empty array
        return [];
      }
      
      // Read all files in the directory
      const files = await fs.readdir(this.baseDir);
      
      // Process each JSON file
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.baseDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const source = JSON.parse(content) as DocumentSource;
            sources.push(source);
          } catch (error: unknown) {
            console.warn(`Error reading source file ${file}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      return sources;
    } catch (error: unknown) {
      console.error(`Error loading all document sources: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}