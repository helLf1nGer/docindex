/**
 * Type definitions for MCP tool arguments and responses
 */

/**
 * Arguments for the docsi-discover tool
 */
export interface DiscoverToolArgs {
  /** Action to perform (add, refresh, list) */
  action: 'add' | 'refresh' | 'list';
  
  /** URL of the documentation source (required for add action) */
  url?: string;
  
  /** Name of the documentation source (required for add and refresh actions) */
  name?: string;
  
  /** Maximum crawl depth */
  depth?: number;
  
  /** Maximum pages to crawl */
  pages?: number;
  
  /** Tags for categorizing the documentation */
  tags?: string[];
  
  /** Force refresh existing content */
  force?: boolean;
}

/**
 * Arguments for the docsi-search tool
 */
export interface SearchToolArgs {
  /** Search query */
  query: string;
  
  /** Type of search to perform */
  type?: 'keyword' | 'semantic' | 'api';
  
  /** Limit search to specific sources */
  sources?: string[];
  
  /** For API searches, type of API component to search for */
  apiType?: 'function' | 'class' | 'method' | 'property' | 'all';
  
  /** Maximum number of results to return */
  limit?: number;
  
  /** Include context around search results */
  context?: boolean;
}

/**
 * Arguments for the docsi-analyze tool
 */
export interface AnalyzeToolArgs {
  /** Type of analysis to perform */
  action?: 'relationships' | 'api-spec' | 'knowledge-graph' | 'semantic-document';
  
  /** URL or ID of the document to analyze */
  url_or_id: string;
  
  /** For relationship analysis, depth of relationships to extract */
  depth?: number;
  
  /** Whether to include full content in the results */
  includeContent?: boolean;
}

/**
 * Arguments for the docsi-admin tool
 */
export interface AdminToolArgs {
  /** Admin action to perform */
  action: 'status' | 'config' | 'stats' | 'clean' | 'export' | 'import';
  
  /** Target for the action (e.g., source name for stats) */
  target?: string;
  
  /** File path for import/export operations */
  path?: string;
  
  /** Additional options for the action */
  options?: Record<string, any>;
}

/**
 * Content item for MCP tool responses
 */
export interface McpContentItem {
  /** Content type */
  type: 'text' | 'image' | 'code' | 'json';
  
  /** Content text */
  text: string;
  
  /** Optional language for code content */
  language?: string;
  
  /** Optional alt text for image content */
  alt?: string;
}

/**
 * Response for MCP tools
 */
export interface McpToolResponse {
  /** Content items */
  content: McpContentItem[];
  
  /** Whether the response is an error */
  isError?: boolean;
}