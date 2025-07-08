import { QdrantClient } from '@qdrant/js-client-rest';
import { VectorRepository } from '../../domain/repositories/VectorRepository.js';
import { Logger, getLogger } from '../../infrastructure/logging.js'; // Import Logger
import { QdrantError } from '../../domain/errors.js'; // Import custom error

export class QdrantVectorRepository implements VectorRepository {
  private client: QdrantClient;
  private logger: Logger; // Added logger property

  async findSimilar(embedding: number[], limit: number): Promise<any[]> {
    return [];
  }
  private collectionName: string;

  constructor(qdrantUrl: string, collectionName = 'docsi_vectors', loggerInstance?: Logger) { // Added logger parameter
    this.client = new QdrantClient({ url: qdrantUrl });
    this.collectionName = collectionName;
    this.logger = loggerInstance || getLogger(); // Use injected or global logger
    this.logger.info(`QdrantVectorRepository initialized. URL: ${qdrantUrl}, Collection: ${collectionName}`, 'QdrantVectorRepository');
  }

  async ensureCollection(): Promise<void> {
    try {
      this.logger.debug(`Checking if collection '${this.collectionName}' exists...`, 'QdrantVectorRepository.ensureCollection');
      const collections = await this.client.getCollections();
      const exists = collections.collections.some((c: { name: string }) => c.name === this.collectionName);

      if (!exists) {
        this.logger.info(`Collection '${this.collectionName}' not found. Creating...`, 'QdrantVectorRepository.ensureCollection');
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: 384, // TODO: Make size configurable
            distance: 'Cosine',
          },
        });
        this.logger.info(`Collection '${this.collectionName}' created successfully.`, 'QdrantVectorRepository.ensureCollection');
      } else {
        this.logger.debug(`Collection '${this.collectionName}' already exists.`, 'QdrantVectorRepository.ensureCollection');
      }
    } catch (error: unknown) {
      const message = `Failed to ensure Qdrant collection '${this.collectionName}'`;
      this.logger.error(message, 'QdrantVectorRepository.ensureCollection', error);
      throw new QdrantError(message, error instanceof Error ? error : undefined);
    }
  }

  async upsertVector(documentId: string, vector: number[]): Promise<void> {
    try {
      await this.ensureCollection();
      this.logger.debug(`Upserting vector for document ID: ${documentId}`, 'QdrantVectorRepository.upsertVector');
      await this.client.upsert(this.collectionName, {
        wait: true, // Wait for operation to complete
        points: [
          {
            id: documentId,
            vector,
            payload: { documentId }, // Store documentId in payload for potential filtering
          },
        ],
      });
      this.logger.debug(`Successfully upserted vector for document ID: ${documentId}`, 'QdrantVectorRepository.upsertVector');
    } catch (error: unknown) {
      const message = `Failed to upsert vector for document ID ${documentId}`;
      this.logger.error(message, 'QdrantVectorRepository.upsertVector', error);
      throw new QdrantError(message, error instanceof Error ? error : undefined);
    }
  }

  async getVector(documentId: string): Promise<number[] | null> {
    try {
      this.logger.debug(`Retrieving vector for document ID: ${documentId}`, 'QdrantVectorRepository.getVector');
      const result = await this.client.retrieve(this.collectionName, {
        ids: [documentId],
        with_vector: true, // Ensure vector is included
      });

      if (result.length > 0 && result[0].vector) {
        const vector = result[0].vector;
        // Qdrant client might return PointVectors or number[] depending on version/config
        if (Array.isArray(vector) && vector.every((v) => typeof v === 'number')) {
          this.logger.debug(`Successfully retrieved vector for document ID: ${documentId}`, 'QdrantVectorRepository.getVector');
          return vector as number[];
        } else {
           this.logger.warn(`Retrieved point for ${documentId} but vector format is unexpected: ${typeof vector}`, 'QdrantVectorRepository.getVector');
        }
      }
      this.logger.debug(`Vector not found for document ID: ${documentId}`, 'QdrantVectorRepository.getVector');
      return null;
    } catch (error: unknown) {
      // Handle cases where the point might not exist gracefully vs. actual client errors
      if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
         this.logger.warn(`Vector not found for document ID ${documentId} (Qdrant error)`, 'QdrantVectorRepository.getVector', error);
         return null;
      }
      const message = `Failed to retrieve vector for document ID ${documentId}`;
      this.logger.error(message, 'QdrantVectorRepository.getVector', error);
      throw new QdrantError(message, error instanceof Error ? error : undefined);
    }
  }

  async deleteVector(documentId: string): Promise<void> {
    try {
      this.logger.debug(`Deleting vector for document ID: ${documentId}`, 'QdrantVectorRepository.deleteVector');
      await this.client.delete(this.collectionName, {
        wait: true, // Wait for operation to complete
        points: [documentId],
      });
      this.logger.debug(`Successfully deleted vector for document ID: ${documentId}`, 'QdrantVectorRepository.deleteVector');
    } catch (error: unknown) {
       // Handle cases where the point might not exist gracefully vs. actual client errors
       if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
          this.logger.warn(`Attempted to delete non-existent vector for document ID ${documentId}`, 'QdrantVectorRepository.deleteVector', error);
          return; // Don't throw if it didn't exist anyway
       }
      const message = `Failed to delete vector for document ID ${documentId}`;
      this.logger.error(message, 'QdrantVectorRepository.deleteVector', error);
      throw new QdrantError(message, error instanceof Error ? error : undefined);
    }
  }
}