// Example of using DocIndex as a library in another project

const {
  addDocumentationSource,
  addCustomLink,
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks,
  updateDocumentation,
  removeDocumentationSource,
  removeCustomLink
} = require('../src/index');

/**
 * This example shows how to integrate DocIndex into your own application
 * to manage and search documentation.
 */
async function documentationManager() {
  console.log('DocIndex Library Usage Example\n');

  // Add documentation sources
  async function addDocs() {
    try {
      // Add custom links for quick reference
      console.log('Adding documentation links...');
      
      // Add links to official documentation
      addCustomLink(
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        'MDN JavaScript',
        ['javascript', 'web', 'reference']
      );
      
      addCustomLink(
        'https://docs.python.org/3/',
        'Python Documentation',
        ['python', 'programming', 'reference']
      );
      
      // Add your team's internal documentation
      addCustomLink(
        'https://internal-wiki.example.com/api-guidelines',
        'Internal API Guidelines',
        ['internal', 'api', 'guidelines']
      );
      
      console.log('Documentation links added successfully!\n');
      
      // You can also add and index full documentation sources
      // This requires network access and will parse the documentation
      console.log('To add a full documentation source with indexing:');
      console.log('await addDocumentationSource("https://docs.example.com", "Example Docs", ["example"]);\n');
    } catch (error) {
      console.error(`Error adding documentation: ${error.message}`);
    }
  }

  // Search documentation
  function searchDocs(query) {
    try {
      console.log(`Searching for "${query}"...`);
      const results = searchDocumentation(query);
      
      // Process and display results
      if (results.documentationMatches.length === 0 && results.customLinkMatches.length === 0) {
        console.log('No results found.');
        return;
      }
      
      // Display custom link matches
      if (results.customLinkMatches.length > 0) {
        console.log(`\nFound ${results.customLinkMatches.length} matching links:`);
        results.customLinkMatches.forEach(link => {
          console.log(`- ${link.name}: ${link.url}`);
        });
      }
      
      // Display documentation matches
      if (results.documentationMatches.length > 0) {
        console.log(`\nFound ${results.documentationMatches.length} matching documentation sources:`);
        results.documentationMatches.forEach(match => {
          console.log(`- ${match.source.name}: ${match.source.url}`);
          
          if (match.matches.headings.length > 0) {
            console.log('  Matching sections:');
            match.matches.headings.slice(0, 3).forEach(heading => {
              console.log(`  * ${heading.text}`);
            });
          }
        });
      }
    } catch (error) {
      console.error(`Error searching documentation: ${error.message}`);
    }
  }

  // Integration with your application
  async function integrateWithApp() {
    // 1. Add documentation during app initialization
    await addDocs();
    
    // 2. Simulate user searching for documentation
    console.log('User searches for "javascript"');
    searchDocs('javascript');
    
    console.log('\nUser searches for "api"');
    searchDocs('api');
    
    // 3. Example of how to update documentation periodically
    console.log('\nYou can schedule regular updates with:');
    console.log('setInterval(async () => {');
    console.log('  const sources = listDocumentationSources();');
    console.log('  for (const source of sources) {');
    console.log('    await updateDocumentation(source.name);');
    console.log('  }');
    console.log('}, 86400000); // Update daily\n');
  }

  // Run the example
  await integrateWithApp();
}

// Execute the example
documentationManager().catch(error => {
  console.error('Error in documentation manager:', error);
});