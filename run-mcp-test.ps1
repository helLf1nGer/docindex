#!/usr/bin/env pwsh
# Run the MCP integration tests for SimpleCrawler

# Ensure we're in the docindex directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Build the TypeScript files (if needed)
Write-Host "Building TypeScript files..." -ForegroundColor Cyan
npm run build

# Run the MCP integration tests
Write-Host "Running MCP integration tests..." -ForegroundColor Green
node --enable-source-maps ./dist/services/crawler/test/MCPIntegrationTest.js

# Check the result
if ($LASTEXITCODE -eq 0) {
    Write-Host "MCP integration tests completed successfully!" -ForegroundColor Green
} else {
    Write-Host "MCP integration tests failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Ask if they want to run performance tests
$runPerf = Read-Host "Do you want to run performance tests? (y/n)"
if ($runPerf -eq "y") {
    # Run the performance tests
    Write-Host "Running performance tests (this may take a few minutes)..." -ForegroundColor Yellow
    node --enable-source-maps ./dist/services/crawler/test/PerformanceTest.js
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Performance tests completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Performance tests failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "All tests completed." -ForegroundColor Cyan