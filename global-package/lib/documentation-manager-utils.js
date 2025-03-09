import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import crypto from 'crypto';

/**
 * Create a page ID from URL
 * @param {string} url - The URL
 * @returns {string} - The page ID
 */
export function createPageId(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

/**
 * Create a search index from documents
 * @param {object[]} documents - The documents to index
 * @returns {object} - The Fuse.js search index
 */
export function createSearchIndex(documents) {
  // Configure Fuse.js options for better search quality
  const options = {
    // Search in these fields
    keys: [
      { name: 'title', weight: 2.0 },
      { name: 'headings', weight: 1.5 },
      { name: 'content', weight: 1.0 },
      { name: 'tags', weight: 0.8 }
    ],
    // Fuzzy matching options - more strict for better quality
    includeScore: true,
    threshold: 0.4,        // Higher threshold = more strict matching
    distance: 50,          // Smaller distance = more exact matching
    minMatchCharLength: 3, // Longer minimum match = fewer false positives
    // Advanced options
    useExtendedSearch: false, // Simpler search for better results
    ignoreLocation: false,    // Consider location for better context
    findAllMatches: true
  };
  
  return new Fuse(documents, options);
}

/**
 * Prepare documents for indexing
 * @param {object[]} pages - The pages to prepare
 * @param {string} sourceName - The source name
 * @param {string} sourceUrl - The source URL
 * @param {string[]} tags - The source tags
 * @returns {object[]} - The prepared documents
 */
export function prepareDocumentsForIndexing(pages, sourceName, sourceUrl, tags) {
  return pages.map(page => {
    // Extract all text content
    const headingsText = page.headings.map(h => h.text).join(' ');
    
    // Store paragraphs separately for better snippet generation
    const paragraphs = page.paragraphs || [];
    const paragraphsText = paragraphs.join(' ');
    
    // Store code blocks separately
    const codeBlocks = page.codeBlocks || [];
    const codeText = codeBlocks.map(b => b.code).join(' ');
    
    // Combine all content with proper weighting
    const content = `${headingsText} ${paragraphsText} ${codeText}`;
    
    return {
      id: page.id || createPageId(page.url),
      title: page.title || '',
      url: page.url,
      headings: headingsText,
      content: content,
      source: sourceName,
      sourceUrl: sourceUrl,
      tags: tags.join(' '),
      // Store original data for better snippet generation
      originalHeadings: page.headings || [],
      originalParagraphs: paragraphs,
      originalCodeBlocks: codeBlocks
    };
  });
}

/**
 * Generate a snippet for search results
 * @param {object} document - The document
 * @param {string} query - The search query
 * @returns {string} - The generated snippet
 */
export function generateSnippet(document, query) {
  if (!document) return '';
  
  // Try to find a matching paragraph
  const paragraphs = document.originalParagraphs || [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
  
  // Find the best paragraph match
  let bestParagraph = '';
  let bestScore = 0;
  
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    
    // Score based on how many query terms appear in the paragraph
    let score = 0;
    const paragraphLower = paragraph.toLowerCase();
    
    for (const term of queryTerms) {
      if (paragraphLower.includes(term)) {
        // Give higher score for exact matches
        score += paragraphLower.split(term).length - 1;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestParagraph = paragraph;
    }
  }
  
  // If no good paragraph match, try headings
  if (!bestParagraph && document.originalHeadings && document.originalHeadings.length > 0) {
    for (const heading of document.originalHeadings) {
      if (!heading || !heading.text) continue;
      
      const headingText = heading.text;
      let matchesQuery = false;
      
      for (const term of queryTerms) {
        if (headingText.toLowerCase().includes(term)) {
          matchesQuery = true;
          break;
        }
      }
      
      if (matchesQuery) {
        bestParagraph = headingText;
        break;
      }
    }
  }
  
  // If still no match, use the first paragraph if available
  if (!bestParagraph && paragraphs.length > 0) {
    bestParagraph = paragraphs[0];
  }
  
  // Truncate if too long
  if (bestParagraph && bestParagraph.length > 250) {
    // Try to find a good truncation point (end of sentence)
    const sentenceEnd = bestParagraph.substring(0, 250).lastIndexOf('.');
    if (sentenceEnd > 150) {
      bestParagraph = bestParagraph.substring(0, sentenceEnd + 1);
    } else {
      bestParagraph = bestParagraph.substring(0, 250) + '...';
    }
  }
  
  // Highlight the query terms
  if (bestParagraph) {
    for (const term of queryTerms) {
      if (term.length > 2) { // Only highlight meaningful terms
        const regex = new RegExp(`(${term})`, 'gi');
        bestParagraph = bestParagraph.replace(regex, '**$1**');
      }
    }
  }
  
  return bestParagraph || 'No preview available';
}

/**
 * Find breadcrumbs for a document in the hierarchy
 * @param {object} hierarchy - The document hierarchy
 * @param {string} docId - The document ID
 * @param {string[]} path - The current path
 * @returns {string[]} - The breadcrumbs
 */
export function findBreadcrumbs(hierarchy, docId, path = []) {
  if (!hierarchy) return null;
  
  // Check if this node is the target
  if (hierarchy._meta && hierarchy._meta.id === docId) {
    return [...path, hierarchy._meta.title];
  }
  
  // Check children
  if (hierarchy._children) {
    for (const key in hierarchy._children) {
      const childPath = [...path, hierarchy._meta ? hierarchy._meta.title : key];
      const result = findBreadcrumbs(hierarchy._children[key], docId, childPath);
      if (result) return result;
    }
  }
  
  return null;
}

/**
 * Build document hierarchy from pages
 * @param {object[]} pages - The pages to build hierarchy from
 * @param {string} sourceName - The source name
 * @returns {object} - The document hierarchy
 */
export function buildDocumentHierarchy(pages, sourceName) {
  const hierarchy = {
    _meta: {
      title: sourceName,
      isRoot: true
    },
    _children: {}
  };
  
  pages.forEach(page => {
    try {
      if (!page.url) return;
      
      // Extract path components from URL
      const url = new URL(page.url);
      const pathParts = url.pathname.split('/').filter(p => p);
      
      // Build nested structure
      let current = hierarchy._children;
      pathParts.forEach((part, i) => {
        if (!current[part]) {
          current[part] = {
            _meta: {
              isLeaf: i === pathParts.length - 1,
              title: i === pathParts.length - 1 ? page.title : part,
              url: i === pathParts.length - 1 ? page.url : null,
              id: i === pathParts.length - 1 ? (page.id || createPageId(page.url)) : null
            },
            _children: {}
          };
        }
        current = current[part]._children;
      });
    } catch (error) {
      // Skip pages with invalid URLs
      console.error(`Error processing URL ${page.url}: ${error.message}`);
    }
  });
  
  return hierarchy;
}

/**
 * Format search results for display
 * @param {object[]} results - The search results from Fuse.js
 * @param {object} hierarchies - The document hierarchies
 * @param {string} query - The search query
 * @returns {object[]} - The formatted search results
 */
export function formatSearchResults(results, hierarchies, query) {
  // Group results by source
  const groupedResults = {};
  
  if (!results || results.length === 0) {
    return [];
  }
  
  results.forEach(result => {
    if (!result || !result.item) return;
    
    const doc = result.item;
    if (!doc.source) return;
    
    if (!groupedResults[doc.source]) {
      groupedResults[doc.source] = {
        name: doc.source,
        url: doc.sourceUrl,
        results: []
      };
    }
    
    // Find document in hierarchy
    const sourceHierarchy = hierarchies[doc.source];
    const breadcrumbs = sourceHierarchy ? 
      findBreadcrumbs(sourceHierarchy, doc.id) || [doc.source, doc.title] : 
      [doc.source, doc.title];
    
    groupedResults[doc.source].results.push({
      title: doc.title,
      url: doc.url,
      breadcrumbs: breadcrumbs,
      snippet: generateSnippet(doc, query),
      score: 1 - (result.score || 0) // Convert Fuse.js score (0 is perfect) to a 0-1 scale where 1 is best
    });
  });
  
  // Sort results by score within each group
  Object.values(groupedResults).forEach(group => {
    group.results.sort((a, b) => b.score - a.score);
    
    // Limit to top 5 results per source for better readability
    if (group.results.length > 5) {
      group.results = group.results.slice(0, 5);
    }
  });
  
  // Sort groups by their highest scoring result
  return Object.values(groupedResults)
    .sort((a, b) => {
      const aScore = a.results[0]?.score || 0;
      const bScore = b.results[0]?.score || 0;
      return bScore - aScore;
    });
}

/**
 * Extract document structure to preserve hierarchy
 * @param {object} $ - Cheerio instance
 * @returns {object[]} - Document structure
 */
export function extractDocumentStructure($) {
  const structure = [];
  let currentSection = null;
  
  $('h1, h2, h3, h4, h5, h6, p, pre, ul, ol, li').each((i, el) => {
    const tagName = el.tagName.toLowerCase();
    
    if (tagName.startsWith('h')) {
      const level = parseInt(tagName.substring(1));
      currentSection = {
        type: 'heading',
        level,
        text: $(el).text().trim(),
        children: []
      };
      structure.push(currentSection);
    } else if (currentSection) {
      if (tagName === 'p') {
        const text = $(el).text().trim();
        if (text) {
          currentSection.children.push({
            type: 'paragraph',
            text
          });
        }
      } else if (tagName === 'pre') {
        const code = $(el).text().trim();
        if (code) {
          currentSection.children.push({
            type: 'code',
            text: code
          });
        }
      } else if (tagName === 'ul' || tagName === 'ol') {
        const listItems = [];
        $(el).find('li').each((j, li) => {
          listItems.push($(li).text().trim());
        });
        if (listItems.length > 0) {
          currentSection.children.push({
            type: tagName === 'ul' ? 'unordered-list' : 'ordered-list',
            items: listItems
          });
        }
      }
    }
  });
  
  return structure;
}

/**
 * Format search results for MCP output
 * @param {object[]} groupedResults - The grouped search results
 * @returns {string} - The formatted output
 */
export function formatSearchResultsForMCP(groupedResults) {
  if (!groupedResults || groupedResults.length === 0) {
    return "No results found.";
  }
  
  let output = [];
  
  output.push(`Found matches in ${groupedResults.length} documentation sources:`);
  
  groupedResults.forEach((sourceGroup, sourceIndex) => {
    output.push(`\n${sourceIndex + 1}. ${sourceGroup.name} (${sourceGroup.url || 'No URL'})`);
    
    sourceGroup.results.forEach((result, resultIndex) => {
      // Format breadcrumbs
      const breadcrumbsText = result.breadcrumbs && result.breadcrumbs.length > 0 ? 
        result.breadcrumbs.join(' > ') : 
        `${sourceGroup.name} > ${result.title}`;
      
      output.push(`   ${String.fromCharCode(97 + resultIndex)}. ${result.title}`);
      output.push(`      Path: ${breadcrumbsText}`);
      output.push(`      URL: ${result.url}`);
      
      if (result.snippet) {
        output.push(`      ${result.snippet}`);
      }
    });
  });
  
  return output.join('\n');
}