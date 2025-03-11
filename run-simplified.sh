#!/bin/bash
# run-simplified.sh
# 
# Script to run the DocSI MCP server with the simplified crawler implementation
# This script builds and runs the simplified version of the server

# Set the current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Build TypeScript files
echo "Building TypeScript files..."
npm run build

# Set environment variables
export DOCSI_DATA_DIR="${DOCSI_DATA_DIR:-$HOME/.docsi}"
export NODE_ENV="${NODE_ENV:-development}"

# Create data directory if it doesn't exist
if [ ! -d "$DOCSI_DATA_DIR" ]; then
  echo "Creating data directory: $DOCSI_DATA_DIR"
  mkdir -p "$DOCSI_DATA_DIR/documents"
  mkdir -p "$DOCSI_DATA_DIR/sources"
fi

# Print startup message
echo "Starting DocSI MCP server with simplified crawler..."
echo "Data directory: $DOCSI_DATA_DIR"

# Run the server
node --enable-source-maps dist/interfaces/mcp/server-simplified.js