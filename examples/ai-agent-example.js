/**
 * Example of using DocIndex with an AI agent
 * 
 * This example shows how to:
 * 1. Connect to a running DocIndex server
 * 2. Search for documentation based on a user query
 * 3. Process the results
 * 4. Generate a response using the documentation
 * 
 * To run this example:
 * 1. Start the DocIndex server: npm run start:simple-server
 * 2. Run this script: node examples/ai-agent-example.js "your query"
 */

const http = require('http');
const url = require('url');

class DocIndexAIAgent {
  constructor(serverUrl = 'http://localhost:3000') {
    // Parse the server URL
    this.serverUrl = url.parse(serverUrl);
  }
  
  /**
   * Search documentation using DocIndex
   * @param {string} query - The search query
   * @returns {Promise<object>} - The search results
   */
  searchDocumentation(query) {
    return new Promise((resolve, reject) => {
      // Create the request options
      const options = {
        hostname: this.serverUrl.hostname,
        port: this.serverUrl.port,
        path: `/search?q=${encodeURIComponent(query)}`,
        method: 'GET'
      };
      
      // Make the request
      const req = http.request(options, (res) => {
        let data = '';
        
        // Collect the response data
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        // Process the response when it's complete
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            resolve(results);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });
      
      // Handle request errors
      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });
      
      // End the request
      req.end();
    });
  }
  
  /**
   * Extract relevant content from search results
   * @param {object} results - The search results
   * @returns {Array} - Array of relevant content items
   */
  extractRelevantContent(results) {
    const relevantContent = [];
    
    // Extract content from documentation matches
    for (const source of results.documentationMatches || []) {
      for (const pageMatch of source.pageMatches || []) {
        // Add page title and URL
        relevantContent.push({
          type: 'page',
          title: pageMatch.page.title,
          url: pageMatch.page.url,
          source: source.source.name
        });
        
        // Add matching headings
        for (const heading of pageMatch.matches.headings || []) {
          relevantContent.push({
            type: 'heading',
            text: heading.text,
            url: pageMatch.page.url,
            source: source.source.name
          });
        }
        
        // Add matching paragraphs
        for (const paragraph of pageMatch.matches.paragraphs || []) {
          relevantContent.push({
            type: 'paragraph',
            text: paragraph.text || paragraph.snippet,
            url: pageMatch.page.url,
            source: source.source.name
          });
        }
        
        // Add matching code blocks
        for (const codeBlock of pageMatch.matches.codeBlocks || []) {
          relevantContent.push({
            type: 'code',
            code: codeBlock.code,
            language: codeBlock.language,
            url: pageMatch.page.url,
            source: source.source.name
          });
        }
      }
    }
    
    // Extract content from custom link matches
    for (const link of results.customLinkMatches || []) {
      relevantContent.push({
        type: 'link',
        name: link.name,
        url: link.url,
        tags: link.tags
      });
    }
    
    return relevantContent;
  }
  
  /**
   * Generate a response using the documentation
   * @param {Array} relevantContent - Array of relevant content items
   * @param {string} query - The original query
   * @returns {string} - The generated response
   */
  generateResponse(relevantContent, query) {
    // In a real AI agent, this would use a language model
    // For this example, we'll just format the content
    
    let response = `I found the following information about "${query}":\n\n`;
    
    if (relevantContent.length === 0) {
      response = `I couldn't find any documentation about "${query}". Please try a different query.`;
    } else {
      // Group content by source
      const contentBySource = {};
      
      for (const content of relevantContent) {
        const sourceName = content.source || 'Custom Links';
        if (!contentBySource[sourceName]) {
          contentBySource[sourceName] = [];
        }
        contentBySource[sourceName].push(content);
      }
      
      // Format response
      for (const [source, contents] of Object.entries(contentBySource)) {
        response += `## ${source}\n\n`;
        
        for (const content of contents) {
          if (content.type === 'heading') {
            response += `### ${content.text}\n`;
          } else if (content.type === 'paragraph') {
            response += `${content.text}\n\n`;
          } else if (content.type === 'code') {
            response += `\`\`\`${content.language}\n${content.code}\n\`\`\`\n\n`;
          } else if (content.type === 'link') {
            response += `- [${content.name}](${content.url}) ${content.tags ? `(${content.tags.join(', ')})` : ''}\n`;
          } else if (content.type === 'page') {
            response += `[View full documentation](${content.url})\n\n`;
          }
        }
        
        response += '\n';
      }
    }
    
    return response;
  }
  
  /**
   * Process a user query
   * @param {string} query - The user query
   * @returns {Promise<string>} - The agent's response
   */
  async processUserQuery(query) {
    try {
      // Search for documentation related to the query
      const docResults = await this.searchDocumentation(query);
      
      // Extract relevant content
      const relevantContent = this.extractRelevantContent(docResults);
      
      // Generate a response
      return this.generateResponse(relevantContent, query);
    } catch (error) {
      return `Error processing query: ${error.message}`;
    }
  }
}

/**
 * Main function
 */
async function main() {
  // Get the query from command line arguments
  const query = process.argv[2] || 'javascript';
  
  console.log(`Processing query: "${query}"`);
  console.log('-----------------------------------');
  
  // Create the AI agent
  const agent = new DocIndexAIAgent();
  
  // Process the query
  const response = await agent.processUserQuery(query);
  
  // Display the response
  console.log(response);
}

// Run the main function
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});