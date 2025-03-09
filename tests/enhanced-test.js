const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  addDocumentationSource,
  addCustomLink,
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks,
  removeDocumentationSource,
  removeCustomLink,
  loadConfig
} = require('../src/enhanced-index');

// Test configuration
const TEST_CONFIG_DIR = path.join(os.tmpdir(), '.docindex-test');
const TEST_DATA_DIR = path.join(TEST_CONFIG_DIR, 'data');
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

// Mock the paths for testing
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => os.tmpdir()
}));

// Mock axios to avoid actual network requests
jest.mock('axios');
const axios = require('axios');

describe('Enhanced DocIndex', () => {
  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    
    // Reset all mocks
    jest.resetAllMocks();
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  test('loadConfig should create default config if none exists', () => {
    const config = loadConfig();
    
    assert.strictEqual(Array.isArray(config.sources), true);
    assert.strictEqual(Array.isArray(config.customLinks), true);
    assert.strictEqual(config.sources.length, 0);
    assert.strictEqual(config.customLinks.length, 0);
  });

  test('addCustomLink should add a custom link', () => {
    const link = addCustomLink(
      'https://example.com/docs',
      'Example Docs',
      ['example', 'test']
    );
    
    assert.strictEqual(link.name, 'Example Docs');
    assert.strictEqual(link.url, 'https://example.com/docs');
    assert.deepStrictEqual(link.tags, ['example', 'test']);
    
    const config = loadConfig();
    assert.strictEqual(config.customLinks.length, 1);
    assert.strictEqual(config.customLinks[0].name, 'Example Docs');
  });

  test('addDocumentationSource should crawl and index pages', async () => {
    // Mock HTML responses
    const mockHtml = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Test Heading</h1>
          <p>Test paragraph with some content.</p>
          <a href="/page1">Link 1</a>
          <a href="/page2">Link 2</a>
          <pre><code>const test = "code block";</code></pre>
        </body>
      </html>
    `;
    
    const mockPage1Html = `
      <html>
        <head><title>Page 1</title></head>
        <body>
          <h1>Page 1 Heading</h1>
          <p>This is page 1 content.</p>
          <a href="/page3">Link 3</a>
        </body>
      </html>
    `;
    
    const mockPage2Html = `
      <html>
        <head><title>Page 2</title></head>
        <body>
          <h1>Page 2 Heading</h1>
          <p>This is page 2 content about navigation.</p>
        </body>
      </html>
    `;
    
    // Set up axios mock responses
    axios.get.mockImplementation((url) => {
      if (url === 'https://example.com/docs') {
        return Promise.resolve({ data: mockHtml });
      } else if (url === 'https://example.com/page1') {
        return Promise.resolve({ data: mockPage1Html });
      } else if (url === 'https://example.com/page2') {
        return Promise.resolve({ data: mockPage2Html });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    
    // Add documentation source
    const source = await addDocumentationSource(
      'https://example.com/docs',
      'Example Docs',
      ['example', 'test'],
      2,  // depth
      10  // max pages
    );
    
    // Verify source was added
    assert.strictEqual(source.name, 'Example Docs');
    assert.strictEqual(source.url, 'https://example.com/docs');
    assert.deepStrictEqual(source.tags, ['example', 'test']);
    
    // Verify pages were indexed
    assert.strictEqual(source.pageCount, 3);
    
    // Verify source directory was created
    const sourceDir = path.join(TEST_DATA_DIR, source.id);
    assert.strictEqual(fs.existsSync(sourceDir), true);
    
    // Verify index file was created
    const indexPath = path.join(sourceDir, 'index.json');
    assert.strictEqual(fs.existsSync(indexPath), true);
    
    // Verify index content
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert.strictEqual(indexData.name, 'Example Docs');
    assert.strictEqual(indexData.pages.length, 3);
  });

  test('searchDocumentation should find content across pages', async () => {
    // Mock HTML responses
    const mockHtml = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Test Heading</h1>
          <p>Test paragraph with some content.</p>
          <a href="/page1">Link 1</a>
          <a href="/page2">Link 2</a>
        </body>
      </html>
    `;
    
    const mockPage1Html = `
      <html>
        <head><title>Page 1</title></head>
        <body>
          <h1>Page 1 Heading</h1>
          <p>This is page 1 content.</p>
        </body>
      </html>
    `;
    
    const mockPage2Html = `
      <html>
        <head><title>Page 2</title></head>
        <body>
          <h1>Navigation Systems</h1>
          <p>This page is about navigation features.</p>
        </body>
      </html>
    `;
    
    // Set up axios mock responses
    axios.get.mockImplementation((url) => {
      if (url === 'https://example.com/docs') {
        return Promise.resolve({ data: mockHtml });
      } else if (url === 'https://example.com/page1') {
        return Promise.resolve({ data: mockPage1Html });
      } else if (url === 'https://example.com/page2') {
        return Promise.resolve({ data: mockPage2Html });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    
    // Add documentation source
    await addDocumentationSource(
      'https://example.com/docs',
      'Example Docs',
      ['example', 'test'],
      2,  // depth
      10  // max pages
    );
    
    // Search for "navigation"
    const results = searchDocumentation('navigation');
    
    // Verify results
    assert.strictEqual(results.documentationMatches.length, 1);
    assert.strictEqual(results.documentationMatches[0].source.name, 'Example Docs');
    assert.strictEqual(results.documentationMatches[0].pageMatches.length, 1);
    
    // Verify the correct page was matched
    const pageMatch = results.documentationMatches[0].pageMatches[0];
    assert.strictEqual(pageMatch.page.title, 'Page 2');
    
    // Verify both heading and paragraph matches
    assert.strictEqual(pageMatch.matches.headings.length, 1);
    assert.strictEqual(pageMatch.matches.headings[0].text, 'Navigation Systems');
    assert.strictEqual(pageMatch.matches.paragraphs.length, 1);
    assert.strictEqual(pageMatch.matches.paragraphs[0].text, 'This page is about navigation features.');
  });
});