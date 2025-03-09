#!/usr/bin/env node

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('DocIndex Documentation Crawler Test');
console.log('==================================');
console.log('\nThis script will:');
console.log('1. Add MDN Web Docs as a documentation source');
console.log('2. Search for "javascript" related information');
console.log('3. Search for "html" related information');
console.log('\nNote: This will crawl the documentation site and may take some time.');
console.log('Limited to 5 pages for this quick test, with a depth of 2.\n');

rl.question('Press Enter to continue or Ctrl+C to cancel...', () => {
  try {
    console.log('\nAdding MDN Web Docs documentation source...');
    
    // Generate a unique name with timestamp
    const uniqueName = `MDN JavaScript Guide ${Date.now()}`;
    
    // Use the enhanced CLI to add MDN Web Docs documentation
    execSync(
      `node src/enhanced-cli.js add --url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide --name "${uniqueName}" --tags javascript,web,mdn --depth 2 --pages 5`,
      { stdio: 'inherit' }
    );
    
    console.log('\nSearching for "function" in the indexed documentation...');
    execSync('node src/enhanced-cli.js search function', { stdio: 'inherit' });
    
    console.log('\nSearching for "object" in the indexed documentation...');
    execSync('node src/enhanced-cli.js search object', { stdio: 'inherit' });
    
    console.log('\nListing all documentation sources:');
    execSync('node src/enhanced-cli.js list', { stdio: 'inherit' });
    
    console.log('\nTest completed successfully!');
    console.log('\nYou can now use the enhanced DocIndex to search for any information in the documentation.');
    console.log('Try running:');
    console.log('  node src/enhanced-cli.js search "your search term"');
    
    rl.close();
  } catch (error) {
    console.error('\nError during test:', error.message);
    rl.close();
    process.exit(1);
  }
});