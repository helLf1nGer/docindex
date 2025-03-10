/**
 * Document entity representing a documentation page or article
 * This is the core domain model for the DocSI system
 */
export interface Document {
  /** Unique identifier for the document */
  id: string;
  
  /** URL where the document was originally found */
  url: string;
  
  /** Document title */
  title: string;
  
  /** HTML content of the document */
  content: string;
  
  /** Plain text content extracted from HTML */
  textContent: string;
  
  /** When the document was crawled/indexed */
  indexedAt: Date;
  
  /** When the document was last updated */
  updatedAt: Date;
  
  /** Source identifier (which documentation source this belongs to) */
  sourceId: string;
  
  /** Tags for categorization */
  tags: string[];
  
  /** Optional metadata about the document */
  metadata?: Record<string, any>;
}

/**
 * Document source representing a documentation website or repository
 */
export interface DocumentSource {
  /** Unique identifier for the source */
  id: string;
  
  /** Human-readable name of the source */
  name: string;
  
  /** Base URL for the documentation */
  baseUrl: string;
  
  /** When the source was added to the system */
  addedAt: Date;
  
  /** When the source was last crawled */
  lastCrawledAt?: Date;
  
  /** Configuration for crawling this source */
  crawlConfig: {
    /** Maximum crawl depth */
    maxDepth: number;
    
    /** Maximum number of pages to crawl */
    maxPages: number;
    
    /** Respect robots.txt */
    respectRobotsTxt: boolean;
    
    /** Crawl delay in milliseconds */
    crawlDelay: number;
    
    /** URL patterns to include */
    includePatterns: string[];
    
    /** URL patterns to exclude */
    excludePatterns: string[];
  };
  
  /** Tags for categorization */
  tags: string[];
}