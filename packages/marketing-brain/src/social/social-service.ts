/**
 * Social Service — Aggregiert alle Social Media Provider
 *
 * Architektur:
 *   SocialService
 *     ├── InternalProvider (SQLite, default — immer da)
 *     ├── BlueskyProvider (AT Protocol, optional)
 *     ├── RedditProvider (OAuth2, optional)
 *     └── publishAll() → postet auf alle konfigurierten Plattformen
 *
 * Einrichten:
 *   ```typescript
 *   const service = new SocialService();
 *   service.registerProvider(new BlueskyProvider());
 *   service.registerProvider(new RedditProvider());
 *   await service.publishAll({ text: 'Hello world!' });
 *   ```
 */

import { getLogger } from '../utils/logger.js';
import type {
  SocialProvider,
  SocialPost,
  PublishResult,
  FeedItem,
  FeedOptions,
  EngagementMetrics,
  SearchResult,
  SocialProviderStatus,
} from './social-provider.js';

export class SocialService {
  private providers: SocialProvider[] = [];
  private readonly log = getLogger();

  /** Register a social media provider */
  registerProvider(provider: SocialProvider): void {
    if (this.providers.some(p => p.name === provider.name)) return;
    this.providers.push(provider);
    this.log.debug(`[Social] Registered provider: ${provider.name}`);
  }

  /** Remove a provider by name */
  removeProvider(name: string): void {
    this.providers = this.providers.filter(p => p.name !== name);
  }

  /** Get all registered providers */
  getProviders(): SocialProvider[] {
    return [...this.providers];
  }

  /**
   * Publish to a single provider by name.
   * Returns the result or an error result if the provider is not found.
   */
  async publish(providerName: string, post: SocialPost): Promise<PublishResult> {
    const provider = this.providers.find(p => p.name === providerName);
    if (!provider) {
      return {
        provider: providerName,
        postId: '',
        url: '',
        success: false,
        error: `Provider '${providerName}' not found`,
      };
    }

    try {
      const available = await provider.isAvailable();
      if (!available) {
        return {
          provider: providerName,
          postId: '',
          url: '',
          success: false,
          error: `Provider '${providerName}' is not available`,
        };
      }
      return await provider.publish(post);
    } catch (err) {
      return {
        provider: providerName,
        postId: '',
        url: '',
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Publish to ALL available providers.
   * Returns results from each provider (some may fail, others succeed).
   */
  async publishAll(post: SocialPost): Promise<PublishResult[]> {
    const results: PublishResult[] = [];

    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) {
          results.push({
            provider: provider.name,
            postId: '',
            url: '',
            success: false,
            error: 'Provider not available',
          });
          continue;
        }
        const result = await provider.publish(post);
        results.push(result);
      } catch (err) {
        results.push({
          provider: provider.name,
          postId: '',
          url: '',
          success: false,
          error: (err as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * Read feed from a specific provider, or aggregate from all.
   */
  async readFeed(providerName?: string, options?: FeedOptions): Promise<FeedItem[]> {
    if (providerName) {
      const provider = this.providers.find(p => p.name === providerName);
      if (!provider) return [];
      try {
        return await provider.readFeed(options);
      } catch (err) {
        this.log.warn(`[Social] ${providerName} readFeed failed: ${(err as Error).message}`);
        return [];
      }
    }

    // Aggregate from all providers
    const allItems: FeedItem[] = [];
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) continue;
        const items = await provider.readFeed(options);
        allItems.push(...items);
      } catch (err) {
        this.log.warn(`[Social] ${provider.name} readFeed failed: ${(err as Error).message}`);
      }
    }

    // Sort by timestamp descending (newest first)
    allItems.sort((a, b) => b.timestamp - a.timestamp);
    return allItems;
  }

  /** Get engagement metrics for a post on a specific provider */
  async getEngagement(providerName: string, postId: string): Promise<EngagementMetrics> {
    const provider = this.providers.find(p => p.name === providerName);
    if (!provider) {
      return { likes: 0, reposts: 0, replies: 0, timestamp: Date.now() };
    }

    try {
      return await provider.getEngagement(postId);
    } catch {
      return { likes: 0, reposts: 0, replies: 0, timestamp: Date.now() };
    }
  }

  /** Search across a specific provider or all providers */
  async search(query: string, providerName?: string, options?: FeedOptions): Promise<SearchResult> {
    if (providerName) {
      const provider = this.providers.find(p => p.name === providerName);
      if (!provider) return { items: [] };
      try {
        return await provider.search(query, options);
      } catch (err) {
        this.log.warn(`[Social] ${providerName} search failed: ${(err as Error).message}`);
        return { items: [] };
      }
    }

    // Search across all providers
    const allItems: FeedItem[] = [];
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) continue;
        const result = await provider.search(query, options);
        allItems.push(...result.items);
      } catch (err) {
        this.log.warn(`[Social] ${provider.name} search failed: ${(err as Error).message}`);
      }
    }

    allItems.sort((a, b) => b.timestamp - a.timestamp);
    return { items: allItems };
  }

  /** Get status of all providers */
  async getProviderStatus(): Promise<SocialProviderStatus[]> {
    return Promise.all(
      this.providers.map(async p => {
        let available = false;
        try {
          available = await p.isAvailable();
        } catch { /* not available */ }
        return {
          name: p.name,
          available,
          postsPublished: 0, // providers track internally
        };
      }),
    );
  }

  /** Graceful shutdown */
  async shutdown(): Promise<void> {
    for (const provider of this.providers) {
      if (provider.shutdown) {
        try { await provider.shutdown(); } catch { /* best effort */ }
      }
    }
  }
}
