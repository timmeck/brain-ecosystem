import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { YahooProvider } from '../yahoo-provider.js';

describe('YahooProvider', () => {
  let provider: YahooProvider;

  beforeEach(() => {
    provider = new YahooProvider();
    // Skip the internal rate-limit delay
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).delay = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stale price detection', () => {
    it('marks price as stale when timestamp is older than 15 minutes', async () => {
      const now = Date.now();
      // Timestamp 30 minutes ago (in seconds, as Yahoo returns)
      const staleTimestamp = Math.floor((now - 30 * 60 * 1000) / 1000);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
        chart: {
          result: [{
            timestamp: [staleTimestamp],
            indicators: {
              quote: [{
                close: [150.50],
                open: [149.00],
                high: [151.00],
                low: [148.50],
                volume: [1000000],
              }],
            },
          }],
        },
      }), { status: 200 }));

      const prices = await provider.fetchPrices(['AAPL']);

      expect(prices.get('AAPL')).toBe(150.50);
      expect(provider.isStale('AAPL')).toBe(true);
      expect(provider.getStaleSymbols()).toContain('AAPL');
    });

    it('marks price as fresh when timestamp is recent', async () => {
      const now = Date.now();
      // Timestamp 5 minutes ago (fresh)
      const freshTimestamp = Math.floor((now - 5 * 60 * 1000) / 1000);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
        chart: {
          result: [{
            timestamp: [freshTimestamp],
            indicators: {
              quote: [{
                close: [150.50],
                open: [149.00],
                high: [151.00],
                low: [148.50],
                volume: [1000000],
              }],
            },
          }],
        },
      }), { status: 200 }));

      const prices = await provider.fetchPrices(['AAPL']);

      expect(prices.get('AAPL')).toBe(150.50);
      expect(provider.isStale('AAPL')).toBe(false);
    });

    it('clears stale flag when fresh price arrives', async () => {
      // First set as stale
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).staleSymbols.add('AAPL');
      expect(provider.isStale('AAPL')).toBe(true);

      const now = Date.now();
      const freshTimestamp = Math.floor((now - 2 * 60 * 1000) / 1000);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
        chart: {
          result: [{
            timestamp: [freshTimestamp],
            indicators: {
              quote: [{
                close: [155.00],
              }],
            },
          }],
        },
      }), { status: 200 }));

      await provider.fetchPrices(['AAPL']);

      expect(provider.isStale('AAPL')).toBe(false);
    });
  });
});
