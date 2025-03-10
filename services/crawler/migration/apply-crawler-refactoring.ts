#!/usr/bin/env node

/**
 * Migration script to apply the CrawlerService refactoring
 * 
 * This script handles the migration from the monolithic CrawlerService
 * to the new component-based architecture.
 */

import * as fs from 'fs';
import * as path from 'path';

// Paths
const BASE_PATH = path.resolve(__dirname, '..');
const ORIGINAL_FILE = path.join(BASE_PATH, 'domain', 'CrawlerService.ts');
const REFACTORED_FILE = path.join(BASE_PATH, 'domain', 'CrawlerService.refactored.ts');
const BACKUP_FILE = path.join(BASE_PATH, 'domain', 'CrawlerService.original.ts');

console.log('DocSI Crawler Service Migration Tool');
console.log('====================================');

// Check if files exist
if (!fs.existsSync(ORIGINAL_FILE)) {
  console.error(`Error: Original file not found: ${ORIGINAL_FILE}`);
  process.exit(1);
}

if (!fs.existsSync(REFACTORED_FILE)) {
  console.error(`Error: Refactored file not found: ${REFACTORED_FILE}`);
  process.exit(1);
}

// Create backup
console.log(`Creating backup of original file at ${BACKUP_FILE}`);
try {
  fs.copyFileSync(ORIGINAL_FILE, BACKUP_FILE);
  console.log('✅ Backup created successfully');
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Error creating backup: ${errorMessage}`);
  process.exit(1);
}

// Apply migration
console.log(`Applying refactored implementation to ${ORIGINAL_FILE}`);
try {
  fs.copyFileSync(REFACTORED_FILE, ORIGINAL_FILE);
  console.log('✅ Refactored implementation applied successfully');
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Error applying refactored implementation: ${errorMessage}`);
  console.log('Attempting to restore from backup...');
  
  try {
    fs.copyFileSync(BACKUP_FILE, ORIGINAL_FILE);
    console.log('✅ Original file restored from backup');
  } catch (restoreError: unknown) {
    const restoreErrorMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
    console.error(`Critical error: Failed to restore from backup: ${restoreErrorMessage}`);
    console.error('Manual intervention required!');
  }
  
  process.exit(1);
}

console.log('\nMigration completed successfully!');
console.log('\nNext steps:');
console.log('1. Run tests to verify the refactored implementation');
console.log('2. Update any imports that may be affected');
console.log('3. Review the MCP handlers to ensure they correctly use the new architecture');
console.log('\nIf you encounter any issues, the original file is backed up at:');
console.log(BACKUP_FILE);