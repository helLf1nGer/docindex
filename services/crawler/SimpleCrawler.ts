import { Logger } from '../../shared/infrastructure/logging.js'; // Removed getLogger

/**
 * SimpleCrawler
 * 
 * A straightforward, reliable crawler implementation focused on core functionality
 * without excessive abstractions. Implements proper recursive crawling with
 * accurate depth tracking and simple but effective document processing.
 */

import { EventEmitter } from 'events';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'; // Added AxiosError
import { URL } from 'url';
import { SimpleUrlProcessor, ProcessedUrl } from './SimpleUrlProcessor.js';
import { SimpleContentExtractor, ExtractedContent } from './SimpleContentExtractor.js';
import {
  CrawlError,
  CrawlHttpError,
  CrawlNetworkError,
  CrawlTimeoutError,
  ValidationError,
  FileSystemError,
  isDocsiError
} from '../../shared/domain/errors.js'; // Import custom errors
// Document type from the existing Document model
// Importing from shared domain to maintain compatibility
import { Document } from '../../shared/domain/models/Document.js';

// Removed console.log redirection hack

export interface CrawlOptions {
  /** Base URL to start crawling from */
  baseUrl: string;
  /** Maximum crawling depth (default: 3) */
  maxDepth?: number;
  /** Maximum pages to crawl (default: 500) */
  maxPages?: number;
  /** Request delay in ms between requests (default: 1000) */
  requestDelay?: number;
  /** Maximum concurrent requests (default: 2) */
  concurrency?: number;
  /** Maximum retries for failed requests (default: 3) */
  maxRetries?: number;
  /** URL patterns to include (regex strings) */
  includePatterns?: string[];
  /** URL patterns to exclude (regex strings) */
  excludePatterns?: string[];
  /** File extensions to exclude */
  excludeExtensions?: string[];
  /** Whether to respect robots.txt (default: true) */
  respectRobotsTxt?: boolean;
  /** HTTP request timeout in ms (default: 10000) */
  timeout?: number;
  /** HTTP headers to include in requests */
  headers?: Record<string, string>;
  /** Whether to follow redirects (default: true) */
  followRedirects?: boolean;
  /** Additional axios request config */
  requestConfig?: AxiosRequestConfig;
  /** Force crawling even if document exists (default: false) */
  force?: boolean;
}

export interface CrawlStatus {
  /** Number of URLs discovered */
  discovered: number;
  /** Number of URLs processed */
  processed: number;
  /** Number of URLs skipped */
  skipped: number;
  /** Number of successful extractions */
  succeeded: number;
  /** Number of failed extractions */
  failed: number;
  /** Whether crawling is completed */
  completed: boolean;
  /** Start time */
  startTime: Date;
  /** End time (if completed) */
  endTime?: Date;
  /** Current URL being processed */
  currentUrl?: string;
}

export interface DocumentStorage {
  /** Save a document to storage */
  saveDocument(document: Document): Promise<boolean>;
  /** Check if a document exists */
  documentExists(url: string): Promise<boolean>;
}

/**
 * SimpleCrawler provides a straightforward implementation of a web crawler
 * designed specifically for documentation websites.
 */
export class SimpleCrawler extends EventEmitter {
  private urlProcessor: SimpleUrlProcessor;
  private contentExtractor: SimpleContentExtractor;
  private httpClient: AxiosInstance;
  private documentStorage: DocumentStorage;
  private logger: Logger; // Added logger property
  
  private options: Required<CrawlOptions>;
  private status: CrawlStatus;
  
  private urlQueue: ProcessedUrl[] = [];
  private visitedUrls: Set<string> = new Set();
  private processing: Set<string> = new Set();
  private activeRequests = 0;
  
  private shouldStop = false;
  
  constructor(documentStorage: DocumentStorage, options: CrawlOptions, logger: Logger) { // Added logger parameter
    super();
    
    // Set default options
    this.options = {
      baseUrl: options.baseUrl,
      maxDepth: options.maxDepth ?? 3,
      maxPages: options.maxPages ?? 500,
      requestDelay: options.requestDelay ?? 1000,
      concurrency: options.concurrency ?? 2,
      maxRetries: options.maxRetries ?? 3,
      includePatterns: options.includePatterns ?? [],
      excludePatterns: options.excludePatterns ?? [],
      excludeExtensions: options.excludeExtensions ?? [],
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      timeout: options.timeout ?? 10000,
      headers: options.headers ?? {},
      followRedirects: options.followRedirects ?? true,
      requestConfig: options.requestConfig ?? {}
,
      force: options.force ?? false
    };
    
    // Initialize components
    this.urlProcessor = new SimpleUrlProcessor({
      baseUrl: this.options.baseUrl,
      excludeExtensions: this.options.excludeExtensions,
      excludePatterns: this.options.excludePatterns,
      includePatterns: this.options.includePatterns,
      sameDomainOnly: true
    });
    
    this.contentExtractor = new SimpleContentExtractor();
    
    // Initialize HTTP client
    this.httpClient = axios.create({
      timeout: this.options.timeout,
      headers: {
        'User-Agent': 'DocSI-SimpleCrawler/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        ...this.options.headers
      },
      maxRedirects: this.options.followRedirects ? 5 : 0,
      ...this.options.requestConfig
    });
    
    this.documentStorage = documentStorage;
    this.logger = logger; // Assign logger instance
    
    // Initialize status
    this.status = {
      discovered: 0,
      processed: 0,
      skipped: 0,
      succeeded: 0,
      failed: 0,
      completed: false,
      startTime: new Date()
    };
  }
  
  /**
          getLogger().debug(`[SimpleCrawler] Emitting document for ${url}: ${JSON.stringify(document, null, 2)}`, 'SimpleCrawler');
   * Start the crawling process
   */
  async start(): Promise<CrawlStatus> {
    this.status.startTime = new Date();
    this.emit('start', { url: this.options.baseUrl, options: this.options });
    
    // Add the initial URL to the queue
    const initialUrl = this.urlProcessor.processUrl(this.options.baseUrl, undefined, -1); // Start at -1 so first URL gets depth 0
    if (initialUrl) {
      this.urlQueue.push(initialUrl);
      this.status.discovered = 1;
    } else {
      this.logger.error(`Failed to process initial URL: ${this.options.baseUrl}`, 'SimpleCrawler.start');
      throw new ValidationError(`Invalid initial URL: ${this.options.baseUrl}`);
    }
    
    // Process the queue with concurrency control
    await this.processQueue();
    
    // Mark as completed
    this.status.completed = true;
    this.status.endTime = new Date();
    
    // Calculate duration
    const duration = (this.status.endTime.getTime() - this.status.startTime.getTime()) / 1000;
    
    this.emit('complete', this.status);
    return this.status;
  }
  
  /**
   * Stop the crawling process
   */
  stop(): void {
    this.shouldStop = true;
    this.emit('stop');
  }
  
  /**
   * Get current crawl status
   */
  getStatus(): CrawlStatus {
    return { ...this.status };
  }
  
  /**
   * Process the URL queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    while (
      (this.urlQueue.length > 0 || this.activeRequests > 0) && 
      !this.shouldStop && 
      this.status.processed < this.options.maxPages
    ) {
      // Wait if we're at max concurrency
      if (this.activeRequests >= this.options.concurrency || this.urlQueue.length === 0) {
        await this.sleep(100);
        continue;
      }
      
      // Get next URL from queue
      const nextUrl = this.urlQueue.shift();
      if (!nextUrl) continue;
      
      // Skip if already visited or being processed
      if (this.visitedUrls.has(nextUrl.normalizedUrl) || this.processing.has(nextUrl.normalizedUrl)) {
        this.status.skipped++;
        continue;
      }
      
      // Skip if over max depth
      if (nextUrl.depth > this.options.maxDepth) {
        this.status.skipped++;
        continue;
      }
      
      // Mark as processing
      this.processing.add(nextUrl.normalizedUrl);
      this.activeRequests++;
      
      // Process URL
      this.processSingleUrl(nextUrl).catch(error => {
        this.logger.error(`Error processing URL ${nextUrl.url} in queue`, 'SimpleCrawler.processQueue', error);
        this.status.failed++;
      }).finally(() => {
        // Remove from processing and decrease active requests
        this.processing.delete(nextUrl.normalizedUrl);
        this.activeRequests--;
      });
      
      // Add delay between requests
      if (this.options.requestDelay > 0) {
        await this.sleep(this.options.requestDelay);
      }
    }
    
    // Wait for any remaining requests to complete
    while (this.activeRequests > 0) {
      await this.sleep(100);
    }
  }
  
  /**
   * Process a single URL
   */
  private async processSingleUrl(processedUrl: ProcessedUrl): Promise<void> {
    const { url, depth, parentUrl } = processedUrl;
    this.status.currentUrl = url;
    
    try {
      this.emit('processing', { url, depth, parentUrl });
      
      // Check if already in storage
      const exists = await this.documentStorage.documentExists(url);
      if (exists && !this.options.force) {
        this.visitedUrls.add(processedUrl.normalizedUrl);
        return;
      } else if (exists && this.options.force) {
        this.logger.debug(`Document exists but force=true, recrawling: ${url}`, 'SimpleCrawler.processSingleUrl');
      }
      
      // Fetch the URL
      const response = await this.fetchWithRetry(url);
      const html = response.data;
      
      // Add to visited URLs
      this.visitedUrls.add(processedUrl.normalizedUrl);
      this.status.processed++;
      
      // Extract content
      const extractedContent = this.contentExtractor.extract(html, url);
      if (!extractedContent) {
        this.logger.warn(`Failed to extract content from URL: ${url}`, 'SimpleCrawler.processSingleUrl');
        this.status.failed++;
        throw new CrawlError(`Content extraction failed for ${url}`); // Throw specific error
      }
      
      // Save document
      await this.saveDocument(url, extractedContent, depth, parentUrl);
      this.status.succeeded++;
      
      // Extract URLs from HTML if not at max depth
      if (depth < this.options.maxDepth) {
        const extractedUrls = this.urlProcessor.extractUrlsFromHtml(html, url, depth);
        
        // Add to queue
        for (const extractedUrl of extractedUrls) {
          if (!this.visitedUrls.has(extractedUrl.normalizedUrl) && 
              !this.processing.has(extractedUrl.normalizedUrl)) {
            this.urlQueue.push(extractedUrl);
            this.status.discovered++;
          }
        }
      }
      
      this.emit('processed', { url, depth, success: true });
    } catch (error) {
      this.logger.error(`Failed to process URL: ${url}`, 'SimpleCrawler.processSingleUrl', error);
      this.status.failed++;
      // Emit the original error object for better context downstream
      this.emit('processed', { url, depth, success: false, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }
  
  /**
   * Fetch a URL with retry logic
   */
  private async fetchWithRetry(url: string, retryCount = 0): Promise<any> {
    try {
      return await this.httpClient.get(url);
    } catch (error: unknown) {
      const attempt = retryCount + 1;
      this.logger.warn(`Attempt ${attempt} failed for URL ${url}`, 'SimpleCrawler.fetchWithRetry', error);

      if (attempt <= this.options.maxRetries) {
        const delay = Math.pow(2, retryCount) * 500 + Math.random() * 500; // Exponential backoff with jitter
        this.logger.debug(`Retrying fetch for ${url} in ${delay.toFixed(0)}ms (Attempt ${attempt}/${this.options.maxRetries})`, 'SimpleCrawler.fetchWithRetry');
        await this.sleep(delay);
        return this.fetchWithRetry(url, attempt);
      }

      // Max retries exceeded, throw specific crawl error
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
          throw new CrawlTimeoutError(url, this.options.timeout, { originalError: axiosError });
        }
        if (axiosError.response) {
          // HTTP status error
          throw new CrawlHttpError(url, axiosError.response.status, axiosError.response.statusText, { originalError: axiosError });
        }
        // Other network errors (DNS, connection refused, etc.)
        throw new CrawlNetworkError(url, axiosError);
      }
      // Non-Axios error
      throw new CrawlNetworkError(url, error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Save a document to storage
   */
  private async saveDocument(
    url: string, 
    content: ExtractedContent, 
    depth: number, 
    parentUrl?: string
  ): Promise<void> {
    // Convert extracted content to Document model
    const now = new Date();
    const document = {
      id: this.generateDocumentId(url),
      url,
      title: content.title,
      content: content.content,
      textContent: this.stripHtml(content.content),
      sourceId: this.getSourceId(),
      indexedAt: now,
      updatedAt: now,
      tags: [],
      metadata: {
        description: content.description,
        headings: content.headings,
        codeBlocks: content.codeBlocks,
        parentUrl,
        depth
      }
    } as Document;
    
    // Save to storage
    const success = await this.documentStorage.saveDocument(document);
    // saveDocument now throws specific errors if validation/write fails
    try {
      await this.documentStorage.saveDocument(document);
    } catch (error) {
      this.logger.error(`Failed to save document: ${url}`, 'SimpleCrawler.saveDocument', error);
      // Re-throw specific error or wrap if necessary
      if (isDocsiError(error)) {
        throw error; // Propagate known Docsi errors (like ValidationError, FileSystemError)
      }
      throw new FileSystemError(`Failed to save document: ${url}`, undefined, error instanceof Error ? error : new Error(String(error)));
    }
    
    this.emit('document', { url, documentId: document.id });
  }

  /**
   * Strip HTML tags from content for plain text version
   */
  private stripHtml(html: string): string {
    if (!html) return '';
    
    // Simple HTML stripping - a more sophisticated version might use cheerio
    return html
      .replace(/<[^>]*>/g, ' ') // Replace HTML tags with spaces
      .replace(/\s+/g, ' ')     // Replace multiple spaces with a single space
      .trim();                  // Remove leading/trailing whitespace
  }
  
  /**
   * Generate a document ID from URL
   */
  private generateDocumentId(url: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `doc_${Math.abs(hash).toString(16)}`;
  }
  
  /**
   * Get source ID from base URL
   */
  private getSourceId(): string {
    try {
      const { hostname } = new URL(this.options.baseUrl);
      return hostname.replace(/[^a-zA-Z0-9]/g, '_');
    } catch (error: unknown) {
      this.logger.warn(`Could not determine hostname from baseUrl: ${this.options.baseUrl}`, 'SimpleCrawler.getSourceId', error);
      return 'unknown_source';
    }
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}