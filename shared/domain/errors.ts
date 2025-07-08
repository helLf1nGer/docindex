/**
 * Defines custom error types for the DocSI application.
 */

/**
 * Base class for all DocSI specific errors.
 * Allows adding custom properties like errorCode and details.
 */
export class DocsiError extends Error {
  public errorCode: string; // Made mutable to allow subclasses to override
  public readonly details?: Record<string, any>;

  constructor(message: string, errorCode: string, details?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name; // Set the error name to the class name
    this.errorCode = errorCode;
    this.details = details;

    // Maintains proper stack trace in V8 environments (like Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// --- Source Related Errors ---

export class SourceNotFoundError extends DocsiError {
  constructor(sourceIdentifier: string, details?: Record<string, any>) {
    super(`Documentation source '${sourceIdentifier}' not found.`, 'SOURCE_NOT_FOUND', details);
  }
}

export class SourceExistsError extends DocsiError {
  constructor(sourceName: string, details?: Record<string, any>) {
    super(`Documentation source with name '${sourceName}' already exists.`, 'SOURCE_EXISTS', details);
  }
}

// --- Document Related Errors ---

export class DocumentNotFoundError extends DocsiError {
  constructor(documentIdentifier: string, details?: Record<string, any>) {
    super(`Document '${documentIdentifier}' not found.`, 'DOCUMENT_NOT_FOUND', details);
  }
}

// --- Validation Errors ---

export class ValidationError extends DocsiError {
  constructor(message: string, details?: Record<string, any>) {
    super(`Validation failed: ${message}`, 'VALIDATION_ERROR', details);
  }
}

// --- Crawling Errors ---

export class CrawlError extends DocsiError {
  constructor(message: string, errorCode: string = 'CRAWL_ERROR', details?: Record<string, any>) {
    super(`Crawling failed: ${message}`, errorCode, details);
  }
}

export class CrawlTimeoutError extends CrawlError {
  constructor(url: string, timeoutMs: number, details?: Record<string, any>) {
    super(`Timeout (${timeoutMs}ms) occurred while crawling URL: ${url}`, 'CRAWL_TIMEOUT', { url, timeoutMs, ...details });
  }
}

export class CrawlNetworkError extends CrawlError {
  constructor(url: string, originalError?: Error, details?: Record<string, any>) {
    super(`Network error occurred while crawling URL: ${url}. ${originalError?.message || ''}`, 'CRAWL_NETWORK_ERROR', { url, originalError, ...details });
  }
}

export class CrawlHttpError extends CrawlError {
  constructor(url: string, statusCode: number, statusText?: string, details?: Record<string, any>) {
    super(`HTTP error ${statusCode} (${statusText || 'Unknown Status'}) occurred while crawling URL: ${url}`, 'CRAWL_HTTP_ERROR', { url, statusCode, statusText, ...details });
  }
}

// --- Filesystem Errors ---

export class FileSystemError extends DocsiError {
  constructor(message: string, path?: string, originalError?: Error, details?: Record<string, any>) {
    super(`Filesystem error: ${message}${path ? ` (Path: ${path})` : ''}. ${originalError?.message || ''}`, 'FILESYSTEM_ERROR', { path, originalError, ...details });
  }
}


export class ContentVerificationError extends FileSystemError {
  constructor(path: string, details?: Record<string, any>) {
    // Call FileSystemError constructor correctly (message, path?, originalError?, details?)
    super(`Content verification failed after writing to temporary file.`, path, undefined, { path, ...details });
    // Now override the errorCode set by the parent constructor
    this.errorCode = 'CONTENT_VERIFICATION_FAILED';
  }
}

export class SecurityError extends FileSystemError {
  constructor(message: string, path?: string, details?: Record<string, any>) {
    super(`Security error: ${message}`, path, undefined, { path, ...details });
    this.errorCode = 'SECURITY_ERROR';
  }
}


// --- Vector Database Errors (Qdrant) ---

export class QdrantError extends DocsiError {
  constructor(message: string, originalError?: Error, details?: Record<string, any>) {
    super(`Qdrant error: ${message}. ${originalError?.message || ''}`, 'QDRANT_ERROR', { originalError, ...details });
  }
}

// --- Embedding Service Errors ---

export class EmbeddingError extends DocsiError {
  constructor(message: string, provider?: string, originalError?: Error, details?: Record<string, any>) {
    super(`Embedding error${provider ? ` with provider ${provider}` : ''}: ${message}. ${originalError?.message || ''}`, 'EMBEDDING_ERROR', { provider, originalError, ...details });
  }
}

// --- Configuration Errors ---
export class ConfigurationError extends DocsiError {
  constructor(message: string, details?: Record<string, any>) {
    super(`Configuration error: ${message}`, 'CONFIG_ERROR', details);
  }
}

// --- MCP Handler Errors ---
export class McpHandlerError extends DocsiError {
  constructor(message: string, toolName?: string, details?: Record<string, any>) {
    super(`MCP Handler error${toolName ? ` in tool ${toolName}` : ''}: ${message}`, 'MCP_HANDLER_ERROR', { toolName, ...details });
  }
}


// --- Serialization Errors ---

export class SerializationError extends DocsiError {
  constructor(message: string, originalError?: Error, details?: Record<string, any>) {
    super(`Serialization error: ${message}. ${originalError?.message || ''}`, 'SERIALIZATION_ERROR', { originalError, ...details });
  }
}

// --- Utility function to check if an error is a DocsiError ---
export function isDocsiError(error: unknown): error is DocsiError {
  return error instanceof DocsiError;
}