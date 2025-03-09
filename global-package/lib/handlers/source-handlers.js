import chalk from 'chalk';

/**
 * Handle get document request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleGetDocument(args, docManager) {
  const { url_or_id } = args;
  console.error(chalk.blue(`Getting document content for: ${url_or_id}`));
  
  try {
    const document = docManager.getFullDocument(url_or_id);
    
    return {
      content: [{
        type: "text",
        text: `# ${document.title}\n\nSource: ${document.source}\nURL: ${document.url}\n\n${document.content}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}\n\nMake sure you're using a valid URL or document ID. You can find document URLs in search results.`
      }],
      isError: true
    };
  }
}

/**
 * Handle list pages request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleListPages(args, docManager) {
  const { source } = args;
  console.error(chalk.blue(`Listing pages for source: ${source}`));
  
  try {
    const result = docManager.getIndexedPages(source);
    
    // Format the pages list
    let output = `# Indexed Pages for ${result.name}\n\n`;
    output += `Source URL: ${result.url}\n`;
    output += `Total Pages: ${result.pageCount}\n`;
    output += `Last Indexed: ${new Date(result.indexedAt).toLocaleString()}\n\n`;
    
    // Group pages by URL path for better organization
    const groupedPages = {};
    
    result.pages.forEach(page => {
      try {
        const url = new URL(page.url);
        const pathParts = url.pathname.split('/').filter(p => p);
        
        // Use the first path part as the group
        const group = pathParts.length > 0 ? pathParts[0] : 'Root';
        
        if (!groupedPages[group]) {
          groupedPages[group] = [];
        }
        
        groupedPages[group].push(page);
      } catch (error) {
        // If URL parsing fails, put in 'Other' group
        if (!groupedPages['Other']) {
          groupedPages['Other'] = [];
        }
        
        groupedPages['Other'].push(page);
      }
    });
    
    // Output pages by group
    Object.keys(groupedPages).sort().forEach(group => {
      output += `## ${group}\n\n`;
      
      groupedPages[group].forEach((page, index) => {
        output += `${index + 1}. [${page.title || 'Untitled'}](${page.url})\n`;
        output += `   ID: ${page.id}\n\n`;
      });
    });
    
    // Add note about viewing full content
    output += `\n---\nTo view the full content of any document, use: DocIndex > get-document?url_or_id=URL_OR_ID`;
    
    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
}

/**
 * Handle get data directory request
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleGetDataDir(docManager) {
  const dataDir = docManager.getDataDirectory();
  console.error(chalk.blue(`Getting data directory path: ${dataDir}`));
  
  return {
    content: [{
      type: "text",
      text: `Indexed documentation is stored in: ${dataDir}\n\nYou can browse this directory to see all indexed content.`
    }]
  };
}

/**
 * Handle add source request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleAddSource(args, docManager) {
  const { url, name, tags = [], depth = 3, pages = 100 } = args;
  console.error(chalk.blue(`Adding documentation source: ${name} (${url})`));
  
  const source = await docManager.addDocumentationSource(url, name, tags, depth, pages);
  
  return {
    content: [{
      type: "text",
      text: `Added documentation source: ${source.name}\nURL: ${source.url}\nTags: ${source.tags.join(', ') || 'none'}\nPages indexed: ${source.pageCount || 0}`
    }]
  };
}

/**
 * Handle refresh source request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleRefreshSource(args, docManager) {
  const { name, depth = 3, pages = 100 } = args;
  console.error(chalk.blue(`Refreshing documentation source: ${name}`));
  
  const result = await docManager.updateDocumentation(name, depth, pages);
  
  return {
    content: [{
      type: "text",
      text: `Refreshed documentation source: ${name}\nPages indexed: ${result.pageCount || 0}\nLast updated: ${new Date().toLocaleString()}`
    }]
  };
}

/**
 * Handle refresh all sources request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleRefreshAll(args, docManager) {
  const { depth = 3, pages = 100 } = args;
  console.error(chalk.blue('Refreshing all documentation sources'));
  
  const sources = await docManager.listDocumentationSources();
  
  if (sources.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No documentation sources found to refresh."
      }]
    };
  }
  
  const results = [];
  
  for (const source of sources) {
    console.error(chalk.blue(`Refreshing documentation source: ${source.name}`));
    try {
      const result = await docManager.updateDocumentation(source.name, depth, pages);
      results.push({
        name: source.name,
        success: true,
        pageCount: result.pageCount || 0
      });
    } catch (error) {
      console.error(`Error refreshing ${source.name}:`, error.message);
      results.push({
        name: source.name,
        success: false,
        error: error.message
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  const summary = `Refreshed ${successCount} documentation sources (${failCount} failed)`;
  
  const details = results.map(result => {
    if (result.success) {
      return `✓ ${result.name}: ${result.pageCount} pages indexed`;
    } else {
      return `✗ ${result.name}: Failed - ${result.error}`;
    }
  }).join('\n');
  
  return {
    content: [{
      type: "text",
      text: `${summary}\n\n${details}`
    }]
  };
}

/**
 * Handle add link request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleAddLink(args, docManager) {
  const { url, name, tags = [] } = args;
  console.error(chalk.blue(`Adding custom link: ${name} (${url})`));
  
  const link = await docManager.addCustomLink(url, name, tags);
  
  return {
    content: [{
      type: "text",
      text: `Added custom link: ${link.name}\nURL: ${link.url}\nTags: ${link.tags.join(', ') || 'none'}`
    }]
  };
}

/**
 * Handle list sources request
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleListSources(docManager) {
  console.error(chalk.blue('Listing documentation sources'));
  
  const sources = await docManager.listDocumentationSources();
  
  if (sources.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No documentation sources found."
      }]
    };
  }
  
  const formattedSources = sources.map((source, index) => {
    const lastUpdated = new Date(source.lastUpdated).toLocaleString();
    return `${index + 1}. ${source.name}\n   URL: ${source.url}\n   Tags: ${source.tags.join(', ') || 'none'}\n   Pages indexed: ${source.pageCount || 0}\n   Last updated: ${lastUpdated}`;
  }).join('\n\n');
  
  return {
    content: [{
      type: "text",
      text: `Documentation Sources:\n\n${formattedSources}`
    }]
  };
}

/**
 * Handle list links request
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleListLinks(docManager) {
  console.error(chalk.blue('Listing custom links'));
  
  const links = await docManager.listCustomLinks();
  
  if (links.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No custom links found."
      }]
    };
  }
  
  const formattedLinks = links.map((link, index) => {
    return `${index + 1}. ${link.name}\n   URL: ${link.url}\n   Tags: ${link.tags.join(', ') || 'none'}`;
  }).join('\n\n');
  
  return {
    content: [{
      type: "text",
      text: `Custom Links:\n\n${formattedLinks}`
    }]
  };
}