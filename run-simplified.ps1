# run-simplified.ps1
#
# PowerShell script to run the DocSI MCP server with the simplified crawler implementation
# This script builds and runs the simplified version of the server

# Set the current directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path $scriptDir

# Build TypeScript files
Write-Host "Building TypeScript files..." -ForegroundColor Cyan
npm run build

# Set environment variables
if (-not $env:DOCSI_DATA_DIR) {
    $env:DOCSI_DATA_DIR = Join-Path -Path $env:USERPROFILE -ChildPath ".docsi"
}

if (-not $env:NODE_ENV) {
    $env:NODE_ENV = "development"
}

# Create data directory if it doesn't exist
if (-not (Test-Path -Path $env:DOCSI_DATA_DIR)) {
    Write-Host "Creating data directory: $env:DOCSI_DATA_DIR" -ForegroundColor Yellow
    New-Item -Path (Join-Path -Path $env:DOCSI_DATA_DIR -ChildPath "documents") -ItemType Directory -Force | Out-Null
    New-Item -Path (Join-Path -Path $env:DOCSI_DATA_DIR -ChildPath "sources") -ItemType Directory -Force | Out-Null
}

# Print startup message
Write-Host "Starting DocSI MCP server with simplified crawler..." -ForegroundColor Green
Write-Host "Data directory: $env:DOCSI_DATA_DIR" -ForegroundColor Gray

# Run the server
node --enable-source-maps dist/interfaces/mcp/server-simplified.js