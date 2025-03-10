/**
 * Handler for the docsi-search tool
 * 
 * This handler provides search functionality across all indexed documentation.
 */
import { BaseToolHandler, ToolDefinition } from './base-tool-handler.js';
import { SearchToolArgs, McpToolResponse } from '../tool-types.js';
import { IDocumentRepository, DocumentSearchQuery } from '../../../shared/domain/repositories/DocumentRepository.js';
import { getLogger } from '../../../shared/infrastructure/logging.js';

const logger = getLogger();

/**
 * Handler for the docsi-search tool
 */
export class SearchToolHandler extends BaseToolHandler {
  /**
   * Create a new search tool handler
   * @param documentRepository Repository for documents
   */
  constructor(
    private readonly documentRepository: IDocumentRepository
  ) {
    super();
  }
  
  /**
   * Get the definitions of all tools provided by this handler
   * @returns Array of tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'docsi-search',
        description: 'Search documentation across all indexed sources. This tool allows you to find relevant documentation based on keywords, semantic meaning, or API specifications. Use this tool when you need to: 1) Find information about specific topics in the documentation, 2) Locate code examples or API references, 3) Research implementation details for libraries and frameworks, or 4) Get context around technical concepts. The search results include document titles, URLs, and relevant snippets with highlighting of matched content. For more targeted results, you can filter by source or search type.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query. The text to search for within the documentation. Can be keywords, phrases, or natural language questions depending on the search type.'
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of results to return (default: 10). Use a higher limit when you need more comprehensive results, or a lower limit for concise responses.',
              default: 10
            },
            type: {
              type: 'string',
              description: 'Type of search to perform. "keyword" searches for exact matches (faster, more precise); "semantic" finds conceptually related content (better for natural language); "api" specifically targets API definitions and code examples.',
              enum: ['keyword', 'semantic', 'api'],
              default: 'keyword'
            },
            sources: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Limit search to specific documentation sources. Use this when you want results from only certain libraries, frameworks, or documentation sites. Each string should match a source name as returned by the docsi-discover tool.'
            },
            context: {
              type: 'boolean',
              description: 'Include context around search results (default: true). When true, returns snippets of text surrounding the matched content to provide more context. Set to false for more concise results with just titles and URLs.',
              default: true
            }
          },
          required: ['query']
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
    if (name !== 'docsi-search') {
      return this.createErrorResponse(`Unknown tool: ${name}`);
    }
    
    const typedArgs = args as unknown as SearchToolArgs;
    const { query, limit = 10, sources = [], type = 'keyword', context = true } = typedArgs;
    
    if (!query) {
      return this.createErrorResponse('Query is required for search');
    }
    
    try {
      logger.info(`Starting search for query: "${query}"`, 'SearchToolHandler');
      
      // Convert to DocumentSearchQuery
      const searchQuery: DocumentSearchQuery = {
        text: query,
        limit,
        sourceIds: sources.length > 0 ? sources : undefined
      };
      
      // Perform search
      const results = await this.documentRepository.search(searchQuery);
      logger.info(`Search returned ${results.length} results for "${query}"`, 'SearchToolHandler');
      
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No results found for query: "${query}"`
            }
          ]
        };
      }
      
      // Format results with enhanced snippets and relevance ranking
      // Sort by relevance (temporary simple algorithm until we implement full TF-IDF)
      results.sort((a, b) => {
        // Calculate relevance scores
        const scoreA = this.calculateRelevanceScore(a, query);
        const scoreB = this.calculateRelevanceScore(b, query);
        
        // Sort by score (descending)
        return scoreB - scoreA;
      });
      
      // Limit results after sorting
      const limitedResults = results.slice(0, limit);
      
      logger.debug(`Returning ${limitedResults.length} ranked results for query "${query}"`, 'SearchToolHandler');
      
      const formattedResults = limitedResults.map((doc, index) => {
        // Validate document properties
        const safeTitle = doc.title || 'Untitled Document';
        const safeUrl = doc.url || '#';
        
        // Get search snippets if available from metadata
        let snippet = '';
        
        if (context) {
          // First try to use the pre-extracted search snippets
          if (doc.metadata?.searchSnippets && Array.isArray(doc.metadata.searchSnippets) && doc.metadata.searchSnippets.length > 0) {
            snippet = doc.metadata.searchSnippets.join('\n...\n');
          } else {
            // If no pre-extracted snippets, generate one
            const safeTextContent = doc.textContent || '';
            snippet = this.generateSnippet(safeTextContent, query);
          }
          
          // Add code blocks if available and relevant to the query
          if (doc.metadata?.codeBlocks && Array.isArray(doc.metadata.codeBlocks)) {
            // Try to find code blocks that contain the query
            const relevantCodeBlocks = doc.metadata.codeBlocks
              .filter(block => block.code && block.code.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 1); // Only include one code block to avoid clutter
              
            if (relevantCodeBlocks.length > 0) {
              const codeBlock = relevantCodeBlocks[0];
              const language = codeBlock.language ? `(${codeBlock.language})` : '';
              snippet += `\n\nCode Example ${language}:\n\`\`\`\n${codeBlock.code.slice(0, 200)}${codeBlock.code.length > 200 ? '...' : ''}\n\`\`\``;
            }
          }
        } else {
          // No context, just use the title
          snippet = safeTitle;
        }
        
        // Build formatted result with title, URL, and snippet
        let formatted = `${index + 1}. **${safeTitle}**\n`;
        formatted += `   URL: ${safeUrl}\n`;
        
        // Add source information if available
        if (doc.sourceId) {
          formatted += `   Source: ${doc.sourceId}\n`;
        }
        
        // Add snippet
        formatted += `\n   ${snippet.replace(/\n/g, '\n   ')}\n`;
        
        return formatted;
      }).join('\n\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `
# Search Results for "${query}" 
Found ${results.length} ${results.length === 1 ? 'document' : 'documents'} matching your query.
Search type: ${type}

${formattedResults}

To view complete document content, use the docsi-get-document tool with the URL from any result.
            `.trim()
          }
        ]
      };
    } catch (error) {
      logger.error(`Search error for query "${query}"`, 'SearchToolHandler', error);
      return this.createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Calculate a relevance score for a document relative to a query
   * @param doc Document to score
   * @param query Search query
   * @returns Relevance score (higher is better)
   */
  private calculateRelevanceScore(doc: any, query: string): number {
    try {
      let score = 0;
      const queryTerms = query.toLowerCase().split(/\s+/);
      
      // Title match is most important
      if (doc.title) {
        const titleLower = doc.title.toLowerCase();
        queryTerms.forEach(term => {
          if (titleLower.includes(term)) {
            score += 10; // High weight for title matches
          }
        });
      }
      
      // Content match
      if (doc.textContent) {
        const contentLower = doc.textContent.toLowerCase();
        queryTerms.forEach(term => {
          if (contentLower.includes(term)) {
            score += 1; // Lower weight for content matches
            
            // Frequency bonus
            const regex = new RegExp(term, 'gi');
            const matches = contentLower.match(regex);
            if (matches) {
              score += Math.min(matches.length / 5, 2); // Cap at +2 for frequency
            }
          }
        });
      }
      
      // Recently updated bonus
      if (doc.updatedAt) {
        // Documents updated in the last week get a bonus
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        if (new Date(doc.updatedAt) > oneWeekAgo) {
          score += 2;
        }
      }
      
      return score;
    } catch (error) {
      logger.warn(`Error calculating relevance score: ${error}`, 'SearchToolHandler');
      return 0;
    }
  }
  
  /**
   * Generate a snippet from document content
   * @param content Document content
   * @param query Search query
   * @returns Formatted snippet
   */
  private generateSnippet(content: string, query: string): string {
    if (!content || content.length === 0) {
      return '[No content available]';
    }
    
    try {
      // Try to find query in text
      const queryTerms = query.split(/\s+/).filter(t => t.length > 2);
      
      for (const term of queryTerms) {
        try {
          // Look for the term with surrounding context
          const termRegex = new RegExp(`(.{0,75}${term}.{0,75})`, 'i');
          const match = content.match(termRegex);
          
          if (match && match[0]) {
            return `...${match[0]}...`;
          }
        } catch (error) {
          logger.warn(`Regex error for term '${term}': ${error}`, 'SearchToolHandler');
          // Continue to the next term if there's an error
        }
      }
      
      // If no specific term match, try with the full query
      try {
        // Escape regex special characters in the query
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const queryRegex = new RegExp(`(.{0,75}${escapedQuery}.{0,75})`, 'i');
        const match = content.match(queryRegex);
        
        if (match && match[0]) {
          return `...${match[0]}...`;
        }
      } catch (error) {
        logger.warn(`Regex error for full query: ${error}`, 'SearchToolHandler');
      }
      
      // If no match is found, just use the beginning of the content
      return content.substring(0, Math.min(150, content.length)) + '...';
    } catch (error) {
      logger.error(`Error generating snippet: ${error}`, 'SearchToolHandler');
      
      // As a last resort, just use the start of the text
      try {
        return content.substring(0, Math.min(100, content.length)) + '...';
      } catch (error) {
        return '[Error extracting content]';
      }
    }
  }
}