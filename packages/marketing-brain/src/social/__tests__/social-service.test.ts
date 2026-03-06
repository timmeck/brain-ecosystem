import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { SocialService } from '../social-service.js';
import type { SocialProvider, SocialPost, PublishResult, FeedItem, EngagementMetrics, SearchResult, FeedOptions } from '../social-provider.js';

function createMockProvider(overrides: Partial<SocialProvider> = {}): SocialProvider {
  return {
    name: overrides.name ?? 'mock',
    isAvailable: overrides.isAvailable ?? (async () => true),
    publish: overrides.publish ?? (async (post: SocialPost) => ({
      provider: overrides.name ?? 'mock',
      postId: 'post-1',
      url: 'https://example.com/post-1',
      success: true,
    })),
    readFeed: overrides.readFeed ?? (async () => [
      { id: '1', author: 'user', text: 'Hello', url: 'https://example.com/1', timestamp: 1000, likes: 5, reposts: 1, replies: 2, platform: overrides.name ?? 'mock' },
    ]),
    getEngagement: overrides.getEngagement ?? (async () => ({
      likes: 10, reposts: 3, replies: 5, timestamp: Date.now(),
    })),
    search: overrides.search ?? (async () => ({
      items: [
        { id: '1', author: 'user', text: 'Found', url: 'https://example.com/1', timestamp: 1000, likes: 5, reposts: 1, replies: 2, platform: overrides.name ?? 'mock' },
      ],
    })),
    shutdown: overrides.shutdown,
  };
}

describe('SocialService', () => {
  describe('registerProvider', () => {
    it('registers a provider', () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider());
      expect(svc.getProviders()).toHaveLength(1);
    });

    it('prevents duplicates', () => {
      const svc = new SocialService();
      const mock = createMockProvider();
      svc.registerProvider(mock);
      svc.registerProvider(mock);
      expect(svc.getProviders()).toHaveLength(1);
    });

    it('removeProvider works', () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider());
      svc.removeProvider('mock');
      expect(svc.getProviders()).toHaveLength(0);
    });
  });

  describe('publish', () => {
    it('publishes to a specific provider', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'bluesky',
        publish: async () => ({
          provider: 'bluesky',
          postId: 'at://did:plc:xxx/post/1',
          url: 'https://bsky.app/profile/test/post/1',
          success: true,
        }),
      }));

      const result = await svc.publish('bluesky', { text: 'Hello Bluesky!' });
      expect(result.success).toBe(true);
      expect(result.provider).toBe('bluesky');
    });

    it('returns error for unknown provider', async () => {
      const svc = new SocialService();
      const result = await svc.publish('unknown', { text: 'Hello' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error when provider is unavailable', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'down',
        isAvailable: async () => false,
      }));

      const result = await svc.publish('down', { text: 'Hello' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('catches provider errors', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'broken',
        publish: async () => { throw new Error('API error'); },
      }));

      const result = await svc.publish('broken', { text: 'Hello' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('publishAll', () => {
    it('publishes to all available providers', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'bluesky',
        publish: async () => ({ provider: 'bluesky', postId: '1', url: 'https://bsky.app/1', success: true }),
      }));
      svc.registerProvider(createMockProvider({
        name: 'reddit',
        publish: async () => ({ provider: 'reddit', postId: '2', url: 'https://reddit.com/2', success: true }),
      }));

      const results = await svc.publishAll({ text: 'Hello everywhere!' });
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('skips unavailable providers but includes them in results', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'available',
        publish: async () => ({ provider: 'available', postId: '1', url: 'url', success: true }),
      }));
      svc.registerProvider(createMockProvider({
        name: 'down',
        isAvailable: async () => false,
      }));

      const results = await svc.publishAll({ text: 'Hello' });
      expect(results).toHaveLength(2);
      expect(results.find(r => r.provider === 'available')?.success).toBe(true);
      expect(results.find(r => r.provider === 'down')?.success).toBe(false);
    });

    it('handles provider errors gracefully', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'ok',
        publish: async () => ({ provider: 'ok', postId: '1', url: 'url', success: true }),
      }));
      svc.registerProvider(createMockProvider({
        name: 'broken',
        publish: async () => { throw new Error('crash'); },
      }));

      const results = await svc.publishAll({ text: 'Hello' });
      expect(results).toHaveLength(2);
      expect(results.find(r => r.provider === 'ok')?.success).toBe(true);
      expect(results.find(r => r.provider === 'broken')?.success).toBe(false);
    });
  });

  describe('readFeed', () => {
    it('reads feed from specific provider', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'bluesky',
        readFeed: async () => [
          { id: '1', author: 'test', text: 'Post', url: 'url', timestamp: 2000, likes: 5, reposts: 1, replies: 2, platform: 'bluesky' },
        ],
      }));

      const items = await svc.readFeed('bluesky');
      expect(items).toHaveLength(1);
      expect(items[0].platform).toBe('bluesky');
    });

    it('aggregates feeds from all providers', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'bluesky',
        readFeed: async () => [
          { id: 'b1', author: 'test', text: 'Bluesky post', url: 'url', timestamp: 2000, likes: 5, reposts: 1, replies: 2, platform: 'bluesky' },
        ],
      }));
      svc.registerProvider(createMockProvider({
        name: 'reddit',
        readFeed: async () => [
          { id: 'r1', author: 'test', text: 'Reddit post', url: 'url', timestamp: 3000, likes: 10, reposts: 0, replies: 5, platform: 'reddit' },
        ],
      }));

      const items = await svc.readFeed();
      expect(items).toHaveLength(2);
      // Should be sorted by timestamp descending
      expect(items[0].id).toBe('r1');
      expect(items[1].id).toBe('b1');
    });

    it('returns empty for unknown provider', async () => {
      const svc = new SocialService();
      const items = await svc.readFeed('unknown');
      expect(items).toHaveLength(0);
    });

    it('skips unavailable providers in aggregate', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'available',
        readFeed: async () => [
          { id: '1', author: 'test', text: 'Post', url: 'url', timestamp: 1000, likes: 1, reposts: 0, replies: 0, platform: 'available' },
        ],
      }));
      svc.registerProvider(createMockProvider({
        name: 'down',
        isAvailable: async () => false,
      }));

      const items = await svc.readFeed();
      expect(items).toHaveLength(1);
    });
  });

  describe('getEngagement', () => {
    it('returns engagement from specific provider', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'bluesky',
        getEngagement: async () => ({ likes: 42, reposts: 7, replies: 3, timestamp: Date.now() }),
      }));

      const metrics = await svc.getEngagement('bluesky', 'post-1');
      expect(metrics.likes).toBe(42);
      expect(metrics.reposts).toBe(7);
    });

    it('returns zeros for unknown provider', async () => {
      const svc = new SocialService();
      const metrics = await svc.getEngagement('unknown', 'post-1');
      expect(metrics.likes).toBe(0);
    });
  });

  describe('search', () => {
    it('searches specific provider', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'reddit',
        search: async (query) => ({
          items: [
            { id: 'r1', author: 'user', text: `Found: ${query}`, url: 'url', timestamp: 1000, likes: 5, reposts: 0, replies: 2, platform: 'reddit' },
          ],
          cursor: 'next',
        }),
      }));

      const result = await svc.search('test query', 'reddit');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].text).toContain('test query');
    });

    it('searches across all providers', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({
        name: 'bluesky',
        search: async () => ({
          items: [
            { id: 'b1', author: 'user', text: 'Bluesky result', url: 'url', timestamp: 2000, likes: 5, reposts: 1, replies: 2, platform: 'bluesky' },
          ],
        }),
      }));
      svc.registerProvider(createMockProvider({
        name: 'reddit',
        search: async () => ({
          items: [
            { id: 'r1', author: 'user', text: 'Reddit result', url: 'url', timestamp: 3000, likes: 10, reposts: 0, replies: 5, platform: 'reddit' },
          ],
        }),
      }));

      const result = await svc.search('test');
      expect(result.items).toHaveLength(2);
      // Sorted by timestamp descending
      expect(result.items[0].id).toBe('r1');
    });

    it('returns empty for unknown provider', async () => {
      const svc = new SocialService();
      const result = await svc.search('test', 'unknown');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('getProviderStatus', () => {
    it('returns status of all providers', async () => {
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({ name: 'bluesky' }));
      svc.registerProvider(createMockProvider({
        name: 'reddit',
        isAvailable: async () => false,
      }));

      const status = await svc.getProviderStatus();
      expect(status).toHaveLength(2);
      expect(status.find(s => s.name === 'bluesky')?.available).toBe(true);
      expect(status.find(s => s.name === 'reddit')?.available).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('calls shutdown on all providers', async () => {
      const shutdownFn = vi.fn();
      const svc = new SocialService();
      svc.registerProvider(createMockProvider({ shutdown: shutdownFn }));

      await svc.shutdown();
      expect(shutdownFn).toHaveBeenCalled();
    });
  });
});
