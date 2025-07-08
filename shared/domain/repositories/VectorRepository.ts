export interface VectorRepository {
  /**
   * Upsert a vector embedding associated with a document ID.
   * Creates or updates the vector in the underlying store.
   * @param documentId Unique identifier of the document
   * @param vector Embedding vector
   */
  upsertVector(documentId: string, vector: number[]): Promise<void>;

  /**
   * Retrieve a vector embedding by document ID.
   * @param documentId Unique identifier of the document
   * @returns The embedding vector or null if not found
   */
  getVector(documentId: string): Promise<number[] | null>;

  /**
   * Delete a vector embedding by document ID.
   * @param documentId Unique identifier of the document
   */
  deleteVector(documentId: string): Promise<void>;

  /**
   * Ensure the vector collection exists, creating it if necessary.
   */
  ensureCollection(): Promise<void>;
}