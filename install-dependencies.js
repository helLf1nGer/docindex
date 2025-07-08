#!/usr/bin/env node
/**
 * Script to install dependencies with error handling
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Install a dependency
 * @param {string} name - The name of the dependency to install
 * @returns {Promise<void>}
 */
async function installDependency(name) {
  try {
    console.log(`Installing ${name}...`);
    const { stdout } = await execPromise(`npm install ${name}`);
    console.log(`Successfully installed ${name}`);
    console.log(stdout);
  } catch (error) {
    console.error(`Error installing ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Main function to install all dependencies
async function installDependencies() {
  try {
    await installDependency('@modelcontextprotocol/sdk');
    await installDependency('axios');
    await installDependency('cheerio');
    await installDependency('dotenv');
    await installDependency('fuse.js');
    console.log('All dependencies installed successfully!');
  } catch (error) {
    console.error(`Error installing dependencies: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the installation
installDependencies();