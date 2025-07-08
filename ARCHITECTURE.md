# DocSI Architecture

## Overview

DocSI (Documentation Search and Indexing) is a tool designed for indexing, storing, retrieving, and reusing documentation from different service websites. It integrates with MCP-enabled IDEs to provide AI agents with direct access to documentation, enabling more effective information retrieval and utilization during development.

This document outlines the architecture of the refactored DocSI system, which follows domain-driven design principles with a focus on security, performance, and modularity.

## Core Architecture Principles

1. **Domain-Driven Design**: Clear separation of concerns with well-defined domain models
2. **Clean Architecture**: Independent layers with dependencies pointing inward
3. **Event-Driven Communication**: Loose coupling through events for extensibility
4. **Security By Design**: Built-in security controls at all levels
5. **Async-First**: Non-blocking operations throughout the system

## Directory Structure

```
docsi/
├── services/              # Core business services
│   ├── crawler/           # Documentation discovery and crawling
│   ├── document-processor/# Processing and normalization of documentation
│   ├── semantic-analyzer/ # Semantic analysis and embedding generation
│   ├── query-engine/      # Search and querying capabilities
│   └── management/        # System administration and configuration
├── shared/                # Shared code across services
│   ├── domain/            # Domain models and business logic
│   ├── infrastructure/    # External services, storage, I/O
│   └── utils/             # Common utilities
├── interfaces/            # External interfaces
│   ├── mcp/               # Model Context Protocol server
│   ├── rest/              # REST API for programmatic access
│   └── cli/               # Command-line interfaces
└── tools/                 # Utility scripts and tools
```

## Layer Responsibilities

### Domain Layer

The domain layer contains the core business logic and domain models. It has no dependencies on external frameworks or libraries.

Key components:
- Domain entities (Document, DocumentSource, etc.)
- Repository interfaces
- Domain services
- Value objects

### Application Layer

The application layer orchestrates the flow of data to and from the domain layer. It coordinates high-level use cases.

Key components:
- Use cases/Application services
- Command and query handlers (CQRS)
- Event handlers

### Infrastructure Layer

The infrastructure layer provides implementations for repositories, external services, and other technical concerns.

Key components:
- Repository implementations
- External service clients (HTTP, database, etc.)
- Caching mechanisms
- I/O operations
- Security implementations

### Interface Layer

The interface layer presents the application to the outside world through various interfaces.

Key components:
- MCP server
- REST API
- CLI commands
- Event handlers

## Service Architecture

DocSI is organized into several specialized services:

### Crawler Service

Responsible for discovering and fetching documentation from external sources.

- **Capabilities**:
  - Recursive crawling with configurable depth and breadth
  - Rate limiting and politeness controls
  - Smart filtering and scope control
  - Robots.txt compliance
  - Content type detection and handling

### Document Processor

Transforms raw documentation content into structured, normalized documents.

- **Capabilities**:
  - HTML parsing and cleaning
  - Content extraction
  - Metadata extraction
  - Document normalization
  - Content type conversions

### Semantic Analyzer

Analyzes document content to extract semantic meaning and relationships.

- **Capabilities**:
  - Embedding generation
  - Entity extraction
  - API component detection
  - Relationship mapping
  - Knowledge graph construction

### Query Engine

Provides search capabilities across the documentation corpus.

- **Capabilities**:
  - Keyword-based search
  - Semantic search
  - API-specific search
  - Faceted search
  - Context-aware results

### Management Service

Provides administrative capabilities for the system.

- **Capabilities**:
  - Configuration management
  - System monitoring
  - Data export/import
  - User management
  - Security controls

## Event-Driven Communication

Services communicate through events to maintain loose coupling:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Crawler   │───>│  Document   │───>│  Semantic   │───>│    Query    │
│   Service   │    │  Processor  │    │  Analyzer   │    │   Engine    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
        │                 │                  │                  │
        │                 │                  │                  │
        v                 v                  v                  v
┌─────────────────────────────────────────────────────────────────┐
│                          Event Bus                              │
└─────────────────────────────────────────────────────────────────┘
        ^                 ^                  ^                  ^
        │                 │                  │                  │
        │                 │                  │                  │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Management  │    │     MCP     │    │    REST     │    │     CLI     │
│   Service   │<───│  Interface  │<───│  Interface  │<───│  Interface  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

Key events:
- `DocumentSourceAdded` - When a new documentation source is registered
- `PageDiscovered` - When a new page is discovered during crawling
- `PageCrawled` - When a page has been crawled and its content retrieved
- `DocumentProcessed` - When a document has been processed and normalized
- `DocumentAnalyzed` - When semantic analysis of a document is complete
- `SearchPerformed` - When a search is executed

## Security Enhancements

The refactored architecture includes several security enhancements:

1. **Input Validation**:
   - Strict validation for all user inputs
   - Parameterized queries for database operations
   - Input sanitization for external content

2. **Path Traversal Prevention**:
   - Secure file access abstraction layer
   - Path normalization and validation
   - Restricted file system access

3. **Content Security**:
   - HTML content sanitization
   - Safe content rendering
   - Content isolation

4. **Data Protection**:
   - Encryption for sensitive data
   - Access control for data operations
   - Proper error handling to prevent information disclosure

## Performance Optimizations

1. **Asynchronous Processing**:
   - Non-blocking I/O operations
   - Background processing for resource-intensive tasks
   - Worker pools for parallel execution

2. **Efficient Storage**:
   - Tiered caching strategy
   - Streaming for large documents
   - Pagination for large result sets

3. **Optimized Search**:
   - Vector-based search with proper indexing
   - Efficient data structures for knowledge graphs
   - Query optimization

## MCP Integration

DocSI exposes its functionality through the Model Context Protocol (MCP), allowing AI agents to access documentation in a standardized way.

Tools exposed via MCP:
- `docsi-discover` - For discovering and managing documentation sources
- `docsi-search` - For searching documentation
- `docsi-analyze` - For analyzing documentation and extracting relationships
- `docsi-admin` - For system administration and configuration

## Implementation Roadmap

The implementation follows a phased approach:

### Phase 1: Foundation
- Core domain models
- Basic crawler service
- Security infrastructure
- MCP integration

### Phase 2: Core Capabilities
- Document processor
- Basic semantic analyzer
- Query engine with keyword search
- CLI interface

### Phase 3: Advanced Features
- Vector-based semantic search
- Knowledge graph construction
- REST API
- Role-specific views

### Phase 4: Enterprise Features
- Multi-user support
- Advanced security controls
- Enterprise integration options
- Performance optimization