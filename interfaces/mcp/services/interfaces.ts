/**
 * Common interfaces for MCP tool services
 */

import { 
  DiscoverToolArgs, 
  SearchToolArgs, 
  AnalyzeToolArgs, 
  AdminToolArgs,
  McpContentItem
} from '../tool-types.js';

/**
 * Interface for tool service with common methods
 */
export interface IToolService {
  handleToolRequest(args: any): Promise<{ content: McpContentItem[], isError: boolean }>;
}

/**
 * Interface for discover tool service
 */
export interface IDiscoverService extends IToolService {
  handleToolRequest(args: DiscoverToolArgs): Promise<{ content: McpContentItem[], isError: boolean }>;
}

/**
 * Interface for search tool service
 */
export interface ISearchService extends IToolService {
  handleToolRequest(args: SearchToolArgs): Promise<{ content: McpContentItem[], isError: boolean }>;
}

/**
 * Interface for analyze tool service
 */
export interface IAnalyzeService extends IToolService {
  handleToolRequest(args: AnalyzeToolArgs): Promise<{ content: McpContentItem[], isError: boolean }>;
}

/**
 * Interface for admin tool service
 */
export interface IAdminService extends IToolService {
  handleToolRequest(args: AdminToolArgs): Promise<{ content: McpContentItem[], isError: boolean }>;
}