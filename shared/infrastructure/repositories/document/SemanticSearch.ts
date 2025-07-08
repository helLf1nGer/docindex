import { EmbeddingService } from '../../EmbeddingService.js';
import { QdrantVectorRepository } from '../QdrantVectorRepository.js';
import { Document } from '../../../../shared/domain/models/Document.js';
import { FileSystemDocumentRepository } from '../FileSystemDocumentRepository.js';
import { Logger, getLogger } from '../../../infrastructure/logging.js'; // Import Logger
import { EmbeddingError, QdrantError, DocsiError, isDocsiError } from '../../../../shared/domain/errors.js'; // Import custom errors

interface VectorSearchResult {
  id: string;
  score: number;
}

export class SemanticSearch {
  private logger: Logger; // Added logger property

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorRepo: QdrantVectorRepository,
    private readonly docRepo: FileSystemDocumentRepository,
    loggerInstance?: Logger // Added optional logger parameter
  ) {
    this.logger = loggerInstance || getLogger(); // Use injected or global logger
  }

  /**
   * Perform semantic search using embeddings and vector similarity
   * @param queryText The user query string
   * @param limit Max number of results
   * @param sources Optional list of source IDs to filter
   */
  async search(queryText: string, limit = 10, sources?: string[]): Promise<Document[]> {
    this.logger.info(`Performing semantic search for query: "${queryText}"`, 'SemanticSearch.search');
    try {
      // Generate embedding for the query
      let queryEmbedding: number[];
      try {
        queryEmbedding = await this.embeddingService.generateEmbedding(queryText);
        this.logger.debug(`Generated query embedding (size: ${queryEmbedding.length})`, 'SemanticSearch.search');
      } catch (error: unknown) {
        const message = `Failed to generate embedding for query: "${queryText}"`;
        this.logger.error(message, 'SemanticSearch.search', error);
        throw new EmbeddingError(message, undefined, error instanceof Error ? error : undefined);
      }

      // Search vector DB for similar vectors
      let similar: VectorSearchResult[];
      try {
        // Fetch more results initially for potential filtering/re-ranking later
        const initialLimit = limit * 3;
        similar = await this.vectorRepo.findSimilar(queryEmbedding, initialLimit);
        this.logger.debug(`Found ${similar.length} potentially similar vectors`, 'SemanticSearch.search');
      } catch (error: unknown) {
        const message = `Failed to find similar vectors in Qdrant`;
        this.logger.error(message, 'SemanticSearch.search', error);
        // Assuming vectorRepo throws QdrantError or similar
        if (isDocsiError(error)) throw error;
        throw new QdrantError(message, error instanceof Error ? error : undefined);
      }

      if (similar.length === 0) {
        this.logger.info(`No similar vectors found for query: "${queryText}"`, 'SemanticSearch.search');
        return [];
      }

      const docIds = similar.map((s: VectorSearchResult) => s.id);
      this.logger.debug(`Fetching documents for IDs: ${docIds.join(', ')}`, 'SemanticSearch.search');

      // Fetch documents by IDs - handle potential errors for individual fetches
      const fetchPromises = docIds.map(async (id: string) => {
        try {
          return await this.docRepo.findById(id);
        } catch (error) {
          this.logger.warn(`Failed to fetch document ${id} during semantic search`, 'SemanticSearch.search', error);
          return null; // Return null if a single doc fetch fails
        }
      });
      const docs = await Promise.all(fetchPromises);

      // Filter nulls (failed fetches) and by sources if provided
      let filtered = docs.filter((d: Document | null): d is Document => d !== null);
      this.logger.debug(`Fetched ${filtered.length} documents successfully`, 'SemanticSearch.search');

      if (sources && sources.length > 0) {
        const initialCount = filtered.length;
        filtered = filtered.filter((doc: Document) => sources.includes(doc.sourceId));
        this.logger.debug(`Filtered ${initialCount - filtered.length} documents by source IDs`, 'SemanticSearch.search');
      }

      // Add scores from vector search back to the documents for potential ranking
      const scoreMap = new Map(similar.map(s => [s.id, s.score]));
      filtered.forEach(doc => {
         doc.metadata = doc.metadata || {};
         doc.metadata.semanticScore = scoreMap.get(doc.id) ?? 0;
      });

      // Sort by score (descending) before limiting
      filtered.sort((a, b) => (b.metadata?.semanticScore ?? 0) - (a.metadata?.semanticScore ?? 0));

      // Limit results
      const finalResults = filtered.slice(0, limit);
      this.logger.info(`Semantic search completed. Returning ${finalResults.length} results.`, 'SemanticSearch.search');
      return finalResults;

    } catch (error: unknown) {
      const message = `Semantic search failed for query "${queryText}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'SemanticSearch.search', error);
      // Re-throw specific errors or a generic search error
      if (isDocsiError(error)) {
        throw error;
      }
      throw new DocsiError(message, 'SEMANTIC_SEARCH_FAILED', { originalError: error });
    }
  }
}