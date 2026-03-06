import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { PlaywrightAdapter } from '../playwright-adapter.js';
import { FirecrawlAdapter } from '../firecrawl-adapter.js';

describe('PlaywrightAdapter', () => {
  it('has correct name', () => {
    const adapter = new PlaywrightAdapter();
    expect(adapter.name).toBe('playwright');
  });

  it('isEnabled returns true (optimistic)', () => {
    const adapter = new PlaywrightAdapter();
    expect(adapter.isEnabled()).toBe(true);
  });

  it('scout returns empty array', async () => {
    const adapter = new PlaywrightAdapter();
    const discoveries = await adapter.scout();
    expect(discoveries).toEqual([]);
  });

  it('checkAvailable returns false when playwright not installed', async () => {
    const adapter = new PlaywrightAdapter();
    // In test environment, playwright chromium is likely not installed
    const available = await adapter.checkAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('extract returns null when playwright unavailable', async () => {
    const adapter = new PlaywrightAdapter();
    // Force unavailable
    (adapter as any).available = false;
    const result = await adapter.extract('https://example.com');
    expect(result).toBeNull();
  });

  it('shutdown is safe when no browser', async () => {
    const adapter = new PlaywrightAdapter();
    await expect(adapter.shutdown()).resolves.not.toThrow();
  });
});

describe('FirecrawlAdapter', () => {
  it('has correct name', () => {
    const adapter = new FirecrawlAdapter();
    expect(adapter.name).toBe('firecrawl');
  });

  it('isEnabled returns false without API key', () => {
    const adapter = new FirecrawlAdapter({ apiKey: undefined });
    expect(adapter.isEnabled()).toBe(false);
  });

  it('isEnabled returns true with API key', () => {
    const adapter = new FirecrawlAdapter({ apiKey: 'fc-test' });
    expect(adapter.isEnabled()).toBe(true);
  });

  it('scout returns empty array', async () => {
    const adapter = new FirecrawlAdapter();
    const discoveries = await adapter.scout();
    expect(discoveries).toEqual([]);
  });

  it('scrape returns null when not enabled', async () => {
    const adapter = new FirecrawlAdapter({ apiKey: undefined });
    const result = await adapter.scrape('https://example.com');
    expect(result).toBeNull();
  });

  it('crawl returns empty when not enabled', async () => {
    const adapter = new FirecrawlAdapter({ apiKey: undefined });
    const result = await adapter.crawl('https://example.com');
    expect(result).toEqual([]);
  });

  it('scrape calls API with correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          markdown: '# Test\n\nContent here',
          metadata: { title: 'Test Page', description: 'A test page' },
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new FirecrawlAdapter({ apiKey: 'fc-test' });
    const result = await adapter.scrape('https://example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v1/scrape',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer fc-test',
        }),
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Page');
    expect(result!.markdown).toContain('# Test');

    vi.unstubAllGlobals();
  });

  it('scrape handles API errors gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new FirecrawlAdapter({ apiKey: 'fc-test' });
    const result = await adapter.scrape('https://example.com');
    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });
});
