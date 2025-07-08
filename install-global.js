#!/usr/bin/env node
/**
 * Script to install the package globally
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

/**
 * Install the package globally
 */
async function installGlobally() {
  try {
    console.log('Installing DocSI globally...');
    const packageDir = join(__dirname, '.');
    const { stdout } = await execPromise(`npm install -g ${packageDir}`);
    console.log('Successfully installed DocSI globally');
    console.log(stdout);
    console.log('\nYou can now use docsi-server, docsi-discover, docsi-search, and other commands.');
  } catch (error) {
    console.error('Error installing globally:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the installation
installGlobally();