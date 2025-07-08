/**
 * Handler for the docsi-get-document tool
 * 
 * This handler provides functionality to retrieve the full content of a document.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { McpToolResponse } from '../tool-types.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { extractUnifiedContent } from '../../../shared/infrastructure/UnifiedContentExtractor.js';
import { Logger, getLogger } from '../../../shared/infrastructure/logging.js'; // Import Logger
import {
  DocumentNotFoundError,
  ValidationError,
  McpHandlerError,
  isDocsiError
} from '../../../shared/domain/errors.js'; // Import custom errors

// Removed global logger instance

/**
 * Arguments for the get-document tool
 */
export interface GetDocumentArgs {
  /** URL of the document to retrieve */
  url?: string;
  
  /** ID of the document to retrieve */
  id?: string;
  
  /** Whether to include raw HTML content */
  includeHtml?: boolean;
  
  /** Whether to extract content if it's missing */
  forceExtract?: boolean;
}

/**
 * Handler for the docsi-get-document tool
 */
export class GetDocumentHandler extends BaseToolHandler {
  private logger: Logger; // Added logger property

  /**
   * Create a new get-document tool handler
   * @param documentRepository Repository for documents
   * @param loggerInstance Optional logger instance
   */
  constructor(
    private readonly documentRepository: IDocumentRepository,
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
        name: 'docsi-get-document',
        description: 'Retrieve the full content of a document by URL or ID. This tool allows you to get the complete details of a document, including its full text content, metadata, and optionally the raw HTML content. Use this tool when you need to examine the entire document rather than just search results or snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL of the document to retrieve. Either URL or ID must be provided.'
            },
            id: {
              type: 'string',
              description: 'ID of the document to retrieve. Either URL or ID must be provided.'
            },
            includeHtml: {
              type: 'boolean',
              description: 'Whether to include the raw HTML content in the response. This can be useful for advanced analysis but increases response size.',
              default: false
            },
            forceExtract: {
              type: 'boolean',
              description: 'Whether to force re-extraction of content even if text content already exists. ' +
                'This can be useful if the previous extraction was incomplete or of poor quality.',
              default: false
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
    this.logger.debug(`[GetDocumentHandler] Entering handleToolCall for tool: ${name}`, 'handleToolCall', { args });
    if (name !== 'docsi-get-document') {
      // Use structured error for consistency, though this case is less likely if routing is correct
      return this.createStructuredErrorResponse(new McpHandlerError(`Handler cannot process tool: ${name}`, name));
    }
    
    const typedArgs = args as unknown as GetDocumentArgs;
    const { url, id, includeHtml = false, forceExtract = false } = typedArgs;
    
    if (!url && !id) {
      // Use ValidationError for input issues
      const validationError = new ValidationError('Either URL or ID must be provided for docsi-get-document');
      this.logger.error('Validation Error: Missing URL or ID', 'GetDocumentHandler.handleToolCall', validationError);
      return this.createStructuredErrorResponse(validationError);
    }
    
    try {
      this.logger.debug(`[GetDocumentHandler] Received args: url=${url}, id=${id}`, 'handleToolCall');
      this.logger.debug(`[GetDocumentHandler] Attempting lookup with URL: ${url}`, 'handleToolCall');
      this.logger.info(`Retrieving document: ${url || id}`, 'GetDocumentHandler.handleToolCall');
      
      // Find document by URL or ID
      let document;
      if (url) {
        document = await this.documentRepository.findByUrl(url);
        this.logger.debug(`[GetDocumentHandler] Found document via URL lookup. ID: ${document?.id}`, 'handleToolCall');
      } else if (id) {
        this.logger.debug(`[GetDocumentHandler] Attempting lookup with ID: ${id}`, 'handleToolCall');
        document = await this.documentRepository.findById(id);
        this.logger.debug(`[GetDocumentHandler] Found document via ID lookup. ID: ${document?.id}`, 'handleToolCall');
      }
      
      if (!document) {
        // Use specific DocumentNotFoundError
        const notFoundError = new DocumentNotFoundError(url || id || 'unknown identifier');
        this.logger.warn(`[GetDocumentHandler] Document lookup failed for identifier: ${url || id || 'unknown'}`, 'handleToolCall');
        this.logger.error(`Document not found: ${url || id || 'unknown identifier'}`, 'GetDocumentHandler.handleToolCall', notFoundError);
        return this.createStructuredErrorResponse(notFoundError);
      }

      // Check if we need to extract content
      if ((forceExtract || !document.textContent || document.textContent.trim().length === 0) && document.content) {
        this.logger.info(`Extracting content for document: ${document.id}`, 'GetDocumentHandler.handleToolCall');
        
        try {
          // Extract content using our unified extractor
          const extractedContent = extractUnifiedContent(document.content, document.url, { 
            comprehensive: true, 
            debug: true 
          });
          
          // Update document with extracted content
          if (extractedContent.textContent && extractedContent.textContent.trim().length > 0) {
            document.textContent = extractedContent.textContent;
            document.metadata = document.metadata || {};
            
            // Add metadata if available
            if (extractedContent.headings) document.metadata.headings = extractedContent.headings;
            if (extractedContent.codeBlocks) document.metadata.codeBlocks = extractedContent.codeBlocks;
            
            await this.documentRepository.save(document);
          }
        } catch (error) {
          this.logger.warn(`Error extracting content for document ${document.id}: ${error}`, 'GetDocumentHandler.handleToolCall', error);
          // Log the error but don't fail the request, return the document as is
        }
      }
      
      this.logger.info(`Found document: ${document.title} (ID: ${document.id})`, 'GetDocumentHandler.handleToolCall');
      
      // Format the response
      // Ensure updatedAt is a proper Date object or handle it as a string
      let updatedAtStr = 'unknown';
      if (document.updatedAt) {
        if (document.updatedAt instanceof Date) {
          updatedAtStr = document.updatedAt.toISOString();
        } else {
          // If it's a string or number, try to format it or use as is
          try {
            updatedAtStr = new Date(document.updatedAt).toISOString();
          } catch (e) {
            this.logger.warn(`Document ${document.id} has non-standard updatedAt format: ${typeof document.updatedAt}`, 'GetDocumentHandler.handleToolCall');
            updatedAtStr = String(document.updatedAt);
          }
        }
      }
      
      // Build a well-formatted response
      let response = `# ${document.title}

**URL:** ${document.url}
**Document ID:** ${document.id}
**Source:** ${document.sourceId}
**Last Updated:** ${updatedAtStr}
**Tags:** ${document.tags?.join(', ') || 'none'}

`;

      // Add metadata if available
      if (document.metadata) {
        response += '\n## Metadata\n';
        
        // Add description if available
        if (document.metadata.description) {
          response += `\n**Description:** ${document.metadata.description}\n`;
        }
        
        // Add headings if available
        if (document.metadata.headings && document.metadata.headings.length > 0) {
          response += '\n**Document Structure:**\n';
          document.metadata.headings.forEach((heading: { level: number, text: string }) => {
            // Indent based on heading level
            const indent = '  '.repeat(Math.min(heading.level - 1, 5));
            response += `${indent}- ${heading.text}\n`;
          });
        }
      }
      
      // Add text content
      response += `\n## Content\n\n`;
      
      if (document.textContent) {
        response += document.textContent;
      } else {
        response += '*No text content available*';
      }

      // Add HTML content if requested
      if (includeHtml && document.content) {
        response += `\n\n## HTML Content\n\n\`\`\`html\n${document.content}\n\`\`\``;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: response.trim()
          }
        ]
      };
    } catch (error) {
      this.logger.error(`Error retrieving document: ${url || id}`, 'GetDocumentHandler.handleToolCall', error);
      // Use structured error response
      return this.createStructuredErrorResponse(error);
    }
  }
}