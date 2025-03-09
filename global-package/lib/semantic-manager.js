import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { createPageId } from './documentation-manager-utils.js';

/**
 * Get semantic document structure
 * @param {string} urlOrId - URL or ID of the document
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - Semantic document structure
 */
export async function getSemanticDocument(urlOrId, docManager) {
  console.error(chalk.blue(`Getting semantic document for: ${urlOrId}`));
  
  // First get the raw document
  const pageId = urlOrId.length === 32 && /^[a-f0-9]+$/.test(urlOrId) ? urlOrId : createPageId(urlOrId);
  const config = loadConfig(docManager);
  const dataDir = docManager.getDataDirectory();
  
  // Find the document in sources
  for (const source of config.sources) {
    const sourceDir = getSourceDataDir(source.id, dataDir);
    const pagePath = path.join(sourceDir, `${pageId}.json`);
    
    if (fs.existsSync(pagePath)) {
      const pageData = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
      
      // Check if we already have a semantic version
      const semanticPath = path.join(sourceDir, 'semantic', `${pageId}.json`);
      
      if (fs.existsSync(semanticPath)) {
        // Return cached semantic document
        return JSON.parse(fs.readFileSync(semanticPath, 'utf8'));
      }
      
      // Parse the document semantically
      const { parseDocumentSemantics } = await import('./semantic-parser.js');
      const semanticDoc = parseDocumentSemantics(
        pageData.fullHtmlContent, 
        pageData.url, 
        source.id
      );
      
      // Ensure semantic directory exists
      const semanticDir = path.join(sourceDir, 'semantic');
      if (!fs.existsSync(semanticDir)) {
        fs.mkdirSync(semanticDir, { recursive: true });
      }
      
      // Cache the semantic document
      fs.writeFileSync(semanticPath, JSON.stringify(semanticDoc, null, 2));
      
      return semanticDoc;
    }
  }
  
  throw new Error(`Document not found: ${urlOrId}`);
}

/**
 * Get API specification from a document
 * @param {string} urlOrId - URL or ID of the document
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - API specification
 */
export async function getApiSpecification(urlOrId, docManager) {
  console.error(chalk.blue(`Getting API specification for: ${urlOrId}`));
  
  // Get the semantic document first
  const semanticDoc = await getSemanticDocument(urlOrId, docManager);
  
  // Extract API specification
  const { extractApiSpecification } = await import('./semantic-parser.js');
  const apiSpec = extractApiSpecification(semanticDoc);
  
  if (!apiSpec) {
    throw new Error(`No API specification found in document: ${urlOrId}`);
  }
  
  return apiSpec;
}

/**
 * Get entity relationships
 * @param {string} urlOrId - URL or ID of the document or entity
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - Entity relationships
 */
export async function getEntityRelationships(urlOrId, docManager) {
  console.error(chalk.blue(`Getting entity relationships for: ${urlOrId}`));
  
  const config = loadConfig(docManager);
  const dataDir = docManager.getDataDirectory();
  const allSemanticDocs = [];
  
  // Load all semantic documents
  for (const source of config.sources) {
    const sourceDir = getSourceDataDir(source.id, dataDir);
    const semanticDir = path.join(sourceDir, 'semantic');
    
    if (fs.existsSync(semanticDir)) {
      const files = fs.readdirSync(semanticDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const semanticDoc = JSON.parse(fs.readFileSync(path.join(semanticDir, file), 'utf8'));
          allSemanticDocs.push(semanticDoc);
        }
      }
    }
  }
  
  // Build relationship map
  const { buildRelationshipMap } = await import('./semantic-parser.js');
  const relationships = buildRelationshipMap(allSemanticDocs);
  
  // Find the target entity
  const pageId = urlOrId.length === 32 && /^[a-f0-9]+$/.test(urlOrId) ? urlOrId : createPageId(urlOrId);
  
  // Extract relationships for this entity
  const entityRelationships = {
    entityId: pageId,
    entityName: null,
    extends: [],
    extendedBy: [],
    uses: [],
    usedBy: [],
    requires: [],
    requiredBy: [],
    relatedTo: []
  };
  
  // Find the entity in the relationships
  for (const [entityId, targets] of Object.entries(relationships.extends || {})) {
    if (entityId.includes(pageId)) {
      entityRelationships.extends.push(...targets);
    }
    
    if (targets.includes(pageId)) {
      entityRelationships.extendedBy.push(entityId);
    }
  }
  
  for (const [entityId, targets] of Object.entries(relationships.uses || {})) {
    if (entityId.includes(pageId)) {
      entityRelationships.uses.push(...targets);
    }
    
    if (targets.includes(pageId)) {
      entityRelationships.usedBy.push(entityId);
    }
  }
  
  for (const [entityId, targets] of Object.entries(relationships.requires || {})) {
    if (entityId.includes(pageId)) {
      entityRelationships.requires.push(...targets);
    }
    
    if (targets.includes(pageId)) {
      entityRelationships.requiredBy.push(entityId);
    }
  }
  
  for (const [entityId, targets] of Object.entries(relationships.relatedTo || {})) {
    if (entityId.includes(pageId)) {
      entityRelationships.relatedTo.push(...targets);
    }
    
    if (targets.includes(pageId)) {
      entityRelationships.relatedTo.push(entityId);
    }
  }
  
  return entityRelationships;
}

/**
 * Perform semantic search
 * @param {string} query - Search query
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object[]>} - Search results
 */
export async function semanticSearch(query, docManager) {
  console.error(chalk.blue(`Performing semantic search for: ${query}`));
  
  const config = loadConfig(docManager);
  const dataDir = docManager.getDataDirectory();
  const allSemanticDocs = [];
  
  // Load all semantic documents
  for (const source of config.sources) {
    const sourceDir = getSourceDataDir(source.id, dataDir);
    const semanticDir = path.join(sourceDir, 'semantic');
    
    if (fs.existsSync(semanticDir)) {
      const files = fs.readdirSync(semanticDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const semanticDoc = JSON.parse(fs.readFileSync(path.join(semanticDir, file), 'utf8'));
          
          // Generate embeddings if not already present
          if (!semanticDoc.embeddings) {
            const { generateDocumentEmbeddings } = await import('./semantic-parser.js');
            const docWithEmbeddings = await generateDocumentEmbeddings(semanticDoc);
            
            // Save the document with embeddings
            fs.writeFileSync(
              path.join(semanticDir, file),
              JSON.stringify(docWithEmbeddings, null, 2)
            );
            
            allSemanticDocs.push(docWithEmbeddings);
          } else {
            allSemanticDocs.push(semanticDoc);
          }
        }
      }
    }
  }
  
  // Perform semantic search
  const { findSimilarSections } = await import('./embedding-utils.js');
  const results = await findSimilarSections(query, allSemanticDocs);
  
  return results;
}

/**
 * Search for API components
 * @param {string} query - Search query
 * @param {string} type - Component type (function, class, method)
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object[]>} - Search results
 */
export async function searchApiComponents(query, type, docManager) {
  console.error(chalk.blue(`Searching for API components: ${query}`));
  
  const config = loadConfig(docManager);
  const dataDir = docManager.getDataDirectory();
  const allSemanticDocs = [];
  
  // Load all semantic documents
  for (const source of config.sources) {
    const sourceDir = getSourceDataDir(source.id, dataDir);
    const semanticDir = path.join(sourceDir, 'semantic');
    
    if (fs.existsSync(semanticDir)) {
      const files = fs.readdirSync(semanticDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const semanticDoc = JSON.parse(fs.readFileSync(path.join(semanticDir, file), 'utf8'));
          allSemanticDocs.push(semanticDoc);
        }
      }
    }
  }
  
  // Filter API components by type if specified
  const results = [];
  
  for (const doc of allSemanticDocs) {
    if (!doc.apiComponents) continue;
    
    for (const component of doc.apiComponents) {
      // Filter by type if specified
      if (type && type !== 'all' && component.type !== type) {
        continue;
      }
      
      // Check if component matches query
      const componentName = component.name || '';
      const componentDesc = component.description || '';
      
      if (componentName.toLowerCase().includes(query.toLowerCase()) ||
          componentDesc.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          componentType: component.type,
          componentName,
          description: componentDesc,
          parameters: component.parameters,
          code: component.code,
          docId: doc.id,
          docTitle: doc.title,
          docUrl: doc.url
        });
      }
    }
  }
  
  // Sort results by relevance (exact name matches first)
  results.sort((a, b) => {
    const aExactMatch = a.componentName.toLowerCase() === query.toLowerCase();
    const bExactMatch = b.componentName.toLowerCase() === query.toLowerCase();
    
    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;
    
    return a.componentName.localeCompare(b.componentName);
  });
  
  return results;
}

/**
 * Find related content
 * @param {string} urlOrId - URL or ID of the document
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - Related content
 */
export async function findRelatedContent(urlOrId, docManager) {
  console.error(chalk.blue(`Finding related content for: ${urlOrId}`));
  
  // Get the document
  const document = docManager.getFullDocument(urlOrId);
  
  if (!document) {
    throw new Error(`Document not found: ${urlOrId}`);
  }
  
  // Get all documents
  const config = loadConfig(docManager);
  const allDocuments = [];
  
  for (const source of config.sources) {
    const documents = loadDocumentLookup(source.id, docManager);
    if (documents && documents.length > 0) {
      allDocuments.push(...documents);
    }
  }
  
  // Find related documents using embeddings
  const { findSimilarDocuments } = await import('./embedding-utils.js');
  const relatedDocs = await findSimilarDocuments(document.content, allDocuments, 5);
  
  // Get entity relationships
  let relationships = {};
  try {
    relationships = await getEntityRelationships(urlOrId, docManager);
  } catch (error) {
    console.error(`Error getting relationships: ${error.message}`);
  }
  
  return {
    sourceTitle: document.title,
    sourceUrl: document.url,
    relatedDocuments: relatedDocs.map(doc => ({
      title: doc.document.title,
      url: doc.document.url,
      score: doc.score,
      snippet: doc.document.originalParagraphs?.[0] || ''
    })),
    usedBy: relationships.usedBy || [],
    uses: relationships.uses || []
  };
}

// Helper functions

/**
 * Load configuration from documentation manager
 * @param {object} docManager - Documentation manager
 * @returns {object} - Configuration
 */
function loadConfig(docManager) {
  // This is a bit of a hack to access the config from the documentation manager
  // In a real implementation, we would refactor to share this functionality
  try {
    const sources = docManager.listDocumentationSources();
    const customLinks = docManager.listCustomLinks();
    return { sources, customLinks };
  } catch (error) {
    console.error('Error loading config:', error.message);
    return { sources: [], customLinks: [] };
  }
}

/**
 * Get source data directory
 * @param {string} sourceId - Source ID
 * @param {string} dataDir - Data directory
 * @returns {string} - Source data directory
 */
function getSourceDataDir(sourceId, dataDir) {
  return path.join(dataDir, sourceId);
}

/**
 * Load document lookup
 * @param {string} sourceId - Source ID
 * @param {object} docManager - Documentation manager
 * @returns {object[]} - Document lookup
 */
function loadDocumentLookup(sourceId, docManager) {
  const dataDir = docManager.getDataDirectory();
  const sourceDir = getSourceDataDir(sourceId, dataDir);
  const documentLookupPath = path.join(sourceDir, 'document-lookup.json');
  
  if (fs.existsSync(documentLookupPath)) {
    const documentLookupJson = fs.readFileSync(documentLookupPath, 'utf8');
    return JSON.parse(documentLookupJson);
  }
  
  return [];
}