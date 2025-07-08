import { pipeline, Pipeline } from '@xenova/transformers';
import { Logger, getLogger } from './logging.js'; // Import Logger
import { EmbeddingError } from '../domain/errors.js'; // Import custom error

export class EmbeddingService {
  private modelName: string;
  private embedder: Pipeline | null = null;
  private logger: Logger; // Added logger property
  private isInitializing: boolean = false; // Flag to prevent concurrent initialization

  constructor(modelName = 'Xenova/all-MiniLM-L6-v2', loggerInstance?: Logger) { // Added logger parameter
    this.modelName = modelName;
    this.logger = loggerInstance || getLogger(); // Use injected or global logger
    this.logger.info(`EmbeddingService initialized with model: ${this.modelName}`, 'EmbeddingService');
  }

  async init(): Promise<void> {
    // Prevent concurrent initialization attempts
    if (this.isInitializing) {
      this.logger.debug('Initialization already in progress, waiting...', 'EmbeddingService.init');
      // Simple wait loop - consider a more robust locking mechanism if needed
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.logger.debug('Initialization finished by other process.', 'EmbeddingService.init');
      return; // Already initialized by the other process
    }

    if (!this.embedder) {
      this.isInitializing = true;
      this.logger.info(`Initializing embedding model: ${this.modelName}...`, 'EmbeddingService.init');
      try {
        // Load the model pipeline
        // Type assertion might be needed if the return type isn't directly assignable
        this.embedder = await pipeline('feature-extraction', this.modelName) as Pipeline;
        this.logger.info(`Embedding model ${this.modelName} loaded successfully.`, 'EmbeddingService.init');
        // Removed potentially problematic processor assignment: (this.embedder as any).processor = {};
        // (this.embedder as any).processor = {};
      } catch (error: unknown) {
        const message = `Failed to initialize embedding model ${this.modelName}`;
        this.logger.error(message, 'EmbeddingService.init', error);
        throw new EmbeddingError(message, this.modelName, error instanceof Error ? error : undefined);
      } finally {
        this.isInitializing = false; // Ensure flag is reset
      }
    } else {
       this.logger.debug(`Embedding model ${this.modelName} already initialized.`, 'EmbeddingService.init');
    }
  }

  /**
   * Generate an embedding vector for the given text.
   * @param text Input text
   * @returns Embedding vector
   */
  /**
   * Generate an embedding vector for the given text.
   * @param text Input text
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Ensure the model is initialized
      if (!this.embedder) {
        await this.init();
        if (!this.embedder) {
          // Should not happen if init() throws correctly, but defensive check
          throw new EmbeddingError(`Embedder not initialized after init() call for model ${this.modelName}`, this.modelName);
        }
      }

      this.logger.debug(`Generating embedding for text (length: ${text.length})...`, 'EmbeddingService.generateEmbedding');
      // Generate embedding using the loaded pipeline
      // Specify return type more accurately if possible, or handle potential variations
      const output = await this.embedder(text, { pooling: 'mean', normalize: true });

      // Validate output structure (depends on the specific model/pipeline)
      // Assuming output is { data: number[] } or similar based on common patterns
      let vector: number[] | null = null;
      if (output && typeof output === 'object' && 'data' in output && Array.isArray(output.data)) {
         vector = output.data as number[];
      } else if (Array.isArray(output) && output.length > 0 && Array.isArray(output[0]) && typeof output[0][0] === 'number') {
         // Handle cases where it might return [[vector]]
         vector = output[0] as number[];
      } else if (Array.isArray(output) && typeof output[0] === 'number') {
         // Handle cases where it might return [vector]
         vector = output as number[];
      }


      if (!vector) {
         this.logger.error(`Unexpected output format from embedding model: ${JSON.stringify(output)}`, 'EmbeddingService.generateEmbedding');
         throw new EmbeddingError(`Unexpected output format from embedding model ${this.modelName}`, this.modelName);
      }

      this.logger.debug(`Embedding generated successfully (size: ${vector.length}).`, 'EmbeddingService.generateEmbedding');
      return vector;

    } catch (error: unknown) {
      const message = `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'EmbeddingService.generateEmbedding', error);
      // Re-throw specific or wrapped error
      if (error instanceof EmbeddingError) {
        throw error;
      }
      throw new EmbeddingError(message, this.modelName, error instanceof Error ? error : undefined);
    }
  }
}