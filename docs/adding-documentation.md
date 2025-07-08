# Adding Documentation Sources to DocIndex

DocIndex allows you to add documentation from various sources and index it for easy searching and retrieval.

## Adding Official Documentation

You can add official documentation from service websites using the CLI:

```bash
docindex add --url https://docs.example.com/api --name "Example API" --tags example,api
```

Or programmatically:

```javascript
const { addDocumentationSource } = require('docindex');

await addDocumentationSource(
  'https://docs.example.com/api',
  'Example API',
  ['example', 'api']
);
```

## How Indexing Works

When you add a documentation source, DocIndex will:

1. Fetch the HTML content from the provided URL
2. Parse the content to extract:
   - Headings (h1, h2, h3)
   - Links to other pages
   - Code examples
   - Important text content
3. Create an index of this content and store it locally
4. Make the content searchable via the CLI or API

## Adding Custom Links

For simple documentation links that don't need indexing, you can add custom links:

```bash
docindex add-custom --url https://my-docs.com --name "My Docs" --tags custom,internal
```

Or programmatically:

```javascript
const { addCustomLink } = require('docindex');

addCustomLink(
  'https://my-docs.com',
  'My Docs',
  ['custom', 'internal']
);
```

## Updating Documentation

To update the indexed content for a documentation source:

```bash
docindex update "Example API"
```

Or programmatically:

```javascript
const { updateDocumentation } = require('docindex');

await updateDocumentation('Example API');
```

## Best Practices

- Use descriptive names for documentation sources
- Add relevant tags to make searching easier
- Update documentation regularly to ensure it's current
- Use custom links for simple references that don't need full indexing