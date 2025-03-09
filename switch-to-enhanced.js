#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the current directory
const currentDir = __dirname;

console.log('Switching DocIndex to Enhanced Mode...');

try {
  // Update the CLI symlink to point to the enhanced version
  const packageJsonPath = path.join(currentDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Backup the original bin configuration
  if (!packageJson.originalBin) {
    packageJson.originalBin = { ...packageJson.bin };
  }
  
  // Set the main docindex command to use the enhanced CLI
  packageJson.bin.docindex = 'src/enhanced-cli.js';
  
  // Write the updated package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  // If the package is globally installed, update the global link
  try {
    execSync('npm link', { 
      cwd: currentDir,
      stdio: 'inherit'
    });
    
    console.log('\nSuccess! DocIndex is now using the enhanced version.');
    console.log('You can now use the regular "docindex" command to access the enhanced features.');
    console.log('\nTry running:');
    console.log('  docindex --help');
  } catch (linkError) {
    console.error('Error updating global link:', linkError.message);
    console.error('\nYou may need to run this script with administrator privileges.');
  }
} catch (error) {
  console.error('Error switching to enhanced mode:', error.message);
  process.exit(1);
}