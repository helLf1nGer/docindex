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
}

/**
 * Configuration for the queue manager
 */
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
  
  /** Maximum number of URLs to process concurrently */
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
  | 'queue-stats-updated';

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
  
  /** Prioritization strategy */
  private strategy: PrioritizationStrategy;
  
  /** Maximum depth to crawl */
  private maxDepth: number;
  
  /** Maximum number of concurrent requests */
  private concurrency: number;
  
  /** Debug mode */
  private debug: boolean;
  
  /** Event emitter for queue events */
  private eventEmitter = new EventEmitter();
  
  /** Statistics about queue processing */
  private stats = {
    // URLs discovered by depth
    discoveredByDepth: new Map<number, number>(),
    
    // URLs visited by depth
    visitedByDepth: new Map<number, number>(),
    
    // Total URLs discovered
    totalDiscovered: 0,
    
    // Total URLs visited
    totalVisited: 0,
    
    // Maximum depth reached
    maxDepthReached: 0
  };
  
  /** Logger instance */
  private logger = getLogger();
  
  /**
   * Create a new queue manager
   * @param config Queue manager configuration
   */
  constructor(config: QueueManagerConfig) {
    this.maxDepth = config.maxDepth;
    this.concurrency = config.concurrency || 1;
    this.debug = config.debug || false;
    
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
      `QueueManager initialized: strategy=${this.strategy.name}, maxDepth=${this.maxDepth}, concurrency=${this.concurrency}`,
      'QueueManager'
    );
  }
  
  /**
   * Add a URL to the queue
   * @param url URL to add
   * @param depth Depth level of the URL
   * @param parentUrl URL that linked to this URL
   * @returns Whether the URL was added (false if depth exceeds maxDepth or URL already visited/queued)
   */
  addUrl(url: string, depth: number, parentUrl: string): boolean {
    // Debug logging
    if (this.debug) {
      this.logger.debug(`Considering URL: ${url} (depth: ${depth})`, 'QueueManager');
    }
    
    // Normalize URL
    url = this.normalizeUrl(url);
    
    // Check if URL is already visited or in progress
    if (this.visited.has(url) || this.inProgress.has(url)) {
      this.logDebug(`Skipping already visited/in-progress URL: ${url}`);
      return false;
    }
    
    // Check if URL is already in queue
    if (this.queue.some(item => item.url === url)) {
      this.logDebug(`Skipping already queued URL: ${url}`);
      return false;
    }
    
    // Check if depth exceeds maxDepth - this is a critical check!
    if (depth > this.maxDepth) {
      this.logDebug(`Skipping URL exceeding max depth: ${url} (depth: ${depth}, max: ${this.maxDepth})`);
      return false;
    }
    
    // Score URL
    const score = this.strategy.scoreUrl(url, depth, parentUrl);
    
    // Add to queue
    const now = new Date();
    const queueItem: QueueItem = {
      url,
      depth,
      parentUrl,
      score,
      addedAt: now
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
    
    // Sort queue after adding a new item
    this.sortQueue();
    
    // Emit event
    this.emitQueueEvent('queue-item-added', {
      url,
      depth,
      queueSize: this.queue.length,
      maxDepthReached: this.stats.maxDepthReached
    });
    
    this.logDebug(`Added URL to queue: ${url} (depth: ${depth}, score: ${score})`);
    
    // Update stats
    this.emitQueueEvent('queue-stats-updated', this.getStats());
    
    return true;
  }
  
  /**
   * Add multiple URLs to the queue
   * @param urls URLs to add
   * @param depth Depth level of the URLs
   * @param parentUrl URL that linked to these URLs
   * @returns Number of URLs added
   */
  addUrls(urls: string[], depth: number, parentUrl: string): number {
    let added = 0;
    
    for (const url of urls) {
      if (this.addUrl(url, depth, parentUrl)) {
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
    const size = batchSize || this.concurrency;
    const batch: QueueItem[] = [];
    
    if (this.queue.length === 0) {
      this.logDebug('Queue is empty, no items to return');
      
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
    for (let i = 0; i < this.queue.length && batch.length < size; i++) {
      const item = this.queue[i];
      if (!this.inProgress.has(item.url)) {
        batch.push(item);
        this.inProgress.add(item.url);
        
        // Remove from queue
        this.queue.splice(i, 1);
        i--; // Adjust index after removal
      }
    }
    
    if (batch.length > 0) {
      this.logDebug(`Retrieved ${batch.length} items from queue (${this.queue.length} remaining)`);
      
      // Log depth distribution of batch
      const depthDistribution = new Map<number, number>();
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
      this.logDebug('No items retrieved from queue (all in progress)');
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
    url = this.normalizeUrl(url);
    
    // Add to visited set
    this.visited.add(url);
    
    // Remove from in-progress set
    this.inProgress.delete(url);
    
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
    
    this.logDebug(`Marked URL as visited: ${url} (depth: ${depth})`);
    
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
    url = this.normalizeUrl(url);
    
    // Remove from in-progress set
    this.inProgress.delete(url);
    
    // Emit event
    this.emitQueueEvent('queue-item-processed', {
      url,
      depth,
      success: false,
      queueSize: this.queue.length,
      inProgressSize: this.inProgress.size,
      visitedSize: this.visited.size
    });
    
    this.logDebug(`Marked URL as failed: ${url} (depth: ${depth})`);
    
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
    remainingTotal: number;
    maxDepthReached: number;
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
      remainingTotal: this.queue.length + this.inProgress.size,
      maxDepthReached: this.stats.maxDepthReached,
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
    
    // Reset statistics
    this.stats = {
      discoveredByDepth: new Map<number, number>(),
      visitedByDepth: new Map<number, number>(),
      totalDiscovered: 0,
      totalVisited: 0,
      maxDepthReached: 0
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
   * Normalize a URL for consistent comparison
   * @param url URL to normalize
   * @returns Normalized URL
   */
  private normalizeUrl(url: string): string {
    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    
    // Remove hash fragments (not relevant for crawling)
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      url = url.slice(0, hashIndex);
    }
    
    return url;
  }
  
  /**
   * Sort the queue based on priority scores
   */
  private sortQueue(): void {
    // Use the strategy to sort the queue
    this.strategy.sortQueue(this.queue);
    
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
  
  /**
   * Log debug message if debug mode is enabled
   * @param message Message to log
   */
  private logDebug(message: string): void {
    if (this.debug) {
      this.logger.debug(message, 'QueueManager');
    }
  }
}