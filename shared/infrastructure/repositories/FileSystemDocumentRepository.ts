/**
 * File system implementation of the DocumentRepository interface
 * Stores documents as JSON files in a directory structure
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import {
  IDocumentRepository,
  DocumentSearchQuery
} from '../../../shared/domain/repositories/DocumentRepository.js';
import { Document } from '../../../shared/domain/models/Document.js';
import { config } from '../config.js';
import { extractUnifiedContent, UnifiedExtractionOptions } from '../UnifiedContentExtractor.js';
import Fuse from 'fuse.js';

/**
 * File system-based document repository
 */
export class FileSystemDocumentRepository implements IDocumentRepository {
  private baseDir: string;
  
  /**
   * Create a new file system document repository
   * @param baseDir Base directory for storing documents
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(config.dataDir, 'documents');
  }
  
  /**
   * Initialize the repository (create directories)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error: unknown) {
      throw new Error(`Failed to initialize document repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get the file path for a document
   * @param id Document ID
   * @returns File path
   */
  private getFilePath(id: string): string {
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
   * Convert a URL to a document ID
   * @param url Document URL
   * @returns Document ID
   */
  private urlToId(url: string): string {
    // Create a stable, URL-safe ID from the URL
    return createHash('sha256').update(url).digest('hex');
  }
  
  /**
   * Find a document by its ID
   * @param id Document ID
   * @returns Promise resolving to the document or null if not found
   */
  async findById(id: string): Promise<Document | null> {
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
      const document = JSON.parse(content) as Document;
      
      // Ensure the document has text content
      if (!document.textContent && document.content) {
        console.log(`Document ${document.id} has HTML content but no text content, extracting...`);
        try {
          // Extract text content from HTML content
          const extractionOptions: UnifiedExtractionOptions = {
            comprehensive: true,
            debug: true
          };
          
          const extractedContent = extractUnifiedContent(document.content, document.url, extractionOptions);
          if (extractedContent.textContent) {
            document.textContent = extractedContent.textContent;
            console.log(`Extracted ${document.textContent.length} chars of text content, ${extractedContent.headings?.length || 0} headings, and ${extractedContent.codeBlocks?.length || 0} code blocks for ${document.id}`);
            document.metadata = document.metadata || {};
            Object.assign(document.metadata, extractedContent.metadata);
            // Update the document with the extracted text content
            await this.save(document);
          }
        } catch (error) {
          console.warn(`Failed to extract text content for ${document.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      // Debug information about content
      if (document.textContent) {
        console.log(`Document ${document.id} has ${document.textContent.length} chars of text content`);
      } else {
        console.warn(`Document ${document.id} has no text content!`);
      }
      
      return document;
    } catch (error: unknown) {
      // Log error and return null (don't expose file system errors to clients)
      console.error(`Error finding document by ID: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Find a document by its URL
   * @param url Document URL
   * @returns Promise resolving to the document or null if not found
   */
  async findByUrl(url: string): Promise<Document | null> {
    // Convert URL to ID and look up by ID
    const id = this.urlToId(url);
    return this.findById(id);
  }
  
  /**
   * Save a document (create or update)
   * @param document Document to save
   * @returns Promise that resolves when the operation is complete
   */
  async save(document: Document): Promise<void> {
    try {
      // Ensure document has proper content
      if (!document.textContent && document.content) {
        console.log(`Document ${document.id} is missing text content, extracting from HTML...`);
        try {
          // Extract text content using our unified extractor
          const extractionOptions: UnifiedExtractionOptions = {
            comprehensive: true, // Enable all extraction features
            debug: true // Enable detailed logging
          };
          
          const extractedContent = extractUnifiedContent(document.content, document.url, extractionOptions);
          
          // Update document with extracted content
          document.textContent = extractedContent.textContent;
          
          // Create metadata object if it doesn't exist
          document.metadata = document.metadata || {};
          
          // Add extracted headings if available
          if (extractedContent.headings && extractedContent.headings.length > 0) {
            document.metadata.headings = extractedContent.headings;
          }
          
          if (extractedContent.codeBlocks && extractedContent.codeBlocks.length > 0) {
            document.metadata = document.metadata || {};
            document.metadata.codeBlocks = extractedContent.codeBlocks;
          }

          
// Add any other metadata from extraction
          if (extractedContent.metadata) {
            // Copy over any metadata that doesn't conflict
            Object.entries(extractedContent.metadata).forEach(([key, value]) => {
              // Skip title, we already have it
              if (key !== 'title' && value && document.metadata) {
                document.metadata[key] = value;
              }
            });
          }
          console.log(`Successfully extracted ${document.textContent.length} chars of text content for ${document.id}`);
        } catch (error) {
          console.warn(`Error extracting text content: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      console.log(`Saving document: ${document.title} (${document.id})`);
      
      const filePath = this.getFilePath(document.id);
      const dirPath = path.dirname(filePath);
      
      // Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });
      
      // Validate document before saving
      if (!document.textContent || document.textContent.trim().length === 0) {
        console.warn(`Document ${document.id} has no text content!`);
        
        // If we can't extract text content but have html content, use a placeholder
        if (document.content && document.content.length > 0) {
          console.log(`Using placeholder text content for ${document.id}`);
          document.textContent = `[Content available but not extracted: ${document.title}]`;
        } else {
          // No content at all
          console.warn(`Document ${document.id} has no HTML content either!`);
          document.textContent = `[No content available: ${document.title}]`;
        }
      }
      
      // Write document to file
      await fs.writeFile(filePath, JSON.stringify(document, null, 2), 'utf-8');
      
      // Update index (this could be optimized in a real implementation)
      await this.updateIndex();
      
      console.log(`Document saved successfully: ${document.title}`);
    } catch (error: unknown) {
      console.error(`Failed to save document: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to save document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete a document by its ID
   * @param id Document ID
   * @returns Promise that resolves to true if the document was deleted
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
      
      // Update index
      await this.updateIndex();
      
      return true;
    } catch (error: unknown) {
      console.error(`Error deleting document: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Update the search index
   * This is a simple implementation that would be replaced with something more
   * efficient in a production system
   */
  private async updateIndex(): Promise<void> {
    // In a real implementation, we would update a persistent index
    // For now, we'll just ensure the index directory exists
    const indexDir = path.join(this.baseDir, 'index');
    await fs.mkdir(indexDir, { recursive: true });
  }
  
  /**
   * Find documents that match the given query
   * @param query Search query parameters
   * @returns Promise resolving to array of matching documents
   */
  async search(query: DocumentSearchQuery): Promise<Document[]> {
    try {
      console.log(`Search query received:`, JSON.stringify(query, null, 2));
      
      // In a real implementation, we would use a proper search index
      // For this prototype, we'll load all documents and search in memory
      const documents = await this.loadAllDocuments();
      console.log(`Loaded ${documents.length} documents for search`);
      
      // Filter by source IDs if provided
      let filteredDocs = documents;
      if (query.sourceIds && query.sourceIds.length > 0) {
        console.log(`Filtering by source IDs:`, query.sourceIds);
        filteredDocs = filteredDocs.filter(doc => 
          query.sourceIds!.includes(doc.sourceId)
        );
        console.log(`After source filter: ${filteredDocs.length} documents`);
      }
      
      // Filter by tags if provided
      if (query.tags && query.tags.length > 0) {
        console.log(`Filtering by tags:`, query.tags);
        filteredDocs = filteredDocs.filter(doc => 
          query.tags!.every(tag => doc.tags && doc.tags.includes(tag))
        );
        console.log(`After tag filter: ${filteredDocs.length} documents`);
      }
      
      // Filter by indexed date if provided
      if (query.indexedAfter) {
        filteredDocs = filteredDocs.filter(doc => 
          new Date(doc.indexedAt) >= query.indexedAfter!
        );
      }
      
      if (query.indexedBefore) {
        filteredDocs = filteredDocs.filter(doc => 
          new Date(doc.indexedAt) <= query.indexedBefore!
        );
      }
      
      // Text search if provided
      if (query.text) {
        console.log(`Searching for text: "${query.text}"`);
        const fuse = new Fuse(filteredDocs, {
          keys: [
            { name: 'title', weight: 2 }, // Title is twice as important
            { name: 'textContent', weight: 1 },
            { name: 'metadata.description', weight: 1.5 } // Description is also important
          ],
          includeScore: true,
          // Lower threshold means more strict matching
          // 0.0 = perfect match, 1.0 = anything matches
          threshold: 0.4, 
          // Include matches information so we can highlight relevant sections
          includeMatches: true,
          ignoreLocation: true
        });
        
        const results = fuse.search(query.text);
        console.log(`Fuse search returned ${results.length} results`);
        
        // Log the top results for debugging
        if (results.length > 0) {
          results.slice(0, 3).forEach((result, index) => {
            console.log(`Result ${index+1}: "${result.item.title}" (score: ${result.score || 'unknown'})`);
            
            // Add match information to the document
            // This can be used by the client to highlight relevant sections
            if (result.matches) {
              // Find text content matches
              const textMatches = result.matches.filter(match => match.key === 'textContent');
              if (textMatches.length > 0 && textMatches[0].indices.length > 0) {
                // Add content snippet to document metadata for retrieval
                result.item.metadata = result.item.metadata || {};
                result.item.metadata.searchSnippets = extractSnippets(result.item.textContent, textMatches[0].indices, 150);
              }
            }
          });
        }
        
        filteredDocs = results.map(result => result.item);
      }
      
      // Apply pagination
      let result = filteredDocs;
      if (query.offset) {
        result = result.slice(query.offset);
      }
      
      if (query.limit) {
        result = result.slice(0, query.limit);
      }
      
      console.log(`Returning ${result.length} search results`);
      return result;
    } catch (error: unknown) {
      console.error(`Error searching documents: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  
  /**
   * Find documents by source ID
   * @param sourceId Source ID
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching documents
   */
  async findBySourceId(sourceId: string, limit?: number, offset?: number): Promise<Document[]> {
    return this.search({
      sourceIds: [sourceId],
      limit,
      offset
    });
  }
  
  /**
   * Find documents by tag
   * @param tag Tag to search for
   * @param limit Maximum number of results
   * @param offset Number of results to skip
   * @returns Promise resolving to array of matching documents
   */
  async findByTag(tag: string, limit?: number, offset?: number): Promise<Document[]> {
    return this.search({
      tags: [tag],
      limit,
      offset
    });
  }
  
  /**
   * Count documents matching a query
   * @param query Search query parameters
   * @returns Promise resolving to the count
   */
  async count(query?: DocumentSearchQuery): Promise<number> {
    if (!query) {
      return this.countAllDocuments();
    }
    
    const documents = await this.search({
      ...query,
      limit: undefined,
      offset: undefined
    });
    
    return documents.length;
  }
  
  /**
   * Count all documents in the repository
   * @returns Promise resolving to the count
   */
  private async countAllDocuments(): Promise<number> {
    try {
      const documents = await this.loadAllDocuments();
      return documents.length;
    } catch (error: unknown) {
      console.error(`Error counting documents: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
  
  /**
   * Load all documents from the file system
   * In a real implementation, this would be replaced with a more efficient approach
   * @returns Promise resolving to array of all documents
   */
  private async loadAllDocuments(): Promise<Document[]> {
    console.log(`Loading all documents from ${this.baseDir}`);
    const documents: Document[] = [];
    
    // Walk through the directory structure
    async function walkDir(dirPath: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
        return;
      }
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip index directory
          if (entry.name === 'index') continue;
          
          // Recursively walk subdirectories
          await walkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          // Read and parse JSON file
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const document = JSON.parse(content) as Document;
            documents.push(document);
            console.log(`Loaded document: ${document.title}`);
          } catch (error: unknown) {
            console.warn(`Error reading document file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
    
    try {
      // Check if base directory exists
      try {
        await fs.access(this.baseDir);
      } catch {
        console.log(`Base directory ${this.baseDir} does not exist`);
        // Base directory doesn't exist, return empty array
        return [];
      }
      
      // Walk the directory structure
      await walkDir(this.baseDir);
      console.log(`Found ${documents.length} documents in repository`);
      
      return documents;
    } catch (error: unknown) {
      console.error(`Error loading all documents: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
  
  /**
   * Get a document with content snippet by ID
   * This is useful for displaying preview snippets in search results
   * @param id Document ID
   * @returns Promise resolving to document with content snippet or null
   */
  async getDocumentWithSnippet(id: string): Promise<Document | null> {
    const document = await this.findById(id);
    if (!document) return null;
    
    // Create a version with just the essential fields and a snippet
    return {
      ...document,
      // Truncate full content to save bandwidth
      content: '', 
      // Keep a snippet of text content
      textContent: document.textContent?.substring(0, 500) + '...'
    };
  }
}

/**
 * Extract text snippets from content based on match indices
 * @param text Full text content
 * @param matches Array of index pairs from Fuse.js
 * @param snippetLength Maximum length of each snippet
 * @returns Array of snippets
 */
function extractSnippets(text: string, matches: ReadonlyArray<ReadonlyArray<number>>, snippetLength: number): string[] {
  if (!text) return [];

  return matches.slice(0, 3).map(([start, end]) => {
    // Calculate snippet boundaries with context
    const snippetStart = Math.max(0, start - snippetLength / 2);
    const snippetEnd = Math.min(text.length, end + snippetLength / 2);
    
    // Extract snippet
    return text.substring(Math.floor(snippetStart), Math.ceil(snippetEnd)) + '...';
  });
}