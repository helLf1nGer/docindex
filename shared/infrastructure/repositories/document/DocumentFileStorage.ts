import { promises as fs, constants } from 'fs';
import path from 'path';
import {
  FileSystemError,
  ContentVerificationError,
  SecurityError,
  SerializationError // Added SerializationError
} from '../../../../shared/domain/errors.js';
import { Document } from '../../../../shared/domain/models/Document.js';
import { Logger, getLogger } from '../../../../shared/infrastructure/logging.js'; // Import Logger type
import { randomUUID, createHash } from 'crypto';
import { readFile, writeFile, rename } from 'fs/promises';
import { DocumentValidator } from './DocumentValidator.js';
// Removed incorrect import for ContentExtractor

// Removed global logger instance

/**
 * Document file system operations helper
 */
export class DocumentFileStorage {
  private baseDir: string;
private logger: Logger; // Added logger property

constructor(baseDir: string, loggerInstance?: Logger) { // Added optional logger parameter
  this.baseDir = baseDir;
  this.logger = loggerInstance || getLogger(); // Use injected logger or fallback
}

  async initialize(): Promise<void> {
    await this.createDirectory(this.baseDir);
    this.logger.info(`Document storage initialized at ${this.baseDir}`, 'DocumentFileStorage.initialize');
  }

  /**
   * Get the base directory for storage
   * @returns Base directory path
   */
  public getBaseDir(): string {
    return this.baseDir;
  }


  getFilePath(id: string): string {
    this.logger.debug(`getFilePath called with id: ${id}`, 'DocumentFileStorage.getFilePath');
    const hash = createHash('sha256').update(id).digest('hex');
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    const dirPath = path.join(this.baseDir, dir1, dir2);

    if (!path.normalize(dirPath).startsWith(path.normalize(this.baseDir))) {
      // Log the security error before throwing
      this.logger.error(`Attempted path traversal detected for id: ${id}, generated path: ${dirPath}`, 'DocumentFileStorage.getFilePath');
      throw new SecurityError('Attempted path traversal detected', dirPath);
    }

    this.logger.debug(`getFilePath generated path: ${path.join(dirPath, `${hash}.json`)} for id: ${id}`, 'DocumentFileStorage.getFilePath');
    return path.join(dirPath, `${hash}.json`);
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: unknown) {
      const message = `Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'DocumentFileStorage.createDirectory', error);
      throw new FileSystemError(message, dirPath, error instanceof Error ? error : undefined);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug(`Successfully unlinked file: ${filePath}`, 'DocumentFileStorage.safeUnlink');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(`Failed to delete file ${filePath}: ${error.message}`, 'DocumentFileStorage.safeUnlink', error);
      } else {
        this.logger.debug(`File not found, no need to unlink: ${filePath}`, 'DocumentFileStorage.safeUnlink');
      }
    }
  }

  async writeDocument(filePath: string, document: Document): Promise<void> {
    // DEBUG LOG: Log received document type and ID
    this.logger.debug(`[DocumentFileStorage] writeDocument received document:`, 'DocumentFileStorage.writeDocument', { type: typeof document, id: document?.id });
    this.logger.info(`Entered writeDocument for filePath: ${filePath}, doc ID: ${document.id}`, 'DocumentFileStorage.writeDocument');
    this.logger.debug(`[DocumentFileStorage] Entering writeDocument for ID: ${document?.id || 'MISSING_ID'}, Path: ${filePath}`, 'writeDocument');
    const tempFilePath = `${filePath}.${randomUUID()}.tmp`;
    this.logger.debug(`Starting writeDocument for ID: ${document.id}`, 'DocumentFileStorage.writeDocument');
    this.logger.debug(`Target file path: ${filePath}`, 'DocumentFileStorage.writeDocument');
    this.logger.debug(`Temp file path: ${tempFilePath}`, 'DocumentFileStorage.writeDocument');

    try {
      this.logger.debug(`Writing document to ${filePath}`, 'DocumentFileStorage.writeDocument');
      const dirPath = path.dirname(filePath);
      this.logger.debug(`[DocumentFileStorage] Ensuring directory exists: ${dirPath}`, 'writeDocument');
      await this.createDirectory(dirPath);

      // DEBUG LOG: Log object structure before stringify
      this.logger.debug(`[DocumentFileStorage] Object structure before stringify:`, 'DocumentFileStorage.writeDocument', { id: document.id, url: document.url, title: document.title, sourceId: document.sourceId, textContentLength: document.textContent?.length });
      let documentData: string;
      try {
        this.logger.debug(`[DocumentFileStorage] Attempting to stringify document ID: ${document?.id || 'unknown'}`, 'writeDocument');
        documentData = JSON.stringify(document, null, 2);
      } catch (stringifyError: unknown) {
        const errorMsg = `Failed to serialize document ID: ${document?.id || 'unknown'}`;
        this.logger.error(errorMsg, 'DocumentFileStorage.writeDocument', stringifyError);
        throw new SerializationError(errorMsg, stringifyError instanceof Error ? stringifyError : undefined);
      }
      // DEBUG LOG: Log serialized data snippet after stringify
      this.logger.debug(`[DocumentFileStorage] Serialized data snippet (first 200 chars): ${documentData.substring(0, 200)}`, 'DocumentFileStorage.writeDocument');

      // DEBUG LOG: Log serialized data before write (kept original log, now redundant but harmless)
      this.logger.debug('[DocumentFileStorage] Serialized data for write:', 'DocumentFileStorage.writeDocument', { jsonString: documentData.substring(0, 200) + (documentData.length > 200 ? '...' : '') });
      // --- BEGIN ADDED VALIDATION ---
      // Enhanced validation check as per Task 3.2
      if (typeof documentData !== 'string' || documentData.length === 0 || documentData === 'undefined' || documentData.trim() === '') {
          const error = new FileSystemError(`Attempted to write invalid or empty data to file: ${filePath}. Received content type: ${typeof documentData}, length: ${documentData?.length}, content snippet: "${documentData.substring(0, 50)}..."`, filePath);
          this.logger.error(error.message, 'DocumentFileStorage.writeDocument', { filePath, contentType: typeof documentData, contentLength: documentData?.length, contentSnippet: documentData.substring(0,50) });
          // No need to clean up temp file here as it hasn't been created yet
          throw error; // Throw the specific error
      }
      // --- END ADDED VALIDATION ---

      this.logger.debug(`Writing content to temp file: ${tempFilePath}`, 'DocumentFileStorage.writeDocument');
      this.logger.debug(`[DocumentFileStorage] Attempting write to temp file: ${tempFilePath}`, 'writeDocument');
      await writeFile(tempFilePath, documentData, 'utf-8');
      this.logger.debug(`Successfully wrote to temp file: ${tempFilePath}`, 'DocumentFileStorage.writeDocument');
      this.logger.debug(`[DocumentFileStorage] Finished write attempt to temp file: ${tempFilePath}`, 'writeDocument');

      let isValid = false;
      this.logger.debug(`[DocumentFileStorage] Verifying content written to temp file: ${tempFilePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix
        this.logger.debug(`[DocumentFileStorage] Starting verification block for temp file: ${tempFilePath}`, 'writeDocument');
      try {
        this.logger.debug(`[DocumentFileStorage] Reading temp file for verification: ${tempFilePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix
        const content = await readFile(tempFilePath, 'utf-8');
        this.logger.debug(`[DocumentFileStorage] Read content from temp file: ${tempFilePath}. Length: ${content?.length}`, 'writeDocument');
        this.logger.debug(`[DocumentFileStorage] Parsing content from temp file: ${tempFilePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix
        const parsedContent = JSON.parse(content);
        this.logger.debug(`[DocumentFileStorage] Parsed content from temp file: ${tempFilePath}. Parsed ID: ${parsedContent?.id}`, 'writeDocument');
        isValid = parsedContent && parsedContent.id === document.id && parsedContent.url === document.url;
        if (!isValid) {
          this.logger.warn(`[DocumentFileStorage] Content verification FAILED for ${filePath}. Parsed ID: ${parsedContent?.id}, Expected ID: ${document.id}. Parsed URL: ${parsedContent?.url}, Expected URL: ${document.url}`, 'DocumentFileStorage.writeDocument'); // Added prefix
        } else {
          this.logger.debug(`[DocumentFileStorage] Content verification SUCCEEDED for: ${tempFilePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix
        }
      } catch (validationError: unknown) {
        // Log specific error during verification
        const errorMsg = `Error during content verification read/parse for ${tempFilePath}`;
        this.logger.error(errorMsg, 'DocumentFileStorage.writeDocument', validationError); // Log the specific validationError
        this.logger.debug(`[DocumentFileStorage] Verification error catch block for ${tempFilePath}`, 'writeDocument');
        await this.safeUnlink(tempFilePath); // Attempt cleanup on validation error
        // Throw a more specific error if possible, or rethrow
        throw new ContentVerificationError(filePath, { originalError: validationError instanceof Error ? validationError : undefined }); // Wrap original error
      }

      // Proceed only if content verification passed
      if (isValid) {
        this.logger.debug(`[DocumentFileStorage] Verification passed. Proceeding to rename for ${filePath}`, 'writeDocument');
        try {
          this.logger.debug(`[DocumentFileStorage] Renaming temp file ${tempFilePath} to ${filePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix
          // Ensure target directory exists before renaming
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          this.logger.debug(`[DocumentFileStorage] Ensured target directory exists: ${path.dirname(filePath)}`, 'writeDocument');
          if (await this.fileExists(filePath)) {
             this.logger.warn(`[DocumentFileStorage] Overwriting existing file: ${filePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix
             await this.safeUnlink(filePath);
          }
          await rename(tempFilePath, filePath);
          this.logger.debug(`[DocumentFileStorage] Successfully renamed temp file. Document write complete for ID: ${document.id} to ${filePath}`, 'DocumentFileStorage.writeDocument'); // Added prefix and confirmation
        } catch (renameError: unknown) {
          this.logger.debug(`[DocumentFileStorage] Rename error catch block for ${tempFilePath} -> ${filePath}`, 'writeDocument');
          // Log specific error during rename
          const errorMsg = `Error renaming temp file ${tempFilePath} to ${filePath}`;
          this.logger.error(errorMsg, 'DocumentFileStorage.writeDocument', renameError); // Log the specific renameError
          await this.safeUnlink(tempFilePath); // Attempt cleanup on rename error
          // Throw a FileSystemError wrapping the original
          throw new FileSystemError(errorMsg, filePath, renameError instanceof Error ? renameError : undefined);
        }
      } else {
        this.logger.warn(`Content verification failed for ${filePath}. File not saved.`, 'DocumentFileStorage.writeDocument');
        this.logger.warn(`[DocumentFileStorage] Verification failed. Aborting save for ${filePath}. Cleaning up temp file: ${tempFilePath}`, 'writeDocument');
        await this.safeUnlink(tempFilePath); // Ensure cleanup if verification failed
        throw new ContentVerificationError(filePath); // Pass path to constructor
      }
    } catch (error: unknown) { // Outer catch block
      // Log the main error from the outer try-catch, indicating which operation likely failed
      let operation = 'unknown';
      if (error instanceof SerializationError) operation = 'serialization';
      else if (error instanceof FileSystemError && error.message.includes('Attempted to write empty')) operation = 'pre-write validation';
      else if (error instanceof ContentVerificationError) operation = 'content verification';
      else if (error instanceof FileSystemError && error.message.includes('renaming')) operation = 'rename';
      else if (error instanceof FileSystemError && error.message.includes('create directory')) operation = 'directory creation';
      else if (error instanceof Error && error.name === 'TypeError' && error.message.includes('writeFile')) operation = 'temp file write (check input type)'; // More specific heuristic
      else if (error instanceof Error && error.message.includes('writeFile')) operation = 'temp file write'; // General write error

      const message = `Error in writeDocument (operation: ${operation}) for ID ${document.id} (${filePath}): ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(`[DocumentFileStorage] Outer catch block triggered for ${filePath}. Operation: ${operation}`, 'writeDocument');
      this.logger.error(message, 'DocumentFileStorage.writeDocument', { error }); // Log original error object
      // Attempt to clean up the temp file in case of any error
      this.logger.warn(`Attempting to clean up temp file: ${tempFilePath}`, 'DocumentFileStorage.writeDocument');
      await this.safeUnlink(tempFilePath).catch(cleanupError => { // Catch cleanup error specifically
         this.logger.error(`Failed to clean up temp file ${tempFilePath} after main error: ${String(cleanupError)}`, 'DocumentFileStorage.writeDocument', { cleanupError });
      });
      // Re-throw wrapped error if it's not already a FileSystemError or ContentVerificationError
      if (error instanceof FileSystemError || error instanceof ContentVerificationError) {
        throw error;
      }
      throw new FileSystemError(message, filePath, error instanceof Error ? error : undefined);
    }
  }

  async readDocument(filePath: string): Promise<Document> {
    this.logger.debug(`[DocumentFileStorage] Attempting to read file at path: ${filePath}`, 'readDocument');
    this.logger.debug(`[DocumentFileStorage] Attempting to read file at path: ${filePath}`, 'readDocument');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Document;
    } catch (error: unknown) {
      const message = `Failed to read document from ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'DocumentFileStorage.readDocument', error);
      throw new FileSystemError(message, filePath, error instanceof Error ? error : undefined);
    }
  }

  // Corrected walkDirectory signature: Added dirPath parameter back
  async walkDirectory(dirPath: string, callback: (filePath: string) => Promise<void>): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, callback); // Recursive call
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          await callback(fullPath);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.warn(`Directory not found during walk: ${dirPath}`, 'DocumentFileStorage.walkDirectory');
      } else {
        const message = `Error walking directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(message, 'DocumentFileStorage.walkDirectory', error);
        throw new FileSystemError(message, dirPath, error instanceof Error ? error : undefined);
      }
    }
  }

  // Added deleteDocument method as it seems to be used in FileSystemDocumentRepository
  async deleteDocument(filePath: string): Promise<boolean> {
    try {
      if (await this.fileExists(filePath)) {
        await fs.unlink(filePath);
        this.logger.info(`Document deleted successfully: ${filePath}`, 'DocumentFileStorage.deleteDocument');
        return true;
      }
      this.logger.warn(`Attempted to delete non-existent document: ${filePath}`, 'DocumentFileStorage.deleteDocument');
      return false; // Indicate file didn't exist
    } catch (error: unknown) {
      const message = `Failed to delete document ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message, 'DocumentFileStorage.deleteDocument', error);
      throw new FileSystemError(message, filePath, error instanceof Error ? error : undefined);
    }
  }
}