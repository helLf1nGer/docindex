/**
 * Base interface and class for MCP tool handlers
 */
import { McpToolResponse } from '../tool-types.js';
import { DocsiError, isDocsiError } from '../../../shared/domain/errors.js'; // Import custom errors

/**
 * Tool definition as used in MCP SDK
 */
export interface ToolDefinition {
  name: string;
  description: string;
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
  getToolDefinitions(): ToolDefinition[];
  handleToolCall(name: string, args: any): Promise<McpToolResponse>;
}

/**
 * Base abstract class for all tool handlers
 */
export abstract class BaseToolHandler implements IToolHandler {
  /**
   * Get the definitions of all tools provided by this handler (Abstract)
   */
  abstract getToolDefinitions(): ToolDefinition[];

  /**
   * Handle a tool call (Abstract)
   */
  abstract handleToolCall(name: string, args: any): Promise<McpToolResponse>;

  /**
   * Create a standard success response
   */
  protected createSuccessResponse(text: string): McpToolResponse {
    return {
      content: [{ type: 'text', text }]
    };
  }

  /**
   * Create a standard error response (simple text)
   */
  protected createErrorResponse(text: string): McpToolResponse {
    return {
      content: [{ type: 'text', text }],
      isError: true,
      errorType: 'HandlerError' // Default error type
    };
  }

  /**
   * Create a structured error response with error type derived from the error object
   */
  protected createStructuredErrorResponse(error: unknown): McpToolResponse {
    let message = 'An unknown error occurred';
    let errorType = 'UnknownError'; // Corresponds to errorDetails.type
    let errorCode = 'UNKNOWN'; // Corresponds to errorDetails.code

    if (isDocsiError(error)) {
      // Use properties from our custom error
      message = error.message;
      errorType = error.name; // Use the specific class name (e.g., SourceNotFoundError)
      errorCode = error.errorCode; // Use the defined error code (e.g., SOURCE_NOT_FOUND)
    } else if (error instanceof Error) {
      // Handle generic JS Errors
      message = error.message;
      errorType = error.name && error.name !== 'Error' ? error.name : 'GenericError'; // Use name or a default
      errorCode = 'GENERIC_ERROR'; // Assign a generic code
    } else if (typeof error === 'string') {
      // Handle plain string errors
      message = error;
      errorType = 'StringError';
      errorCode = 'STRING_ERROR';
    } else if (error && typeof error === 'object' && 'message' in error) {
      // Handle plain objects with a message property
      message = String((error as any).message);
      errorType = (error as any).name || 'ObjectError';
      errorCode = (error as any).code || 'OBJECT_ERROR';
    }
    // else: Keep default unknown error values

    return {
      isError: true,
      content: [{ type: 'text', text: message }], // Just the message, no "Error: " prefix
      errorDetails: {
        type: errorType,
        code: errorCode,
        // Optionally add more details here if needed, e.g., from error.details
        // ...(isDocsiError(error) && error.details ? { details: error.details } : {})
      }
    };
  }
}