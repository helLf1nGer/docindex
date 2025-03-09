# DocSI MCP - Documentation Search Index for AI Agents

DocSI is a documentation indexing, searching, and integration tool designed specifically for AI agents using the Model Context Protocol (MCP). Unlike human-focused documentation browsers, DocSI optimizes documentation for machine consumption.

## Key Features

- **Documentation Indexing**: Crawl and index documentation from websites with configurable depth and limits
- **Semantic Search**: Find documentation using natural language queries and semantic understanding
- **API Component Extraction**: Automatically identify and extract API components (functions, classes, methods)
- **Relationship Mapping**: Discover connections between related documentation components
- **MCP Integration**: Seamless integration with Roo Cline and other MCP-compatible AI assistants
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Security & Privacy Features

- **Path Sanitization**: Prevents path traversal attacks with robust validation
- **Environment-Based Configuration**: Uses environment variables instead of hardcoded paths
- **Dynamic Path Detection**: Adapts to different OS platforms automatically
- **Input Validation**: Sanitizes all inputs to prevent injection attacks

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/docsi.git
cd docsi

# Install dependencies
npm install
```

### Indexing Documentation

```bash
# Index MDN JavaScript documentation
npm run start:enhanced add --url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide --name "MDN JavaScript" --depth 2 --pages 100
```

### Running the MCP Server

```bash
# Update MCP settings and start the server
npm run setup-and-start
```

### Using with Roo Cline

Once the server is running, you can use DocSI in Roo Cline:

```
DocIndex > search?q=javascript promises
```

## Environment Variables

Customize paths and behavior with environment variables:

```bash
# Base directory for all DocIndex data
export DOCSI_BASE_DIR=~/custom-docindex

# Specific directories (optional)
export DOCSI_DATA_DIR=~/custom-docindex/data
export DOCSI_CACHE_DIR=~/custom-docindex/cache
export DOCSI_MODEL_DIR=~/custom-docindex/models
```

## Architecture

DocSI implements an AI-centric documentation architecture focusing on:

1. **Semantic Parsing**: Documentation is parsed into semantically meaningful components
2. **Relationship Mapping**: Explicit mapping of relationships between components
3. **Contextual Embeddings**: Embeddings that capture hierarchical context
4. **API Specification Extraction**: Formal API specifications for AI consumption
5. **Usage Pattern Mining**: Extraction of common usage patterns

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License