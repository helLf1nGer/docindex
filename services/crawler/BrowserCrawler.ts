import { Logger } from '../../shared/infrastructure/logging.js';
import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { EventEmitter } from 'events';
import { URL } from 'url';
import { Document } from '../../shared/domain/models/Document.js';
import { IDocumentRepository } from '../../shared/domain/repositories/DocumentRepository.js';
import { SimpleUrlProcessor } from './SimpleUrlProcessor.js';
import type { CrawlerEngineConfig } from './domain/CrawlerEngine.js';
import {
  CrawlError,
  CrawlTimeoutError,
  CrawlNetworkError,
  ValidationError,
  FileSystemError,
  isDocsiError
} from '../../shared/domain/errors.js';

export interface BrowserCrawlerOptions extends CrawlerEngineConfig {
  navigationTimeout?: number;
  pageLoadTimeout?: number;
  actionTimeout?: number;
  readySelector?: string | string[];
  overallPageTimeout?: number;
  maxRetries?: number;
  blockedResourceTypes?: string[] | null;
  playwrightLaunchOptions?: object;
  browserContextOptions?: object;
  concurrency?: number;
  baseUrl: string;
}

interface QueueItem {
  url: string;
  depth: number;
}

export class BrowserCrawler extends EventEmitter {
  private browser: Browser; // Changed: Browser instance is now required in constructor
  private options: Required<Omit<BrowserCrawlerOptions, 'playwrightLaunchOptions' | 'browserContextOptions' | 'readySelector'>> & Pick<BrowserCrawlerOptions, 'playwrightLaunchOptions' | 'browserContextOptions' | 'readySelector'>;
  private logger: Logger;
  private documentRepository: IDocumentRepository;
  private urlProcessor: SimpleUrlProcessor;

  private queue: QueueItem[] = [];
  private visited: Set<string> = new Set();
  private processedCount: number = 0;
  private isRunning: boolean = false;
  private currentContext: BrowserContext | null = null;
  private crawlJobId: string | null = null;
  // Removed _resolveCrawl and _rejectCrawl

  private static defaultOptions: Required<Omit<BrowserCrawlerOptions, 'playwrightLaunchOptions' | 'browserContextOptions' | 'readySelector' | 'baseUrl' | 'maxDepth' | 'maxPages'>> & Pick<BrowserCrawlerOptions, 'readySelector'> = {
      navigationTimeout: 30000,
      pageLoadTimeout: 60000,
      actionTimeout: 15000,
      overallPageTimeout: 90000,
      maxRetries: 2,
      blockedResourceTypes: ['image', 'stylesheet', 'font', 'media'],
      readySelector: 'body',
      concurrency: 1,
      force: false,
      crawlDelay: 0,
      strategy: 'hybrid',
      prioritizationPatterns: [],
      debug: false,
      useSitemaps: true
    };


  constructor(
    browser: Browser, // Pass the shared browser instance
    options: BrowserCrawlerOptions,
    logger: Logger,
    documentRepository: IDocumentRepository
  ) {
    super();
    this.browser = browser;
    this.logger = logger;
    this.documentRepository = documentRepository;

    this.options = {
      ...BrowserCrawler.defaultOptions,
      ...options,
      baseUrl: options.baseUrl,
      maxDepth: options.maxDepth ?? Infinity,
      maxPages: options.maxPages ?? Infinity,
    };

    this.urlProcessor = new SimpleUrlProcessor({ baseUrl: this.options.baseUrl });

    this.logger.info(`[BrowserCrawler] Initialized. BaseURL: ${this.options.baseUrl}, MaxDepth: ${this.options.maxDepth}, MaxPages: ${this.options.maxPages}`, 'BrowserCrawler');
    this.logger.debug(`[BrowserCrawler] Full options: ${JSON.stringify(this.options)}`, 'BrowserCrawler');
  }

  // Refactored start to be directly async
  async start(startUrl: string, jobId?: string): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[BrowserCrawler] Crawler already running.', 'BrowserCrawler');
      throw new CrawlError('Crawler already running.', 'CRAWLER_BUSY');
    }

    this.logger.debug('[Start] Entered start method', 'BrowserCrawler');

    this.isRunning = true;
    this.crawlJobId = jobId || `browser-${Date.now()}`;
    this.logger.info(`[BrowserCrawler] Starting crawl job ${this.crawlJobId} for: ${startUrl}`, 'BrowserCrawler');
    this.emit('start', { jobId: this.crawlJobId, startUrl });

    // Reset state
    this.queue = [];
    this.visited = new Set();
    this.processedCount = 0;

    try {
        this.logger.debug('[StartTry] Entering try block', 'BrowserCrawler');
        // Create context
        this.logger.debug('[StartTry] Attempting this.browser.newContext...', 'BrowserCrawler');
        try {
            this.currentContext = await this.browser.newContext(this.options.browserContextOptions);
            this.logger.info(`[BrowserCrawler] Browser context created for job ${this.crawlJobId}.`, 'BrowserCrawler');
        } catch (contextError: any) {
            this.logger.error('[StartTry] Error during this.browser.newContext:', 'BrowserCrawler', contextError);
            throw contextError; // Re-throw to be caught by outer catch
        }
        this.logger.debug('[StartTry] Context created', 'BrowserCrawler');

        // Setup request interception
        await this.setupResourceBlocking(this.currentContext);
        this.logger.debug('[StartTry] Resource blocking setup complete', 'BrowserCrawler');

        // Add starting URL to queue
        this.addToQueue({ url: startUrl, depth: 0 });
        this.logger.debug('[StartTry] Added to queue', 'BrowserCrawler');

        // Await processQueue directly
        this.logger.debug('[StartTry] Awaiting processQueue...', 'BrowserCrawler');
        await this.processQueue(); // processQueue now handles cleanup/completion status internally
        this.logger.debug('[StartTry] Awaited processQueue successfully', 'BrowserCrawler');

        // If processQueue finished without throwing, the crawl is considered complete (potentially with handled errors)
        // cleanupAndComplete should have been called internally by processQueue

    } catch (error: any) {
        this.logger.error('[StartCatch] Caught error in start method catch block', 'BrowserCrawler', { rawError: error }); // Log raw error
        // Handle potential undefined error before accessing properties
        const safeError = error || new Error('Unknown error occurred in start method');
        const errorMessage = safeError instanceof Error ? safeError.message : String(safeError);
        const crawlError = new CrawlError(`Error during crawl start or processing: ${errorMessage}`, 'CRAWL_START_ERROR', { originalError: error });
        this.logger.error(`[BrowserCrawler] ${crawlError.message}`, 'BrowserCrawler', error instanceof Error ? error.stack : undefined);
        this.emit('error', { jobId: this.crawlJobId, url: startUrl, message: crawlError.message, error: crawlError });

        // Ensure cleanup happens on error, then re-throw
        await this.cleanupAndComplete(false, crawlError); // Call cleanup, indicating failure
        throw crawlError; // Re-throw the wrapped error

    } finally {
        // Ensure isRunning is reset if start finishes, although cleanupAndComplete should handle this
        // this.isRunning = false; // Might be redundant if cleanupAndComplete always runs
        this.logger.debug('[StartFinally] Exiting start method', 'BrowserCrawler');
    }
  }


  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.info(`[BrowserCrawler] Stop called but crawler is not running for job ${this.crawlJobId}.`, 'BrowserCrawler');
      return;
    }
    this.logger.info(`[BrowserCrawler] Stop requested for job ${this.crawlJobId}.`, 'BrowserCrawler');
    this.isRunning = false; // Signal to stop processing the queue
    await this.cleanupContext(); // Ensure context is closed promptly on stop request
  }

  private async cleanupContext(): Promise<void> {
      if (this.currentContext) {
          this.logger.info(`[BrowserCrawler] Closing browser context for job ${this.crawlJobId}.`, 'BrowserCrawler');
          try {
              await this.currentContext.close();
          } catch (error: any) {
              if (!error.message.includes('closed')) {
                  this.logger.warn(`[BrowserCrawler] Error closing browser context: ${error.message}`, 'BrowserCrawler');
              }
          } finally {
              this.currentContext = null;
          }
      }
  }

  // Refactored cleanupAndComplete to only cleanup and emit events
  private async cleanupAndComplete(success: boolean, error?: any): Promise<void> {
      const wasRunning = this.isRunning;
      this.isRunning = false;

      await this.cleanupContext();

      const statusMessage = success ? 'successfully' : `with errors${error ? ': ' + (error.message || String(error)) : ''}`;
      this.logger.info(`[BrowserCrawler] Crawl job ${this.crawlJobId} finishing ${statusMessage}. Total processed: ${this.processedCount}.`, 'BrowserCrawler');

      if (wasRunning) {
          if (!success && error && !(error instanceof CrawlError)) {
              const originalErrorMessage = error instanceof Error ? error.message : String(error);
              this.logger.warn(`[BrowserCrawler] Wrapping non-CrawlError in cleanupAndComplete:`, 'BrowserCrawler', error);
              error = new CrawlError(`Crawl failed: ${originalErrorMessage}`, 'CRAWL_ERROR', { originalError: error, jobId: this.crawlJobId });
          }

          if (success) {
              this.emit('complete', { jobId: this.crawlJobId, totalProcessed: this.processedCount, success: true });
          } else {
              const finalErrorMessage = error instanceof Error ? error.message : (error ? String(error) : 'Unknown error');
              this.emit('error', { jobId: this.crawlJobId, message: `Crawl failed: ${finalErrorMessage}`, error, success: false });
              this.logger.error(`[Cleanup] Final error state:`, 'BrowserCrawler', { error });
          }
      } else {
           this.logger.info(`[BrowserCrawler] cleanupAndComplete called but crawler was not running (jobId: ${this.crawlJobId}). Skipping final event emission.`, 'BrowserCrawler');
      }

      this.crawlJobId = null;
      // Removed promise handlers
  }


  private addToQueue(item: QueueItem): void {
    const normalizedUrl = this.urlProcessor.normalizeUrl(item.url);
    if (!normalizedUrl || this.visited.has(normalizedUrl) || item.depth > this.options.maxDepth) {
      return;
    }
    this.queue.push({ url: normalizedUrl, depth: item.depth });
    this.visited.add(normalizedUrl);
    this.logger.debug(`[BrowserCrawler] Added to queue: ${normalizedUrl} (Depth: ${item.depth})`, 'BrowserCrawler');
  }

  private async processQueue(): Promise<void> {
    this.logger.debug('[ProcessQueue] Starting queue processing loop.', 'BrowserCrawler'); // Log added previously
    let crawlSuccessful = true;
    let finalError: Error | undefined;

    try {
        while (this.isRunning && this.queue.length > 0 && this.processedCount < this.options.maxPages) {
          const item = this.queue.shift();
          if (!item) continue;

          this.emit('processing', { jobId: this.crawlJobId, url: item.url, depth: item.depth });

          try {
            if (!this.currentContext) {
                throw new CrawlError("Browser context is not available.", 'BROWSER_CONTEXT_UNAVAILABLE');
            }
            const result = await this.processSingleUrl(item.url, item.depth, this.currentContext);
            if (result) {
              this.processedCount++;
              this.logger.info(`[BrowserCrawler] Successfully processed (${this.processedCount}/${this.options.maxPages}): ${item.url}`, 'BrowserCrawler');
              result.links.forEach(link => this.addToQueue({ url: link, depth: item.depth + 1 }));
            } else {
              crawlSuccessful = false;
              // Ensure finalError is set if it wasn't already by a direct catch block below
              if (!finalError) {
                  // Use a more specific error if possible, maybe retrieve last error from processSingleUrl? For now, generic.
                  finalError = new CrawlError(`Processing failed for ${item.url} (processSingleUrl returned null)`, 'URL_PROCESSING_ERROR');
              }
              this.logger.warn(`[BrowserCrawler] Failed to process (returned null): ${item.url}`, 'BrowserCrawler');
            }
          } catch (error: any) {
            // Catch errors *thrown* by processSingleUrl (should be rare if it handles internally)
             const errorMessage = error instanceof Error ? error.message : String(error);
             const crawlError = new CrawlError(`Error processing ${item.url}: ${errorMessage}`, 'URL_PROCESSING_ERROR', { originalError: error });
             this.logger.error(`[BrowserCrawler] ${crawlError.message}`, 'BrowserCrawler', error instanceof Error ? error.stack : undefined);
             // Emit error here as processSingleUrl might not have
             this.emit('error', { jobId: this.crawlJobId, url: item.url, message: crawlError.message, error: crawlError });
             crawlSuccessful = false;
             finalError = crawlError; // Set finalError
          }
        } // End while loop
    } catch (loopError: any) {
        this.logger.error(`[BrowserCrawler] Unexpected error during queue processing loop:`, 'BrowserCrawler', loopError);
        crawlSuccessful = false;
        finalError = loopError instanceof CrawlError ? loopError : new CrawlError(`Unexpected loop error: ${loopError?.message || loopError}`, 'QUEUE_PROCESSING_ERROR', { originalError: loopError });
    } finally { // Ensure cleanup runs regardless of loop outcome
        // Determine final state and cleanup
        if (!this.isRunning && crawlSuccessful) { // Check if stopped externally *before* loop finished naturally
             this.logger.info(`[BrowserCrawler] Crawl stopped externally during processing for job ${this.crawlJobId}.`, 'BrowserCrawler');
             await this.cleanupAndComplete(false); // Stopped externally
        } else if (this.queue.length === 0 && crawlSuccessful) {
            this.logger.info(`[BrowserCrawler] Queue empty, crawl completed successfully for job ${this.crawlJobId}.`, 'BrowserCrawler');
            await this.cleanupAndComplete(true); // Success
        } else if (this.processedCount >= this.options.maxPages && crawlSuccessful) {
            this.logger.info(`[BrowserCrawler] Max pages limit (${this.options.maxPages}) reached, crawl completed successfully for job ${this.crawlJobId}.`, 'BrowserCrawler');
            await this.cleanupAndComplete(true); // Success (reached limit)
        } else {
            // Loop finished due to errors, stop signal, or unexpected loop exit
            this.logger.warn(`[BrowserCrawler] Crawl finished for job ${this.crawlJobId}, but some items may have failed or it was stopped. Final error: ${finalError?.message}`, 'BrowserCrawler');
            // Ensure we pass a valid error if the crawl wasn't successful
            const completionError = crawlSuccessful ? undefined : (finalError || new CrawlError('Crawl finished with unspecified errors.', 'UNKNOWN_COMPLETION_ERROR'));
            await this.cleanupAndComplete(crawlSuccessful, completionError);
        }
    }
  }

  // --- processSingleUrl with revised structure ---
  private async processSingleUrl(url: string, depth: number, context: BrowserContext): Promise<{ document: Document; links: string[] } | null> {
    const overallTimeout = this.options.overallPageTimeout;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      const attemptId = `${this.crawlJobId}-${url}-attempt-${attempt + 1}`;
      let page: Page | null = null;

      const processingPromise = (async (): Promise<{ document: Document; links: string[] } | null> => {
        try {
          page = await context.newPage();
          this.logger.debug(`[${attemptId}] Page created`, 'BrowserCrawler');

          this.logger.debug(`[${attemptId}] Navigating to: ${url}`, 'BrowserCrawler');
          await page.goto(url, {
            waitUntil: 'load', // Changed to 'load'
            timeout: this.options.navigationTimeout,
          });
          this.logger.debug(`[${attemptId}] Navigation initiated`, 'BrowserCrawler');

          await this.waitForPageReady(page, attemptId);

          this.logger.debug(`[${attemptId}] Extracting content`, 'BrowserCrawler');
          const { title, content, links } = await this.extractContentAndLinks(page);
          this.logger.debug(`[${attemptId}] Content extracted. Title: ${title}, Links: ${links.length}`, 'BrowserCrawler');

          const finalUrl = page.url();
          const document = {
              id: (await import('crypto')).randomUUID(),
              url: finalUrl,
              title,
              content,
              textContent: content,
              indexedAt: new Date(),
              updatedAt: new Date(),
              sourceId: 'browser-crawl',
              tags: [`depth:${depth}`],
              metadata: {
                  depth,
                  source: 'browser',
                  originalUrl: url
              }
          } as Document;

          try {
            await this.documentRepository.save(document);
            this.logger.info(`[${attemptId}] Document saved for: ${finalUrl}`, 'BrowserCrawler');
            this.emit('document', { jobId: this.crawlJobId, url: finalUrl, documentId: document.id, success: true });
            return { document, links };
          } catch (saveError: any) {
            this.logger.error(`[${attemptId}] Failed to save document: ${saveError.message}`, 'BrowserCrawler', saveError.stack);
            this.emit('error', { jobId: this.crawlJobId, url: finalUrl, message: `Failed to save document: ${saveError.message}`, error: saveError });
            return null;
          }
        } finally {
          if (page && !page.isClosed()) {
            this.logger.debug(`[${attemptId}] Closing page in inner finally`, 'BrowserCrawler');
            await page.close().catch((e: any) => this.logger.warn(`[${attemptId}] Error closing page in inner finally: ${e.message}`, 'BrowserCrawler'));
          }
        }
      })();

      try {
          const result = await Promise.race([
            processingPromise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new CrawlTimeoutError(url, overallTimeout, { attempt: attempt + 1, stage: 'overall' })), overallTimeout)
            )
          ]);

          if (result) {
            return result;
          } else {
             if (attempt >= this.options.maxRetries) {
                 this.logger.error(`[BrowserCrawler] Failed to process ${url} after save error and retries.`, 'BrowserCrawler');
                 return null;
             }
          }
      } catch (error: any) {
          this.logger.error(`[processSingleUrl Catch] Raw error:`, 'BrowserCrawler', { rawError: error }); // Log raw error
          let wrappedError: CrawlError;
           if (error instanceof CrawlTimeoutError) {
              wrappedError = error;
           } else if (error.name === 'TimeoutError' || (error.message && error.message.includes('timeout'))) {
              const waitStage = error.message.includes('waitForLoadState') ? 'load' : 'waitForSelector'; // Updated stage check
              const timeoutValue = waitStage === 'load' ? this.options.pageLoadTimeout : this.options.actionTimeout; // Updated timeout value check
              wrappedError = new CrawlTimeoutError(url, timeoutValue, { stage: `waitForPageReady:${waitStage}`, selector: this.options.readySelector, originalError: error });
           } else {
              wrappedError = new CrawlNetworkError(url, error, { attempt: attempt + 1 });
           }
           this.logger.warn(`[${attemptId}] Attempt failed: ${wrappedError.message}`, 'BrowserCrawler');

          if (attempt >= this.options.maxRetries) {
            this.logger.error(`[BrowserCrawler] All ${this.options.maxRetries + 1} attempts failed for URL ${url}. Final error: ${wrappedError.message}`, 'BrowserCrawler', wrappedError.stack);
            this.emit('error', { jobId: this.crawlJobId, url: url, message: `All attempts failed: ${wrappedError.message}`, error: wrappedError });
            return null;
          }
      }

      const delay = 1000 * Math.pow(2, attempt);
      this.logger.info(`[BrowserCrawler] Retrying ${url} in ${delay}ms... (Attempt ${attempt + 2}/${this.options.maxRetries + 1})`, 'BrowserCrawler');
      await new Promise(resolve => setTimeout(resolve, delay));

    } // End retry loop

    return null;
  }
  // --- End processSingleUrl ---


  private async waitForPageReady(page: Page, attemptId: string): Promise<void> {
    const readySelector = this.options.readySelector;
    const actionTimeout = this.options.actionTimeout;
    const pageLoadTimeout = this.options.pageLoadTimeout;

    try {
        this.logger.debug(`[${attemptId}] Waiting for page load state 'load' (timeout: ${pageLoadTimeout}ms)...`, 'BrowserCrawler'); // Changed log message
        await page.waitForLoadState('load', { timeout: pageLoadTimeout }); // Changed to 'load'
        this.logger.debug(`[${attemptId}] Page load state is 'load'.`, 'BrowserCrawler'); // Changed log message

        if (readySelector) {
            this.logger.debug(`[${attemptId}] Waiting for ready selector(s): ${JSON.stringify(readySelector)} with timeout ${actionTimeout}ms`, 'BrowserCrawler');
            const selectors = Array.isArray(readySelector) ? readySelector : [readySelector];
            await Promise.all(selectors.map(selector =>
                page.waitForSelector(selector, { state: 'visible', timeout: actionTimeout })
            ));
            this.logger.debug(`[${attemptId}] All ready selectors found: ${JSON.stringify(readySelector)}`, 'BrowserCrawler');
        } else {
             this.logger.debug(`[${attemptId}] No readySelector specified, proceeding after page load.`, 'BrowserCrawler'); // Changed log message
        }
    } catch (error: any) {
        if (error.name === 'TimeoutError' || (error.message && error.message.includes('timeout'))) {
             const waitStage = error.message.includes('waitForLoadState') ? 'load' : 'waitForSelector'; // Updated stage check
             const timeoutValue = waitStage === 'load' ? pageLoadTimeout : actionTimeout; // Updated timeout value check
             this.logger.warn(`[${attemptId}] Timeout during waitForPageReady stage (${waitStage}): ${error.message}`, 'BrowserCrawler');
             throw new CrawlTimeoutError(page.url(), timeoutValue, { stage: `waitForPageReady:${waitStage}`, selector: readySelector, originalError: error });
        } else {
            this.logger.error(`[${attemptId}] Unexpected error during waitForPageReady: ${error.message}`, 'BrowserCrawler', error.stack);
            throw error;
        }
    }
  }


  private async setupResourceBlocking(context: BrowserContext): Promise<void> {
    const blockedTypes = this.options.blockedResourceTypes;
    if (!blockedTypes || blockedTypes.length === 0) {
      return;
    }
    this.logger.debug(`[BrowserCrawler] Setting up resource blocking for context: ${blockedTypes.join(', ')}`, 'BrowserCrawler');
    try {
        await context.route('**/*', (route) => {
            if (blockedTypes.includes(route.request().resourceType())) {
                route.abort().catch(() => {});
            } else {
                route.continue().catch(() => {});
            }
        });
    } catch (error: any) {
        this.logger.warn(`[BrowserCrawler] Failed to set up resource blocking for context: ${error.message}`, 'BrowserCrawler');
    }
  }

  private async extractContentAndLinks(page: Page): Promise<{ title: string; content: string; links: string[] }> {
    let title = '';
    let content = '';
    let links: string[] = [];

    try {
      title = await page.title();
    } catch (error: any) {
      this.logger.warn(`[BrowserCrawler] Error extracting title from ${page.url()}: ${error.message}`, 'BrowserCrawler');
    }

    try {
      const mainContentSelector = 'main, article, [role="main"]';
      let contentElement = await page.$(mainContentSelector);
      if (contentElement) {
          content = await contentElement.innerText();
      } else {
          content = await page.locator('body').innerText();
      }
    } catch (error: any) {
      this.logger.warn(`[BrowserCrawler] Error extracting content from ${page.url()}: ${error.message}`, 'BrowserCrawler');
       try {
           content = await page.content();
       } catch (rawContentError: any) {
            this.logger.error(`[BrowserCrawler] Failed to get even raw content from ${page.url()}: ${rawContentError.message}`, 'BrowserCrawler');
       }
    }


    try {
      const pageUrl = page.url();
      const rawLinks = await page.$$eval('a', (anchors: HTMLAnchorElement[]) =>
        anchors.map(a => a.href).filter(Boolean)
      );

      links = rawLinks
        .map(link => this.urlProcessor.normalizeUrl(link))
        .filter((link): link is string => !!link);

      this.logger.debug(`[BrowserCrawler] Extracted ${links.length} valid links from ${pageUrl}`, 'BrowserCrawler');

    } catch (linkErr: any) {
      this.logger.warn(`[BrowserCrawler] Error extracting links from ${page.url()}: ${linkErr.message}`, 'BrowserCrawler');
    }

    return { title, content, links };
  }
}
