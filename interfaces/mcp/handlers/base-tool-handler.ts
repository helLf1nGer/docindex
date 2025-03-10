/**
 * Base interface for MCP tool handlers
 * 
 * All tool handlers should implement this interface to provide a consistent way
 * to define and handle MCP tool calls.
 */
import { McpToolResponse } from '../tool-types.js';

/**
 * Tool definition as used in MCP SDK
 */
export interface ToolDefinition {
  /** Unique tool name */
  name: string;
  
  /** Human-readable description */
  description: string;
  
  /** JSON Schema for input parameters */
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Base interface for all tool handlers
 */
export interface IToolHandler {
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  getToolDefinitions(): ToolDefinition[];
  
  /**
   * Handle a tool call
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool response
   */
  handleToolCall(name: string, args: any): Promise<McpToolResponse>;
}

/**
 * Base class for all tool handlers
 */
export abstract class BaseToolHandler implements IToolHandler {
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  abstract getToolDefinitions(): ToolDefinition[];
  
  /**
   * Handle a tool call
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool response
   */
  abstract handleToolCall(name: string, args: any): Promise<McpToolResponse>;
  
  /**
   * Create a success response
   * @param text Response text
   * @returns Success response
   */
  protected createSuccessResponse(text: string): McpToolResponse {
    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }
  
  /**
   * Create an error response
   * @param text Error message
   * @returns Error response
   */
  protected createErrorResponse(text: string): McpToolResponse {
    return {
      content: [
        {
          type: 'text',
          text
        }
      ],
      isError: true
    };
  }
}