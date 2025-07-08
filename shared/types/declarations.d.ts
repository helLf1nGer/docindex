/**
 * Global type declarations for third-party modules
 */

declare module "dotenv" {
  export function config(options?: {
    path?: string;
    encoding?: string;
    debug?: boolean;
    override?: boolean;
  }): { parsed: { [key: string]: string } };
}

declare module "robots-parser" {
  export default function(url: string, contents: string): {
    isAllowed: (userAgent: string, path: string) => boolean;
    getCrawlDelay: (userAgent: string) => number | null;
    getSitemaps: () => string[];
  };
}

declare module "lru-cache" {
  export interface LRUCacheOptions<K, V> {
    max?: number;
    maxSize?: number;
    ttl?: number;
    sizeCalculation?: (value: V, key: K) => number;
    dispose?: (value: V, key: K) => void;
    noDisposeOnSet?: boolean;
    updateAgeOnGet?: boolean;
    noUpdateTTL?: boolean;
  }

  export default class LRUCache<K, V> {
    constructor(options?: LRUCacheOptions<K, V>);
    set(key: K, value: V, options?: { ttl?: number; size?: number }): boolean;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    size: number;
  }
}