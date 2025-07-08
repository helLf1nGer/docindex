# Integration Testing Framework

This document describes the integration testing approach for verifying the SimpleCrawler integration with the MCP server and tools.

## Overview

The integration testing framework consists of two main components:

1. **MCP Integration Tests** - Verify that the SimpleCrawler works correctly with all MCP tools
2. **Performance Tests** - Evaluate the performance of the SimpleCrawler under various load conditions

These tests are designed to ensure that the SimpleCrawler implementation functions correctly within the MCP ecosystem and provides adequate performance for real-world usage.

## MCP Integration Tests

The `MCPIntegrationTest.ts` file implements comprehensive tests for the SimpleCrawler's integration with MCP tools. This test suite:

- Sets up an isolated test environment with temporary repositories
- Creates a test MCP server using the SimpleCrawler implementation
- Tests each MCP tool that interacts with the crawler
- Verifies the correctness of responses and data flow

### Test Components

The test suite includes the following components:

1. **In-Memory Test Environment** - Creates temporary repositories and a mock HTTP server
2. **Tool Handlers** - Direct testing of tool handler functionality
3. **End-to-End Flow Testing** - Tests the complete flow from source creation to document retrieval

### Running the Tests

To run the MCP integration tests:

```bash
# On Windows
./run-mcp-test.ps1

# On Linux/macOS
./run-mcp-test.sh
```

These scripts will:
1. Build the TypeScript code if needed
2. Run the MCP integration tests
3. Optionally run the performance tests if requested

### Test Coverage

The integration tests cover the following MCP tools:

1. **docsi-info** - Verifies server information
2. **docsi-discover** - Tests adding new documentation sources
3. **docsi-batch-crawl** - Tests starting and monitoring batch crawl jobs
4. **docsi-search** - Tests searching indexed documents
5. **docsi-get-document** - Tests retrieving specific documents

### Response Format Requirements

The MCP integration tests expect specific response formats from each tool handler:

1. **docsi-info** - Must include version and configuration information
2. **docsi-discover** - When adding or refreshing a source, must include "Source ID: [id]" in the response
3. **docsi-batch-crawl** - Must include job ID and status information
4. **docsi-search** - Must include properly formatted search results with title, URL, and context
5. **docsi-get-document** - Must include "Document ID: [id]" and properly formatted document content

These format requirements ensure consistency across different implementations and enable reliable testing. If you're modifying a tool handler, ensure it maintains these expected response formats to pass the integration tests.

### Troubleshooting Response Format Issues

If you encounter integration test failures related to response formatting:
- Check that handlers include required identifier fields (e.g., "Document ID:", "Source ID:")
- Ensure response structure follows the expected format for the specific tool

## Performance Testing

The `PerformanceTest.ts` file implements performance tests to evaluate the SimpleCrawler under different load conditions. These tests:

- Generate test websites of varying size and structure
- Measure crawling speed, memory usage, and resource utilization
- Test different concurrency and delay settings
- Evaluate performance with different website structures

### Performance Test Scenarios

The performance tests include several scenarios:

1. **Small Site (Default Settings)** - 50 pages with default concurrency and delay
2. **Medium Site (Default Settings)** - 200 pages with default concurrency and delay
3. **Small Site (High Concurrency)** - 50 pages with high concurrency
4. **Medium Site (High Concurrency)** - 200 pages with high concurrency
5. **Medium Site (Very High Concurrency)** - 200 pages with very high concurrency
6. **Deep Structure** - Testing crawling on a deeply nested site structure

### Performance Metrics

The performance tests collect the following metrics:

- **Pages Crawled per Second** - The rate at which pages are processed
- **Memory Usage** - The memory footprint during crawling
- **Concurrency Impact** - How different concurrency settings affect performance
- **Request Delay Impact** - How different delay settings affect performance

### Using Performance Test Results

The performance test results are presented in a table format that allows easy comparison of different configurations. These results can be used to:

1. **Optimize Configuration** - Determine the optimal concurrency and delay settings
2. **Estimate Resource Requirements** - Understand memory and CPU needs for production
3. **Plan Crawl Jobs** - Estimate crawl times for different site sizes

## Test Server Approach

Both test suites use a built-in HTTP server to simulate documentation websites:

- The server generates test HTML pages with links between them
- Page generation is configurable for different site sizes and structures
- The server simulates network delays to provide realistic testing

This approach allows testing without external dependencies and provides consistent, repeatable test results.

## Troubleshooting Tests

If you encounter issues with the tests:

1. **Build Issues** - Ensure TypeScript compilation succeeds with `npm run build`
2. **Port Conflicts** - The tests use random ports to avoid conflicts, but check for port availability
3. **Memory Issues** - Large performance tests may require increasing Node.js memory (`--max-old-space-size`)
4. **Timeout Issues** - Increase timeouts for larger test sites in slow environments

## Extending the Tests

To add new test scenarios:

1. **New MCP Tool Tests** - Add methods to `MCPIntegrationTest.ts` and update the `runTests` method
2. **New Performance Scenarios** - Add test configurations to `runTestWithConfig` calls in `PerformanceTest.ts`
3. **Custom Website Structures** - Modify the `generateTestPages` method in `PerformanceTest.ts`

## Continuous Integration

These tests are designed to work in CI environments. For CI implementation:

1. Use non-interactive mode by setting environment variables:
   ```bash
   # Skip the performance test prompt
   export DOCSI_TEST_SKIP_PERF=true
   
   # Or always run performance tests
   export DOCSI_TEST_RUN_PERF=true
   ```

2. Set timeouts appropriate for the CI environment:
   ```bash
   # Increase test timeouts for CI
   export DOCSI_TEST_TIMEOUT_MULTIPLIER=2