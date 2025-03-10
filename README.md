# DocSI - Documentation Search and Indexing for AI Agents

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/docsi/docsi)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

DocSI is a state-of-the-art documentation mechanism designed for AI-assisted software development. It crawls, indexes, and provides semantic search capabilities for technical documentation, optimized for AI agent consumption.

## Features

- **Crawl & Index Documentation** - Automatically discover and index documentation from various sources
- **Semantic Search** - Find documentation based on meaning, not just keywords
- **API Component Extraction** - Identify and extract API definitions for structured access
- **MCP Integration** - Seamless integration with the Model Context Protocol
- **Relationship Mapping** - Understand connections between documentation entities
- **Security-First Design** - Built with security best practices from the ground up

## Getting Started

### Prerequisites

- Node.js 14.0.0 or higher
- npm 6.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/docsi/docsi.git
cd docsi

# Install dependencies
npm install

# Build TypeScript
npm run build

# Set up MCP integration
npm run setup-mcp
```

### Usage

After installation, restart your MCP-enabled application (VSCode with Cline or Claude Desktop). The following tools will be available:

- `docsi-discover` - Add and manage documentation sources
- `docsi-search` - Search for documentation
- `docsi-analyze` - Analyze documentation and extract relationships
- `docsi-admin` - Configure and manage DocSI

### Adding Documentation Sources

```
docsi-discover add --url https://docs.example.com --name "Example Docs"
```

### Searching Documentation

```
docsi-search "How to implement authentication"
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

## Contributing

We welcome contributions to DocSI! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- The Model Context Protocol team for their excellent work on MCP
- The open source community for their contributions to the dependencies used