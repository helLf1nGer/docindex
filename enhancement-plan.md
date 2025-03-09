# DocIndex Enhancement Plan

## Overview

This plan outlines the enhancements needed to make DocIndex capable of handling complex documentation sites like Google Maps. The focus is on implementing breadth-first crawling with rate limiting, while keeping all content stored locally.

## 1. Add Recursive Crawling with Breadth-First Approach

### New Functions to Add:

```javascript
// Main crawling function
async function crawlDocumentation(source, maxPages = 100, maxDepth = 3) {
  const visitedUrls = new Set();
  const queue = [{ url: source.url, depth: 0 }];
  const allPages = [];
  
  console.log(`Starting breadth-first crawl of ${source.url} (max ${maxPages} pages, depth ${maxDepth})`);
  
  while (queue.length > 0 && visitedUrls.size < maxPages) {
    const { url, depth } = queue.shift();
    
    if (visitedUrls.has(url) || depth > maxDepth) {
      continue;
    }
    
    console.log(`Crawling ${url} (depth: ${depth}, pages indexed: ${visitedUrls.size})`);
    
    try {
      // Add delay for rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch and process the page
      const pageData = await fetchAndProcessPage(url, source);
      allPages.push(pageData);
      visitedUrls.add(url);
      
      // Add all links from this page to the queue
      if (depth < maxDepth) {
        for (const link of pageData.links) {
          if (!visitedUrls.has(link.url) && isSameDomain(link.url, source.url)) {
            queue.push({ url: link.url, depth: depth + 1 });
          }
        }
      }
    } catch (error) {
      console.error(`Error crawling ${url}:`, error.message);
    }
  }
  
  return allPages;
}

// Helper function to check if a URL is from the same domain
function isSameDomain(url, baseUrl) {
  try {
    const urlObj = new URL(url);
    const baseUrlObj = new URL(baseUrl);
    return urlObj.hostname === baseUrlObj.hostname;
  } catch (error) {
    return false;
  }
}

// Enhanced page processing
async function fetchAndProcessPage(url, source) {
  const response = await axios.get(url);
  const html = response.data;
  const $ = cheerio.load(html);
  
  // Extract content
  const title = $('title').text().trim();
  const headings = extractHeadings($);
  const paragraphs = extractParagraphs($);
  const codeBlocks = extractCodeBlocks($);
  const links = extractLinks($, url);
  
  return {
    url,
    title,
    headings,
    paragraphs,
    codeBlocks,
    links,
    sourceId: source.id,
    indexedAt: new Date().toISOString()
  };
}

// Content extraction helpers
function extractHeadings($) {
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((i, el) => {
    headings.push({
      text: $(el).text().trim(),
      level: parseInt(el.tagName.substring(1)),
      id: $(el).attr('id') || `heading-${i}`
    });
  });
  return headings;
}

function extractParagraphs($) {
  const paragraphs = [];
  $('p').each((i, el) => {
    const text = $(el).text().trim();
    if (text) {
      paragraphs.push(text);
    }
  });
  return paragraphs;
}

function extractCodeBlocks($) {
  const codeBlocks = [];
  $('pre code').each((i, el) => {
    codeBlocks.push({
      code: $(el).text().trim(),
      language: $(el).attr('class') || 'text'
    });
  });
  return codeBlocks;
}

function extractLinks($, baseUrl) {
  const links = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try {
        links.push({
          text: $(el).text().trim(),
          url: new URL(href, baseUrl).toString()
        });
      } catch (error) {
        // Skip invalid URLs
      }
    }
  });
  return links;
}
```

## 2. Enhance Storage Structure

We need to modify how we store indexed documentation to handle multiple pages from the same source.

```javascript
// Save multiple pages from a source
async function saveIndexedPages(pages, source) {
  // Create a directory for this source
  const sourceDir = path.join(DATA_DIR, source.id);
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
  }
  
  // Save each page
  for (const page of pages) {
    const pageId = createPageId(page.url);
    const pagePath = path.join(sourceDir, `${pageId}.json`);
    fs.writeFileSync(pagePath, JSON.stringify(page, null, 2));
  }
  
  // Create an index file with metadata
  const indexFile = {
    id: source.id,
    name: source.name,
    url: source.url,
    pageCount: pages.length,
    pages: pages.map(page => ({
      url: page.url,
      title: page.title,
      id: createPageId(page.url)
    })),
    indexedAt: new Date().toISOString()
  };
  
  const indexPath = path.join(sourceDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(indexFile, null, 2));
  
  return indexFile;
}

// Helper to create a page ID from URL
function createPageId(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}
```

## 3. Enhance Search Functionality

We need to update the search function to look through all indexed pages for a source.

```javascript
// Enhanced search function
function searchDocumentation(query) {
  const config = loadConfig();
  const results = [];
  
  // Search in indexed documentation
  for (const source of config.sources) {
    const sourceDir = path.join(DATA_DIR, source.id);
    
    if (fs.existsSync(sourceDir)) {
      const indexPath = path.join(sourceDir, 'index.json');
      
      if (fs.existsSync(indexPath)) {
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const pageMatches = [];
        
        // Search through each page
        for (const pageInfo of indexData.pages) {
          const pagePath = path.join(sourceDir, `${pageInfo.id}.json`);
          
          if (fs.existsSync(pagePath)) {
            const pageData = JSON.parse(fs.readFileSync(pagePath, 'utf8'));
            const matches = {
              headings: [],
              paragraphs: [],
              codeBlocks: []
            };
            
            // Search in headings
            matches.headings = pageData.headings.filter(heading => 
              heading.text.toLowerCase().includes(query.toLowerCase())
            );
            
            // Search in paragraphs
            matches.paragraphs = pageData.paragraphs.filter(paragraph => 
              paragraph.toLowerCase().includes(query.toLowerCase())
            ).map(paragraph => ({
              text: paragraph,
              // Add context by including a snippet
              snippet: paragraph.length > 150 ? 
                paragraph.substring(0, 150) + '...' : 
                paragraph
            }));
            
            // Search in code blocks
            matches.codeBlocks = pageData.codeBlocks.filter(block => 
              block.code.toLowerCase().includes(query.toLowerCase())
            );
            
            if (matches.headings.length > 0 || 
                matches.paragraphs.length > 0 || 
                matches.codeBlocks.length > 0) {
              pageMatches.push({
                page: {
                  url: pageData.url,
                  title: pageData.title
                },
                matches
              });
            }
          }
        }
        
        if (pageMatches.length > 0) {
          results.push({
            source: {
              id: source.id,
              name: source.name,
              url: source.url
            },
            pageMatches
          });
        }
      }
    }
  }
  
  // Search in custom links (unchanged)
  const matchingCustomLinks = config.customLinks.filter(link => 
    link.name.toLowerCase().includes(query.toLowerCase()) ||
    (link.tags && link.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
  );
  
  return {
    documentationMatches: results,
    customLinkMatches: matchingCustomLinks
  };
}
```

## 4. Update CLI Interface

We need to update the CLI to support the new crawling functionality.

```javascript
// Add documentation source command (updated)
program
  .command('add')
  .description('Add a new documentation source')
  .option('-u, --url <url>', 'URL of the documentation')
  .option('-n, --name <name>', 'Name of the documentation source')
  .option('-t, --tags <tags>', 'Comma-separated list of tags', val => val.split(','))
  .option('-d, --depth <depth>', 'Maximum crawl depth', parseInt, 3)
  .option('-p, --pages <pages>', 'Maximum pages to crawl', parseInt, 100)
  .action(async (options) => {
    try {
      // If options are missing, prompt for them
      if (!options.url || !options.name) {
        const answers = await inquirer.prompt([
          // ... existing prompts ...
          {
            type: 'input',
            name: 'depth',
            message: 'Enter maximum crawl depth:',
            default: 3,
            when: !options.depth,
            filter: input => parseInt(input)
          },
          {
            type: 'input',
            name: 'pages',
            message: 'Enter maximum pages to crawl:',
            default: 100,
            when: !options.pages,
            filter: input => parseInt(input)
          }
        ]);
        
        // Merge answers with options
        options = { ...options, ...answers };
      }
      
      const spinner = ora('Adding documentation source...').start();
      
      const source = await addDocumentationSource(
        options.url,
        options.name,
        options.tags || [],
        options.depth,
        options.pages
      );
      
      spinner.succeed(`Documentation source "${source.name}" added successfully`);
      console.log(chalk.green('\nSource details:'));
      console.log(chalk.cyan(`Name: ${source.name}`));
      console.log(chalk.cyan(`URL: ${source.url}`));
      console.log(chalk.cyan(`Tags: ${source.tags.join(', ') || 'none'}`));
      console.log(chalk.cyan(`Pages indexed: ${source.pageCount || 0}`));
      console.log(chalk.cyan(`Added at: ${new Date(source.addedAt).toLocaleString()}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Update search command display
program
  .command('search <query>')
  .description('Search indexed documentation')
  .action((query) => {
    try {
      console.log(chalk.cyan(`Searching for "${query}"...`));
      
      const results = searchDocumentation(query);
      
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
            
            if (pageMatch.matches.headings.length > 0) {
              console.log(chalk.yellow('  Matching headings:'));
              pageMatch.matches.headings.forEach(heading => {
                console.log(`  - ${heading.text}`);
              });
            }
            
            if (pageMatch.matches.paragraphs.length > 0) {
              console.log(chalk.yellow('  Matching content:'));
              pageMatch.matches.paragraphs.forEach(paragraph => {
                console.log(`  - ${paragraph.snippet}`);
              });
            }
            
            if (pageMatch.matches.codeBlocks.length > 0) {
              console.log(chalk.yellow('  Matching code blocks:'));
              pageMatch.matches.codeBlocks.forEach(block => {
                console.log(`  - ${block.code.substring(0, 50)}${block.code.length > 50 ? '...' : ''}`);
              });
            }
          });
        });
      }
      
      // Display custom link matches (unchanged)
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
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });
```

## 5. Implementation Steps

1. Update the core indexing function to support crawling
2. Modify the storage structure to handle multiple pages
3. Enhance the search functionality to search across all pages
4. Update the CLI interface to support the new features
5. Add rate limiting to be respectful of documentation sites
6. Add error handling and logging for the crawling process
7. Update documentation to reflect the new features

## 6. Testing Plan

1. Test with small documentation sites first
2. Test with larger sites like Google Maps documentation
3. Test rate limiting to ensure we're being respectful
4. Test search functionality with various queries
5. Test error handling and recovery

## 7. Future Enhancements (Technical Debt)

1. Authentication support for protected documentation
2. Better handling of JavaScript-heavy sites
3. Improved content extraction for specific documentation formats
4. Export/import functionality for sharing indexed documentation
5. Web interface for easier interaction