# DocSI - Documentation Search and Indexing for AI Agents

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/helLf1nGer/docindex)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)

DocSI is a state-of-the-art documentation mechanism designed for AI-assisted software development. It crawls, indexes, and provides semantic search capabilities for technical documentation, optimized for AI agent consumption through the Model Context Protocol (MCP).

## Features

- **Crawl & Index Documentation** - Automatically discover and index documentation from various sources
- **Semantic Search** - Find documentation based on meaning, not just keywords
- **API Component Extraction** - Identify and extract API definitions for structured access
- **MCP Integration** - Seamless integration with the Model Context Protocol
- **Relationship Mapping** - Understand connections between documentation entities
- **Security-First Design** - Built with security best practices from the ground up

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm 6.0.0 or higher
- TypeScript 5.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/helLf1nGer/docindex.git
cd docindex

# Install dependencies
npm install

# Build TypeScript
npm run build

# Set up MCP integration
npm run setup-mcp
```

### Usage

After installation, restart your MCP-enabled application (e.g., Cline, Claude Desktop, or any MCP-compatible client). The following tools will be available:

- `docsi-discover` - Add and manage documentation sources
- `docsi-search` - Search indexed documentation
- `docsi-get-document` - Retrieve specific documents
- `docsi-batch-crawl` - Crawl multiple documentation sources
- `docsi-info` - Get system information and status

### Quick Examples

#### Adding a Documentation Source

```bash
# Through MCP in your AI assistant:
docsi-discover add --url https://docs.example.com --name "Example Docs" --depth 3 --pages 100
```

#### Searching Documentation

```bash
# Through MCP in your AI assistant:
docsi-search "How to implement authentication"
```

#### Batch Crawling

```bash
# Through MCP in your AI assistant:
docsi-batch-crawl --sources "React Docs,TypeScript Docs" --depth 3 --pages 50
```

## Architecture

DocSI follows a Domain-Driven Design architecture with clear separation of concerns:

```
docindex/
├── services/              # Service modules (bounded contexts)
│   ├── crawler/           # Documentation discovery and crawling
│   ├── document-processor/# Documentation processing service
│   ├── semantic-analyzer/ # Semantic analysis service
│   ├── query-engine/      # Search and querying service
├── shared/                # Shared modules
│   ├── domain/            # Core domain models and interfaces
│   ├── infrastructure/    # Shared infrastructure 
├── interfaces/            # External interfaces
│   ├── mcp/               # MCP server interface
```

## Security

DocSI is designed with security as a primary concern:

- Protects against path traversal attacks
- Implements proper input validation
- Sanitizes external content
- Respects robots.txt
- Uses proper file system abstractions

## Development

### Project Structure

- `shared/domain/models/` - Core domain entities
- `shared/domain/repositories/` - Repository interfaces
- `services/` - Bounded contexts for different services
- `interfaces/` - External interfaces (MCP, CLI)

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
```

## Configuration

DocSI can be configured using environment variables or a configuration file. See [.env.example](.env.example) for available options.

### Environment Variables

```bash
# Set custom data directory
export DOCSI_DATA_DIR=~/my-docsi-data

# Configure crawler behavior
export DOCSI_CRAWLER_MAX_DEPTH=5
export DOCSI_CRAWLER_MAX_PAGES=200
```

### Configuration File

Copy `docsi.config.example.json` to `docsi.config.json` and customize as needed.

## Contributing

We welcome contributions to DocSI! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Reporting Issues

If you find a bug or have a feature request, please open an issue on [GitHub Issues](https://github.com/helLf1nGer/docindex/issues).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- The [Model Context Protocol](https://modelcontextprotocol.io) team for their excellent work on MCP
- The open source community for their contributions to the dependencies used