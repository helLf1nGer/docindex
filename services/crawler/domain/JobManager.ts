/**
 * JobManager for managing crawler jobs
 * 
 * This class handles job creation, status tracking, progress updates,
 * and cancellation for crawler jobs, providing a clean interface for
 * the CrawlerService to interact with.
 */

import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import EventEmitter from 'events';
import { CrawlJobSettings, CrawlJobStatus, JobStatusType } from './CrawlerService.js';

const logger = getLogger();

/**
 * Job information
 */
export interface Job {
  /** Job ID */
  jobId: string;
  
  /** Job settings */
  settings: CrawlJobSettings;
  
  /** Job status */
  status: JobStatusType;
  
  /** Start time */
  startTime?: Date;
  
  /** End time */
  endTime?: Date;
  
  /** Error message if job failed */
  error?: string;
  
  /** Progress information */
  progress: {
    /** Number of pages crawled */
    pagesCrawled: number;
    
    /** Number of pages discovered */
    pagesDiscovered: number;
    
    /** Number of pages in queue */
    pagesInQueue: number;
    
    /** Max depth reached */
    maxDepthReached: number;
  };
}

/**
 * Progress update for a job
 */
export interface JobProgressUpdate {
  /** Number of pages crawled */
  pagesCrawled?: number;
  
  /** Number of pages discovered */
  pagesDiscovered?: number;
  
  /** Number of pages in queue */
  pagesInQueue?: number;
  
  /** Max depth reached */
  maxDepthReached?: number;
}

/**
 * Event payload for job events
 */
export interface JobEvent {
  /** Job ID */
  jobId: string;
  
  /** Source ID */
  sourceId: string;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Event type */
  type: 'created' | 'started' | 'completed' | 'canceled' | 'progress';
  
  /** Job status */
  status: JobStatusType;
  
  /** Additional event data */
  data?: any;
}

/**
 * Manager for crawler jobs
 */
export class JobManager {
  /** Map of job ID to job information */
  private jobs = new Map<string, Job>();
  
  /** Event emitter for job events */
  private eventEmitter = new EventEmitter();
  
  /**
   * Create a new job manager
   */
  constructor() {
    logger.debug('JobManager initialized', 'JobManager');
  }
  
  /**
   * Create a new job
   * @param settings Job settings
   * @returns Created job information
   */
  createJob(settings: CrawlJobSettings): { jobId: string, status: CrawlJobStatus } {
    const jobId = settings.jobId || uuidv4();
    
    // Create job
    const job: Job = {
      jobId,
      settings,
      status: 'pending',
      progress: {
        pagesCrawled: 0,
        pagesDiscovered: 0,
        pagesInQueue: 0,
        maxDepthReached: 0
      }
    };
    
    // Store job
    this.jobs.set(jobId, job);
    
    // Emit event
    this.emitJobEvent(jobId, settings.sourceId, 'created');
    
    logger.info(`Created job ${jobId} for source ${settings.sourceId}`, 'JobManager');
    
    return {
      jobId,
      status: this.getJobStatus(jobId)
    };
  }
  
  /**
   * Mark a job as running
   * @param jobId ID of the job
   * @returns Job status
   */
  markJobAsRunning(jobId: string): CrawlJobStatus {
    const job = this.getJob(jobId);
    
    // Update job
    job.status = 'running';
    job.startTime = new Date();
    
    // Emit event
    this.emitJobEvent(jobId, job.settings.sourceId, 'started');
    
    logger.info(`Started job ${jobId}`, 'JobManager');
    
    return this.getJobStatus(jobId);
  }
  
  /**
   * Mark a job as completed
   * @param jobId ID of the job
   * @param success Whether the job completed successfully
   * @param error Optional error message if job failed
   * @returns Job status
   */
  markJobAsCompleted(
    jobId: string,
    success: boolean,
    error?: string
  ): CrawlJobStatus {
    const job = this.getJob(jobId);
    
    // Update job
    job.status = success ? 'completed' : 'failed';
    job.endTime = new Date();
    job.error = error;
    
    // Emit event
    this.emitJobEvent(jobId, job.settings.sourceId, 'completed', {
      success,
      error,
      duration: job.endTime.getTime() - (job.startTime?.getTime() || job.endTime.getTime()),
      pagesCrawled: job.progress.pagesCrawled,
      pagesDiscovered: job.progress.pagesDiscovered
    });
    
    logger.info(
      `Completed job ${jobId} (${success ? 'success' : 'failed'})${error ? `: ${error}` : ''}`,
      'JobManager'
    );
    
    return this.getJobStatus(jobId);
  }
  
  /**
   * Update job progress
   * @param jobId ID of the job
   * @param progress Progress update
   * @returns Job status
   */
  updateJobProgress(jobId: string, progress: JobProgressUpdate): CrawlJobStatus {
    const job = this.getJob(jobId);
    
    // Update job progress
    if (progress.pagesCrawled !== undefined) {
      job.progress.pagesCrawled = progress.pagesCrawled;
    }
    
    if (progress.pagesDiscovered !== undefined) {
      job.progress.pagesDiscovered = progress.pagesDiscovered;
    }
    
    if (progress.pagesInQueue !== undefined) {
      job.progress.pagesInQueue = progress.pagesInQueue;
    }
    
    if (progress.maxDepthReached !== undefined) {
      job.progress.maxDepthReached = progress.maxDepthReached;
    }
    
    // Emit event
    this.emitJobEvent(jobId, job.settings.sourceId, 'progress', {
      progress: { ...job.progress }
    });
    
    return this.getJobStatus(jobId);
  }
  
  /**
   * Cancel a job
   * @param jobId ID of the job to cancel
   * @returns Whether the job was canceled
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      logger.warn(`Job not found: ${jobId}`, 'JobManager');
      return false;
    }
    
    // Only cancel if not already completed or failed
    if (job.status !== 'completed' && job.status !== 'failed') {
      job.status = 'canceled';
      job.endTime = new Date();
      
      // Emit event
      this.emitJobEvent(jobId, job.settings.sourceId, 'canceled');
      
      logger.info(`Canceled job ${jobId}`, 'JobManager');
      
      return true;
    }
    
    logger.warn(`Cannot cancel job ${jobId} with status ${job.status}`, 'JobManager');
    return false;
  }
  
  /**
   * Get job status
   * @param jobId ID of the job
   * @returns Job status
   */
  getJobStatus(jobId: string): CrawlJobStatus {
    const job = this.getJob(jobId);
    
    return {
      jobId: job.jobId,
      sourceId: job.settings.sourceId,
      status: job.status,
      startTime: job.startTime,
      endTime: job.endTime,
      progress: { ...job.progress },
      error: job.error
    };
  }
  
  /**
   * Get all jobs
   * @returns Array of job statuses
   */
  getAllJobs(): CrawlJobStatus[] {
    return Array.from(this.jobs.values()).map(job => this.getJobStatus(job.jobId));
  }
  
  /**
   * Get the event emitter for job events
   * @returns Event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
  
  /**
   * Get a job, throwing an error if not found
   * @param jobId ID of the job
   * @returns Job
   * @throws Error if job not found
   */
  private getJob(jobId: string): Job {
    const job = this.jobs.get(jobId);
    
    if (!job) {
      const error = `Job not found: ${jobId}`;
      logger.error(error, 'JobManager');
      throw new Error(error);
    }
    
    return job;
  }
  
  /**
   * Emit a job event
   * @param jobId Job ID
   * @param sourceId Source ID
   * @param type Event type
   * @param data Optional event data
   */
  private emitJobEvent(
    jobId: string,
    sourceId: string,
    type: 'created' | 'started' | 'completed' | 'canceled' | 'progress',
    data?: any
  ): void {
    const job = this.getJob(jobId);
    
    const event: JobEvent = {
      jobId,
      sourceId,
      timestamp: new Date(),
      type,
      status: job.status,
      data
    };
    
    this.eventEmitter.emit(`job-${type}`, event);
    this.eventEmitter.emit('job-event', event);
  }
}