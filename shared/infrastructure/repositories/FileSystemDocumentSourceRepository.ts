/**
 * File system implementation of the DocumentSourceRepository interface
 * Stores document sources as JSON files in a directory structure
 */

import path from 'path';
import {
  IDocumentSourceRepository,
  DocumentSourceSearchQuery
} from '../../../shared/domain/repositories/DocumentSourceRepository.js';
import { DocumentSource } from '../../../shared/domain/models/Document.js';
import { config } from '../config.js';
import { getLogger } from '../logging.js';
import { InMemorySourceIndex } from './source/SourceIndex.js';
import { SourceFileStorage } from './source/SourceFileStorage.js';
import { SourceSearch } from './source/SourceSearch.js';

const logger = getLogger();

/**
 * File system-based document source repository
 */
export class FileSystemDocumentSourceRepository implements IDocumentSourceRepository {
  private baseDir: string;
  private index: InMemorySourceIndex;
  private storage: SourceFileStorage;
  private searchService: SourceSearch;
  
  /**
   * Create a new file system document source repository
   * @param baseDir Base directory for storing document sources
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(config.dataDir, 'sources');
    
    // Initialize components
    this.index = new InMemorySourceIndex();
    this.storage = new SourceFileStorage(this.baseDir);
    this.searchService = new SourceSearch();
    
    logger.info(`FileSystemDocumentSourceRepository initialized with base directory: ${this.baseDir}`, 'FileSystemDocumentSourceRepository');
  }
  
  /**
   * Initialize the repository (create directories)
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing document source repository...', 'FileSystemDocumentSourceRepository');
      
      // Initialize storage
      await this.storage.initialize();
      
      // Build index
      await this.buildIndex();
      
      logger.info(`Document source repository initialized. Indexed ${this.index.size} sources.`, 'FileSystemDocumentSourceRepository');
    } catch (error: unknown) {
      throw new Error(`Failed to initialize document source repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Build index for existing sources
   */
  private async buildIndex(): Promise<void> {
    logger.info('Building source index...', 'FileSystemDocumentSourceRepository');
    
    // Clear existing index
    this.index.clear();
    
    // Load all sources from storage
    await this.storage.walkDirectory(async (filePath) => {
      try {
        const source = await this.storage.readSource(filePath);
        this.index.addSource(source);
      } catch (error: unknown) {
        logger.warn(`Error indexing source file ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
      }
    });
    
    logger.info(`Indexed ${this.index.size} sources.`, 'FileSystemDocumentSourceRepository');
  }
  
  /**
   * Find a document source by its ID
   * @param id Source ID
   * @returns Promise resolving to the source or null if not found
   */
  async findById(id: string): Promise<DocumentSource | null> {
    try {
      // Check if source is in index
      const source = this.index.getById(id);
      if (source) {
        return source;
      }
      
      // Not in index, try to load from storage
      const filePath = this.storage.getFilePath(id);
      
      // Check if file exists
      if (!await this.storage.fileExists(filePath)) {
        return null;
      }
      
      // Read source from file
      const loadedSource = await this.storage.readSource(filePath);
      
      // Add to index
      this.index.addSource(loadedSource);
      
      return loadedSource;
    } catch (error: unknown) {
      logger.error(`Error finding document source by ID: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      // Check if source is in index
      const source = this.index.findByName(name);
      if (source) {
        return source;
      }
      
      // Not in index, load all sources
      await this.loadAllSources();
      
      // Try again after loading all sources
      const foundSource = this.index.findByName(name);
      return foundSource || null;
    } catch (error: unknown) {
      logger.error(`Error finding document source by name: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      // Check if source is in index
      const source = this.index.findByBaseUrl(baseUrl);
      if (source) {
        return source;
      }
      
      // Not in index, load all sources
      await this.loadAllSources();
      
      // Try again after loading all sources
      const foundSource = this.index.findByBaseUrl(baseUrl);
      return foundSource || null;
    } catch (error: unknown) {
      logger.error(`Error finding document source by base URL: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      logger.info(`Saving document source: ${source.name} (${source.id})`, 'FileSystemDocumentSourceRepository');
      
      // Get file path
      const filePath = this.storage.getFilePath(source.id);
      
      // Write to storage
      await this.storage.writeSource(filePath, source);
      
      // Update index
      this.index.addSource(source);
      
      logger.info(`Document source saved successfully: ${source.name} (${source.id})`, 'FileSystemDocumentSourceRepository');
    } catch (error: unknown) {
      logger.error(`Failed to save document source: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      logger.info(`Deleting document source: ${id}`, 'FileSystemDocumentSourceRepository');
      
      // Get file path
      const filePath = this.storage.getFilePath(id);
      
      // Check if file exists
      if (!await this.storage.fileExists(filePath)) {
        return false;
      }
      
      // Delete from storage
      const result = await this.storage.deleteSource(filePath);
      
      // Remove from index
      this.index.removeSource(id);
      
      return result;
    } catch (error: unknown) {
      logger.error(`Error deleting document source: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      logger.info(`Searching document sources: ${JSON.stringify(query)}`, 'FileSystemDocumentSourceRepository');
      
      // Load all sources
      const sources = await this.loadAllSources();
      
      // Perform search
      return this.searchService.executeSearch(sources, query);
    } catch (error: unknown) {
      logger.error(`Error searching document sources: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      logger.error(`Error finding all document sources: ${error instanceof Error ? error.message : String(error)}`, 'FileSystemDocumentSourceRepository');
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
      return this.index.size;
    }
    
    const sources = await this.search({
      ...query,
      limit: undefined,
      offset: undefined
    });
    
    return sources.length;
  }
  
  /**
   * Update the lastCrawledAt timestamp for a source
   * @param id Source ID
   * @param timestamp New lastCrawledAt timestamp
   * @returns Promise that resolves when the operation is complete
   */
  async updateLastCrawledAt(id: string, timestamp: Date): Promise<void> {
    try {
      logger.info(`Updating lastCrawledAt for source ${id}: ${timestamp.toISOString()}`, 'FileSystemDocumentSourceRepository');
      
      const source = await this.findById(id);
      if (!source) {
        throw new Error(`Document source with ID ${id} not found`);
      }
      
      // Update the timestamp
      source.lastCrawledAt = timestamp;
      
      // Save the updated source
      await this.save(source);
      
      logger.info(`Updated lastCrawledAt for source ${id}`, 'FileSystemDocumentSourceRepository');
    } catch (error: unknown) {
      throw new Error(`Failed to update lastCrawledAt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Load all document sources from the file system
   * @returns Promise resolving to array of all sources
   */
  private async loadAllSources(): Promise<DocumentSource[]> {
    logger.info(`Loading all document sources from ${this.baseDir}`, 'FileSystemDocumentSourceRepository');
    
    const sources: DocumentSource[] = [];
    
    // Use existing index if available
    if (this.index.size > 0) {
      for (const id of this.index.getAllIds()) {
        const source = this.index.getById(id);
        if (source) {
          sources.push(source);
        }
      }
      
      if (sources.length > 0) {
        logger.info(`Loaded ${sources.length} sources from index`, 'FileSystemDocumentSourceRepository');
        return sources;
      }
    }
    
    // Rebuild the index if it's empty
    await this.buildIndex();
    
    // Get sources from the rebuilt index
    for (const id of this.index.getAllIds()) {
      const source = this.index.getById(id);
      if (source) {
        sources.push(source);
      }
    }
    
    logger.info(`Loaded ${sources.length} sources`, 'FileSystemDocumentSourceRepository');
    return sources;
  }
}