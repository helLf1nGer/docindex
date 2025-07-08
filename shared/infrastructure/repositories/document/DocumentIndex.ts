/**
 * Document repository indexing
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DocumentIndex, IndexEntry } from './DocumentTypes.js';
import { getLogger, Logger } from '../../../infrastructure/logging.js';
import { ensureDirectoryExists } from '../../../utils/fileUtils.js'; // Correct path with extension

const logger: Logger = getLogger();

/**
 * In-memory document index implementation
 */
export class InMemoryDocumentIndex implements DocumentIndex {
  private idToPathMap: Map<string, string>;
  private urlToPathMap: Map<string, string>;
  private indexFilePath: string;
  private dataDir: string;
  private isInitialized: boolean = false; // Track initialization status

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.indexFilePath = path.join(this.dataDir, 'index.json');
    this.idToPathMap = new Map(); // Initialize as empty maps
    this.urlToPathMap = new Map();
    logger.info(`DocumentIndex created. Index file will be loaded via initialize(). Path: ${this.indexFilePath}`, 'DocumentIndex.constructor');
    // Initialization will be triggered externally via initialize()
  }

  // Removed ensureInitialized method - initialization is now explicit

  /**
   * Loads the index from the file system.
   */
  /**
   * Loads the index from the file system. Should be called once after construction.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('DocumentIndex already initialized.', 'DocumentIndex.initialize');
      return;
    }
    try {
      // This log was already present from previous attempt, context tag fixed below if needed
      await ensureDirectoryExists(this.dataDir); // Ensure data directory exists
      logger.info(`Attempting to load index from ${this.indexFilePath}`, 'DocumentIndex.initialize');
      logger.debug(`Reading index file: ${this.indexFilePath}`, 'DocumentIndex.initialize'); // Corrected context tag
      const data = await fs.readFile(this.indexFilePath, 'utf-8');
      logger.debug(`Reading index file: ${this.indexFilePath}`, 'DocumentIndex.initialize'); // Keep added log
      logger.debug(`Raw index data read (first 100 chars): ${data.substring(0, 100)}`, 'DocumentIndex.initialize'); // Corrected context tag and removed duplicate
      const parsedData = JSON.parse(data);
      logger.debug(`Parsed index data keys: ${Object.keys(parsedData).join(', ')}`, 'DocumentIndex.initialize'); // Keep added log
      // Removed duplicate log line

      if (parsedData && parsedData.idMap && parsedData.urlMap) {
        this.idToPathMap = new Map(parsedData.idMap);
        this.urlToPathMap = new Map(parsedData.urlMap);
        logger.info(`Successfully loaded index from ${this.indexFilePath}. ID Map size: ${this.idToPathMap.size}, URL Map size: ${this.urlToPathMap.size}`, 'DocumentIndex.initialize');
      } else {
        logger.warn(`Index file ${this.indexFilePath} has invalid format. Starting with empty index.`, 'DocumentIndex.initialize');
        this.idToPathMap = new Map();
        this.urlToPathMap = new Map();
      }
    } catch (error: any) {
      logger.error(`initialize error caught. Code: ${error.code}, Message: ${error.message}`, 'DocumentIndex.initialize', { stack: error.stack }); // Corrected context tag
      if (error.code === 'ENOENT') {
        logger.info(`Index file ${this.indexFilePath} not found. Starting with empty index.`, 'DocumentIndex.initialize');
        this.idToPathMap = new Map();
        this.urlToPathMap = new Map();
      } else {
        logger.error(`Failed to load index from ${this.indexFilePath}: ${error.message}`, 'DocumentIndex.initialize', { error });
        // Decide if we should start empty or throw? Starting empty for resilience.
        this.idToPathMap = new Map();
        this.urlToPathMap = new Map();
      }
    } finally { // Correctly place finally after the catch block
      this.isInitialized = true; // Mark as initialized even if loading failed (started empty)
      logger.info('DocumentIndex initialization complete.', 'DocumentIndex.initialize');
    }
  }

  /**
   * Saves the current index state to the file system.
   */
  private async saveIndex(): Promise<void> {
    // No longer need ensureInitialized, but check if initialized before saving
    if (!this.isInitialized) {
      logger.error('Attempted to save index before initialization was complete.', 'DocumentIndex.saveIndex');
      // Optionally throw an error or just return to prevent saving an incomplete/empty index prematurely
      return;
    }
    try {
      logger.debug('Entering saveIndex try block', 'DocumentIndex.saveIndex'); // Keep added log
      logger.info(`Attempting to save index to ${this.indexFilePath}. ID Map size: ${this.idToPathMap.size}, URL Map size: ${this.urlToPathMap.size}`, 'DocumentIndex.saveIndex');
      const dataToSave = {
        idMap: Array.from(this.idToPathMap.entries()),
        urlMap: Array.from(this.urlToPathMap.entries()),
      };
      logger.debug(`Data to save: ID map size ${this.idToPathMap.size}, URL map size ${this.urlToPathMap.size}`, 'DocumentIndex.saveIndex'); // Keep this log
      const jsonData = JSON.stringify(dataToSave, null, 2); // Pretty print JSON

      // Atomic write: write to temp file, then rename
      const tempFilePath = `${this.indexFilePath}.${Date.now()}.tmp`;
      logger.debug(`Calculated temp file path: ${tempFilePath}`, 'DocumentIndex.saveIndex');
      logger.debug(`Attempting to write to temp file: ${tempFilePath}`, 'DocumentIndex.saveIndex');
      await fs.writeFile(tempFilePath, jsonData, 'utf-8');
      logger.debug(`Attempting to rename temp file ${tempFilePath} to ${this.indexFilePath}`, 'DocumentIndex.saveIndex');
      await fs.rename(tempFilePath, this.indexFilePath);

      logger.info(`Successfully saved index to ${this.indexFilePath}`, 'DocumentIndex.saveIndex');
    } catch (error: any) {
      logger.error(`saveIndex error caught: ${error.message}`, 'DocumentIndex.saveIndex', { stack: error.stack }); // Keep this log
      logger.error(`Failed to save index to ${this.indexFilePath}: ${error.message}`, 'DocumentIndex.saveIndex', { error });
      // Consider strategy if save fails (e.g., retry, log critical error)
    }
  }

  /**
   * Clear the index
   */
  async clear(): Promise<void> {
    // No ensureInitialized needed
    this.idToPathMap.clear();
    this.urlToPathMap.clear();
    logger.info('Document index cleared', 'DocumentIndex.clear');
    await this.saveIndex();
  }
  
  /**
   * Get file path by document ID
   * @param id Document ID
   * @returns File path or undefined if not found
   */
  async getPathById(id: string): Promise<string | undefined> {
    // No ensureInitialized needed
    const path = this.idToPathMap.get(id);
    logger.debug(`[InMemoryDocumentIndex] getPathById(${id}): Found path: ${path}`, 'InMemoryDocumentIndex.getPathById');
    return path;
  }
  
  /**
   * Get file path by document URL
   * @param url Document URL
   * @returns File path or undefined if not found
   */
  async getPathByUrl(url: string): Promise<string | undefined> {
    // No ensureInitialized needed
    const path = this.urlToPathMap.get(url);
    logger.debug(`[InMemoryDocumentIndex] getPathByUrl(${url}): Found path: ${path}`, 'InMemoryDocumentIndex.getPathByUrl');
    return path;
  }
  
  /**
   * Set path for document ID
   * @param id Document ID
   * @param path File path
   */
  async setPathForId(id: string, path: string): Promise<void> {
    // No ensureInitialized needed
    logger.debug(`[InMemoryDocumentIndex] setPathForId: Setting ID '${id}' to path '${path}'. Current size: ${this.idToPathMap.size}`, 'InMemoryDocumentIndex.setPathForId');
    this.idToPathMap.set(id, path);
    logger.debug(`[InMemoryDocumentIndex] setPathForId: ID '${id}' set. New size: ${this.idToPathMap.size}`, 'InMemoryDocumentIndex.setPathForId');
    await this.saveIndex();
  }
  
  /**
   * Set path for document URL
   * @param url Document URL
   * @param path File path
   */
  async setPathForUrl(url: string, path: string): Promise<void> {
    // No ensureInitialized needed
    logger.debug(`[InMemoryDocumentIndex] setPathForUrl: Setting URL '${url}' to path '${path}'. Current size: ${this.urlToPathMap.size}`, 'InMemoryDocumentIndex.setPathForUrl');
    this.urlToPathMap.set(url, path);
    logger.debug(`[InMemoryDocumentIndex] setPathForUrl: URL '${url}' set. New size: ${this.urlToPathMap.size}`, 'InMemoryDocumentIndex.setPathForUrl');
    await this.saveIndex();
  }
  
  /**
   * Remove document ID from index
   * @param id Document ID
   */
  async removeId(id: string): Promise<void> {
    // No ensureInitialized needed
    const deleted = this.idToPathMap.delete(id);
    if (deleted) {
      logger.debug(`[InMemoryDocumentIndex] Removed ID '${id}' from index.`, 'InMemoryDocumentIndex.removeId');
      await this.saveIndex();
    } else {
      logger.debug(`[InMemoryDocumentIndex] Attempted to remove non-existent ID '${id}'.`, 'InMemoryDocumentIndex.removeId');
    }
  }
  
  /**
   * Remove document URL from index
   * @param url Document URL
   */
  async removeUrl(url: string): Promise<void> {
    // No ensureInitialized needed
    const deleted = this.urlToPathMap.delete(url);
     if (deleted) {
      logger.debug(`[InMemoryDocumentIndex] Removed URL '${url}' from index.`, 'InMemoryDocumentIndex.removeUrl');
      await this.saveIndex();
    } else {
       logger.debug(`[InMemoryDocumentIndex] Attempted to remove non-existent URL '${url}'.`, 'InMemoryDocumentIndex.removeUrl');
    }
  }
  
  /**
   * Get size of the index
   */
  async size(): Promise<number> {
    // No ensureInitialized needed
    return this.idToPathMap.size;
  }
  
  /**
   * Get all document IDs
   * @returns Array of document IDs
   */
  async getAllIds(): Promise<string[]> {
    // No ensureInitialized needed
    return Array.from(this.idToPathMap.keys());
  }
  
  /**
   * Add a document to the index
   * @param id Document ID
   * @param url Document URL
   * @param path File path
   */
  async addDocument(id: string, url: string, path: string): Promise<void> {
    // Note: setPathForId and setPathForUrl call saveIndex internally
    await this.setPathForId(id, path);
    await this.setPathForUrl(url, path); // saveIndex will be called twice, could optimize later if needed
  }
  
  /**
   * Remove a document from the index
   * @param id Document ID
   * @param url Document URL
   */
  async removeDocument(id: string, url: string): Promise<void> {
    // Note: removeId and removeUrl call saveIndex internally
    await this.removeId(id);
    await this.removeUrl(url); // saveIndex might be called twice if both existed
  }
}