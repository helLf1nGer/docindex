/**
 * Logging infrastructure for DocSI
 * 
 * This module provides structured logging capabilities for the application,
 * writing logs to files instead of using console.log statements.
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { createWriteStream, existsSync, mkdirSync } from 'fs';

/**
 * Log level enumeration
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

/**
 * Configuration for the logger
 */
export interface LoggerConfig {
  /** Base directory for log files */
  logDir: string;
  
  /** Minimum log level to record */
  minLevel: LogLevel;
  
  /** File name for the log file */
  logFile: string;
  
  /** Maximum log file size before rotation (in bytes) */
  maxFileSize: number;
  
  /** Maximum number of log files to keep */
  maxFiles: number;
}

/**
 * Class for structured logging
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private writeStream: NodeJS.WritableStream | null = null;
  private currentLogSize = 0;
  private logFilePath: string;
  
  /**
   * Create a new logger
   * @param config Logger configuration
   */
  private constructor(config: LoggerConfig) {
    this.config = config;
    this.logFilePath = path.join(config.logDir, config.logFile);
    this.setupLogger();
  }
  
  /**
   * Get the singleton logger instance
   * @returns Logger instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      // Default configuration
      const defaultConfig: LoggerConfig = {
        logDir: path.join(config.dataDir, 'logs'),
        minLevel: LogLevel.INFO,
        logFile: 'docsi.log',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      };
      
      Logger.instance = new Logger(defaultConfig);
    }
    
    return Logger.instance;
  }
  
  /**
   * Configure the logger
   * @param config Logger configuration
   */
  public static configure(config: Partial<LoggerConfig>): void {
    const logger = Logger.getInstance();
    
    // Update configuration
    logger.config = {
      ...logger.config,
      ...config
    };
    
    // Close existing stream if any
    if (logger.writeStream) {
      logger.writeStream.end();
      logger.writeStream = null;
    }
    
    // Update log file path
    logger.logFilePath = path.join(logger.config.logDir, logger.config.logFile);
    
    // Setup logger with new configuration
    logger.setupLogger();
  }
  
  /**
   * Set up the logger (create directory and stream)
   */
  private async setupLogger(): Promise<void> {
    try {
      // Create log directory if it doesn't exist
      if (!existsSync(this.config.logDir)) {
        mkdirSync(this.config.logDir, { recursive: true });
      }
      
      // Check current log size if file exists
      try {
        const stats = await fs.stat(this.logFilePath);
        this.currentLogSize = stats.size;
      } catch (error) {
        // File doesn't exist yet, size is 0
        this.currentLogSize = 0;
      }
      
      // Create write stream
      this.writeStream = createWriteStream(this.logFilePath, { flags: 'a' });
      
      // Log logger initialization
      this.info('Logger initialized', 'Logger');
    } catch (error) {
      // Fallback to console in case of setup failure
      console.error('Failed to setup logger:', error);
    }
  }
  
  /**
   * Rotate log file if it exceeds the maximum size
   */
  private async rotateLogFile(): Promise<void> {
    if (this.currentLogSize < this.config.maxFileSize) {
      return;
    }
    
    // Close current stream
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
    
    try {
      // Rotate log files
      for (let i = this.config.maxFiles - 1; i > 0; i--) {
        const oldPath = path.join(this.config.logDir, `${this.config.logFile}.${i}`);
        const newPath = path.join(this.config.logDir, `${this.config.logFile}.${i + 1}`);
        
        try {
          // Check if old file exists before attempting to rename
          await fs.access(oldPath);
          await fs.rename(oldPath, newPath);
        } catch (error) {
          // File doesn't exist, ignore
        }
      }
      
      // Rename current log file
      const newPath = path.join(this.config.logDir, `${this.config.logFile}.1`);
      await fs.rename(this.logFilePath, newPath);
      
      // Reset size and create new stream
      this.currentLogSize = 0;
      this.writeStream = createWriteStream(this.logFilePath, { flags: 'a' });
      
      this.info('Log file rotated', 'Logger');
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }
  
  /**
   * Write a log entry
   * @param level Log level
   * @param message Log message
   * @param context Log context (e.g., class or module name)
   * @param metadata Additional metadata to log
   */
  private async writeLog(level: LogLevel, message: string, context: string, metadata?: any): Promise<void> {
    // Check if we should log this level
    const logLevels = Object.values(LogLevel);
    if (logLevels.indexOf(level) > logLevels.indexOf(this.config.minLevel)) {
      return;
    }
    
    try {
      // Rotate log file if needed
      await this.rotateLogFile();
      
      // Prepare log entry
      const timestamp = new Date().toISOString();
      let logEntry = `${timestamp} [${level}] [${context}] ${message}`;
      
      // Add metadata if provided
      if (metadata) {
        if (typeof metadata === 'object') {
          logEntry += ` ${JSON.stringify(metadata)}`;
        } else {
          logEntry += ` ${metadata}`;
        }
      }
      
      logEntry += '\n';
      
      // Write to file
      if (this.writeStream) {
        this.writeStream.write(logEntry);
        this.currentLogSize += logEntry.length;
      }
    } catch (error) {
      // Fallback to console in case of write failure
      console.error('Failed to write log:', error);
    }
  }
  
  /**
   * Log an error message
   * @param message Error message
   * @param context Log context (e.g., class or module name)
   * @param metadata Additional metadata to log
   */
  public error(message: string, context: string, metadata?: any): void {
    this.writeLog(LogLevel.ERROR, message, context, metadata);
  }
  
  /**
   * Log a warning message
   * @param message Warning message
   * @param context Log context (e.g., class or module name)
   * @param metadata Additional metadata to log
   */
  public warn(message: string, context: string, metadata?: any): void {
    this.writeLog(LogLevel.WARN, message, context, metadata);
  }
  
  /**
   * Log an info message
   * @param message Info message
   * @param context Log context (e.g., class or module name)
   * @param metadata Additional metadata to log
   */
  public info(message: string, context: string, metadata?: any): void {
    this.writeLog(LogLevel.INFO, message, context, metadata);
  }
  
  /**
   * Log a debug message
   * @param message Debug message
   * @param context Log context (e.g., class or module name)
   * @param metadata Additional metadata to log
   */
  public debug(message: string, context: string, metadata?: any): void {
    this.writeLog(LogLevel.DEBUG, message, context, metadata);
  }
  
  /**
   * Log an error with stack trace
   * @param error Error object
   * @param context Log context (e.g., class or module name)
   * @param message Optional message to add
   */
  public logError(error: Error, context: string, message?: string): void {
    const logMessage = message || error.message;
    this.error(logMessage, context, {
      stack: error.stack,
      name: error.name,
      message: error.message
    });
  }
}

// Convenience function to get the logger instance
export function getLogger(): Logger {
  return Logger.getInstance();
}