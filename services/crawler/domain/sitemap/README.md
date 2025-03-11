# Sitemap Processing Components

This directory contains components for advanced sitemap discovery, parsing, and processing to support the enhanced crawler architecture.

## Overview

The sitemap processing system discovers, parses, and prioritizes URLs from XML and JSON sitemaps to feed into the crawler pipeline. It includes support for sitemap indexes, robust error handling, and intelligent URL prioritization.

## Components

### SitemapTypes.ts

This file defines the TypeScript interfaces and types used throughout the sitemap processing system:

- `SitemapEntry`: Represents a URL extracted from a sitemap with metadata
- `RawSitemapUrl`: Raw data structure from sitemap XML
- `RawSitemap`: Raw sitemap data from a sitemap index
- `SitemapIndex`: Processed sitemap index with child sitemap URLs

### SitemapParser.ts

Responsible for parsing XML and JSON sitemap content:

- `parseXml()`: Parses XML content into structured objects
- `isSitemapIndex()`: Detects if content is a sitemap index
- `parseSitemapIndex()`: Parses sitemap indexes into structured objects
- `parseSitemap()`: Parses any sitemap format into SitemapEntry[] objects
- `processJsonSitemap()`: Handles various JSON sitemap formats

### SitemapScorer.ts

Assigns priority scores to sitemap entries based on multiple factors:

- Path length/depth (shorter is higher priority)
- Priority keywords in the path
- Explicit sitemap priority values
- Content recency based on lastmod
- Pattern matching for explicit priorities
- Special locations (homepage, section indices)

```typescript
// Example usage
const scorer = new SitemapScorer();
const scoredEntries = scorer.scoreEntries(entries, 'https://example.com', {
  priorityKeywords: ['docs', 'guide', 'reference'],
  priorityPatterns: ['getting-started', 'api/.*'],
  useSitemapPriorities: true
});
```

### SitemapDiscovery.ts

Finds sitemaps for a given website using multiple methods:

- Checking robots.txt
- Looking for standard sitemap locations
- Searching for sitemap links in the HTML content

### EnhancedSitemapProcessor.ts

High-level component that coordinates the sitemap processing pipeline with advanced features:

- Intelligent depth calculation based on URL structure
- Content-type aware processing (docs, API, regular content)
- Custom scoring and prioritization
- Supports adaptive limits for large sites

```typescript
// Example usage
const processor = new EnhancedSitemapProcessor(httpClient);
const entries = await processor.discoverAndProcessSitemaps('https://example.com', {
  followSitemapIndex: true,
  maxEntries: 1000,
  assignCustomDepth: true,
  depthCalculationMethod: 'hybrid',
  docPathMarkers: ['docs', 'guide', 'tutorial'],
  apiPathMarkers: ['api', 'reference']
});
```

### SitemapProcessor.ts

The main processor class that handles the orchestration of sitemap handling:

- Coordinates discovery, parsing, and scoring
- Handles sitemap indexes recursively
- Manages error handling and retries
- Deduplicates and prioritizes entries

## Integration

These components are integrated with the main crawler system through:

1. `AdvancedCrawlerEngine.ts`: Uses sitemap components for initial URL discovery
2. `EnhancedCrawlerService.ts`: Configures sitemap processing options
3. `enhanced-integration.ts`: Wires up enhanced components

## Performance Considerations

- XML parsing is relatively expensive - JSDOM is used for robust parsing
- Large sitemaps are processed in batches to avoid memory issues
- Sitemap indexes are processed with controlled parallelism
- URLs are filtered before deep processing to reduce overhead