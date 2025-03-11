/**
 * Factory for document processors
 * 
 * This factory is responsible for creating and selecting the appropriate
 * document processor for a given documentation source based on its URL
 * and content patterns.
 */

import { getLogger } from '../../../../shared/infrastructure/logging.js';
import { IDocumentProcessor } from './DocumentProcessor.js';
import { GenericDocProcessor } from './GenericDocProcessor.js';
import { NodejsDocProcessor } from './NodejsDocProcessor.js';
import { ReactDocProcessor } from './ReactDocProcessor.js';
import { TypeScriptDocProcessor } from './TypeScriptDocProcessor.js';
import { MDNDocProcessor } from './MDNDocProcessor.js';

const logger = getLogger();

/**
 * Factory for document processors
 */
export class ProcessorFactory {
  private processors: IDocumentProcessor[] = [];
  private fallbackProcessor: IDocumentProcessor;
  
  /**
   * Create a new processor factory
   */
  constructor() {
    // Initialize the fallback processor
    this.fallbackProcessor = new GenericDocProcessor();
    
    // Initialize all specialized processors
    this.processors = [
      new NodejsDocProcessor(),
      new ReactDocProcessor(),
      new TypeScriptDocProcessor(),
      new MDNDocProcessor(),
      // Add more specialized processors here
    ];
    
    logger.info(`ProcessorFactory initialized with ${this.processors.length} specialized processors`, 'ProcessorFactory');
  }
  
  /**
   * Get a document processor for a specific source
   * @param url The source URL
   * @param html HTML content of the page (optional)
   * @returns The appropriate document processor
   */
  getProcessor(url: string, html?: string): IDocumentProcessor {
    // Try all specialized processors
    for (const processor of this.processors) {
      if (processor.canHandle(url, html)) {
        logger.debug(`Using ${processor.getName()} for ${url}`, 'ProcessorFactory');
        return processor;
      }
    }
    
    // Fallback to generic processor
    logger.debug(`Using fallback processor for ${url}`, 'ProcessorFactory');
    return this.fallbackProcessor;
  }
  
  /**
   * Register a new processor
   * @param processor The processor to register
   */
  registerProcessor(processor: IDocumentProcessor): void {
    this.processors.push(processor);
    logger.info(`Registered processor: ${processor.getName()}`, 'ProcessorFactory');
  }
  
  /**
   * Get all registered processors
   * @returns Array of all registered processors
   */
  getAllProcessors(): IDocumentProcessor[] {
    return [...this.processors, this.fallbackProcessor];
  }
  
  /**
   * Set the fallback processor
   * @param processor The processor to use as fallback
   */
  setFallbackProcessor(processor: IDocumentProcessor): void {
    this.fallbackProcessor = processor;
    logger.info(`Set fallback processor to: ${processor.getName()}`, 'ProcessorFactory');
  }
}

// Singleton instance for global use
let instance: ProcessorFactory | null = null;

/**
 * Get the processor factory instance
 * @returns The processor factory instance
 */
export function getProcessorFactory(): ProcessorFactory {
  if (!instance) {
    instance = new ProcessorFactory();
  }
  return instance;
}