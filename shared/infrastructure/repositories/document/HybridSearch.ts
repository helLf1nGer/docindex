import { Document } from '../../../../shared/domain/models/Document.js';
import { DocumentSearch } from './DocumentSearch.js';
import { SemanticSearch } from './SemanticSearch.js';
import { DocumentSearchQuery, IDocumentRepository } from '../../../../shared/domain/repositories/DocumentRepository.js'; // Import IDocumentRepository
import { Logger, getLogger } from '../../../infrastructure/logging.js'; // Import Logger
import { DocsiError, isDocsiError } from '../../../../shared/domain/errors.js'; // Import custom errors

export class HybridSearch {
  private logger: Logger; // Added logger property

  constructor(
    private readonly keywordSearch: DocumentSearch,
    private readonly semanticSearch: SemanticSearch,
    private readonly documentRepository: IDocumentRepository, // Inject repository
    // private readonly repository: import('../../../../shared/domain/repositories/DocumentRepository.js').IDocumentRepository, // Old comment, keep repository name consistent
    loggerInstance?: Logger // Added optional logger parameter
  ) {
    this.documentRepository = documentRepository; // Assign injected repository
    this.logger = loggerInstance || getLogger(); // Use injected or global logger
  }

  /**
   * Perform hybrid search combining keyword and semantic results
   * @param query Search query object
   */
  async search(query: DocumentSearchQuery): Promise<Document[]> {
    const { text = '', limit = 10, sourceIds } = query;
    this.logger.info(`Performing hybrid search for query: "${text}"`, 'HybridSearch.search');

    // Initialize result arrays outside the main try block to ensure they are always defined
    let semanticResults: Document[] = [];
    let keywordResults: Document[] = [];

    try {

      // Step 1: Run semantic search
      try {
        this.logger.debug(`Running semantic search component...`, 'HybridSearch.search');
        // Fetch more results initially for better ranking/combination potential
        semanticResults = await this.semanticSearch.search(text, limit * 3, sourceIds);
        this.logger.debug(`Semantic search returned ${semanticResults.length} candidates`, 'HybridSearch.search');
      } catch (error: unknown) {
        this.logger.error(`Semantic search component failed: ${error instanceof Error ? error.message : String(error)}`, 'HybridSearch.search', error);
        // semanticResults is already initialized to [], allow hybrid search to continue
        // Optionally re-throw if semantic search is critical:
        // if (isDocsiError(error)) throw error;
        // throw new DocsiError(`Semantic search failed: ${error.message}`, 'SEMANTIC_SEARCH_FAILED', { originalError: error });
      }

      // Step 2: Run keyword search on the semantic candidate pool (faster, focuses refinement)
      // Option B: Run keyword search ONLY on the semantic candidate pool (faster, focuses refinement)
      try {
        this.logger.debug(`Running keyword search component on ${semanticResults.length} semantic candidates...`, 'HybridSearch.search');
        // Adjust query limit for keyword search if needed, or let executeSearch handle it
        const keywordQuery = { ...query, limit: limit * 3 }; // Fetch more for ranking
        keywordResults = this.keywordSearch.executeSearch(semanticResults, keywordQuery);
        this.logger.debug(`Keyword search on candidates returned ${keywordResults.length} results`, 'HybridSearch.search');
      } catch (error: unknown) {
         this.logger.error(`Keyword search component failed: ${error instanceof Error ? error.message : String(error)}`, 'HybridSearch.search', error);
         // keywordResults is already initialized to [], allow hybrid search to continue
         // Optionally re-throw if keyword search is critical:
         // if (isDocsiError(error)) throw error;
         // throw new DocsiError(`Keyword search failed: ${error.message}`, 'KEYWORD_SEARCH_FAILED', { originalError: error });
      }


      // Step 3: Combine, Deduplicate, and Rank results (Simple Interleaving Example)
      // TODO: Implement more sophisticated ranking (e.g., Reciprocal Rank Fusion - RRF)
      this.logger.debug(`Combining, ranking, and collecting IDs...`, 'HybridSearch.search');
      const seenIds = new Set<string>();
      const finalIds: string[] = [];
      // Optional: Store scores if needed for re-ranking/association later
      // const scores = new Map<string, number>();
      const maxResults = limit;

      let ki = 0, si = 0;
      while (finalIds.length < maxResults && (ki < keywordResults.length || si < semanticResults.length)) {
        // Prioritize keyword results slightly in simple interleaving
        if (ki < keywordResults.length) {
          const doc = keywordResults[ki++];
      // Removed stray debug logging

          if (!seenIds.has(doc.id)) {
            finalIds.push(doc.id);
            seenIds.add(doc.id);
            // scores.set(doc.id, doc.score ?? 0); // Example score storage
          }
        }
        if (finalIds.length >= maxResults) break;
        if (si < semanticResults.length) {
          const doc = semanticResults[si++];
          if (!seenIds.has(doc.id)) {
            finalIds.push(doc.id);
            seenIds.add(doc.id);
            // scores.set(doc.id, doc.score ?? 0); // Example score storage
          }
        }
      }

      // Step 4: Fetch full documents for the final ranked IDs
      if (finalIds.length === 0) {
        this.logger.info('Hybrid search found no matching document IDs after combination.', 'HybridSearch.search');
        return [];
      }

      this.logger.debug(`Fetching full documents for ${finalIds.length} combined IDs...`, 'HybridSearch.search');
      const finalDocuments = await this.documentRepository.findByIds(finalIds);
      this.logger.debug(`Fetched ${finalDocuments.length} documents from repository.`, 'HybridSearch.search');

      // Re-order fetched documents based on the finalIds ranking
      const finalResultsMap = new Map(finalDocuments.map((doc: Document) => [doc.id, doc])); // Explicitly type 'doc'
      const orderedFinalResults = finalIds
          .map(id => finalResultsMap.get(id))
          .filter((doc): doc is Document => doc !== undefined); // Filter out any potential misses

      // Log if any documents were missing (should be rare if index/repo are consistent)
      if (orderedFinalResults.length !== finalIds.length) {
           const missingIds = finalIds.filter(id => !finalResultsMap.has(id));
           this.logger.warn(`Could not find documents for IDs during final fetch: ${missingIds.join(', ')}`, 'HybridSearch.search');
      }

      this.logger.info(`Hybrid search completed. Returning ${orderedFinalResults.length} final documents.`, 'HybridSearch.search');
      return orderedFinalResults;

    } catch (error: unknown) {
      // Catch errors from the combination logic itself (less likely)
      const message = `Hybrid search failed during result combination: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'HybridSearch.search', error);
      throw new DocsiError(message, 'HYBRID_SEARCH_FAILED', { originalError: error });
    }
  }

  // Removed unused loadAllDocuments method
}