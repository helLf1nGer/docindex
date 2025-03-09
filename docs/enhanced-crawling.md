# Enhanced Documentation Crawling

The enhanced version of DocIndex includes powerful crawling capabilities to index entire documentation sites. This guide explains how to use these features effectively.

## How Crawling Works

When you add a documentation source using the enhanced version, DocIndex will:

1. Start at the provided URL
2. Extract content from the page (headings, paragraphs, code blocks)
3. Find all links on the page
4. Follow links that are on the same domain, up to the specified depth
5. Index each page and store it locally
6. Create a searchable index of all content

## Using the Enhanced CLI

The enhanced version is available through the `docindex-enhanced` command:

```bash
docindex-enhanced add --url https://developers.google.com/maps/documentation --name "Google Maps" --depth 3 --pages 100
```

### Crawling Parameters

- `--depth <number>`: Controls how many links deep the crawler will go from the starting URL. Default is 3.
  - Depth 1: Only the starting page
  - Depth 2: Starting page + directly linked pages
  - Depth 3: Starting page + directly linked pages + pages linked from those

- `--pages <number>`: Maximum number of pages to crawl. Default is 100.
  - This prevents crawling too many pages from large documentation sites
  - Increase this for more comprehensive coverage

## Rate Limiting

The crawler includes a 1-second delay between requests to be respectful of documentation sites. This helps prevent overloading servers and getting your IP blocked.

## Storage Structure

Indexed documentation is stored in a structured format:

```
~/.docindex/data/
  └── [source-id]/
      ├── index.json         # Metadata about the source and all indexed pages
      ├── [page-id-1].json   # Content from page 1
      ├── [page-id-2].json   # Content from page 2
      └── ...
```

## Example: Indexing Google Maps Documentation

```javascript
const { addDocumentationSource } = require('docindex');

async function indexGoogleMaps() {
  const source = await addDocumentationSource(
    'https://developers.google.com/maps/documentation',
    'Google Maps',
    ['maps', 'google', 'api'],
    2,  // depth
    50  // max pages
  );
  
  console.log(`Indexed ${source.pageCount} pages`);
}
```

## Searching Indexed Documentation

The enhanced search looks through all indexed pages:

```bash
docindex-enhanced search "navigation"
```

Search results include:
- The source name and URL
- Each matching page with its title and URL
- Matching headings from each page
- Snippets of matching content with context
- Matching code blocks

## Best Practices

1. **Start with smaller depths and page limits** to test before doing a full crawl
2. **Be specific with your starting URL** - start at a section of documentation rather than the root
3. **Use meaningful tags** to help with searching later
4. **Be respectful** of documentation sites - don't crawl too frequently
5. **Update periodically** to keep your local index current

## Troubleshooting

- If crawling stops unexpectedly, try reducing the depth or page limit
- Some sites may block crawling - check if the site has a robots.txt file
- JavaScript-heavy sites may not render all content in the initial HTML
- If you encounter rate limiting, the tool will automatically retry with increased delays