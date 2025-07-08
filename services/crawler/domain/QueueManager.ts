/**
 * QueueManager for managing the URL crawling queue
 * 
 * This class manages the prioritized queue of URLs to be crawled,
 * handling prioritization, deduplication, and concurrent processing
 * with improved depth handling.
 */

import { getLogger } from '../../../shared/infrastructure/logging.js';
import { PrioritizationStrategy } from './strategies/PrioritizationStrategy.js';
import { strategyFactory } from './strategies/StrategyFactory.js';
import { UrlProcessor } from './UrlProcessor.js';
import EventEmitter from 'events';

const logger = getLogger();

/**
 * Queue item representing a URL to be crawled
 */
export interface QueueItem {
  /** URL to crawl */
  url: string;
  
  /** Depth level of the URL in the crawl tree */
  depth: number;
  
  /** URL that linked to this URL */
  parentUrl: string;
  
  /** Priority score (lower is higher priority) */
  score: number;
  
  /** When the item was added to the queue */
  addedAt: Date;
  
  /** Whether this is a high-priority item */
  isPriority?: boolean;
}

/**
 * Configuration for the queue manager
 */
export type DepthHandlingMode = 'strict' | 'flexible' | 'adaptive';

export interface QueueManagerConfig {
  /** Maximum depth to crawl */
  maxDepth: number;
  
  /** Prioritization strategy to use */
  strategy?: PrioritizationStrategy;
  
  /** Strategy name if no strategy object is provided */
  strategyName?: string;
  
  /** Prioritization parameters */
  prioritizationParams?: {
    /** URL patterns to prioritize */
    patterns?: string[];
    
    /** Number of concurrent requests */
    concurrency?: number;
  };
  
  /** 
   * Depth handling mode:
   * - 'strict': Strictly enforce maxDepth limit
   * - 'flexible': Allow higher depths for high-priority URLs
   * - 'adaptive': Dynamically adjust depth limit based on domain characteristics
   */
  depthHandlingMode?: DepthHandlingMode;
  
  /** Per-domain rate limiting (in milliseconds between requests) */
  domainRateLimit?: number;
  
  /** Maximum number of URLs to process concurrently (overall) */
  concurrency?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Queue event types
 */
export type QueueEventType = 
  | 'queue-item-added'
  | 'queue-item-processed'
  | 'queue-empty'
  | 'queue-stats-updated'
  | 'queue-paused'
  | 'queue-resumed'
  | 'queue-depth-limit-reached'
  | 'queue-domain-rate-limited'
  | 'queue-priority-url-added'
  | 'queue-error';

/**
 * Queue event data
 */
export interface QueueEvent {
  /** Event timestamp */
  timestamp: Date;
  
  /** Event type */
  type: QueueEventType;
  
  /** Event data */
  data: any;
}

/**
 * Manager for the URL crawling queue
 */
export class QueueManager {
  /** URLs queued for processing */
  private queue: QueueItem[] = [];
  
  /** Set of visited URLs */
  private visited = new Set<string>();
  
  /** Set of URLs currently being processed */
  private inProgress = new Set<string>();
  
  /** Task queue for improved concurrency management */
  private taskQueue: (() => Promise<void>)[] = [];
  
  /** Prioritization strategy */
  private strategy: PrioritizationStrategy;

  /** Depth handling mode */
  private depthHandlingMode: DepthHandlingMode;
  
  /** Per-domain request tracking for rate limiting */
  private domainLastRequest: Map<string, number> = new Map();
  
  /** Per-domain rate limit in milliseconds */
  private domainRateLimit: number;
  
  /** Maximum depth to crawl */
  private maxDepth: number;
  
  /** URL processor for URL normalization */
  private urlProcessor: UrlProcessor;
  
  /** Maximum number of concurrent requests */
  private concurrency: number;
  
  /** Debug mode */
  private debug: boolean;
  
  /** Event emitter for queue events */
  private eventEmitter = new EventEmitter();
  
  /** Whether the queue is paused */
  private paused = false;
  
  /** Statistics about queue processing */
  private stats = {
    // URLs discovered by depth
    discoveredByDepth: new Map<number, number>(),
    
    // URLs visited by depth
    visitedByDepth: new Map<number, number>(), 
    
    // URLs skipped due to rate limiting
    rateLimited: 0,
    
    // URLs processed per domain
    processedPerDomain: new Map<string, number>(),
    
    // Maximum depth reached
    maxDepthReached: 0,
    
    // Total URLs discovered
    totalDiscovered: 0,
    
    // Total URLs visited
    totalVisited: 0,
    
    // URLs skipped due to max depth limit
    skippedByDepth: 0
  };
  
  /** Logger instance */
  private logger = getLogger();
  
  /**
   * Create a new queue manager
   * @param config Queue manager configuration
   */
  constructor(config: QueueManagerConfig) {
    this.maxDepth = config.maxDepth;
    this.concurrency = config.concurrency || 2; // Default to 2 for better performance
    this.depthHandlingMode = config.depthHandlingMode || 'strict';
    this.domainRateLimit = config.domainRateLimit || 0; // No domain rate limiting by default
    this.debug = config.debug || false;
    this.urlProcessor = new UrlProcessor();
    
    // Set up prioritization strategy
    if (config.strategy) {
      this.strategy = config.strategy;
    } else {
      const strategyName = config.strategyName || 'hybrid';
      this.strategy = strategyFactory.createStrategy(strategyName, {
        patterns: config.prioritizationParams?.patterns,
        concurrency: config.prioritizationParams?.concurrency
      });
    }
    
    this.logger.info(
      `QueueManager initialized: strategy=${this.strategy.name}, maxDepth=${this.maxDepth}, ` +
      `depthMode=${this.depthHandlingMode}, concurrency=${this.concurrency}, ` +
      `domainRateLimit=${this.domainRateLimit}ms`,
      'QueueManager'
    );
  }
  
  /**
   * Pause the queue processing
   */
  pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.logger.info('Queue processing paused', 'QueueManager');
      this.emitQueueEvent('queue-paused', { timestamp: new Date() });
    }
  }
  
  /**
   * Resume the queue processing
   */
  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.logger.info('Queue processing resumed', 'QueueManager');
      this.emitQueueEvent('queue-resumed', { timestamp: new Date() });
      
      // Process any waiting tasks
      this.processQueue();
    }
  }
  
  /**
   * Check if the queue is paused
   */
  isPaused(): boolean {
    return this.paused;
  }
  
  /**
   * Acquire a slot for processing
   * @returns Promise that resolves to true if a slot was acquired, false otherwise
   */
  async acquireSlot(): Promise<boolean> {
    if (this.inProgress.size < this.concurrency) {
      return true;
    }
    return false;
  }
  
  /**
   * Release a processing slot and process the next item in the queue if available
   */
  releaseSlot(): void {
    if (this.paused) {
      return; // Don't process queue if paused
    }
    
    this.processQueue();
  }
  
  /**
   * Enqueue a task for processing when a slot becomes available
   * @param task Task to enqueue
   * @returns Promise that resolves when the task is processed
   */
  async enqueueTask(task: () => Promise<void>): Promise<void> {
    // Check if we can process immediately
    if (this.inProgress.size < this.concurrency) {
      return task();
    }
    
    // Otherwise, add to the queue
    return new Promise<void>((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          await task();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      this.taskQueue.push(wrappedTask);
    });
  }
  
  /**
   * Process next task in the queue if a slot is available
   */
  private processQueue(): void {
    // Skip if paused
    if (this.paused) {
      return;
    }
    
    if (this.taskQueue.length > 0 && this.inProgress.size < this.concurrency) {
      const task = this.taskQueue.shift();
      if (task) {
        task().finally(() => this.releaseSlot());
      }
    }
  }
  
  /**
   * Add a URL to the queue
   * @param url URL to add
   * @param depth Depth level of the URL
   * @param parentUrl URL that linked to this URL
   * @param isPriority Whether this is a high priority URL
   * @returns Whether the URL was added (false if depth exceeds maxDepth or URL already visited/queued)
   */
  addUrl(url: string, depth: number, parentUrl: string, isPriority = false): boolean {
    // Debug logging 
    this.logger.debug(`Considering URL: ${url} (depth: ${depth})`, 'QueueManager');
    
    // Normalize URL
    const normalizedUrl = this.urlProcessor.normalizeUrl(url, parentUrl);
    if (!normalizedUrl) {
      this.logger.debug(`Skipping invalid URL: ${url}`, 'QueueManager');
      return false;
    }
    
    // Extract domain from URL for rate limiting
    let domain = '';
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (error) {
      this.logger.warn(`Failed to extract domain from URL: ${url}`, 'QueueManager');
    }
    
    // Apply depth policy based on mode
    if (depth > this.maxDepth) {
      if (this.depthHandlingMode === 'strict' || (this.depthHandlingMode === 'flexible' && !isPriority)) {
        this.logger.debug(`Skipping URL exceeding max depth: ${url} (depth: ${depth}, max: ${this.maxDepth})`, 'QueueManager');
        this.stats.skippedByDepth++;
        return false;
      }
    }
    
    url = normalizedUrl;
    
    // Check if URL is already visited or in progress
    if (this.visited.has(url) || this.inProgress.has(url)) {
      this.logger.debug(`Skipping already visited/in-progress URL: ${url}`, 'QueueManager');
      return false;
    }
    
    // Check if URL is already in queue
    if (this.queue.some(item => item.url === url)) {
      this.logger.debug(`Skipping already queued URL: ${url}`, 'QueueManager');
      return false;
    }
    
    // In adaptive mode, we make depth decisions based on domain characteristics
    if (this.depthHandlingMode === 'adaptive' && depth > this.maxDepth) {
      const domainProcessed = this.stats.processedPerDomain.get(domain) || 0;
      
      // If we've already processed a good number of URLs from this domain,
      // and we're exceeding depth, we might want to limit further crawling
      if (domainProcessed > 10 && !isPriority) {
        this.logger.debug(
          `Adaptive depth control: skipping deep URL from well-crawled domain: ${url} ` +
          `(depth: ${depth}, domain URLs: ${domainProcessed})`,
          'QueueManager'
        );
        
        this.emitQueueEvent('queue-depth-limit-reached', {
          url,
          depth,
          domain,
          maxDepth: this.maxDepth,
          domainProcessed
        });
        
        this.stats.skippedByDepth++;
        return false;
      }
    }
    
    // Score URL (priority URLs get lowest possible score to force them to the front)
    const score = isPriority ? Number.MIN_SAFE_INTEGER : 
      this.strategy.scoreUrl(url, depth, parentUrl);
    
    // Add to queue
    const now = new Date();
    const queueItem: QueueItem = {
      url,
      depth,
      parentUrl,
      score,
      addedAt: now,
      isPriority: isPriority
    };
    
    this.queue.push(queueItem);
    
    // Update statistics
    this.stats.totalDiscovered++;
    const depthCount = this.stats.discoveredByDepth.get(depth) || 0;
    this.stats.discoveredByDepth.set(depth, depthCount + 1);
    
    // Update max depth reached
    if (depth > this.stats.maxDepthReached) {
      this.stats.maxDepthReached = depth;
      this.logger.info(`New max depth reached: ${depth}`, 'QueueManager');
    }
    
    // Track domain stats
    if (domain) {
      const domainCount = this.stats.processedPerDomain.get(domain) || 0;
      this.stats.processedPerDomain.set(domain, domainCount);
    }
    
    // Sort queue after adding a new item
    this.sortQueue();
    
    // Emit event
    const eventType = isPriority ? 'queue-priority-url-added' : 'queue-item-added';
    this.emitQueueEvent(eventType, {
      url,
      domain,
      depth,
      queueSize: this.queue.length,
      maxDepthReached: this.stats.maxDepthReached
    });
    
    this.logger.info(`Added URL to queue: ${url} (depth: ${depth}, score: ${score})`, 'QueueManager');
    
    // Update stats
    this.emitQueueEvent('queue-stats-updated', this.getStats());
    
    return true;
  }
  
  /**
   * Add multiple URLs to the queue
   * @param urls URLs to add
   * @param depth Depth level of the URLs
   * @param parentUrl URL that linked to these URLs
   * @param priorityUrls Optional list of URLs to be treated as high priority
   * @returns Number of URLs added
   */
  addUrls(urls: string[], depth: number, parentUrl: string, priorityUrls: string[] = []): number {
    let added = 0;
    
    // First, add priority URLs if any
    for (const url of priorityUrls) {
      if (this.addUrl(url, depth, parentUrl, true)) {
        added++;
      }
    }
    
    // Then add regular URLs
    for (const url of urls) {
      if (!priorityUrls.includes(url) && this.addUrl(url, depth, parentUrl)) {
        added++;
      }
    }
    if (added > 0) {
      this.logger.debug(`Added ${added}/${urls.length} URLs at depth ${depth}`, 'QueueManager');
    }
    
    return added;
  }
  
  /**
   * Get the next batch of URLs to process
   * @param batchSize Maximum number of URLs to return (defaults to concurrency setting)
   * @returns Array of queue items to process
   */
  getNextBatch(batchSize?: number): QueueItem[] {
    // Skip if paused
    if (this.paused) {
      return [];
    }
    
    const size = batchSize || this.concurrency;
    const batch: QueueItem[] = [];
    
    if (this.queue.length === 0) {
      this.logger.debug('Queue is empty, no items to return', 'QueueManager');
      
      // Emit queue empty event if there are no in-progress items
      if (this.inProgress.size === 0) {
        this.emitQueueEvent('queue-empty', { 
          stats: this.getStats() 
        });
      }
      
      return [];
    }
    
    // Get items with highest priority (lowest score)
    // The queue is already sorted, so we just need to take from the beginning
    // Limit to max concurrency and respect size
    const availableSlots = Math.min(
      size,
      this.concurrency - this.inProgress.size
    );
    
    if (availableSlots <= 0) {
      this.logger.debug('No available slots for processing', 'QueueManager');
      return [];
    }
    
    for (let i = 0; i < this.queue.length && batch.length < availableSlots; i++) {
      try {
        const item = this.queue[i];
        
        // Check if URL is allowed by domain rate limiting
        let domain = '';
        try {
          const urlObj = new URL(item.url);
          domain = urlObj.hostname;
          
          // Only apply rate limiting if configured
          if (this.domainRateLimit > 0) {
            const lastRequest = this.domainLastRequest.get(domain) || 0;
            const now = Date.now();
            
            if (lastRequest > 0 && now - lastRequest < this.domainRateLimit) {
              // Not enough time has passed since last request to this domain
              // Skip this item but keep it in the queue
              
              // If this is the only domain in the queue, we might want to
              // delay processing to respect rate limiting
              if (i === this.queue.length - 1 || batch.length === 0) {
                const waitTime = this.domainRateLimit - (now - lastRequest);
                this.logger.debug(
                  `Rate limiting domain ${domain}, waiting ${waitTime}ms`,
                  'QueueManager'
                );
                
                this.emitQueueEvent('queue-domain-rate-limited', {
                  domain,
                  waitTime,
                  url: item.url
                });
                
                // Delay next processing to respect rate limit
                setTimeout(() => this.processQueue(), waitTime);
                
                // Update stats
                this.stats.rateLimited++;
              }
              
              continue; // Skip this item
            }
            
            // Update last request time for this domain
            this.domainLastRequest.set(domain, now);
          }
        } catch (error) {
          this.logger.warn(`Failed to extract domain from URL: ${item.url}`, 'QueueManager');
        }
        
        // Check if URL is already in progress
        if (!this.inProgress.has(item.url)) {
          // Add item to batch
          batch.push(item);
          this.inProgress.add(item.url);
          
          // Track domain stats
          if (domain) {
            const domainCount = this.stats.processedPerDomain.get(domain) || 0;
            this.stats.processedPerDomain.set(domain, domainCount + 1);
          }
          
          // Remove from queue
          this.queue.splice(i, 1);
          i--; // Adjust index after removal
        }
      } catch (error) {
        this.logger.error(`Error processing queue item: ${error}`, 'QueueManager');
        
        // Remove from queue
        this.queue.splice(i, 1);
        i--; // Adjust index after removal
      }
    }
    
    if (batch.length > 0) {
      this.logger.info(`Retrieved ${batch.length} items from queue (${this.queue.length} remaining)`, 'QueueManager');
      
      // Log depth distribution of batch
      const depthDistribution: Map<number, number> = new Map();
      for (const item of batch) {
        const count = depthDistribution.get(item.depth) || 0;
        depthDistribution.set(item.depth, count + 1);
      }
      
      // Convert to string for logging
      const depthStr = Array.from(depthDistribution.entries())
        .map(([depth, count]) => `depth ${depth}: ${count}`)
        .join(', ');
      
      this.logger.debug(`Batch depth distribution: ${depthStr}`, 'QueueManager');
    } else {
      this.logger.debug('No items retrieved from queue (all slots in use)', 'QueueManager');
    }
    
    return batch;
  }
  
  /**
   * Mark a URL as processed (visited)
   * @param url URL that has been processed
   * @param depth Depth of the URL
   */
  markVisited(url: string, depth: number): void {
    // Normalize URL
    const normalizedUrl = this.urlProcessor.normalizeUrl(url, '');
    if (!normalizedUrl) {
      this.logger.warn(`Cannot mark invalid URL as visited: ${url}`, 'QueueManager');
      return;
    }
    
    url = normalizedUrl;
    
    // Add to visited set
    this.visited.add(url);
    
    // Remove from in-progress set
    this.inProgress.delete(url);
    
    // Process next task if available
    this.releaseSlot();
    
    // Update statistics
    this.stats.totalVisited++;
    const depthCount = this.stats.visitedByDepth.get(depth) || 0;
    this.stats.visitedByDepth.set(depth, depthCount + 1);
    
    // Emit event
    this.emitQueueEvent('queue-item-processed', {
      url,
      depth,
      success: true,
      queueSize: this.queue.length,
      inProgressSize: this.inProgress.size,
      visitedSize: this.visited.size
    });
    
    this.logger.debug(`Marked URL as visited: ${url} (depth: ${depth})`, 'QueueManager');
    
    // Update stats
    this.emitQueueEvent('queue-stats-updated', this.getStats());
  }
  
  /**
   * Mark a URL as failed (not visited, but no longer in progress)
   * @param url URL that has failed processing
   * @param depth Depth of the URL
   */
  markFailed(url: string, depth: number): void {
    // Normalize URL
    const normalizedUrl = this.urlProcessor.normalizeUrl(url, '');
    if (!normalizedUrl) {
      this.logger.warn(`Cannot mark invalid URL as failed: ${url}`, 'QueueManager');
      return;
    }
    
    url = normalizedUrl;
    
    // Remove from in-progress set
    this.inProgress.delete(url);
    
    // Process next task if available
    this.releaseSlot();
    
    // Emit event
    this.emitQueueEvent('queue-item-processed', {
      url,
      depth,
      success: false,
      queueSize: this.queue.length,
      inProgressSize: this.inProgress.size,
      visitedSize: this.visited.size
    });
    
    this.logger.debug(`Marked URL as failed: ${url} (depth: ${depth})`, 'QueueManager');
    
    // Update stats
    this.emitQueueEvent('queue-stats-updated', this.getStats());
  }
  
  /**
   * Check if there are more URLs to process
   * @returns Whether there are more URLs to process (either queued or in progress)
   */
  hasMoreUrls(): boolean {
    return this.queue.length > 0 || this.inProgress.size > 0;
  }
  
  /**
   * Get statistics about the queue
   * @returns Queue statistics
   */
  getStats(): {
    queued: number;
    visited: number;
    inProgress: number;
    rateLimited: number;
    remainingTotal: number;
    maxDepthReached: number;
    domainsProcessed: number;
    isPaused: boolean;
    discoveredByDepth: Map<number, number>;
    visitedByDepth: Map<number, number>;
    queueDistribution: Map<number, number>;
  } {
    // Calculate queue distribution by depth
    const queueDistribution = new Map<number, number>();
    for (const item of this.queue) {
      const count = queueDistribution.get(item.depth) || 0;
      queueDistribution.set(item.depth, count + 1);
    }
    
    return {
      queued: this.queue.length,
      visited: this.visited.size,
      inProgress: this.inProgress.size,
      rateLimited: this.stats.rateLimited,
      remainingTotal: this.queue.length + this.inProgress.size,
      maxDepthReached: this.stats.maxDepthReached,
      domainsProcessed: this.stats.processedPerDomain.size,
      isPaused: this.paused,
      discoveredByDepth: new Map(this.stats.discoveredByDepth),
      visitedByDepth: new Map(this.stats.visitedByDepth),
      queueDistribution
    };
  }
  
  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
    this.inProgress.clear();
    this.taskQueue = [];
    // Note: We don't clear visited URLs to maintain the history
    
    this.logger.info('Queue cleared', 'QueueManager');
  }
  
  /**
   * Reset the queue (including visited URLs)
   */
  reset(): void {
    this.queue = [];
    this.inProgress.clear();
    this.visited.clear();
    this.taskQueue = [];
    
    // Reset statistics
    this.stats = {
      discoveredByDepth: new Map<number, number>(),
      visitedByDepth: new Map<number, number>(),
      totalDiscovered: 0,
      totalVisited: 0,
      rateLimited: 0,
      maxDepthReached: 0,
      processedPerDomain: new Map<string, number>(),
      skippedByDepth: 0
    };
    
    this.logger.info('Queue completely reset', 'QueueManager');
  }
  
  /**
   * Get the event emitter for queue events
   * @returns Event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Sort the queue based on priority scores
   */
  private sortQueue(): void {
    // Sort the queue with priority items first, then by score
    this.queue.sort((a: QueueItem, b: QueueItem) => {
      // Priority items always come first
      if (a.isPriority && !b.isPriority) {
        return -1; // a comes before b
      } else if (!a.isPriority && b.isPriority) {
        return 1;  // b comes before a
      }
      
      // If both have same priority flag, sort by score (lower score = higher priority)
      return a.score - b.score;
    });
    
    // Debug logging of queue distribution after sorting
    if (this.debug) {
      const queueDistribution = new Map<number, number>();
      for (const item of this.queue) {
        const count = queueDistribution.get(item.depth) || 0;
        queueDistribution.set(item.depth, count + 1);
      }
      
      const distributionStr = Array.from(queueDistribution.entries())
        .map(([depth, count]) => `depth ${depth}: ${count}`)
        .join(', ');
      
      this.logger.debug(`Queue sorted, distribution: ${distributionStr}`, 'QueueManager');
      
      // Log top 5 items in queue
      if (this.queue.length > 0) {
        const topItems = this.queue.slice(0, Math.min(5, this.queue.length))
          .map(item => `${item.url} (depth: ${item.depth}, score: ${item.score})`)
          .join('\n- ');
        
        this.logger.debug(`Top queued items:\n- ${topItems}`, 'QueueManager');
      }
    }
  }
  
  /**
   * Emit a queue event
   * @param type Event type
   * @param data Event data
   */
  private emitQueueEvent(type: QueueEventType, data: any): void {
    const event: QueueEvent = {
      timestamp: new Date(),
      type,
      data
    };
    
    this.eventEmitter.emit(type, event);
  }
}