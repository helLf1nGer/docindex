# Searching and Retrieving Documentation with DocIndex

DocIndex provides powerful search capabilities to help you find the documentation you need quickly.

## Basic Search

To search for documentation containing specific keywords:

```bash
docindex search "authentication"
```

This will search across all indexed documentation sources and custom links for the term "authentication".

## Search Results

Search results include:

1. **Documentation Sources** - Matches from indexed documentation
   - Matching headings
   - Matching code examples
   - Context around matches

2. **Custom Links** - Matches from custom documentation links
   - Links with matching names
   - Links with matching tags

## Searching Programmatically

You can also search programmatically:

```javascript
const { searchDocumentation } = require('docindex');

const results = searchDocumentation('authentication');

// Access documentation matches
results.documentationMatches.forEach(match => {
  console.log(`Source: ${match.source.name}`);
  
  // Access matching headings
  match.matches.headings.forEach(heading => {
    console.log(`Heading: ${heading.text}`);
  });
  
  // Access matching code blocks
  match.matches.codeBlocks.forEach(block => {
    console.log(`Code: ${block.code.substring(0, 50)}...`);
  });
});

// Access custom link matches
results.customLinkMatches.forEach(link => {
  console.log(`Custom Link: ${link.name} (${link.url})`);
});
```

## Listing All Documentation

To list all available documentation sources and custom links:

```bash
docindex list
```

This will display:
- All indexed documentation sources
- All custom documentation links
- Tags, URLs, and when they were added/updated

## Programmatic Listing

You can also list documentation programmatically:

```javascript
const { listDocumentationSources, listCustomLinks } = require('docindex');

// Get all documentation sources
const sources = listDocumentationSources();
sources.forEach(source => {
  console.log(`Source: ${source.name} (${source.url})`);
});

// Get all custom links
const links = listCustomLinks();
links.forEach(link => {
  console.log(`Link: ${link.name} (${link.url})`);
});
```

## Search Tips

- Use specific keywords for better results
- Search by technology name (e.g., "react", "node")
- Search by concept (e.g., "authentication", "routing")
- Search by tag (if you've added tags to your documentation)