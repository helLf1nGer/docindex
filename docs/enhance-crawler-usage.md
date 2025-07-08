# Enhance Crawler Usage Guide

This document provides instructions for using the enhanced crawler components and the `enhance-crawler.js` utility.

## Quick Start

The enhanced crawler provides improved depth handling, better sitemap processing, and more intelligent URL prioritization. Here's how to integrate it:

```bash
# Run the enhancement script to automatically enhance the system
node docindex/tools/enhance-crawler.js
```

This script will:
1. Identify existing MCP server instances
2. Set up enhanced components
3. Wire up the improved crawler to the existing handlers

## Manual Integration

If you prefer more control, you can manually integrate the enhanced components:

```typescript
import { createEnhancedCrawlerService } from './interfaces/mcp/enhanced-integration.js';
import { FileSystemDocumentRepository } from './shared/infrastructure/repositories/FileSystemDocumentRepository.js';
import { FileSystemDocumentSourceRepository } from './shared/infrastructure/repositories/FileSystemDocumentSourceRepository.js';

// Initialize repositories
const documentRepository = new FileSystemDocumentRepository();
const sourceRepository = new FileSystemDocumentSourceRepository();

// Create enhanced crawler service
const crawlerService = createEnhancedCrawlerService(
  documentRepository, 
  sourceRepository
);
```

## Advanced Configuration

The enhanced crawler supports numerous configuration options:

```typescript
// Example configuration with detailed options
const crawlConfig = {
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
  strategy: 'hybrid', // 'breadth', 'depth', or 'hybrid'
  prioritizationPatterns: ['docs', 'api', 'guide'],
  concurrency: 2,
  
  // Advanced depth handling
  depthHandlingMode: 'adaptive', // 'strict', 'flexible', or 'adaptive'
  
  // URL filtering
  includePatterns: ['^/docs', '^/api'],
  excludePatterns: ['\.pdf$', '/assets/'],
  
  // Entry points - URLs to consider as base URLs
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

// Start a crawl job with this configuration
const jobId = await crawlerService.startCrawlJob({
  sourceId: 'your-source-id',
  ...crawlConfig
});
```

## Depth Handling Modes

The enhanced crawler supports three depth handling modes:

### 1. Strict Mode

Traditional crawling with depth strictly based on URL path segments:
- `/page` → depth 1
- `/section/page` → depth 2
- `/section/subsection/page` → depth 3

```typescript
const config = {
  depthHandlingMode: 'strict',
  // other options...
};
```

### 2. Flexible Mode

Content-aware depth assignment that treats documentation and API paths differently:
- `/docs` → depth 1
- `/docs/guides` → depth 1.5
- `/docs/guides/intro` → depth 2
- `/other/section/page` → depth 3

```typescript
const config = {
  depthHandlingMode: 'flexible',
  // other options...
};
```

### 3. Adaptive Mode (Default)

Dynamically adjusts depth calculation based on site structure and crawling progress:
- Starts with flexible mode
- Adjusts depth calculation as it learns the site structure
- Prioritizes important sections even at deeper levels

```typescript
const config = {
  depthHandlingMode: 'adaptive',
  // other options...
};
```

## Handling Large Documentation Sites

For large documentation sites (500+ pages), the enhanced crawler implements special handling:

```typescript
const config = {
  largeDocSiteOptions: {
    detectLargeSites: true, // Auto-detect large sites
    largeSiteThreshold: 500, // URLs threshold to consider a site large
    maxUrlsPerSection: 50 // Max URLs to crawl per section
  },
  // other options...
};
```

This ensures:
1. Balanced coverage across all major sections
2. Efficient resource usage
3. Better prioritization of critical content

## Usage with MCP Batch Crawl Tool

When using the MCP batch crawl tool, the enhanced crawler is automatically used:

```
<use_mcp_tool>
<server_name>docsi</server_name>
<tool_name>docsi-batch-crawl</tool_name>
<arguments>
{
  "sources": ["example-docs"],
  "depth": 5,
  "pages": 1000,
  "strategy": "hybrid",
  "concurrency": 2,
  "prioritize": ["guide", "api", "reference"],
  "useSitemaps": true,
  "maxRetries": 3,
  "debug": true
}
</arguments>
</use_mcp_tool>
```

## Monitoring Crawl Jobs

Monitor ongoing crawl jobs with the batch status tool:

```
<use_mcp_tool>
<server_name>docsi</server_name>
<tool_name>docsi-batch-status</tool_name>
<arguments>
{
  "jobId": "your-job-id"
}
</arguments>
</use_mcp_tool>
```

The enhanced crawler provides more detailed status information including:
- Section coverage statistics
- URLs discovered per depth level
- Sitemap statistics