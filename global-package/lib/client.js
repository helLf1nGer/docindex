/**
 * DocIndex Client
 * 
 * This module provides functions for interacting with the DocIndex server.
 */

const http = require('http');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');

// Default server port
const DEFAULT_PORT = 3000;

// Get port from PID file or use default
function getServerPort() {
  const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.docindex-mcp');
  const PID_FILE = path.join(CONFIG_DIR, 'docindex-mcp.pid');
  
  // Just use the default port since we can't reliably get the port from the PID
  return DEFAULT_PORT;
}

/**
 * Make a request to the DocIndex server
 * @param {string} path - The API path
 * @param {string} method - The HTTP method
 * @param {object} data - The request data (for POST/PUT)
 * @returns {Promise<object>} - The response data
 */
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const port = getServerPort();
    
    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          if (responseData) {
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } else {
            resolve({});
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Add documentation source
 * @param {object} options - The documentation source options
 * @returns {Promise<void>}
 */
async function addDocumentation(options) {
  const spinner = ora('Adding documentation source...').start();
  
  try {
    if (!options.url || !options.name) {
      spinner.fail('URL and name are required.');
      return;
    }
    
    const data = {
      url: options.url,
      name: options.name,
      tags: options.tags ? options.tags.split(',').map(tag => tag.trim()) : [],
      depth: parseInt(options.depth) || 3,
      pages: parseInt(options.pages) || 100
    };
    
    const result = await makeRequest('/sources', 'POST', data);
    
    spinner.succeed(`Documentation source "${result.name}" added successfully.`);
    console.log(chalk.cyan(`Name: ${result.name}`));
    console.log(chalk.cyan(`URL: ${result.url}`));
    console.log(chalk.cyan(`Tags: ${result.tags.join(', ') || 'none'}`));
    console.log(chalk.cyan(`Pages indexed: ${result.pageCount || 0}`));
    console.log(chalk.cyan(`Added at: ${new Date(result.addedAt).toLocaleString()}`));
  } catch (error) {
    spinner.fail(`Failed to add documentation source: ${error.message}`);
  }
}

/**
 * Search documentation
 * @param {string} query - The search query
 * @returns {Promise<void>}
 */
async function searchDocumentation(query) {
  const spinner = ora(`Searching for "${query}"...`).start();
  
  try {
    const results = await makeRequest(`/search?q=${encodeURIComponent(query)}`);
    
    spinner.succeed(`Search results for "${query}"`);
    
    if (results.documentationMatches.length === 0 && results.customLinkMatches.length === 0) {
      console.log(chalk.yellow('No results found.'));
      return;
    }
    
    // Display documentation matches
    if (results.documentationMatches.length > 0) {
      console.log(chalk.green(`\nFound matches in ${results.documentationMatches.length} documentation sources:`));
      
      results.documentationMatches.forEach((result, index) => {
        console.log(chalk.cyan(`\n${index + 1}. ${result.source.name} (${result.source.url})`));
        
        result.pageMatches.forEach((pageMatch, pageIndex) => {
          console.log(chalk.yellow(`  Page: ${pageMatch.page.title}`));
          console.log(`  URL: ${pageMatch.page.url}`);
          
          if (pageMatch.matches.headings && pageMatch.matches.headings.length > 0) {
            console.log(chalk.yellow('  Matching headings:'));
            pageMatch.matches.headings.forEach(heading => {
              console.log(`  - ${heading.text}`);
            });
          }
          
          if (pageMatch.matches.paragraphs && pageMatch.matches.paragraphs.length > 0) {
            console.log(chalk.yellow('  Matching content:'));
            pageMatch.matches.paragraphs.forEach(paragraph => {
              console.log(`  - ${paragraph.snippet || paragraph.text}`);
            });
          }
          
          if (pageMatch.matches.codeBlocks && pageMatch.matches.codeBlocks.length > 0) {
            console.log(chalk.yellow('  Matching code blocks:'));
            pageMatch.matches.codeBlocks.forEach(block => {
              console.log(`  - ${block.code.substring(0, 50)}${block.code.length > 50 ? '...' : ''}`);
            });
          }
        });
      });
    }
    
    // Display custom link matches
    if (results.customLinkMatches.length > 0) {
      console.log(chalk.green(`\nFound ${results.customLinkMatches.length} custom links:`));
      
      results.customLinkMatches.forEach((link, index) => {
        console.log(chalk.cyan(`\n${index + 1}. ${link.name} (${link.url})`));
        if (link.tags && link.tags.length > 0) {
          console.log(`  Tags: ${link.tags.join(', ')}`);
        }
      });
    }
  } catch (error) {
    spinner.fail(`Failed to search documentation: ${error.message}`);
  }
}

/**
 * List documentation sources
 * @returns {Promise<void>}
 */
async function listDocumentation() {
  const spinner = ora('Listing documentation sources...').start();
  
  try {
    const sources = await makeRequest('/sources');
    const customLinks = await makeRequest('/links');
    
    spinner.succeed('Documentation sources and custom links');
    
    if (sources.length === 0 && customLinks.length === 0) {
      console.log(chalk.yellow('No documentation sources or custom links found.'));
      return;
    }
    
    // Display documentation sources
    if (sources.length > 0) {
      console.log(chalk.green(`\nDocumentation Sources (${sources.length}):`));
      
      sources.forEach((source, index) => {
        console.log(chalk.cyan(`\n${index + 1}. ${source.name}`));
        console.log(`  URL: ${source.url}`);
        if (source.tags && source.tags.length > 0) {
          console.log(`  Tags: ${source.tags.join(', ')}`);
        }
        console.log(`  Pages indexed: ${source.pageCount || 0}`);
        console.log(`  Added: ${new Date(source.addedAt).toLocaleString()}`);
        console.log(`  Last Updated: ${new Date(source.lastUpdated).toLocaleString()}`);
      });
    }
    
    // Display custom links
    if (customLinks.length > 0) {
      console.log(chalk.green(`\nCustom Links (${customLinks.length}):`));
      
      customLinks.forEach((link, index) => {
        console.log(chalk.cyan(`\n${index + 1}. ${link.name}`));
        console.log(`  URL: ${link.url}`);
        if (link.tags && link.tags.length > 0) {
          console.log(`  Tags: ${link.tags.join(', ')}`);
        }
        console.log(`  Added: ${new Date(link.addedAt).toLocaleString()}`);
      });
    }
  } catch (error) {
    spinner.fail(`Failed to list documentation: ${error.message}`);
  }
}

module.exports = {
  addDocumentation,
  searchDocumentation,
  listDocumentation
};