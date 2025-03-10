# Crawler Architecture

## Overview

The DocSI crawler is responsible for discovering and extracting content from documentation websites. The architecture follows a component-based design that emphasizes separation of concerns, maintainability, and extensibility.

## Key Components

The crawler is composed of several specialized components, each with a clear and focused responsibility:

![Component Diagram](../assets/images/crawler-components.png)

### CrawlerService

The `CrawlerService` acts as the main orchestrator, coordinating all the components. It:
- Manages the lifecycle of crawl jobs
- Handles API requests from MCP tools
- Coordinates the crawling process using specialized components

### JobManager

The `JobManager` is responsible for:
- Creating and tracking crawl jobs
- Updating job status and progress
- Handling job cancellation
- Maintaining job statistics

### CrawlerEngine

The `CrawlerEngine` is the core of the crawling process, responsible for:
- Performing the actual URL crawling
- Coordinating between URL processing, content extraction, and storage
- Managing the crawler's state during a crawl job
- Implementing crawl strategies

### QueueManager

The `QueueManager` is responsible for:
- Managing the queue of URLs to be crawled
- Prioritizing URLs based on selected strategy
- Handling URL deduplication
- Tracking crawl depth
- Providing batch processing capabilities

### ContentProcessor

The `ContentProcessor` handles:
- Extraction of content from HTML
- Processing and validation of extracted content
- Structure normalization
- Document creation

### StorageManager

The `StorageManager` is responsible for:
- Persisting documents to storage
- Handling document updates and versioning
- Content validation before storage
- Error handling for storage operations

### UrlProcessor

The `UrlProcessor` manages:
- URL normalization and validation
- URL filtering based on patterns
- Link extraction from HTML
- Depth calculation

## Crawling Strategies

The crawler supports multiple strategies for URL prioritization:

1. **Breadth-First Strategy**: Crawls all URLs at the current depth before proceeding to the next depth level
2. **Depth-First Strategy**: Explores as far as possible along each branch before backtracking
3. **Hybrid Strategy**: A combination approach that prioritizes important pages while maintaining good coverage

## Content Extraction

Content extraction utilizes a unified approach that combines multiple techniques:

1. **Basic Extraction**: Fast extraction of core content
2. **Enhanced Extraction**: More sophisticated extraction that handles complex layouts
3. **Specialized Extraction**: Custom extraction logic for specific documentation platforms (GitHub, ReadTheDocs, MDN, etc.)

## Implementation Details

### Event-Driven Communication

Components communicate via an event-driven architecture. Each component exposes an EventEmitter that allows other components to subscribe to events.

Key events include:
- `job-created`, `job-started`, `job-completed`, `job-canceled`
- `page-discovered`, `page-crawled`
- `queue-item-added`, `queue-item-processed`, `queue-empty`
- `document-stored`, `document-updated`, `document-failed`

### Error Handling

The system implements comprehensive error handling:
- Each component has its own error handling logic
- Errors are logged and propagated when appropriate
- Failed URLs are tracked but don't stop the overall crawl process
- Validation failures trigger fallback mechanisms

### Depth Control

One of the critical issues addressed in the refactoring was proper depth control:
- URL depth is calculated based on parent-child relationships
- The `calculateCrawlDepthFromParent` method in `UrlProcessor` ensures accurate depth tracking
- QueueManager enforces the maximum depth constraint
- Depth statistics are maintained throughout the crawl process

### Concurrency

The crawler handles concurrent requests:
- URL batches are processed in parallel
- Concurrency limits are configurable per source
- Rate limiting respects the crawlDelay setting for each source

## Migration

The refactoring moves from a monolithic ~700-line CrawlerService to a component-based architecture. A migration script is provided to help transition:

```
node docindex/services/crawler/migration/apply-crawler-refactoring.js
```

This script creates a backup of the original implementation and applies the refactored version.

## Future Improvements

1. **Distributed Crawling**: Enable crawling across multiple instances
2. **Improved Content Extraction**: Further enhance content extraction for specialized documentation sites
3. **Advanced Queue Management**: Implement priority queues with dynamic scoring
4. **Crawl Resumption**: Add the ability to pause and resume crawls
5. **Machine Learning Integration**: Use ML to better extract and categorize content