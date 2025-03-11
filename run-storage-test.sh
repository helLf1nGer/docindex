#!/bin/bash
# Run storage integration tests for the SimpleCrawler
# This script builds the TypeScript code and runs the StorageIntegrationTest

# Stop on any error
set -e

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Build the TypeScript code first
echo "Building TypeScript code..."
npx tsc

# Run the storage integration test
echo "Running storage integration tests..."
node dist/services/crawler/test/StorageIntegrationTest.js

echo "Tests completed!"