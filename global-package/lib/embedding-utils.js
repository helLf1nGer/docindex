import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Cache for embeddings to avoid redundant computation
const embeddingCache = new Map();
// Path to embedding cache file
let embeddingCachePath = null;

/**
 * Initialize embedding utilities
 * @param {string} dataDir - Data directory for caching embeddings
 */
export function initEmbeddingUtils(dataDir) {
  embeddingCachePath = path.join(dataDir, 'embedding-cache.json');
  
  // Load existing cache if available
  if (fs.existsSync(embeddingCachePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(embeddingCachePath, 'utf8'));
      Object.entries(cacheData).forEach(([key, value]) => {
        embeddingCache.set(key, value);
      });
      console.log(`Loaded ${embeddingCache.size} cached embeddings`);
    } catch (error) {
      console.error('Error loading embedding cache:', error.message);
    }
  }
}

// Lazy-loaded embedding pipeline
let embeddingPipeline = null;

/**
 * Create an embedding for text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function createEmbedding(text) {
  if (!text) return null;
  
  // Create a hash of the text for caching
  const textHash = crypto.createHash('md5').update(text).digest('hex');
  
  // Check cache first
  if (embeddingCache.has(textHash)) {
    return embeddingCache.get(textHash);
  }
  
  try {
    // Initialize pipeline if not already done
    if (!embeddingPipeline) {
      embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    
    // Generate embedding
    const result = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true
    });
    
    // Extract the embedding vector
    const embedding = Array.from(result.data);
    
    // Cache the result
    embeddingCache.set(textHash, embedding);
    
    // Periodically save cache to disk
    if (embeddingCache.size % 10 === 0) {
      saveEmbeddingCache();
    }
    
    return embedding;
  } catch (error) {
    console.error('Error creating embedding:', error.message);
    return null;
  }
}

/**
 * Save embedding cache to disk
 */
function saveEmbeddingCache() {
  if (!embeddingCachePath) return;
  
  try {
    const cacheObject = Object.fromEntries(embeddingCache);
    fs.writeFileSync(embeddingCachePath, JSON.stringify(cacheObject), 'utf8');
  } catch (error) {
    console.error('Error saving embedding cache:', error.message);
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {number[]} embedding1 - First embedding
 * @param {number[]} embedding2 - Second embedding
 * @returns {number} - Similarity score (0-1)
 */
export function calculateSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2) return 0;
  
  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
  }
  
  // Calculate magnitudes
  let mag1 = 0;
  let mag2 = 0;
  for (let i = 0; i < embedding1.length; i++) {
    mag1 += embedding1[i] * embedding1[i];
    mag2 += embedding2[i] * embedding2[i];
  }
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  // Calculate cosine similarity
  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
}

/**
 * Find most similar documents to a query
 * @param {string} query - Query text
 * @param {object[]} documents - Documents with embeddings
 * @param {number} limit - Maximum number of results
 * @returns {Promise<object[]>} - Ranked similar documents
 */
export async function findSimilarDocuments(query, documents, limit = 5) {
  // Create embedding for query
  const queryEmbedding = await createEmbedding(query);
  if (!queryEmbedding) return [];
  
  // Calculate similarity for each document
  const scoredDocs = documents
    .filter(doc => doc.embeddings && doc.embeddings.document)
    .map(doc => ({
      document: doc,
      score: calculateSimilarity(queryEmbedding, doc.embeddings.document)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return scoredDocs;
}

/**
 * Find most similar sections to a query
 * @param {string} query - Query text
 * @param {object[]} documents - Documents with section embeddings
 * @param {number} limit - Maximum number of results
 * @returns {Promise<object[]>} - Ranked similar sections
 */
export async function findSimilarSections(query, documents, limit = 10) {
  // Create embedding for query
  const queryEmbedding = await createEmbedding(query);
  if (!queryEmbedding) return [];
  
  // Collect all sections from all documents
  const allSections = [];
  
  documents.forEach(doc => {
    if (!doc.embeddings || !doc.embeddings.sections) return;
    
    doc.embeddings.sections.forEach(section => {
      allSections.push({
        docId: doc.id,
        docTitle: doc.title,
        docUrl: doc.url,
        sectionTitle: section.title,
        embedding: section.embedding
      });
    });
  });
  
  // Calculate similarity for each section
  const scoredSections = allSections
    .filter(section => section.embedding)
    .map(section => ({
      section,
      score: calculateSimilarity(queryEmbedding, section.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return scoredSections;
}

/**
 * Find most similar API components to a query
 * @param {string} query - Query text
 * @param {object[]} documents - Documents with API component embeddings
 * @param {number} limit - Maximum number of results
 * @returns {Promise<object[]>} - Ranked similar API components
 */
export async function findSimilarApiComponents(query, documents, limit = 10) {
  // Create embedding for query
  const queryEmbedding = await createEmbedding(query);
  if (!queryEmbedding) return [];
  
  // Collect all API components from all documents
  const allComponents = [];
  
  documents.forEach(doc => {
    if (!doc.embeddings || !doc.embeddings.apiComponents) return;
    
    doc.embeddings.apiComponents.forEach(component => {
      allComponents.push({
        docId: doc.id,
        docTitle: doc.title,
        docUrl: doc.url,
        componentType: component.type,
        componentName: component.name,
        embedding: component.embedding
      });
    });
  });
  
  // Calculate similarity for each component
  const scoredComponents = allComponents
    .filter(component => component.embedding)
    .map(component => ({
      component,
      score: calculateSimilarity(queryEmbedding, component.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return scoredComponents;
}

/**
 * Clean up resources
 */
export function cleanupEmbeddingUtils() {
  // Save cache before exiting
  saveEmbeddingCache();
}