# Crawler Troubleshooting Guide

This document provides solutions for common issues encountered when using the enhanced crawler.

## Common Issues and Solutions

### Crawler Not Discovering All Pages

**Symptoms:**
- Missing important pages in the crawl results
- Incomplete coverage of documentation sections

**Possible Causes and Solutions:**

1. **Depth Limit Too Low**
   - **Solution:** Increase the `maxDepth` setting
   ```typescript
   const config = {
     maxDepth: 7, // Increase from default of 5
     // other options...
   };
   ```

2. **URL Structure Not Mapped to Depth Correctly**
   - **Solution:** Change depth handling mode to adapt to the site structure
   ```typescript
   const config = {
     depthHandlingMode: 'adaptive', // Instead of 'strict'
     // other options...
   };
   ```

3. **Links Using JavaScript**
   - **Problem:** Some sites use JavaScript to render links which aren't discovered by the crawler
   - **Solution:** Add known important URLs as entry points
   ```typescript
   const config = {
     entryPoints: [
       'https://example.com/docs/getting-started',
       'https://example.com/docs/hidden-page' // Add known pages that might be missed
     ],
     // other options...
   };
   ```

### Memory Usage Issues

**Symptoms:**
- Process crashes with "JavaScript heap out of memory" errors
- Very slow crawling performance with high memory usage

**Possible Causes and Solutions:**

1. **Large Sitemaps**
   - **Solution:** Limit sitemap entries and processing batch size
   ```typescript
   const config = {
     sitemapOptions: {
       maxEntries: 500, // Reduce from default 1000
       processingBatchSize: 100 // Process in smaller batches
     },
     // other options...
   };
   ```

2. **Too High Concurrency**
   - **Solution:** Reduce concurrency setting
   ```typescript
   const config = {
     concurrency: 1, // Reduce from default 2
     // other options...
   };
   ```

3. **Very Large Documentation Site**
   - **Solution:** Enable large site mode with stricter limits
   ```typescript
   const config = {
     largeDocSiteOptions: {
       detectLargeSites: true,
       largeSiteThreshold: 300, // Lower threshold (default 500)
       maxUrlsPerSection: 25 // Reduce from default 50
     },
     // other options...
   };
   ```

### Crawling Takes Too Long

**Symptoms:**
- Crawling jobs run for hours without completing
- Progress seems to stall at certain percentages

**Possible Causes and Solutions:**

1. **Too Many Pages Discovered**
   - **Solution:** Set stricter limits on total pages
   ```typescript
   const config = {
     maxPages: 500, // Reduce from default 1000
     // other options...
   };
   ```

2. **Inefficient Prioritization**
   - **Solution:** Improve prioritization with specific patterns
   ```typescript
   const config = {
     prioritizationPatterns: [
       'getting-started',
       'tutorial',
       'api/.*'
     ],
     // other options...
   };
   ```

3. **Site Rate Limiting**
   - **Solution:** Increase crawl delay to avoid being throttled
   ```typescript
   const config = {
     crawlDelay: 500, // Milliseconds between requests (increase from default 100)
     // other options...
   };
   ```

### Timeout Errors

**Symptoms:**
- Many requests fail with timeout errors
- Crawling progress is very slow with many retries

**Possible Causes and Solutions:**

1. **Slow Server Response**
   - **Solution:** Increase request timeout
   ```typescript
   const config = {
     requestTimeoutMs: 30000, // Increase from default 10000 (10s to 30s)
     // other options...
   };
   ```

2. **Overloaded Target Server**
   - **Solution:** Reduce concurrency and increase delay
   ```typescript
   const config = {
     concurrency: 1,
     crawlDelay: 1000, // 1 second between requests
     // other options...
   };
   ```

3. **Network Issues**
   - **Solution:** Increase retry count and use exponential backoff
   ```typescript
   const config = {
     maxRetries: 5, // Increase from default 3
     useExponentialBackoff: true,
     // other options...
   };
   ```

## Debugging Techniques

### Enable Debug Mode

For more detailed logging during crawling:

```typescript
const config = {
  debug: true,
  // other options...
};
```

This will log additional information about:
- URL discovery
- Depth calculations
- Prioritization decisions
- Sitemap processing details

### Generate Crawl Report

To get a comprehensive report of the crawl results:

```typescript
// After a crawl completes
const report = await crawlerService.generateCrawlReport(jobId);
console.log(JSON.stringify(report, null, 2));
```

The report includes:
- URLs discovered by depth level
- Success/failure statistics
- Processing time metrics
- Sitemap statistics

### Dump Queue State

To examine the current crawl queue state:

```typescript
const queueState = await crawlerService.dumpQueueState(jobId);
console.log(JSON.stringify(queueState, null, 2));
```

This can help identify:
- Stuck queue processing
- Prioritization issues
- URLs that might be causing problems

## Performance Tuning

For the best balance of thoroughness and performance:

1. **Start with restrictive settings**
   ```typescript
   const config = {
     maxDepth: 3,
     maxPages: 200,
     concurrency: 1
   };
   ```

2. **Gradually increase limits** based on results

3. **Use adaptive depth mode** for most sites
   ```typescript
   const config = {
     depthHandlingMode: 'adaptive'
   };
   ```

4. **Enable section-based crawling** for large documentation
   ```typescript
   const config = {
     largeDocSiteOptions: {
       detectLargeSites: true
     }
   };
   ```

5. **Tune URL prioritization** for your specific documentation type
   ```typescript
   const config = {
     prioritizationPatterns: [
       // Add patterns specific to the documentation platform
     ]
   };
   ```

## When to Contact Support

Consider reaching out to the DocSI team if:

1. Crawler consistently fails despite configuration adjustments
2. Memory usage remains problematic after tuning
3. Critical pages are still not being discovered
4. You encounter error messages not covered in this guide