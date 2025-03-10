import { PrioritizationStrategy, PrioritizationParams } from './PrioritizationStrategy.js';
import { BreadthFirstStrategy } from './BreadthFirstStrategy.js';
import { DepthFirstStrategy } from './DepthFirstStrategy.js';
import { HybridStrategy } from './HybridStrategy.js';
import { getLogger } from '../../../../shared/infrastructure/logging.js';

/**
 * Factory for creating prioritization strategies
 * 
 * This factory creates instances of different prioritization strategies
 * based on the strategy name and parameters.
 */
export class StrategyFactory {
  private logger = getLogger();
  
  /**
   * Create a new prioritization strategy
   * 
   * @param strategyName Name of the strategy to create (breadth, depth, hybrid)
   * @param params Parameters for the strategy
   * @returns Prioritization strategy instance
   */
  createStrategy(
    strategyName: string = 'hybrid',
    params: PrioritizationParams = {}
  ): PrioritizationStrategy {
    this.logger.debug(`Creating ${strategyName} prioritization strategy`, 'StrategyFactory');
    
    switch (strategyName.toLowerCase()) {
      case 'breadth':
      case 'breadth-first':
        return new BreadthFirstStrategy(params);
        
      case 'depth':
      case 'depth-first':
        return new DepthFirstStrategy(params);
        
      case 'hybrid':
        return new HybridStrategy(params);
        
      default:
        this.logger.warn(`Unknown strategy "${strategyName}", defaulting to hybrid`, 'StrategyFactory');
        return new HybridStrategy(params);
    }
  }
  
  /**
   * Create a strategy from crawler settings
   * 
   * @param settings Crawler settings with prioritization configuration
   * @returns Prioritization strategy instance
   */
  createStrategyFromSettings(settings: {
    pagePrioritization?: {
      strategy: string;
      patterns?: string[];
      concurrency?: number;
    }
  }): PrioritizationStrategy {
    if (!settings.pagePrioritization) {
      // Default to hybrid strategy if no prioritization settings
      return this.createStrategy('hybrid', {});
    }
    
    const { strategy, patterns, concurrency } = settings.pagePrioritization;
    
    return this.createStrategy(strategy, {
      patterns,
      concurrency
    });
  }
}

// Export a singleton instance
export const strategyFactory = new StrategyFactory();