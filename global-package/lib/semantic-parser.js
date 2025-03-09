import * as cheerio from 'cheerio';
import { createPageId } from './documentation-manager-utils.js';
import { createEmbedding } from './embedding-utils.js';

/**
 * Parses documentation into semantically meaningful components
 * @param {string} html - HTML content to parse
 * @param {string} url - URL of the document
 * @param {string} sourceId - ID of the source
 * @returns {object} - Parsed semantic document
 */
export function parseDocumentSemantics(html, url, sourceId) {
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  
  // Extract semantic components
  const apiComponents = extractApiComponents($);
  const codeExamples = extractCodeExamples($);
  const conceptualSections = extractConceptualSections($);
  const procedureSteps = extractProcedureSteps($);
  const warnings = extractWarningsAndNotes($, 'warning');
  const notes = extractWarningsAndNotes($, 'note');
  
  return {
    id: createPageId(url),
    url,
    title,
    sourceId,
    apiComponents,
    codeExamples,
    conceptualSections,
    procedureSteps,
    warnings,
    notes,
    indexedAt: new Date().toISOString()
  };
}

/**
 * Extract API components (functions, methods, classes, etc.)
 * @param {object} $ - Cheerio instance
 * @returns {object[]} - Extracted API components
 */
function extractApiComponents($) {
  const components = [];
  
  // Look for function signatures in pre/code blocks
  $('pre code').each((i, el) => {
    const code = $(el).text().trim();
    
    // Try to identify function signatures
    const functionMatch = code.match(/function\s+(\w+)\s*\((.*?)\)/);
    const methodMatch = code.match(/(\w+)\s*\.\s*(\w+)\s*\((.*?)\)/);
    const classMatch = code.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?/);
    
    if (functionMatch) {
      components.push({
        type: 'function',
        name: functionMatch[1],
        parameters: parseParameters(functionMatch[2]),
        code: code,
        description: findDescriptionForElement($(el).parent(), $)
      });
    } else if (methodMatch) {
      components.push({
        type: 'method',
        object: methodMatch[1],
        name: methodMatch[2],
        parameters: parseParameters(methodMatch[3]),
        code: code,
        description: findDescriptionForElement($(el).parent(), $)
      });
    } else if (classMatch) {
      components.push({
        type: 'class',
        name: classMatch[1],
        extends: classMatch[2] || null,
        code: code,
        description: findDescriptionForElement($(el).parent(), $)
      });
    }
  });
  
  // Look for parameter tables
  $('table').each((i, table) => {
    const headers = [];
    let isParamTable = false;
    
    // Check if this looks like a parameter table
    $(table).find('th').each((j, th) => {
      const header = $(th).text().trim().toLowerCase();
      headers.push(header);
      if (header === 'parameter' || header === 'param' || header === 'name') {
        isParamTable = true;
      }
    });
    
    if (isParamTable) {
      const params = [];
      $(table).find('tr').each((j, tr) => {
        if (j === 0) return; // Skip header row
        
        const cells = $(tr).find('td');
        if (cells.length < 2) return;
        
        const param = {
          name: $(cells[0]).text().trim(),
          description: $(cells[1]).text().trim(),
          type: cells.length > 2 ? $(cells[2]).text().trim() : null,
          required: cells.length > 3 ? $(cells[3]).text().trim().toLowerCase() === 'yes' : null
        };
        
        params.push(param);
      });
      
      if (params.length > 0) {
        components.push({
          type: 'parameters',
          params: params,
          description: findDescriptionForElement($(table), $)
        });
      }
    }
  });
  
  return components;
}

/**
 * Parse parameters from a function signature
 * @param {string} paramsString - Parameter string from function signature
 * @returns {object[]} - Parsed parameters
 */
function parseParameters(paramsString) {
  if (!paramsString || paramsString.trim() === '') {
    return [];
  }
  
  return paramsString.split(',').map(param => {
    param = param.trim();
    const parts = param.split('=');
    const name = parts[0].trim();
    const defaultValue = parts.length > 1 ? parts[1].trim() : null;
    
    // Try to extract type from JSDoc-style comments or TypeScript annotations
    let type = null;
    const typeMatch = name.match(/(\w+)\s*:\s*(\w+)/);
    if (typeMatch) {
      type = typeMatch[2];
    }
    
    return {
      name: name.replace(/\s*:\s*\w+/, ''), // Remove type annotation if present
      type,
      defaultValue
    };
  });
}

/**
 * Find description text for an element
 * @param {object} element - Element to find description for
 * @param {object} $ - Cheerio instance
 * @returns {string} - Description text
 */
function findDescriptionForElement(element, $) {
  // Look for preceding paragraph
  const prevP = element.prev('p');
  if (prevP.length > 0) {
    return prevP.text().trim();
  }
  
  // Look for following paragraph
  const nextP = element.next('p');
  if (nextP.length > 0) {
    return nextP.text().trim();
  }
  
  // Look for parent's description
  const parent = element.parent();
  if (parent.length > 0) {
    const parentPrev = parent.prev('p');
    if (parentPrev.length > 0) {
      return parentPrev.text().trim();
    }
  }
  
  return '';
}

/**
 * Extract code examples
 * @param {object} $ - Cheerio instance
 * @returns {object[]} - Extracted code examples
 */
function extractCodeExamples($) {
  const examples = [];
  
  // Look for code blocks that appear to be examples
  $('pre code').each((i, el) => {
    const code = $(el).text().trim();
    if (!code) return;
    
    // Skip if this looks like a function signature or definition
    if (code.match(/^(function|class|interface|type|const|let|var)\s+\w+/)) {
      return;
    }
    
    // Get language from class
    let language = 'text';
    const classAttr = $(el).attr('class');
    if (classAttr) {
      const langMatch = classAttr.match(/language-(\w+)/);
      if (langMatch) {
        language = langMatch[1];
      }
    }
    
    // Find description or title
    let title = '';
    let description = '';
    
    // Check for preceding heading
    const prevH = $(el).parent().prev('h1, h2, h3, h4, h5, h6');
    if (prevH.length > 0 && prevH.text().toLowerCase().includes('example')) {
      title = prevH.text().trim();
    }
    
    // Check for preceding paragraph
    const prevP = $(el).parent().prev('p');
    if (prevP.length > 0) {
      description = prevP.text().trim();
    }
    
    examples.push({
      code,
      language,
      title: title || `Example ${i + 1}`,
      description
    });
  });
  
  return examples;
}

/**
 * Extract conceptual sections (explanatory content)
 * @param {object} $ - Cheerio instance
 * @returns {object[]} - Extracted conceptual sections
 */
function extractConceptualSections($) {
  const sections = [];
  let currentSection = null;
  
  $('h1, h2, h3, h4, h5, h6, p').each((i, el) => {
    const tagName = el.tagName.toLowerCase();
    
    if (tagName.startsWith('h')) {
      // Start a new section
      const level = parseInt(tagName.substring(1));
      const text = $(el).text().trim();
      
      // Skip API reference sections
      if (text.toLowerCase().includes('api reference') || 
          text.toLowerCase().includes('method reference') ||
          text.toLowerCase().includes('function reference')) {
        currentSection = null;
        return;
      }
      
      currentSection = {
        title: text,
        level,
        content: '',
        subsections: []
      };
      
      sections.push(currentSection);
    } else if (tagName === 'p' && currentSection) {
      // Add paragraph to current section
      const text = $(el).text().trim();
      if (text) {
        if (currentSection.content) {
          currentSection.content += '\n\n' + text;
        } else {
          currentSection.content = text;
        }
      }
    }
  });
  
  return sections;
}

/**
 * Extract procedure steps (how-to instructions)
 * @param {object} $ - Cheerio instance
 * @returns {object[]} - Extracted procedure steps
 */
function extractProcedureSteps($) {
  const procedures = [];
  
  // Look for ordered lists that might be procedures
  $('ol').each((i, ol) => {
    const steps = [];
    
    $(ol).find('li').each((j, li) => {
      steps.push($(li).text().trim());
    });
    
    if (steps.length > 0) {
      // Find a title for this procedure
      let title = '';
      const prevH = $(ol).prev('h1, h2, h3, h4, h5, h6');
      if (prevH.length > 0) {
        title = prevH.text().trim();
      }
      
      // Find a description
      let description = '';
      const prevP = $(ol).prev('p');
      if (prevP.length > 0) {
        description = prevP.text().trim();
      }
      
      procedures.push({
        title: title || `Procedure ${i + 1}`,
        description,
        steps
      });
    }
  });
  
  return procedures;
}

/**
 * Extract warnings and notes
 * @param {object} $ - Cheerio instance
 * @param {string} type - Type of notice ('warning' or 'note')
 * @returns {object[]} - Extracted warnings or notes
 */
function extractWarningsAndNotes($, type) {
  const notices = [];
  
  // Common class names for warnings and notes
  const classSelectors = type === 'warning' 
    ? '.warning, .caution, .alert, .danger, [role="alert"]'
    : '.note, .info, .tip, .information, [role="note"]';
  
  $(classSelectors).each((i, el) => {
    notices.push({
      text: $(el).text().trim(),
      html: $(el).html()
    });
  });
  
  // Look for paragraphs that start with "Note:" or "Warning:"
  $('p').each((i, el) => {
    const text = $(el).text().trim();
    const lowerText = text.toLowerCase();
    
    if ((type === 'note' && lowerText.startsWith('note:')) ||
        (type === 'warning' && (lowerText.startsWith('warning:') || lowerText.startsWith('caution:')))) {
      notices.push({
        text,
        html: $(el).html()
      });
    }
  });
  
  return notices;
}

/**
 * Extract API specification from semantic document
 * @param {object} semanticDoc - Semantic document
 * @returns {object} - API specification
 */
export function extractApiSpecification(semanticDoc) {
  if (!semanticDoc || !semanticDoc.apiComponents) {
    return null;
  }
  
  const spec = {
    endpoints: [],
    types: [],
    classes: [],
    functions: []
  };
  
  semanticDoc.apiComponents.forEach(component => {
    if (component.type === 'function') {
      spec.functions.push({
        name: component.name,
        parameters: component.parameters,
        description: component.description,
        source: semanticDoc.url
      });
    } else if (component.type === 'class') {
      spec.classes.push({
        name: component.name,
        extends: component.extends,
        description: component.description,
        source: semanticDoc.url
      });
    } else if (component.type === 'method' && component.object.toLowerCase() === 'api') {
      // This might be a REST API endpoint
      spec.endpoints.push({
        name: component.name,
        parameters: component.parameters,
        description: component.description,
        source: semanticDoc.url
      });
    }
  });
  
  return spec;
}

/**
 * Build relationship map between documentation entities
 * @param {object[]} semanticDocs - Semantic documents
 * @returns {object} - Relationship map
 */
export function buildRelationshipMap(semanticDocs) {
  const relationships = {
    uses: {}, // entity A uses entity B
    extends: {}, // entity A extends entity B
    requires: {}, // entity A requires entity B
    replaces: {}, // entity A replaces entity B
    relatedTo: {} // entity A is related to entity B
  };
  
  // Build entity lookup for quick reference
  const entities = {};
  
  semanticDocs.forEach(doc => {
    // Add API components as entities
    doc.apiComponents.forEach(component => {
      const entityId = `${component.type}:${component.name}`;
      entities[entityId] = {
        type: component.type,
        name: component.name,
        docId: doc.id,
        url: doc.url
      };
      
      // Check for extends relationships in classes
      if (component.type === 'class' && component.extends) {
        const extendsId = `class:${component.extends}`;
        if (!relationships.extends[entityId]) {
          relationships.extends[entityId] = [];
        }
        relationships.extends[entityId].push(extendsId);
      }
    });
  });
  
  // Analyze code examples to find usage relationships
  semanticDocs.forEach(doc => {
    doc.codeExamples.forEach(example => {
      // Look for entity usage in code examples
      Object.keys(entities).forEach(entityId => {
        const entity = entities[entityId];
        
        // Simple check: if entity name appears in code
        if (example.code.includes(entity.name)) {
          // This is a potential usage relationship
          const docEntityId = `doc:${doc.id}`;
          
          if (!relationships.uses[docEntityId]) {
            relationships.uses[docEntityId] = [];
          }
          
          if (!relationships.uses[docEntityId].includes(entityId)) {
            relationships.uses[docEntityId].push(entityId);
          }
        }
      });
    });
  });
  
  return relationships;
}

/**
 * Generate contextual embeddings for semantic document components
 * @param {object} semanticDoc - Semantic document
 * @returns {object} - Document with embeddings
 */
export async function generateDocumentEmbeddings(semanticDoc) {
  if (!semanticDoc) return null;
  
  const embeddings = {
    document: null,
    sections: [],
    apiComponents: [],
    codeExamples: []
  };
  
  // Generate document-level embedding
  const documentText = `${semanticDoc.title}\n\n${semanticDoc.conceptualSections.map(s => s.content).join('\n\n')}`;
  embeddings.document = await createEmbedding(documentText);
  
  // Generate section-level embeddings
  for (const section of semanticDoc.conceptualSections) {
    const sectionText = `${section.title}\n\n${section.content}`;
    const embedding = await createEmbedding(sectionText);
    
    embeddings.sections.push({
      title: section.title,
      embedding
    });
  }
  
  // Generate API component embeddings
  for (const component of semanticDoc.apiComponents) {
    const componentText = `${component.type} ${component.name}\n\n${component.description}\n\n${component.code || ''}`;
    const embedding = await createEmbedding(componentText);
    
    embeddings.apiComponents.push({
      type: component.type,
      name: component.name,
      embedding
    });
  }
  
  // Generate code example embeddings
  for (const example of semanticDoc.codeExamples) {
    const exampleText = `${example.title}\n\n${example.description}\n\n${example.code}`;
    const embedding = await createEmbedding(exampleText);
    
    embeddings.codeExamples.push({
      title: example.title,
      embedding
    });
  }
  
  return {
    ...semanticDoc,
    embeddings
  };
}