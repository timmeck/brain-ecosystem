import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriceFetcher } from '../price-fetcher.js';
import type { PaperConfig } from '../types.js';

const mockConfig: PaperConfig = {
  enabled: true,
  intervalMs: 300_000,
  startingBalance: 10_000,
  maxPositionPct: 5,
  maxPositions: 10,
  stopLossPct: -2.5,
  takeProfitPct: 4,
  trailingStopActivation: 3,
  trailingStopDistance: 1.5,
  confidenceThreshold: 0.60,
  scoreThreshold: 80,
  timeExitHours: 24,
  cryptoIds: ['bitcoin'],
  stockSymbols: ['AAPL'],
};

function createMockRepo() {
  return {
    getRecentPrices: vi.fn().mockReturnValue([]),
    savePrices: vi.fn(),
    pruneOldPrices: vi.fn(),
  };
}

describe('PriceFetcher', () => {
  describe('Per-provider rate limiting', () => {
    it('should have rate limiting properties initialized', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      expect((fetcher as any).providerErrors).toBeInstanceOf(Map);
      expect((fetcher as any).providerBackoff).toBeInstanceOf(Map);
      expect((fetcher as any).MAX_CONSECUTIVE_ERRORS).toBe(3);
    });

    it('should track consecutive errors per provider and compute backoff', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      for (let i = 0; i < 3; i++) {
        (fetcher as any).recordProviderError('coingecko');
      }

      expect((fetcher as any).providerErrors.get('coingecko')).toBe(3);
      expect((fetcher as any).getBackoff('coingecko')).toBeGreaterThan(0);
      // Yahoo should be unaffected
      expect((fetcher as any).getBackoff('yahoo')).toBe(0);
    });

    it('should reset error tracking on provider success', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      for (let i = 0; i < 5; i++) {
        (fetcher as any).recordProviderError('yahoo');
      }
      expect((fetcher as any).providerErrors.get('yahoo')).toBe(5);

      (fetcher as any).recordProviderSuccess('yahoo');
      expect((fetcher as any).providerErrors.get('yahoo')).toBe(0);
      expect((fetcher as any).getBackoff('yahoo')).toBe(0);
    });

    it('should cap backoff at MAX_BACKOFF_MS', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      for (let i = 0; i < 20; i++) {
        (fetcher as any).recordProviderError('coingecko');
      }

      expect((fetcher as any).getBackoff('coingecko')).toBeLessThanOrEqual(30_000);
    });

    it('should isolate providers from each other', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      for (let i = 0; i < 5; i++) {
        (fetcher as any).recordProviderError('coingecko');
      }
      (fetcher as any).recordProviderError('yahoo');

      expect((fetcher as any).providerErrors.get('coingecko')).toBe(5);
      expect((fetcher as any).providerErrors.get('yahoo')).toBe(1);
      expect((fetcher as any).getBackoff('coingecko')).toBeGreaterThan(0);
      expect((fetcher as any).getBackoff('yahoo')).toBe(0);
    });
  });

  describe('Cache', () => {
    it('should load candle cache from database on construction', () => {
      const repo = createMockRepo();
      repo.getRecentPrices.mockReturnValue([
        { timestamp: 1000, open: 50000, high: 51000, low: 49000, close: 50500, volume: 100 },
      ]);

      const fetcher = new PriceFetcher(mockConfig, repo as any);

      expect(repo.getRecentPrices).toHaveBeenCalled();
      expect(fetcher.getCandles('bitcoin').length).toBe(1);
      expect(fetcher.getPrice('bitcoin')).toBe(50500);
    });

    it('should return all configured symbols', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      const symbols = fetcher.getAllSymbols();
      expect(symbols).toContain('bitcoin');
      expect(symbols).toContain('AAPL');
    });
  });

  describe('Stale detection', () => {
    it('should initially have no stale symbols', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);
      expect(fetcher.isStale('AAPL')).toBe(false);
      expect(fetcher.getStaleSymbols()).toHaveLength(0);
    });

    it('should track stale symbols', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);
      (fetcher as any).staleSymbols.add('AAPL');
      expect(fetcher.isStale('AAPL')).toBe(true);
      expect(fetcher.getStaleSymbols()).toContain('AAPL');
    });
  });

  describe('pruneOldPrices', () => {
    it('should call repo.pruneOldPrices with correct cutoff', () => {
      const repo = createMockRepo();
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      fetcher.pruneOldPrices(30);

      expect(repo.pruneOldPrices).toHaveBeenCalled();
      const cutoffArg = repo.pruneOldPrices.mock.calls[0][0] as number;
      // Should be approximately 30 days ago
      const expectedCutoff = Date.now() - 30 * 86_400_000;
      expect(Math.abs(cutoffArg - expectedCutoff)).toBeLessThan(1000);
    });

    it('should handle repo errors gracefully', () => {
      const repo = createMockRepo();
      repo.pruneOldPrices.mockImplementation(() => { throw new Error('DB locked'); });
      const fetcher = new PriceFetcher(mockConfig, repo as any);

      // Should not throw
      const result = fetcher.pruneOldPrices(30);
      expect(result).toBe(0);
    });
  });
});
