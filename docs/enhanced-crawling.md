# Enhanced Crawling Architecture

This document outlines the improvements made to the DocSI crawler architecture, focusing on depth handling, sitemap processing, and URL prioritization.

## Overview

The enhanced crawler architecture addresses several limitations in the original implementation:

1. **Improved Depth Handling**: Better handling of different documentation structures and more consistent depth calculation
2. **Advanced Sitemap Processing**: Smarter processing of sitemap indexes and prioritization of URLs
3. **Intelligent URL Prioritization**: Context-aware scoring of URLs for more effective crawling
4. **Large Documentation Site Support**: Special handling for very large documentation sites

## Architecture Components

The enhanced crawler introduces several new components:

![Enhanced Crawler Architecture](../assets/enhanced-crawler-architecture.png)

### Core Components

- **EnhancedCrawlerService**: Orchestrates the crawling process with improved capabilities
- **AdvancedCrawlerEngine**: Powers the crawling with better depth handling and prioritization
- **EnhancedSitemapProcessor**: Provides improved sitemap discovery and processing

### Sitemap Processing Components

- **SitemapParser**: Parses XML and JSON sitemaps with improved sitemap index support
- **SitemapScorer**: Scores URLs based on multiple factors for prioritization
- **SitemapTypes**: Provides comprehensive type definitions for sitemap processing

## Key Improvements

### 1. Depth Handling Modes

The crawler now supports three depth handling modes:

- **Strict**: Traditional counting of URL segments from the base URL
- **Flexible**: Content-aware depth assignment based on URL structure
- **Adaptive**: Dynamic depth adjustment based on site structure and crawling progress

```typescript
// Example configuration
const config: AdvancedCrawlerConfig = {
  maxDepth: 5,
  depthHandlingMode: 'adaptive',
  // other options...
};
```

### 2. Sitemap Processing

The enhanced sitemap processing pipeline includes:

1. **Sitemap Discovery**: Finds sitemaps through robots.txt and common locations
2. **Sitemap Classification**: Detects sitemap indexes and processes them accordingly
3. **URL Extraction**: Extracts URLs and metadata from various sitemap formats
4. **Depth Assignment**: Intelligently assigns depth values based on URL structure
5. **Prioritization**: Scores URLs for optimal crawling order

```typescript
// Example sitemap processing options
const sitemapOptions: SitemapProcessingOptions = {
  followSitemapIndex: true,
  maxEntries: 1000,
  assignCustomDepth: true,
  depthCalculationMethod: 'hybrid',
  docPathMarkers: ['docs', 'documentation', 'guide'],
  apiPathMarkers: ['api', 'reference']
};
```

### 3. URL Prioritization

URLs are scored using multiple factors:

- **Path Structure**: Shorter paths are generally higher priority
- **Content Type Indicators**: Documentation and API paths are prioritized
- **Sitemap Metadata**: Uses priority and lastmod values from sitemaps
- **Pattern Matching**: Boosts scores for URLs matching specific patterns

```typescript
// Example prioritization configuration
const config: AdvancedCrawlerConfig = {
  // other options...
  strategy: 'hybrid',
  prioritizationPatterns: [
    'getting-started',
    'tutorial',
    'quickstart',
    'api/.*',
    'reference/.*'
  ]
};
```

### 4. Large Documentation Site Handling

For large documentation sites, the crawler implements special handling:

- **Section-Based Crawling**: Organizes URLs by section and ensures balanced coverage
- **Adaptive Limits**: Dynamically adjusts limits based on site size
- **Progressive Depth**: Starts with lower depths and gradually increases

```typescript
// Example large site handling configuration
const config: AdvancedCrawlerConfig = {
  // other options...
  largeDocSiteOptions: {
    detectLargeSites: true,
    largeSiteThreshold: 500,
    maxUrlsPerSection: 50
  }
};
```

## Using the Enhanced Crawler

### Integration

You can integrate the enhanced crawler components in several ways:

1. **Direct Integration**: Use the `enhance-crawler.js` utility script

```bash
# Run the enhancement script
node tools/enhance-crawler.js
```

2. **Programmatic Integration**: Use the integration utilities in your code

```typescript
import { createEnhancedCrawlerService } from './interfaces/mcp/enhanced-integration.js';

// Create an enhanced crawler service
const crawlerService = createEnhancedCrawlerService(
  documentRepository,
  sourceRepository
);
```

### Configuration Options

The enhanced crawler supports numerous configuration options:

```typescript
// Example detailed configuration
const config: AdvancedCrawlerConfig = {
  // Core settings
  maxDepth: 5,
  maxPages: 1000,
  force: false,
  
  // Enhanced features
  useSitemaps: true,
  maxRetries: 3,
  
  // Timing settings
  crawlDelay: 100,
  
  // Crawl strategy
  strategy: 'hybrid',
  prioritizationPatterns: ['docs', 'api'],
  concurrency: 2,
  
  // Advanced depth handling
  depthHandlingMode: 'adaptive',
  
  // URL filtering
  includePatterns: ['^/docs', '^/api'],
  excludePatterns: ['\.pdf$', '/assets/'],
  
  // Entry points
  entryPoints: [
    'https://example.com/docs/getting-started',
    'https://example.com/api/reference'
  ],
  
  // Large site handling
  largeDocSiteOptions: {
    detectLargeSites: true,
    largeSiteThreshold: 500,
    maxUrlsPerSection: 50
  },
  
  // Sitemap options
  sitemapOptions: {
    followSitemapIndex: true,
    maxEntries: 1000,
    assignCustomDepth: true,
    depthCalculationMethod: 'hybrid',
    docPathMarkers: ['docs', 'guide', 'tutorial'],
    apiPathMarkers: ['api', 'reference']
  },
  
  // Debug mode
  debug: false
};
```

## Performance Considerations

The enhanced crawler includes several performance optimizations:

1. **Batch Processing**: Processes URLs in batches for better memory management
2. **Smart Retries**: Uses exponential backoff for failed requests
3. **Progressive Crawling**: Prioritizes important content first
4. **Resource Limits**: Adjusts concurrency and delays based on server response

## Future Enhancements

Planned future enhancements include:

1. **Machine Learning Prioritization**: Using ML to predict URL importance
2. **Content Quality Scoring**: Evaluating content quality for better prioritization
3. **Headless Browser Support**: Adding support for JavaScript-rendered sites
4. **Distributed Crawling**: Support for distributed crawling of very large sites

## Conclusion

The enhanced crawler architecture significantly improves DocSI's ability to handle complex documentation sites, especially those with deep hierarchies or large numbers of pages. By implementing smart depth handling, improved sitemap processing, and intelligent URL prioritization, the crawler can more effectively index documentation while respecting resource constraints.