/**
 * Handler for the docsi-info tool
 * 
 * Provides information about the DocSI installation.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { McpToolResponse } from '../tool-types.js';
import { ConfigService } from '../services/config-service.js';
import { Logger, getLogger } from '../../../shared/infrastructure/logging.js'; // Import Logger
import { McpHandlerError, ConfigurationError, isDocsiError } from '../../../shared/domain/errors.js'; // Import custom errors

/**
 * Handler for the docsi-info tool
 */
export class InfoToolHandler extends BaseToolHandler {
  private logger: Logger; // Added logger property

  /**
   * Create a new info tool handler
   * @param configService Configuration service instance
   * @param loggerInstance Optional logger instance
   */
  constructor(
    private configService: ConfigService,
    loggerInstance?: Logger // Added optional logger parameter
  ) {
    super();
    this.logger = loggerInstance || getLogger(); // Use injected or global logger
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
      return this.createStructuredErrorResponse(new McpHandlerError(`Handler cannot process tool: ${name}`, name));
    }
    
    try {
      this.logger.info('Handling docsi-info request', 'InfoToolHandler.handleToolCall');
      // Get system information
      const dataDir = this.configService.get('dataDir');
      const version = this.configService.get('version');

      let startTimeValue = this.configService.get('startTime');
      let startTimeStr = 'N/A'; // Default value

      if (startTimeValue) {
        try {
          // Attempt to create a Date object and format it
          const dateObj = new Date(startTimeValue);
          // Check if the date is valid before formatting
          if (!isNaN(dateObj.getTime())) {
             startTimeStr = dateObj.toISOString();
          } else {
             this.logger.warn(`Configured startTime '${startTimeValue}' is not a valid date representation.`, 'InfoToolHandler.handleToolCall');
          }
        } catch (timeError) {
          this.logger.warn(`Error processing startTime '${startTimeValue}': ${timeError}`, 'InfoToolHandler.handleToolCall', timeError);
        }
      } else {
         // If config didn't provide startTime, use current time as fallback
         startTimeStr = new Date().toISOString();
         this.logger.debug('No startTime found in config, using current time.', 'InfoToolHandler.handleToolCall');
      }

      const docSources = this.configService.get('documentSources') || 0;
      const docCount = this.configService.get('documentCount') || 0;

      const infoText = `
DocSI Information:
------------------
Version: ${version || 'N/A'}
Data Directory: ${dataDir || 'N/A'}
Running Since: ${startTimeStr}
Running Since: ${startTimeStr}
Document Sources: ${docSources}
Indexed Documents: ${docCount}
Protocol: Model Context Protocol
Transport: stdio
Node Version: ${process.version}
Platform: ${process.platform}
      `.trim();

      this.logger.debug('Successfully retrieved info', 'InfoToolHandler.handleToolCall');
      return this.createSuccessResponse(infoText);

    } catch (error: unknown) {
      const message = `Error retrieving DocSI info: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'InfoToolHandler.handleToolCall', error);
      // Wrap config errors specifically if possible, otherwise use generic handler error
      if (error instanceof ConfigurationError || (error instanceof Error && error.message.includes('config'))) {
         return this.createStructuredErrorResponse(new ConfigurationError(message, { originalError: error }));
      }
      return this.createStructuredErrorResponse(new McpHandlerError(message, name, { originalError: error }));
    }
  }
}