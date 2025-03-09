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
} = require('../src/index');

// Test configuration
const TEST_CONFIG_DIR = path.join(os.tmpdir(), '.docindex-test');
const TEST_DATA_DIR = path.join(TEST_CONFIG_DIR, 'data');
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

// Mock the paths for testing
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => os.tmpdir()
}));

describe('DocIndex', () => {
  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
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

  test('listCustomLinks should return all custom links', () => {
    addCustomLink('https://example.com/docs1', 'Example Docs 1', ['example', 'test']);
    addCustomLink('https://example.com/docs2', 'Example Docs 2', ['example', 'test']);
    
    const links = listCustomLinks();
    
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].name, 'Example Docs 1');
    assert.strictEqual(links[1].name, 'Example Docs 2');
  });

  test('removeCustomLink should remove a custom link', () => {
    addCustomLink('https://example.com/docs1', 'Example Docs 1', ['example', 'test']);
    addCustomLink('https://example.com/docs2', 'Example Docs 2', ['example', 'test']);
    
    const removedLink = removeCustomLink('Example Docs 1');
    
    assert.strictEqual(removedLink.name, 'Example Docs 1');
    
    const links = listCustomLinks();
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].name, 'Example Docs 2');
  });

  test('searchDocumentation should find matching custom links', () => {
    addCustomLink('https://example.com/docs1', 'Example Docs 1', ['example', 'test']);
    addCustomLink('https://example.com/docs2', 'Example API', ['api', 'test']);
    
    const results = searchDocumentation('api');
    
    assert.strictEqual(results.customLinkMatches.length, 1);
    assert.strictEqual(results.customLinkMatches[0].name, 'Example API');
  });
});