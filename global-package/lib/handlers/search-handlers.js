import chalk from 'chalk';
import { formatSearchResultsForMCP } from '../documentation-manager-utils.js';
import { 
  semanticSearch, 
  searchApiComponents, 
  findRelatedContent 
} from '../semantic-manager.js';

/**
 * Handle basic search request
 * @param {object} args - Search arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleSearch(args, docManager) {
  const { query } = args;
  console.error(chalk.blue(`Searching for: ${query}`));
  
  const results = await docManager.searchDocumentation(query);
  
  // Format results for MCP response
  let output = results.documentationMatches;
  
  // Add custom links if any
  if (results.customLinkMatches && results.customLinkMatches.length > 0) {
    if (output && output.length > 0) {
      output += '\n\n';
    }
    
    output += `Found ${results.customLinkMatches.length} custom links:\n\n`;
    
    results.customLinkMatches.forEach((link, index) => {
      output += `${index + 1}. ${link.name} (${link.url})\n`;
      if (link.tags && link.tags.length > 0) {
        output += `   Tags: ${link.tags.join(', ')}\n`;
      }
    });
  }
  
  if (!output || output.length === 0) {
    output = "No results found.";
  } else {
    // Add a note about getting full document content
    output += '\n\n---\nTo view the full content of any document, use: DocIndex > get-document?url_or_id=URL_OR_ID';
  }
  
  return {
    content: [{
      type: "text",
      text: output
    }]
  };
}

/**
 * Handle semantic search request
 * @param {object} args - Search arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleSemanticSearch(args, docManager) {
  const { query } = args;
  console.error(chalk.blue(`Performing semantic search for: ${query}`));
  
  const semanticResults = await semanticSearch(query, docManager);
  
  if (!semanticResults || semanticResults.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No semantic search results found."
      }]
    };
  }
  
  // Format results for display
  let output = `# Semantic Search Results for "${query}"\n\n`;
  
  // Group by document
  const groupedResults = {};
  
  semanticResults.forEach(result => {
    if (!groupedResults[result.section.docId]) {
      groupedResults[result.section.docId] = {
        title: result.section.docTitle,
        url: result.section.docUrl,
        sections: []
      };
    }
    
    groupedResults[result.section.docId].sections.push({
      title: result.section.sectionTitle || 'Untitled Section',
      score: result.score
    });
  });
  
  // Format grouped results
  Object.entries(groupedResults).forEach(([docId, doc], index) => {
    output += `## ${index + 1}. ${doc.title}\n`;
    output += `URL: ${doc.url}\n\n`;
    
    doc.sections.forEach((section, sectionIndex) => {
      output += `${sectionIndex + 1}. ${section.title} (Relevance: ${Math.round(section.score * 100)}%)\n`;
    });
    
    output += '\n';
  });
  
  output += '---\nTo view the full content of any document, use: DocIndex > get-document?url_or_id=URL_OR_ID';
  
  return {
    content: [{
      type: "text",
      text: output
    }]
  };
}

/**
 * Handle API search request
 * @param {object} args - Search arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleApiSearch(args, docManager) {
  const { query, type } = args;
  console.error(chalk.blue(`Searching for API ${type || 'components'}: ${query}`));
  
  const apiResults = await searchApiComponents(query, type, docManager);
  
  if (!apiResults || apiResults.length === 0) {
    return {
      content: [{
        type: "text",
        text: `No API ${type || 'components'} found matching "${query}".`
      }]
    };
  }
  
  // Format results for display
  let output = `# API ${type || 'Component'} Search Results for "${query}"\n\n`;
  
  apiResults.forEach((result, index) => {
    output += `## ${index + 1}. ${result.componentType}: ${result.componentName}\n`;
    output += `Source: ${result.docTitle}\n`;
    output += `URL: ${result.docUrl}\n\n`;
    
    if (result.description) {
      output += `${result.description}\n\n`;
    }
    
    if (result.parameters && result.parameters.length > 0) {
      output += `### Parameters\n\n`;
      result.parameters.forEach(param => {
        output += `- \`${param.name}\`${param.type ? `: ${param.type}` : ''} ${param.required ? '(required)' : '(optional)'}\n`;
        if (param.description) {
          output += `  ${param.description}\n`;
        }
        if (param.defaultValue) {
          output += `  Default: \`${param.defaultValue}\`\n`;
        }
        output += '\n';
      });
    }
    
    if (result.code) {
      output += `\`\`\`\n${result.code}\n\`\`\`\n\n`;
    }
  });
  
  output += '---\nTo view the full content of any document, use: DocIndex > get-document?url_or_id=URL_OR_ID';
  
  return {
    content: [{
      type: "text",
      text: output
    }]
  };
}

/**
 * Handle related content search
 * @param {object} args - Search arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleRelatedContent(args, docManager) {
  const { url_or_id } = args;
  console.error(chalk.blue(`Finding related content for: ${url_or_id}`));
  
  const relatedContent = await findRelatedContent(url_or_id, docManager);
  
  if (!relatedContent || Object.keys(relatedContent).length === 0) {
    return {
      content: [{
        type: "text",
        text: `No related content found for "${url_or_id}".`
      }]
    };
  }
  
  // Format results for display
  let output = `# Related Content for ${relatedContent.sourceTitle || url_or_id}\n\n`;
  
  if (relatedContent.relatedDocuments && relatedContent.relatedDocuments.length > 0) {
    output += `## Related Documents\n\n`;
    
    relatedContent.relatedDocuments.forEach((doc, index) => {
      output += `${index + 1}. [${doc.title}](${doc.url}) (Relevance: ${Math.round(doc.score * 100)}%)\n`;
      if (doc.snippet) {
        output += `   ${doc.snippet}\n\n`;
      }
    });
  }
  
  if (relatedContent.usedBy && relatedContent.usedBy.length > 0) {
    output += `## Used By\n\n`;
    
    relatedContent.usedBy.forEach((item, index) => {
      output += `${index + 1}. [${item.title}](${item.url})\n`;
    });
    
    output += '\n';
  }
  
  if (relatedContent.uses && relatedContent.uses.length > 0) {
    output += `## Uses\n\n`;
    
    relatedContent.uses.forEach((item, index) => {
      output += `${index + 1}. [${item.title}](${item.url})\n`;
    });
    
    output += '\n';
  }
  
  output += '---\nTo view the full content of any document, use: DocIndex > get-document?url_or_id=URL_OR_ID';
  
  return {
    content: [{
      type: "text",
      text: output
    }]
  };
}