# Simplified Crawler Implementation

## Overview

The simplified crawler is a complete rewrite of the DocSI crawler subsystem with a focus on simplicity, reliability, and maintainability. It fixes the depth calculation issues present in the original implementation and ensures proper document storage and indexing.

## Key Improvements

1. **Simplified Architecture**
   - Replaced complex abstractions with straightforward components
   - Implemented clear parent-child URL relationship tracking
   - Used functional approach where appropriate

2. **Reliable Depth Tracking**
   - Direct depth calculation through parent-child relationships
   - Proper propagation of depth information to document metadata
   - Verified with comprehensive test suite 

3. **Improved Content Extraction**
   - Used battle-tested libraries (cheerio) for HTML processing
   - Implemented robust text extraction and cleaning
   - Added support for metadata, headings, and code block extraction

4. **Seamless Integration**
   - Created adapter for compatibility with existing ICrawlerService interface
   - Maintained backward compatibility with MCP tool handlers
   - Provided both Unix and Windows scripts for easy execution

## Components

### 1. SimpleUrlProcessor

The URL processor handles URL normalization, validation, and filtering with clear parent-child depth tracking.

Key features:
- URL normalization for consistent processing
- Configurable filtering based on patterns, extensions, and domains
- Straightforward depth tracking through parent-child relationships
- HTML link extraction with proper depth inheritance

### 2. SimpleContentExtractor

Content extractor that handles HTML parsing and text extraction using cheerio.

Key features:
- Configurable content selectors for main content identification
- Metadata extraction (title, description)
- Structure extraction (headings, code blocks)
- Text cleaning and normalization

### 3. SimpleCrawler

Main crawler implementation with recursive crawling and proper depth tracking.

Key features:
- Event-based architecture for progress tracking
- Concurrency controls with configurable limits
- Retry mechanisms for resilience
- Proper depth enforcement
- Queue management with prioritization

### 4. SimpleCrawlerService

Adapter implementation that provides compatibility with the existing ICrawlerService interface.

Key features:
- Job management with status tracking
- Event forwarding for integration with MCP handlers
- Configuration mapping between interfaces

## Usage

### Running the Simplified Crawler Server

#### For Windows Users

```powershell
# Navigate to the docindex directory
cd docindex

# Run the script
.\run-simplified.ps1
```

#### For Linux/Mac Users

```bash
# Navigate to the docindex directory
cd docindex

# Make the script executable
chmod +x run-simplified.sh

# Run the script
./run-simplified.sh
```

### Testing

A comprehensive test suite is included to verify the crawler's functionality.

```bash
# Run the test
node dist/services/crawler/test/SimpleCrawlerTest.js
```

This will:
1. Start a mock web server with pages at multiple depth levels
2. Run the crawler against the mock server
3. Verify proper depth calculation and document extraction
4. Output results with detailed statistics

## Integration with MCP

The simplified crawler is fully compatible with the existing MCP tool handlers. The following tools continue to work as before:

- `docsi-discover`: For managing documentation sources
- `docsi-search`: For searching through indexed documentation
- `docsi-batch-crawl`: For running batch crawl jobs

## Technical Implementation Details

### Depth Tracking

The simplified crawler tracks depth through direct parent-child relationships:

1. Initial URL starts at depth 0
2. Each child URL discovered on that page gets depth 1
3. URLs discovered on depth 1 pages get depth 2, and so on

This direct approach ensures accurate depth tracking without the complexity that caused issues in the original implementation.

### Content Extraction

Content extraction uses a simple but effective approach:

1. Try content extraction using configurable selectors (`main`, `article`, etc.)
2. Fall back to whole-page extraction with excluded elements removed
3. Clean and normalize the extracted text
4. Extract and preserve additional metadata (headings, code blocks)

### Document Storage

Documents are stored with proper metadata including:

- URL and title
- Clean extracted content (both HTML and plain text)
- Depth information
- Parent-child relationships
- Timestamps for indexing and updates

## Next Steps

While the simplified crawler addresses the core issues, there are opportunities for further enhancements:

1. **Performance Optimization**
   - Implement more efficient URL queue with priority based on page relevance
   - Add parallel processing for content extraction

2. **Content Analysis**
   - Add semantic analysis of extracted content
   - Implement relevance scoring based on content quality

3. **Integration Enhancements**
   - Provide direct CLI interface for standalone usage
   - Add visualization tools for crawl progress and results