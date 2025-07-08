/**
 * Handler for the docsi-search tool
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { SearchToolArgs, McpToolResponse } from '../tool-types.js';
import { IDocumentRepository, DocumentSearchQuery } from '../../../shared/domain/repositories/DocumentRepository.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';
import { z, ZodIssue } from 'zod'; // Import zod and ZodIssue
import { ValidationError } from '../../../shared/domain/errors.js'; // Import ValidationError

const logger = getLogger();

export class SearchToolHandler extends BaseToolHandler {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    // Optional dependencies for semantic/hybrid search (can be injected later)
    private readonly semanticSearch?: { search(query: string, limit?: number, sources?: string[]): Promise<any[]> },
    private readonly hybridSearch?: { search(query: DocumentSearchQuery): Promise<any[]> }
  ) {
    super();
  }

  // No need to explicitly override protected methods if just calling super

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docsi-search',
        description: 'Search documentation across all indexed sources. Supports keyword, semantic, and hybrid search types.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query.' },
            limit: { type: 'integer', description: 'Max results', default: 10 },
            type: { type: 'string', enum: ['keyword', 'semantic', 'hybrid', 'api'], default: 'keyword', description: 'Search type (keyword, semantic, hybrid, api).' },
            sources: { type: 'array', items: { type: 'string' }, description: 'Optional array of source names to filter by.' },
            context: { type: 'boolean', description: 'Include context snippets', default: true }
          },
          required: ['query']
        }
      }
    ];
  }

  async handleToolCall(name: string, args: any): Promise<McpToolResponse> {
    // Assuming SearchToolParamsSchema and Logger are defined/imported correctly
    // Also assuming a BaseToolHandler method 'createStructuredErrorResponse' exists

    // Use the schema defined in the previous analysis
    const SearchToolParamsSchema = z.object({
      query: z.string().min(1, "Query cannot be empty"),
      type: z.enum(["keyword", "semantic", "hybrid", "api"]), // Make type required and strictly one of the enum values
      limit: z.number().int().positive().optional().default(10), // Default 10 as per original schema
      sources: z.array(z.string()).optional().default([]), // Added sources
      context: z.boolean().optional().default(true) // Added context
    });


    const safeParams = SearchToolParamsSchema.safeParse(args);

    // Check if parsing failed
    if (!safeParams.success) {
      // Log the detailed Zod error
      logger.error("Invalid parameters received for search tool:", "SearchToolHandler.handleToolCall", {
        issues: safeParams.error.issues,
        input: args
      });

      // Check if the error is specifically related to the 'type' field
      const typeError = safeParams.error.issues.find((issue: ZodIssue) => issue.path.includes('type'));
      if (typeError) {
          // Use ValidationError for consistency and hardcode allowed types
          const allowedTypes = "keyword, semantic, hybrid, api"; // Hardcoded list
          const validationError = new ValidationError(`Invalid search type provided. Allowed types are: ${allowedTypes}`);
          logger.error(`Validation Error: Invalid search type`, 'SearchToolHandler.handleToolCall', validationError); // Log the specific error
          return this.createStructuredErrorResponse(validationError);
      }

      // Generic error for other validation issues (like missing query)
      const queryError = safeParams.error.issues.find((issue: ZodIssue) => issue.path.includes('query'));
      if (queryError) {
          const validationError = new ValidationError('Query parameter is required and cannot be empty.');
          logger.error('Validation Error: Missing or empty query parameter', 'SearchToolHandler.handleToolCall', validationError);
          return this.createStructuredErrorResponse(validationError);
      }

      // Fallback generic validation error
      const validationError = new ValidationError("Invalid parameters provided for search tool.");
      logger.error('Validation Error: Generic parameter validation failed', 'SearchToolHandler.handleToolCall', safeParams.error.issues);
      return this.createStructuredErrorResponse(validationError);
    }

    // Parameters are valid, proceed with search
    const { query, type, limit, sources, context } = safeParams.data; // Include sources and context

    try {
      logger.info(`Starting ${type} search for query: "${query}"`, 'SearchToolHandler');

      const searchQuery: DocumentSearchQuery = {
        text: query,
        limit, // Apply limit later after ranking for hybrid/semantic
        sourceIds: sources.length > 0 ? sources : undefined
      };

      let results: any[] = [];

      // --- Search Logic ---
      if (type === 'semantic' && this.semanticSearch) {
        logger.info(`Performing semantic search...`, 'SearchToolHandler');
        results = await this.semanticSearch.search(query, limit, sources);
      } else if (type === 'hybrid' && this.hybridSearch) {
        logger.info(`Performing hybrid search...`, 'SearchToolHandler');
        // HybridSearch now takes the full query object including limit
        results = await this.hybridSearch.search(searchQuery);
      } else { // Default to keyword (or handle 'api' if needed)
        if (type === 'api') {
           // Placeholder: Add logic for 'api' search type if it's distinct
           logger.warn(`API search type not fully implemented, defaulting to keyword search.`, 'SearchToolHandler');
        }
        logger.info(`Performing keyword search (type: ${type})...`, 'SearchToolHandler');
        // Keyword search within DocumentRepository likely handles limit internally
        // We pass the original limit from the query here.
        searchQuery.limit = limit;
        results = await this.documentRepository.search(searchQuery);
      }
      // --- End Search Logic ---


      logger.info(`Search returned ${results.length} initial results for "${query}"`, 'SearchToolHandler');

      if (results.length === 0) {
        return this.createSuccessResponse(`No results found for query: "${query}"`);
      }

      // --- Ranking and Formatting ---
      results.sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, query);
        const scoreB = this.calculateRelevanceScore(b, query);
        return scoreB - scoreA;
      });

      const limitedResults = results.slice(0, limit);

      const formattedResults = limitedResults.map((doc: any, index: number) => {
        const safeTitle = doc.title || 'Untitled Document';
        const safeUrl = doc.url || '#';
        let snippet = '';

        if (context) { // Use the validated context flag
           const safeTextContent = doc.textContent || '';
           snippet = this.generateSnippet(safeTextContent, query);
        } else {
          snippet = safeTitle;
        }
        return `${index + 1}. **${safeTitle}**\n   URL: ${safeUrl}\n   Snippet: ${snippet.replace(/\n/g, '\n   ')}`;
      }).join('\n\n');
      // --- End Ranking and Formatting ---

      return this.createSuccessResponse(`# Search Results for "${query}" (${type})\n\n${formattedResults}`);

    } catch (error) {
      logger.error(`Search error for query "${query}"`, 'SearchToolHandler', error);
      return this.createStructuredErrorResponse(error); // Pass original error for structured response
    }
  }

  // Basic relevance scoring - placeholder, can be significantly improved
  private calculateRelevanceScore(doc: any, query: string): number {
    let score = doc.score || 0; // Use score from vector search if available
    const queryLower = query.toLowerCase();
    const titleLower = (doc.title || '').toLowerCase();
    const contentLower = (doc.textContent || '').toLowerCase();

    if (titleLower.includes(queryLower)) {
      score += 10;
    }
    if (contentLower.includes(queryLower)) {
      score += 1;
    }
    return score;
  }

  // Basic snippet generation - placeholder
  private generateSnippet(content: string, query: string): string {
     if (!content) return '[No content available]';
     const queryLower = query.toLowerCase();
     const contentLower = content.toLowerCase();
     const idx = contentLower.indexOf(queryLower);

     if (idx !== -1) {
       const start = Math.max(0, idx - 75);
       const end = Math.min(content.length, idx + query.length + 75);
       return '...' + content.substring(start, end) + '...';
     }
     // Fallback: return start of content
     return content.substring(0, 150) + (content.length > 150 ? '...' : '');
  }
}