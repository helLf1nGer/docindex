// Example of using the enhanced DocIndex to index Google Maps documentation

const {
  addDocumentationSource,
  searchDocumentation,
  listDocumentationSources
} = require('../src/enhanced-index');

async function indexGoogleMapsDocumentation() {
  console.log('DocIndex Google Maps Documentation Example\n');

  try {
    // Add Google Maps documentation source with crawling
    console.log('Adding Google Maps documentation source...');
    console.log('This will crawl the documentation site and may take some time.');
    console.log('Limited to 10 pages for this example, with a depth of 2.\n');
    
    const source = await addDocumentationSource(
      'https://developers.google.com/maps/documentation',
      'Google Maps',
      ['maps', 'google', 'api', 'geolocation'],
      2,  // depth
      10  // max pages
    );
    
    console.log(`Documentation source "${source.name}" added successfully`);
    console.log(`Pages indexed: ${source.pageCount}`);
    console.log(`URL: ${source.url}`);
    console.log(`Tags: ${source.tags.join(', ')}`);
    console.log(`Added at: ${new Date(source.addedAt).toLocaleString()}`);
    
    // Search for navigation-related information
    console.log('\nSearching for "navigation" in the indexed documentation...');
    const navigationResults = searchDocumentation('navigation');
    
    if (navigationResults.documentationMatches.length > 0) {
      console.log(`\nFound matches in ${navigationResults.documentationMatches.length} documentation sources:`);
      
      navigationResults.documentationMatches.forEach(result => {
        console.log(`\nSource: ${result.source.name}`);
        
        result.pageMatches.forEach(pageMatch => {
          console.log(`\nPage: ${pageMatch.page.title}`);
          console.log(`URL: ${pageMatch.page.url}`);
          
          if (pageMatch.matches.headings.length > 0) {
            console.log('\nMatching headings:');
            pageMatch.matches.headings.forEach(heading => {
              console.log(`- ${heading.text}`);
            });
          }
          
          if (pageMatch.matches.paragraphs.length > 0) {
            console.log('\nMatching content:');
            pageMatch.matches.paragraphs.forEach(paragraph => {
              console.log(`- ${paragraph.snippet}`);
            });
          }
        });
      });
    } else {
      console.log('No navigation-related content found.');
    }
    
    // Search for directions-related information
    console.log('\nSearching for "directions" in the indexed documentation...');
    const directionsResults = searchDocumentation('directions');
    
    if (directionsResults.documentationMatches.length > 0) {
      console.log(`\nFound matches in ${directionsResults.documentationMatches.length} documentation sources:`);
      
      directionsResults.documentationMatches.forEach(result => {
        console.log(`\nSource: ${result.source.name}`);
        
        result.pageMatches.forEach(pageMatch => {
          console.log(`\nPage: ${pageMatch.page.title}`);
          console.log(`URL: ${pageMatch.page.url}`);
          
          if (pageMatch.matches.headings.length > 0) {
            console.log('\nMatching headings:');
            pageMatch.matches.headings.forEach(heading => {
              console.log(`- ${heading.text}`);
            });
          }
          
          if (pageMatch.matches.paragraphs.length > 0) {
            console.log('\nMatching content:');
            pageMatch.matches.paragraphs.forEach(paragraph => {
              console.log(`- ${paragraph.snippet}`);
            });
          }
        });
      });
    } else {
      console.log('No directions-related content found.');
    }
    
    // List all indexed documentation sources
    console.log('\nListing all documentation sources:');
    const sources = listDocumentationSources();
    sources.forEach(source => {
      console.log(`\n- ${source.name}`);
      console.log(`  URL: ${source.url}`);
      console.log(`  Pages indexed: ${source.pageCount || 0}`);
      console.log(`  Tags: ${source.tags.join(', ')}`);
    });
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Run the example
indexGoogleMapsDocumentation().catch(error => {
  console.error('Error in example:', error);
});