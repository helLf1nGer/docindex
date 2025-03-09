// Example of using the DocIndex API programmatically

const {
  addDocumentationSource,
  addCustomLink,
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks
} = require('../src/index');

async function runExample() {
  console.log('DocIndex Basic Usage Example\n');

  try {
    // Add a custom documentation link
    console.log('Adding a custom documentation link...');
    const customLink = addCustomLink(
      'https://nodejs.org/en/docs/',
      'Node.js Documentation',
      ['nodejs', 'javascript', 'runtime']
    );
    console.log(`Added custom link: ${customLink.name}\n`);

    // Add another custom link
    console.log('Adding another custom documentation link...');
    const customLink2 = addCustomLink(
      'https://expressjs.com/en/4x/api.html',
      'Express.js API',
      ['expressjs', 'javascript', 'framework', 'api']
    );
    console.log(`Added custom link: ${customLink2.name}\n`);

    // List all custom links
    console.log('Listing all custom links:');
    const links = listCustomLinks();
    links.forEach(link => {
      console.log(`- ${link.name} (${link.url})`);
      console.log(`  Tags: ${link.tags.join(', ')}`);
    });
    console.log();

    // Search for documentation
    console.log('Searching for "javascript"...');
    const results = searchDocumentation('javascript');
    
    if (results.customLinkMatches.length > 0) {
      console.log(`Found ${results.customLinkMatches.length} matching custom links:`);
      results.customLinkMatches.forEach(link => {
        console.log(`- ${link.name} (${link.url})`);
      });
    } else {
      console.log('No matching custom links found.');
    }
    console.log();

    // Try to add a documentation source (this would normally require network access)
    console.log('Note: Adding a documentation source requires network access to index the content.');
    console.log('To add a documentation source, use:');
    console.log('addDocumentationSource("https://example.com/docs", "Example Docs", ["example", "docs"])');

  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

runExample();