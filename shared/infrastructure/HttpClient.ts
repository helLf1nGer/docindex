import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { promisify } from 'util';
import robotsParser from 'robots-parser';

/**
 * Options for the HTTP client
 */
export interface HttpClientOptions {
  /** Default timeout in milliseconds */
  timeout?: number;
  
  /** Default retry count */
  retries?: number;
  
  /** Default delay between retries in milliseconds */
  retryDelay?: number;
  
  /** Whether to respect robots.txt */
  respectRobotsTxt?: boolean;
  
  /** Default user agent */
  userAgent?: string;
  
  /** Default rate limit in requests per minute */
  rateLimit?: number;
  
  /** Maximum cache size for robots.txt */
  robotsCacheSize?: number;
}

/**
 * Interface for the HTTP client
 */
export interface IHttpClient {
  /**
   * Fetch a URL with GET method
   * @param url URL to fetch
   * @param options Request options
   */
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  
  /**
   * Check if a URL is allowed to be crawled according to robots.txt
   * @param url URL to check
   */
  isAllowed(url: string): Promise<boolean>;
  
  /**
   * Get the crawl delay for a URL from robots.txt
   * @param url URL to check
   */
  getCrawlDelay(url: string): Promise<number | null>;
}

/**
 * Response from the HTTP client
 */
export interface HttpResponse {
  /** Response status code */
  statusCode: number;
  
  /** Response headers */
  headers: Record<string, string>;
  
  /** Response body as string */
  body: string;
  
  /** Time taken to fetch in milliseconds */
  timeTaken: number;
  
  /** Redirects that were followed */
  redirects?: string[];
}

/**
 * Options for a request
 */
export interface RequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  
  /** Number of retries on failure */
  retries?: number;
  
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  
  /** Custom headers */
  headers?: Record<string, string>;
  
  /** Whether to respect robots.txt for this request */
  respectRobotsTxt?: boolean;
  
  /** Custom user agent for this request */
  userAgent?: string;
}

// Simple Map-based cache implementation to avoid LRUCache dependency issues
class SimpleCache {
  private cache = new Map<string, any>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: string): any {
    return this.cache.get(key);
  }
  
  set(key: string, value: any): void {
    // If the cache is full, remove the first entry
    if (this.cache.size >= this.maxSize && this.cache.size > 0) {
      // Get the first key - with null check to make TypeScript happy
      const iterator = this.cache.keys();
      const firstItem = iterator.next();
      if (!firstItem.done && firstItem.value) {
        this.cache.delete(firstItem.value);
      }
    }
    
    // Add the new item
    this.cache.set(key, value);
  }
}

/**
 * Implementation of the HTTP client
 */
export class HttpClient implements IHttpClient {
  private axiosInstance: AxiosInstance;
  private robotsCache: SimpleCache;
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private defaultOptions: HttpClientOptions;
  
  /**
   * Create a new HTTP client
   * @param options Options for the HTTP client
   */
  constructor(options: HttpClientOptions = {}) {
    this.defaultOptions = {
      timeout: 10000,
      retries: 3,
      retryDelay: 1000,
      respectRobotsTxt: true,
      userAgent: 'DocSI-Bot/1.0 (+https://docsi.io/bot)',
      rateLimit: 60,
      robotsCacheSize: 100,
      ...options
    };
    
    this.axiosInstance = axios.create({
      timeout: this.defaultOptions.timeout,
      headers: {
        'User-Agent': this.defaultOptions.userAgent || 'DocSI-Bot/1.0'
      }
    });
    
    // Use our simple cache implementation 
    this.robotsCache = new SimpleCache(this.defaultOptions.robotsCacheSize || 100);
  }
  
  /**
   * Fetch a URL with GET method
   * @param url URL to fetch
   * @param options Request options
   */
  async get(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const requestOptions = {
      ...this.defaultOptions,
      ...options
    };
    
    // Check robots.txt
    if (requestOptions.respectRobotsTxt) {
      const allowed = await this.isAllowed(url);
      if (!allowed) {
        throw new Error(`URL ${url} is disallowed by robots.txt`);
      }
      
      // Apply rate limiting
      const host = new URL(url).hostname;
      const delay = await this.getCrawlDelay(url) || (60000 / requestOptions.rateLimit!);
      
      if (delay) {
        const limiter = this.getRateLimiter(host, delay);
        await limiter.waitForNextSlot();
      }
    }
    
    // Prepare request config
    const config: AxiosRequestConfig = {
      timeout: requestOptions.timeout,
      headers: {
        'User-Agent': requestOptions.userAgent || this.defaultOptions.userAgent || 'DocSI-Bot/1.0',
        ...requestOptions.headers
      },
      validateStatus: () => true, // Don't throw on any status code
      maxRedirects: 10
    };
    
    // Execute request with retries
    let lastError: Error | null = null;
    const retries = requestOptions.retries || 0;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await this.axiosInstance.get<string>(url, config);
        const timeTaken = Date.now() - startTime;
        
        return {
          statusCode: response.status,
          headers: response.headers as Record<string, string>,
          body: String(response.data),
          timeTaken
        };
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Only retry on network errors or 5xx status codes
        const axiosError = error as any; // Type assertion for axios error shape
        if (axiosError.response && axiosError.response.status < 500) {
          break;
        }
        
        // Wait before retrying
        if (attempt < retries) {
          const delay = requestOptions.retryDelay || 0;
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }
    
    throw lastError || new Error(`Failed to fetch ${url}`);
  }
  
  /**
   * Check if a URL is allowed to be crawled according to robots.txt
   * @param url URL to check
   */
  async isAllowed(url: string): Promise<boolean> {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/robots.txt`;
    
    try {
      let parser = this.robotsCache.get(parsedUrl.hostname);
      
      if (!parser) {
        // Fetch robots.txt
        try {
          const response = await this.axiosInstance.get<string>(robotsUrl, {
            headers: {
              'User-Agent': this.defaultOptions.userAgent || 'DocSI-Bot/1.0'
            },
            timeout: 5000
          });
          
          if (response.status === 200) {
            parser = robotsParser(robotsUrl, response.data);
            this.robotsCache.set(parsedUrl.hostname, parser);
          } else {
            // If robots.txt doesn't exist or can't be fetched, assume allowed
            return true;
          }
        } catch (error: unknown) {
          // If error fetching robots.txt, assume allowed
          return true;
        }
      }
      
      return parser.isAllowed(url, this.defaultOptions.userAgent || 'DocSI-Bot/1.0');
    } catch (error: unknown) {
      // If any error occurs during parsing, assume allowed
      return true;
    }
  }
  
  /**
   * Get the crawl delay for a URL from robots.txt
   * @param url URL to check
   */
  async getCrawlDelay(url: string): Promise<number | null> {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/robots.txt`;
    
    try {
      let parser = this.robotsCache.get(parsedUrl.hostname);
      
      if (!parser) {
        // Fetch robots.txt
        try {
          const response = await this.axiosInstance.get<string>(robotsUrl, {
            headers: {
              'User-Agent': this.defaultOptions.userAgent || 'DocSI-Bot/1.0'
            },
            timeout: 5000
          });
          
          if (response.status === 200) {
            parser = robotsParser(robotsUrl, response.data);
            this.robotsCache.set(parsedUrl.hostname, parser);
          } else {
            // If robots.txt doesn't exist or can't be fetched, no crawl delay
            return null;
          }
        } catch (error: unknown) {
          // If error fetching robots.txt, no crawl delay
          return null;
        }
      }
      
      const crawlDelay = parser.getCrawlDelay(this.defaultOptions.userAgent || 'DocSI-Bot/1.0');
      return crawlDelay !== null ? crawlDelay * 1000 : null; // Convert to milliseconds
    } catch (error: unknown) {
      // If any error occurs during parsing, no crawl delay
      return null;
    }
  }
  
  /**
   * Get or create a rate limiter for a host
   * @param host Host to get rate limiter for
   * @param delay Delay between requests in milliseconds
   */
  private getRateLimiter(host: string, delay: number): RateLimiter {
    let limiter = this.rateLimiters.get(host);
    
    if (!limiter) {
      limiter = new RateLimiter(delay);
      this.rateLimiters.set(host, limiter);
    } else {
      // Update delay if it changed
      limiter.setDelay(delay);
    }
    
    return limiter;
  }
}

/**
 * Rate limiter for a host
 */
class RateLimiter {
  private lastRequestTime: number = 0;
  private delay: number;
  
  /**
   * Create a new rate limiter
   * @param delay Delay between requests in milliseconds
   */
  constructor(delay: number) {
    this.delay = delay;
  }
  
  /**
   * Set the delay for the rate limiter
   * @param delay Delay between requests in milliseconds
   */
  setDelay(delay: number): void {
    this.delay = delay;
  }
  
  /**
   * Wait for the next available slot
   */
  async waitForNextSlot(): Promise<void> {
    const now = Date.now();
    const nextSlot = this.lastRequestTime + this.delay;
    
    if (now < nextSlot) {
      const waitTime = nextSlot - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}