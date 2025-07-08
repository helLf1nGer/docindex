/**
 * Configuration service for DocSI MCP Server
 */
export interface ConfigOptions {
  /** Data directory path */
  dataDir: string;
  
  /** Server version */
  version: string;
  
  /** Additional configuration settings */
  [key: string]: any;
}

export class ConfigService {
  private config: ConfigOptions;
  
  /**
   * Create a new configuration service
   * @param options Initial configuration options
   */
  constructor(options: ConfigOptions) {
    this.config = {
      ...options
    };
  }
  
  /**
   * Get a configuration value
   * @param key Configuration key
   * @param defaultValue Default value if the key doesn't exist
   * @returns The configuration value
   */
  public get<T = any>(key: string, defaultValue?: T): T {
    return this.config[key] !== undefined ? this.config[key] : defaultValue as T;
  }
  
  /**
   * Set a configuration value
   * @param key Configuration key
   * @param value Configuration value
   */
  public set(key: string, value: any): void {
    this.config[key] = value;
  }
  
  /**
   * Get all configuration values
   * @returns All configuration values
   */
  public getAll(): ConfigOptions {
    return { ...this.config };
  }
}