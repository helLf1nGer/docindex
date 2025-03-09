#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the current directory
const currentDir = __dirname;

console.log('Installing docindex globally...');

try {
  // Create a symlink to make the package globally available
  execSync('npm link', { 
    cwd: currentDir,
    stdio: 'inherit'
  });
  
  console.log('\nSuccess! DocIndex has been installed globally.');
  console.log('You can now use the "docindex" command from anywhere.');
  console.log('\nTry running:');
  console.log('  docindex --help');
  console.log('  docindex list');
  console.log('  docindex search javascript');
} catch (error) {
  console.error('Error installing globally:', error.message);
  console.error('\nYou may need to run this script with administrator privileges.');
  process.exit(1);
}