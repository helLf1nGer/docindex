#!/bin/bash
# Run the MCP integration tests for SimpleCrawler

# Ensure script is executable: chmod +x run-mcp-test.sh

# Exit on error
set -e

# Ensure we're in the docindex directory
cd "$(dirname "$0")"

# Build the TypeScript files (if needed)
echo -e "\033[36mBuilding TypeScript files...\033[0m"
npm run build

# Run the MCP integration tests
echo -e "\033[32mRunning MCP integration tests...\033[0m"
node --enable-source-maps ./dist/services/crawler/test/MCPIntegrationTest.js

# Check the result
if [ $? -eq 0 ]; then
    echo -e "\033[32mMCP integration tests completed successfully!\033[0m"
else
    echo -e "\033[31mMCP integration tests failed with exit code $?\033[0m"
    exit 1
fi

# Ask if they want to run performance tests
read -p "Do you want to run performance tests? (y/n) " runperf
if [[ $runperf == "y" ]]; then
    # Run the performance tests
    echo -e "\033[33mRunning performance tests (this may take a few minutes)...\033[0m"
    node --enable-source-maps ./dist/services/crawler/test/PerformanceTest.js
    
    if [ $? -eq 0 ]; then
        echo -e "\033[32mPerformance tests completed successfully!\033[0m"
    else
        echo -e "\033[31mPerformance tests failed with exit code $?\033[0m"
        exit 1
    fi
fi

echo -e "\033[36mAll tests completed.\033[0m"