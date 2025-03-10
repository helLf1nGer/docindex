/**
 * Handler for the docsi-info tool
 * 
 * Provides information about the DocSI installation.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { McpToolResponse } from '../tool-types.js';
import { ConfigService } from '../services/config-service.js';

/**
 * Handler for the docsi-info tool
 */
export class InfoToolHandler extends BaseToolHandler {
  /**
   * Create a new info tool handler
   * @param configService Configuration service instance
   */
  constructor(private configService: ConfigService) {
    super();
  }
  
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docsi-info',
        description: 'Get information about the DocSI installation. This tool provides detailed information about the server configuration, data location, runtime statistics, and system environment. Use this when you need to understand the server setup, check version information, find where data is stored, or view statistics about indexed documentation. This tool requires no parameters and can be called any time to get the current state of the server.',
        inputSchema: {
          type: 'object',
          properties: {}
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
    if (name !== 'docsi-info') {
      return this.createErrorResponse(`Unknown tool: ${name}`);
    }
    
    // Get system information
    const dataDir = this.configService.get('dataDir');
    const version = this.configService.get('version');
    const startTime = this.configService.get('startTime') || new Date().toISOString();
    const docSources = this.configService.get('documentSources') || 0;
    const docCount = this.configService.get('documentCount') || 0;
    
    return {
      content: [
        {
          type: 'text',
          text: `
DocSI Information:
------------------
Version: ${version}
Data Directory: ${dataDir}
Running Since: ${startTime}
Document Sources: ${docSources}
Indexed Documents: ${docCount}
Protocol: Model Context Protocol
Transport: stdio
Node Version: ${process.version}
Platform: ${process.platform}
          `.trim()
        }
      ]
    };
  }
}