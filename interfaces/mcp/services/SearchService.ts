/**
 * Implementation of the search tool service
 * Provides search functionality across documentation sources
 */

import { ISearchService } from './interfaces.js';
import { SearchToolArgs, McpContentItem } from '../tool-types.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';

/**
 * Implementation of the search tool service
 */
export class SearchService implements ISearchService {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly sourceRepository: IDocumentSourceRepository
  ) {}

  async handleToolRequest(args: SearchToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Validate required fields
    if (!args.query) {
      return {
        content: [{ type: 'text', text: 'Query is required' }],
        isError: true
      };
    }

    try {
      const searchType = args.type || 'keyword';
      
      // Build search query
      const searchQuery = {
        text: args.query,
        sourceIds: args.sources,
        limit: args.limit || 10
      };

      // Perform search
      const results = await this.documentRepository.search(searchQuery);

      if (results.length === 0) {
        return {
          content: [{ 
            type: 'text', 
            text: `No results found for query: "${args.query}"` 
          }],
          isError: false
        }
      }

      // Format results based on search type
      let formattedResults: string;
      
      if (searchType === 'api' && args.apiType) {
        formattedResults = results.map((doc, index) => {
          return `${index + 1}. ${doc.title}\n   URL: ${doc.url}\n   Source: ${doc.sourceId}\n   ${
            args.context ? `\n   Context: ${doc.textContent.substring(0, 200)}...` : ''
          }\n`;
        }).join('\n');
        
        formattedResults = `API Search Results (${args.apiType}):\n\n${formattedResults}`;
      } else {
        formattedResults = results.map((doc, index) => {
          return `${index + 1}. ${doc.title}\n   URL: ${doc.url}\n   Source: ${doc.sourceId}\n   ${
            args.context ? `\n   Context: ${doc.textContent.substring(0, 200)}...` : ''
          }\n`;
        }).join('\n');
        
        formattedResults = `${searchType.charAt(0).toUpperCase() + searchType.slice(1)} Search Results:\n\n${formattedResults}`;
      }

      return {
        content: [{ 
          type: 'text', 
          text: `Found ${results.length} results for "${args.query}":\n\n${formattedResults}` 
        }],
        isError: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing search request: ${message}` }],
        isError: true
      };
    }
  }
  
  /**
   * Helper method to enrich search results with source names
   */
  private async enrichResults(results: any[]): Promise<any[]> {
    // Get all unique source IDs
    const sourceIds = [...new Set(results.map(r => r.sourceId))];
    
    // Get sources for these IDs
    const sourcePromises = sourceIds.map(id => this.sourceRepository.findById(id));
    const sources = await Promise.all(sourcePromises);
    
    // Create a mapping of ID to name
    const sourceNameMap = new Map();
    sources.forEach(source => {
      if (source) {
        sourceNameMap.set(source.id, source.name);
      }
    });
    
    // Enrich results with source names
    return results.map(result => ({
      ...result,
      sourceName: sourceNameMap.get(result.sourceId) || 'Unknown Source'
    }));
  }
}