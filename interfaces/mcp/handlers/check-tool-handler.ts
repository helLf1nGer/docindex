/**
 * Handler for the docsi-check tool
 * 
 * This is a simple health-check tool to verify that the MCP server is functioning.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { McpToolResponse } from '../tool-types.js';

/**
 * Handler for the docsi-check tool
 */
export class CheckToolHandler extends BaseToolHandler {
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docsi-check',
        description: 'Check if the DocSI MCP server is functioning properly. This is a diagnostic tool that returns a simple status message with an optional echo parameter. Use this when you need to verify that the server is online and responding to requests before attempting more complex operations.',
        inputSchema: {
          type: 'object',
          properties: {
            echo: {
              type: 'string',
              description: 'Text to echo back. The server will return this text as part of its response.'
            }
          }
        }
      }
    ];
  }
  
  /**
   * Handle a tool call
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool response
   */
  async handleToolCall(name: string, args: any): Promise<McpToolResponse> {
    if (name !== 'docsi-check') {
      return this.createErrorResponse(`Unknown tool: ${name}`);
    }
    
    const echo = args?.echo || 'No echo provided';
    
    return {
      content: [
        {
          type: 'text',
          text: `DocSI MCP server is functioning properly! Echo: ${echo}`
        }
      ]
    };
  }
}