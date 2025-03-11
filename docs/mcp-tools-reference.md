# DocSI MCP Tools Reference

This document provides a comprehensive reference for all MCP tools available in the DocSI system.

## Basic Tools

### docsi-check

Checks if the DocSI MCP server is functioning properly.

**Purpose**: Use this tool to verify that the server is online and responding to requests.

**Parameters**:
- `echo` (optional): Text to echo back in the response.

**Example**:
```json
{
  "echo": "Hello, DocSI!"
}
```

**Response**:
```
DocSI MCP server is functioning properly! Echo: Hello, DocSI!
```

### docsi-info

Get information about the DocSI installation.

**Purpose**: Use this tool to get detailed information about the server configuration, data location, and runtime statistics.

**Parameters**: None

**Response**:
```
DocSI Server Information:
Version: 0.2.0
Data Location: /path/to/data
Indexed Documents: 250
Configured Sources: 3
Last Indexing: 2025-03-09T12:34:56Z
Server Uptime: 3d 12h 45m
```

## Response Format Standards

All MCP tools follow standardized response format conventions to ensure consistent interaction with clients and reliable automated testing:

1. **Identifiers** must be consistently formatted:
   - Document ID must be presented as `Document ID: [id]`
   - Source ID must be presented as `Source ID: [id]`
   - Job ID must be presented with a consistent prefix (e.g., `batch-`, `job-`)

2. **Structured Content** should follow consistent patterns:
   - Headings use Markdown format (`#`, `##`, etc.)
   - Metadata is presented as `**Key:** Value` pairs
   - Lists use consistent bullet points or numbering
   - Code examples use appropriate Markdown code fences

3. **Error Messages** should include clear error codes and helpful descriptions

These standards ensure that all tools can be reliably tested and integrated with client applications.

## Documentation Management

### docsi-discover

Discover and manage documentation sources.

**Purpose**: Use this tool to add new documentation sources for indexing, refresh existing sources to update their content, and list all configured sources.

**Parameters**:
- `action` (required): Action to perform:
  - `list`: Shows all configured documentation sources
  - `add`: Adds a new documentation source for indexing
  - `refresh`: Updates an existing source with fresh content
- `url` (required for add): URL of the documentation source
- `name` (required for add and refresh): Name of the documentation source
- `depth` (optional, default: 3): Maximum crawl depth
- `pages` (optional, default: 100): Maximum pages to crawl
- `tags` (optional): Tags for categorizing the documentation

**Example (list)**:
```json
{
  "action": "list"
}
```

**Example (add)**:
```json
{
  "action": "add",
  "url": "https://docs.example.com",
  "name": "Example Documentation",
  "depth": 5,
  "pages": 200,
  "tags": ["example", "reference"]
}
```

**Example (refresh)**:
```json
{
  "action": "refresh",
  "name": "Example Documentation",
  "depth": 3,
  "pages": 150
}
```

## Search and Retrieval

### docsi-search

Search documentation across all indexed sources.

**Purpose**: Use this tool to find relevant documentation based on keywords or queries.

**Parameters**:
- `query` (required): Search query
- `limit` (optional, default: 10): Maximum number of results to return
- `type` (optional, default: "keyword"): Type of search:
  - `keyword`: Searches for exact matches (faster, more precise)
  - `semantic`: Finds conceptually related content (better for natural language)
  - `api`: Specifically targets API definitions and code examples
- `sources` (optional): Limit search to specific documentation sources
- `context` (optional, default: true): Include context around search results

**Example**:
```json
{
  "query": "authentication tokens",
  "limit": 5,
  "type": "keyword",
  "sources": ["API Reference"],
  "context": true
}
```

### docsi-get-document

Retrieve the full content of a document by URL or ID.

**Purpose**: Use this tool to get the complete details of a document, including its full text content, metadata, and optionally the raw HTML content.

**Parameters**:
- `url` (optional): URL of the document to retrieve (either URL or ID must be provided)
- `id` (optional): ID of the document to retrieve (either URL or ID must be provided)
- `includeHtml` (optional, default: false): Whether to include the raw HTML content

**Example**:
```json
{
  "url": "https://docs.example.com/api/auth",
  "includeHtml": false
}
```

**Response**:
```
Document: Authentication API | Example Documentation
URL: https://docs.example.com/api/auth
Source: Example Documentation
Last Updated: 2025-03-08T15:30:22Z
Tags: api, authentication

Content:
# Authentication API

This document describes the authentication endpoints...
```

## Advanced Crawling

### docsi-batch-crawl

Start a long-running background crawl job for one or more documentation sources with advanced prioritization.

**Purpose**: Use this tool to initiate comprehensive crawls that continue in the background after the initial response. The tool returns immediately with job information while the crawling continues in the background for up to 20 minutes.

**Parameters**:
- `sources` (required): Array of source names to crawl, or ["all"] to crawl all configured sources
- `depth` (optional, default: 5): Maximum crawl depth
- `pages` (optional, default: 500): Maximum pages per source
- `strategy` (optional, default: "hybrid"): Crawl strategy:
  - `breadth`: Crawls level by level
  - `depth`: Follows each path to completion
  - `hybrid`: Uses smart prioritization
- `concurrency` (optional, default: 5): Number of concurrent requests per source
- `prioritize` (optional): URL or title patterns (regex) to prioritize
- `timeout` (optional, default: 30): Wait time in seconds for initial status report

**Example**:
```json
{
  "sources": ["Node.js Documentation", "React Documentation"],
  "depth": 5,
  "pages": 500,
  "strategy": "hybrid",
  "concurrency": 5,
  "prioritize": ["api", "reference", "guide"],
  "timeout": 30
}
```

**Response**:
```
Batch crawl job started:
Job ID: batch-1741584123456-abc12
Sources: Node.js Documentation, React Documentation
Configuration:
  - Maximum depth: 5
  - Maximum pages per source: 500
  - Crawl strategy: hybrid
  - Concurrency: 5
  - Prioritized patterns: api, reference, guide

Current status: running
Initial progress:
  - Pages crawled: 15
  - Pages discovered: 95
  - Max depth reached: 1

The crawl is continuing in the background and may run for up to 20 minutes.
Use the docsi-batch-status tool with this job ID to check progress.
```

### docsi-batch-status

Get the status of a background batch crawl job.

**Purpose**: Use this tool to check the progress of a long-running batch crawl job.

**Parameters**:
- `jobId` (required): ID of the batch job to check status for

**Example**:
```json
{
  "jobId": "batch-1741584123456-abc12"
}
```

**Response**:
```
Batch Job Status: batch-1741584123456-abc12
Status: running
Started: 2025-03-09T22:15:23.456Z
Runtime: 5m 30s
Configuration:
  - Maximum depth: 5
  - Maximum pages per source: 500
  - Crawl strategy: hybrid
  - Concurrency: 5
  - Prioritized patterns: api, reference, guide

Overall Progress:
  - Pages crawled: 78
  - Pages discovered: 247
  - Max depth reached: 2

Individual Source Status:
- Node.js Documentation: running, Crawled: 45, Discovered: 152, Depth: 2
- React Documentation: running, Crawled: 33, Discovered: 95, Depth: 1
```

## Best Practices

1. **For initial discovery**, use `docsi-discover` with action "add" to add new documentation sources.

2. **For comprehensive indexing**, use `docsi-batch-crawl` with a hybrid strategy and appropriate prioritization patterns to ensure the most important documentation pages are indexed first.

3. **For targeted searches**, use `docsi-search` with the appropriate search type and source filters to get the most relevant results.

4. **For detailed content retrieval**, use `docsi-get-document` after finding relevant documents with search to get the complete content.

5. **For batch job monitoring**, use `docsi-batch-status` periodically to check the progress of long-running crawl jobs.