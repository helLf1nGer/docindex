# DocIndex MCP

A documentation indexing and search service for MCP-enabled IDEs.

## Overview

DocIndex MCP is a tool that allows you to index, store, retrieve, and reuse documentation from different service websites. It integrates with MCP-enabled IDEs like VS Code with Roo Cline, allowing AI agents to access documentation directly.

## Installation

```bash
# Install globally
npm install -g docindex-mcp
```

## Usage with MCP-Enabled IDEs

Once installed, you can use DocIndex in MCP-enabled IDEs like VS Code with Roo Cline:

```
DocIndex > search?query=javascript promises
```

The MCP system will automatically start the DocIndex server when needed.

## Available Tools

DocIndex provides the following tools:

### Search Documentation

#### Basic Search
```
DocIndex > search?query=javascript promises
```

The search uses Fuse.js for powerful fuzzy searching with:
- Weighted field searching (titles and headings prioritized)
- Contextual snippets showing the most relevant content
- Hierarchical results showing the document path
- Highlighted search terms in results

#### Semantic Search (New!)
```
DocIndex > semantic-search?query=how to handle async operations
```

Semantic search uses embeddings to find content based on meaning rather than just keywords:
- Understands the intent behind your query
- Finds conceptually similar content even with different terminology
- Returns results ranked by semantic relevance
- Provides more accurate results for conceptual queries

#### API Component Search (New!)
```
DocIndex > api-search?query=fetch&type=function
```

Search specifically for API components like functions, classes, and methods:
- Filter by component type (function, class, method)
- Get parameter information and descriptions
- See code examples of usage
- Find API components across all documentation sources

### Document Retrieval

#### Get Full Document Content
```
DocIndex > get-document?url_or_id=https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
```

Or using the document ID (shown in search results):
```
DocIndex > get-document?url_or_id=7f4d6e5c3b2a1098765432109876543
```

#### Get Semantic Document (New!)
```
DocIndex > get-semantic-document?url_or_id=https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises
```

Get a semantically parsed version of a document:
- API components extracted and structured
- Code examples isolated with language detection
- Conceptual sections separated from procedural content
- Warnings and notes highlighted
- Content organized by semantic meaning rather than just layout

#### Get API Specification (New!)
```
DocIndex > get-api-spec?url_or_id=https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
```

Extract formal API specifications from documentation:
- Function signatures with parameter types
- Class definitions with inheritance relationships
- Method descriptions and return values
- API endpoints for REST documentation
- Structured in a machine-readable format

### Relationship Exploration

#### Get Relationships (New!)
```
DocIndex > get-relationships?url_or_id=https://developer.mozilla.org/en-US/docs/Web/API/fetch
```

Discover relationships between documentation entities:
- See what classes extend or are extended by this entity
- Find what components use or are used by this entity
- Identify dependencies and dependents
- Explore related concepts and implementations

#### Find Related Content (New!)
```
DocIndex > related-content?url_or_id=https://developer.mozilla.org/en-US/docs/Web/API/fetch
```

Find content related to a specific document:
- Semantically similar documents across all sources
- Components that use the current component
- Components used by the current component
- Ranked by relevance score

### List All Indexed Pages

List all pages that have been indexed for a specific documentation source:

```
DocIndex > list-pages?source=MDN JavaScript
```

This shows all indexed pages organized by URL path, with titles and document IDs.

### Get Data Directory Location

Find out where indexed documentation is stored on your local machine:

```
DocIndex > get-data-dir
```

This will show the path to the directory where all indexed documentation is stored (typically `~/.docindex/data`).

### Add Documentation Source

```
DocIndex > add-source?url=https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide&name=MDN JavaScript&tags=javascript,web,mdn&depth=5&pages=500
```

The indexing process now supports:
- Depth up to 15 levels (default: 3)
- Up to 2000 pages per source (default: 100)
- 20-minute timeout for large documentation sites
- Adaptive rate limiting to avoid overloading servers

### Refresh Documentation Source

Refresh a specific documentation source to update its content:

```
DocIndex > refresh-source?name=MDN JavaScript&depth=5&pages=500
```

### Refresh All Documentation Sources

Refresh all documentation sources at once:

```
DocIndex > refresh-all?depth=3&pages=100
```

### Add Custom Link

```
DocIndex > add-link?url=https://your-internal-docs.com&name=Internal API&tags=internal,api
```

### List Documentation Sources

```
DocIndex > list-sources
```

### List Custom Links

```
DocIndex > list-links
```

## How It Works

DocIndex MCP uses the Model Context Protocol (MCP) to communicate with IDEs. It:

1. Runs as a stdio-based MCP server
2. Indexes and stores documentation locally
3. Provides search capabilities for AI agents
4. Integrates seamlessly with MCP-enabled IDEs

## AI-Optimized Features (New!)

DocIndex now includes features specifically designed for AI agent consumption:

### 1. Semantic Parsing
- Documentation is parsed into semantically meaningful components
- API specifications are extracted in a structured format
- Code examples are isolated with language detection
- Content is organized by semantic meaning rather than layout

### 2. Relationship Mapping
- Explicit mapping of relationships between documentation entities
- "Uses", "extends", "requires", "replaces" relationships tracked
- Hierarchical relationships (class/method, module/function) preserved
- Bidirectional links between related concepts

### 3. Contextual Embeddings
- Vector embeddings generated for semantic search
- Multiple granularity levels (document, section, paragraph)
- Hierarchical context included in embeddings
- Specialized embeddings for code examples

### 4. API Specification Extraction
- Function signatures and class definitions extracted
- Type information and constraints identified
- Required vs. optional parameters distinguished
- OpenAPI/JSON Schema-like representations generated

### 5. Usage Pattern Mining
- Common usage patterns extracted from examples
- Typical combinations of functions/methods identified
- Error handling patterns noted
- Performance considerations highlighted

## Enhanced Search Features

The search functionality has been significantly improved:

1. **Fuzzy Search**: Uses Fuse.js for powerful fuzzy matching
2. **Weighted Fields**: Prioritizes matches in titles and headings
3. **Contextual Snippets**: Shows the most relevant part of the document
4. **Hierarchical Results**: Displays the document path for better context
5. **Highlighted Terms**: Highlights search terms in results
6. **Semantic Search**: Finds content based on meaning, not just keywords
7. **API-Specific Search**: Targeted search for API components

## Full Document Retrieval

DocIndex now supports retrieving complete document content:

1. **Search First**: Find relevant documents using the search tool
2. **Get Full Content**: Use the document URL or ID to retrieve the entire document
3. **Markdown Formatting**: Documents are returned in markdown format for easy reading
4. **Code Examples**: All code examples are preserved with proper formatting
5. **Original Link**: Each document includes a link to the original source
6. **Semantic Structure**: Get semantically parsed versions of documents
7. **API Specifications**: Extract formal API specifications

## Storage

All documentation is stored locally in `~/.docindex/data/` and can be accessed directly. The directory structure is:

```
~/.docindex/
  ├── config.json           # Configuration file with sources and links
  └── data/                 # Indexed documentation
      ├── 1234567890/       # Source ID (directory for each source)
      │   ├── index.json    # Source index with metadata
      │   ├── hierarchy.json # Document hierarchy
      │   ├── document-lookup.json # Document lookup table
      │   ├── semantic/     # Semantic document storage
      │   │   └── abc123def.json # Semantic document files
      │   └── abc123def.json # Individual document files (named by ID)
      └── 0987654321/       # Another source
          └── ...
```

You can browse this directory to see all indexed content or use the `get-data-dir` tool to find its location.

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/docindex.git

# Navigate to the package directory
cd docindex/global-package

# Install dependencies
npm install

# Link for local development
npm link
```

### Running Tests

```bash
npm test
```

## License

MIT