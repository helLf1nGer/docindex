#!/usr/bin/env node

/**
 * DocIndex MCP Global Installation Script
 * 
 * This script installs DocIndex MCP globally and sets it up for use with MCP-enabled IDEs.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.docindex-mcp');
const ENHANCED_INDEX_PATH = path.join(__dirname, 'lib', 'enhanced-index.js');

console.log('DocIndex MCP Global Installation');
console.log('===============================');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Main installation function
async function install() {
  try {
    // Step 1: Install dependencies
    console.log('\nStep 1: Installing dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    
    // Step 2: Copy enhanced-index.js if available
    console.log('\nStep 2: Setting up DocIndex core...');
    const sourceEnhancedIndex = path.join(__dirname, '..', 'src', 'enhanced-index.js');
    
    if (fs.existsSync(sourceEnhancedIndex)) {
      fs.copyFileSync(sourceEnhancedIndex, ENHANCED_INDEX_PATH);
      console.log('- Enhanced index module copied successfully.');
    } else {
      console.log('- Enhanced index module not found. Using minimal implementation.');
    }
    
    // Step 3: Install globally
    console.log('\nStep 3: Installing DocIndex MCP globally...');
    execSync('npm install -g', { stdio: 'inherit', cwd: __dirname });
    
    // Step 4: Ask to start the server
    const answer = await askQuestion('\nDo you want to start the DocIndex MCP server now? (y/n): ');
    
    if (answer.toLowerCase() === 'y') {
      console.log('\nStarting DocIndex MCP server...');
      execSync('docindex-mcp start --daemon', { stdio: 'inherit' });
    } else {
      console.log('\nYou can start the server later with:');
      console.log('  docindex-mcp start');
    }
    
    console.log('\nInstallation completed successfully!');
    console.log('\nUsage:');
    console.log('  docindex-mcp start    - Start the server');
    console.log('  docindex-mcp stop     - Stop the server');
    console.log('  docindex-mcp status   - Check server status');
    console.log('  docindex-mcp add      - Add documentation source');
    console.log('  docindex-mcp search   - Search documentation');
    console.log('  docindex-mcp list     - List documentation sources');
    console.log('\nIn MCP-enabled IDEs:');
    console.log('  DocIndex > search?q=your_query');
    
  } catch (error) {
    console.error(`\nError during installation: ${error.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Helper function to ask a question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Run the installation
install();