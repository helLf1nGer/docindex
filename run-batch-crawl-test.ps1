#!/usr/bin/env pwsh
# Run the Batch Crawl integration tests for SimpleCrawler

# Ensure we're in the docindex directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Build the TypeScript files
Write-Host "Building TypeScript files..." -ForegroundColor Cyan
npm run build

# Run the Batch Crawl integration tests
Write-Host "Running Batch Crawl integration tests..." -ForegroundColor Green
node --enable-source-maps ./dist/services/crawler/test/BatchCrawlIntegrationTest.js

# Check the result
if ($LASTEXITCODE -eq 0) {
    Write-Host "Batch Crawl integration tests completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Batch Crawl integration tests failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "All tests completed." -ForegroundColor Cyan