# SimpleCrawler Usage Examples

This document provides examples of how to use the SimpleCrawler implementation through MCP tools and directly in code.

## Using SimpleCrawler via MCP Tools

The SimpleCrawler implementation is fully integrated with the MCP interface, making it accessible through standard DocSI MCP tools.

### Adding a Documentation Source

To add a new documentation source that will be crawled using SimpleCrawler:

```json
{
  "name": "docsi-discover",
  "arguments": {
    "action": "add",
    "url": "https://example.com/docs",
    "name": "Example Documentation",
    "depth": 3,
    "pages": 100
  }
}
```

This will create a new source configuration that can be used with the batch crawler.

### Starting a Batch Crawl

To start a crawler job using SimpleCrawler:

```json
{
  "name": "docsi-batch-crawl",
  "arguments": {
    "sources": ["Example Documentation"],
    "depth": 3,
    "pages": 100,
    "concurrency": 2,
    "strategy": "hybrid",
    "timeout": 30
  }
}
```

This will start a crawl job in the background that will:
- Crawl up to 100 pages from the Example Documentation source
- Go to a maximum depth of 3 links from the base URL
- Use 2 concurrent requests (recommended for stability)
- Use a hybrid crawling strategy (balancing breadth and depth)
- Return an initial status report after 30 seconds

### Checking Batch Crawl Status

To check the status of an ongoing crawl job:

```json
{
  "name": "docsi-batch-status",
  "arguments": {
    "jobId": "batch-1234567890-abcde"
  }
}
```

This will return a detailed status report, including the number of pages crawled, discovered, and the current progress.

## Direct Usage in Code

If you need to integrate SimpleCrawler into your own code, you can use it directly:

```typescript
import { SimpleCrawler } from './services/crawler/SimpleCrawler.js';
import { DocumentStorage } from './shared/infrastructure/repositories/document/DocumentStorage.js';

// Create a document storage implementation
const documentStorage: DocumentStorage = {
  async saveDocument(document) {
    // Your storage logic here
    return true;
  },
  async documentExists(url) {
    // Your existence check logic here
    return false;
  }
};

// Create and configure the crawler
const crawler = new SimpleCrawler(documentStorage, {
  baseUrl: 'https://example.com/docs',
  maxDepth: 3,
  maxPages: 100,
  concurrency: 2,
  requestDelay: 500, // ms between requests
  includePatterns: ['/docs/', '/reference/'],
  excludePatterns: ['/blog/', '/news/']
});

// Set up event listeners
crawler.on('start', (data) => {
  console.log(`Started crawling ${data.url}`);
});

crawler.on('processing', (data) => {
  console.log(`Processing ${data.url} (depth: ${data.depth})`);
});

crawler.on('document', (data) => {
  console.log(`Saved document ${data.documentId} from ${data.url}`);
});

crawler.on('complete', (status) => {
  console.log(`Crawling complete. Processed ${status.processed} URLs, saved ${status.succeeded} documents`);
});

// Start crawling
try {
  const result = await crawler.start();
  console.log(`Crawl completed successfully. Pages crawled: ${result.succeeded}`);
} catch (error) {
  console.error('Crawl failed:', error);
}
```

## Performance Optimization Tips

The SimpleCrawler is designed to be reliable and efficient, but there are several ways to optimize its performance:

### Concurrency Settings

The `concurrency` setting controls how many pages can be fetched simultaneously:

- **Low concurrency (1-2)**: More stable, respectful of server resources, good for production use
- **Medium concurrency (3-5)**: Balanced between speed and stability
- **High concurrency (6+)**: Faster but may cause rate limiting or server load issues

### Request Delay

Adding a delay between requests helps avoid overloading target servers:

- **Production use**: 500-1000ms recommended
- **Friendly crawling**: 200-500ms
- **Internal/development**: 0-100ms (use only on your own servers)

### URL Patterns

Using include/exclude patterns can drastically improve crawling efficiency:

```typescript
const crawler = new SimpleCrawler(documentStorage, {
  baseUrl: 'https://example.com/docs',
  includePatterns: [
    '/api/',        // Only API documentation
    '/reference/',  // And reference material
    '/guides/'      // And guides
  ],
  excludePatterns: [
    '/blog/',       // Skip blog posts
    '/archive/',    // Skip archived content
    '/pdf/'         // Skip PDF links
  ]
});
```

### Depth Control

Be strategic about depth settings:

- **Shallow crawl (depth 1-2)**: Quick overview, good for testing
- **Medium crawl (depth 3-4)**: Balanced coverage of most documentation
- **Deep crawl (depth 5+)**: Comprehensive but slower, may include less relevant content

## Common Issues and Troubleshooting

### Rate Limiting

If you're being rate limited by the target server:

1. Decrease concurrency (2 or lower)
2. Increase request delay (1000ms or higher)
3. Add appropriate User-Agent and headers

### Memory Usage

For large documentation sites:

1. Limit max pages to a reasonable number (100-500)
2. Process in batches using multiple crawl jobs
3. Implement more aggressive URL filtering

### Incomplete Content

If the crawler isn't capturing complete content:

1. Check the content extraction in `SimpleContentExtractor.ts`
2. Add specific selectors for the documentation site structure
3. Consider creating a site-specific extractor for complex sites