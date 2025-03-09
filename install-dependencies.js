#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Installing DocIndex dependencies...');

try {
  // Read package.json to get dependencies
  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Get dependencies
  const dependencies = packageJson.dependencies || {};
  
  // Install each dependency
  Object.entries(dependencies).forEach(([name, version]) => {
    console.log(`Installing ${name}@${version}...`);
    try {
      execSync(`npm install ${name}@${version}`, { stdio: 'inherit' });
    } catch (error) {
      console.error(`Error installing ${name}: ${error.message}`);
    }
  });
  
  console.log('\nAll dependencies installed successfully!');
  console.log('\nYou can now run the setup and start the server:');
  console.log('  npm run setup-and-start');
  
} catch (error) {
  console.error(`Error installing dependencies: ${error.message}`);
  process.exit(1);
}