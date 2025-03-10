/**
 * Implementation of the analyze tool service
 * Provides deep analysis for documents including relationships, API specs,
 * knowledge graphs, and semantic structures
 */

import { IAnalyzeService } from './interfaces.js';
import { AnalyzeToolArgs, McpContentItem } from '../tool-types.js';
import { IDocumentRepository } from '../../../shared/domain/repositories/DocumentRepository.js';
import { IDocumentSourceRepository } from '../../../shared/domain/repositories/DocumentSourceRepository.js';

/**
 * Implementation of the analyze tool service
 */
export class AnalyzeService implements IAnalyzeService {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly sourceRepository: IDocumentSourceRepository
  ) {}

  async handleToolRequest(args: AnalyzeToolArgs): Promise<{ content: McpContentItem[], isError: boolean }> {
    // Validate required fields
    if (!args.url_or_id) {
      return {
        content: [{ type: 'text', text: 'URL or ID is required' }],
        isError: true
      };
    }

    try {
      // Find document by ID or URL
      let document = await this.documentRepository.findById(args.url_or_id);
      
      if (!document) {
        document = await this.documentRepository.findByUrl(args.url_or_id);
      }

      if (!document) {
        return {
          content: [{ 
            type: 'text', 
            text: `Document not found with ID or URL: ${args.url_or_id}` 
          }],
          isError: true
        };
      }

      // Get source information
      const source = await this.sourceRepository.findById(document.sourceId);
      
      // Determine analysis type
      const analysisType = args.action || 'relationships';
      
      // Get basic document info
      let analysisText = `
Document Analysis (${analysisType}):

Title: ${document.title}
URL: ${document.url}
Source: ${source ? source.name : document.sourceId}
Indexed: ${document.indexedAt.toISOString()}
Last Updated: ${document.updatedAt.toISOString()}
Tags: ${document.tags.join(', ') || 'None'}
`;

      // Perform specific analysis based on the type
      switch (analysisType) {
        case 'api-spec':
          analysisText += await this.performApiSpecAnalysis(document);
          break;
          
        case 'knowledge-graph':
          analysisText += await this.performKnowledgeGraphAnalysis(document);
          break;
          
        case 'semantic-document':
          analysisText += await this.performSemanticDocumentAnalysis(document);
          break;
          
        case 'relationships':
        default:
          analysisText += await this.performRelationshipAnalysis(document, args.depth || 1);
          break;
      }

      return {
        content: [{ 
          type: 'text', 
          text: analysisText.trim()
        }],
        isError: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error processing analyze request: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * Perform API specification analysis
   */
  private async performApiSpecAnalysis(document: any): Promise<string> {
    return `
API Components:
--------------
${document.metadata?.apiComponents ? JSON.stringify(document.metadata.apiComponents, null, 2) : 'No API components detected'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
  }

  /**
   * Perform knowledge graph analysis
   */
  private async performKnowledgeGraphAnalysis(document: any): Promise<string> {
    return `
Knowledge Graph:
--------------
${document.metadata?.knowledgeGraph ? JSON.stringify(document.metadata.knowledgeGraph, null, 2) : 'No knowledge graph available'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
  }

  /**
   * Perform semantic document analysis
   */
  private async performSemanticDocumentAnalysis(document: any): Promise<string> {
    return `
Semantic Structure:
-----------------
${document.metadata?.semanticStructure ? JSON.stringify(document.metadata.semanticStructure, null, 2) : 'No semantic structure available'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
  }

  /**
   * Perform relationship analysis
   */
  private async performRelationshipAnalysis(document: any, depth: number): Promise<string> {
    // Find related documents
    const relatedDocs = await this.documentRepository.search({
      sourceIds: [document.sourceId],
      limit: 5,
      text: document.title.split(' ').slice(0, 3).join(' ')
    });
    
    return `
Related Documents:
----------------
${relatedDocs.length > 1 ? 
  relatedDocs.filter(d => d.id !== document.id).map(d => `- ${d.title} (${d.url})`).join('\n') : 
  'No related documents found'}

Content Preview:
${document.textContent.substring(0, 300)}...
`;
  }
}