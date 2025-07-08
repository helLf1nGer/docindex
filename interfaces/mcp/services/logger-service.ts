/**
 * Simple logger service for DocSI MCP Server
 */
export class LoggerService {
  /**
   * Log an informational message
   */
  public info(...args: any[]): void {
    console.error('[INFO]', ...args);
  }
  
  /**
   * Log a warning message
   */
  public warn(...args: any[]): void {
    console.error('[WARN]', ...args);
  }
  
  /**
   * Log an error message
   */
  public error(...args: any[]): void {
    console.error('[ERROR]', ...args);
  }
  
  /**
   * Log a debug message
   */
  public debug(...args: any[]): void {
    if (process.env.DEBUG === 'true') {
      console.error('[DEBUG]', ...args);
    }
  }
}