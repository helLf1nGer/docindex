/**
 * Run Debug Script
 * 
 * This script runs the debug-url-discovery.js test script to help diagnose
 * URL discovery issues in the crawler.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the debug script
const debugScriptPath = join(__dirname, 'services', 'crawler', 'test', 'debug-url-discovery.js');

console.log(`Running debug script: ${debugScriptPath}`);

// Spawn the node process to run the debug script
const child = spawn('node', [debugScriptPath], {
  stdio: 'inherit' // Inherit stdio to see output in the console
});

// Handle process events
child.on('error', (error) => {
  console.error(`Error running debug script: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`Debug script exited with code ${code}`);
  process.exit(code);
});