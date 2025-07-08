# Run storage integration tests for the SimpleCrawler
# This script builds the TypeScript code and runs the StorageIntegrationTest

# Stop on any error
$ErrorActionPreference = "Stop"

# Ensure we're in the right directory
Set-Location -Path $PSScriptRoot

# Build the TypeScript code first
Write-Host "Building TypeScript code..."
npx tsc

# Run the storage integration test
Write-Host "Running storage integration tests..."
node dist/services/crawler/test/StorageIntegrationTest.js

Write-Host "Tests completed!"