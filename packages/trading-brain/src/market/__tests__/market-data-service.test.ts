import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { MarketDataService } from '../market-data-service.js';
import type { MarketDataProvider, PriceUpdate } from '../market-data-provider.js';
import type { OHLCVCandle } from '../../paper/types.js';

function createMockProvider(overrides: Partial<MarketDataProvider> = {}): MarketDataProvider {
  return {
    name: overrides.name ?? 'mock',
    assetTypes: overrides.assetTypes ?? ['crypto'],
    supportsStreaming: overrides.supportsStreaming ?? false,
    isAvailable: overrides.isAvailable ?? (async () => true),
    fetchPrices: overrides.fetchPrices ?? (async (symbols) => {
      const m = new Map<string, number>();
      for (const s of symbols) m.set(s, 50000 + Math.random() * 1000);
      return m;
    }),
    fetchOHLCV: overrides.fetchOHLCV ?? (async () => [
      { timestamp: Date.now() - 3600000, open: 50000, high: 51000, low: 49000, close: 50500, volume: 100 },
      { timestamp: Date.now(), open: 50500, high: 51500, low: 50000, close: 51000, volume: 120 },
    ]),
    startStreaming: overrides.startStreaming,
    stopStreaming: overrides.stopStreaming,
    shutdown: overrides.shutdown,
  };
}

describe('MarketDataService', () => {
  describe('registerProvider', () => {
    it('registers a provider', () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider());
      expect(svc.getProviders()).toHaveLength(1);
    });

    it('prevents duplicates', () => {
      const svc = new MarketDataService();
      const mock = createMockProvider();
      svc.registerProvider(mock);
      svc.registerProvider(mock);
      expect(svc.getProviders()).toHaveLength(1);
    });

    it('removeProvider works', () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider());
      svc.removeProvider('mock');
      expect(svc.getProviders()).toHaveLength(0);
    });
  });

  describe('fetchPrices', () => {
    it('fetches crypto prices from provider', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        fetchPrices: async (symbols) => {
          const m = new Map<string, number>();
          m.set('bitcoin', 60000);
          m.set('ethereum', 3500);
          return m;
        },
      }));

      const prices = await svc.fetchPrices(['bitcoin', 'ethereum'], []);
      expect(prices.get('bitcoin')).toBe(60000);
      expect(prices.get('ethereum')).toBe(3500);
    });

    it('fetches stock prices from stock provider', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        name: 'stocks',
        assetTypes: ['stock'],
        fetchPrices: async () => {
          const m = new Map<string, number>();
          m.set('AAPL', 175);
          return m;
        },
      }));

      const prices = await svc.fetchPrices([], ['AAPL']);
      expect(prices.get('AAPL')).toBe(175);
    });

    it('falls back to next provider on failure', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        name: 'failing',
        fetchPrices: async () => { throw new Error('down'); },
      }));
      svc.registerProvider(createMockProvider({
        name: 'backup',
        fetchPrices: async () => {
          const m = new Map<string, number>();
          m.set('bitcoin', 55000);
          return m;
        },
      }));

      const prices = await svc.fetchPrices(['bitcoin'], []);
      expect(prices.get('bitcoin')).toBe(55000);
    });

    it('emits price events', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        fetchPrices: async () => {
          const m = new Map<string, number>();
          m.set('bitcoin', 60000);
          return m;
        },
      }));

      const events: PriceUpdate[] = [];
      svc.onPrice(update => events.push(update));

      await svc.fetchPrices(['bitcoin'], []);
      expect(events).toHaveLength(1);
      expect(events[0].symbol).toBe('bitcoin');
      expect(events[0].price).toBe(60000);
    });

    it('unsubscribe works', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        fetchPrices: async () => {
          const m = new Map<string, number>();
          m.set('bitcoin', 60000);
          return m;
        },
      }));

      const events: PriceUpdate[] = [];
      const unsub = svc.onPrice(update => events.push(update));
      unsub(); // Unsubscribe

      await svc.fetchPrices(['bitcoin'], []);
      expect(events).toHaveLength(0);
    });
  });

  describe('fetchOHLCV', () => {
    it('fetches candles from provider', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider());

      const candles = await svc.fetchOHLCV('bitcoin');
      expect(candles.length).toBeGreaterThan(0);
      expect(candles[0]).toHaveProperty('open');
      expect(candles[0]).toHaveProperty('close');
    });

    it('caches OHLCV data', async () => {
      let fetchCount = 0;
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        fetchOHLCV: async () => {
          fetchCount++;
          return [{ timestamp: Date.now(), open: 50000, high: 51000, low: 49000, close: 50500, volume: 100 }];
        },
      }));

      await svc.fetchOHLCV('bitcoin');
      await svc.fetchOHLCV('bitcoin'); // Should use cache
      expect(fetchCount).toBe(1); // Only fetched once
    });

    it('falls back on failure', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        name: 'failing',
        fetchOHLCV: async () => { throw new Error('down'); },
      }));
      svc.registerProvider(createMockProvider({
        name: 'backup',
        fetchOHLCV: async () => [
          { timestamp: Date.now(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        ],
      }));

      const candles = await svc.fetchOHLCV('bitcoin');
      expect(candles.length).toBe(1);
    });
  });

  describe('getPrice / getAllPrices', () => {
    it('returns cached prices after fetch', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        fetchPrices: async () => {
          const m = new Map<string, number>();
          m.set('bitcoin', 60000);
          m.set('ethereum', 3500);
          return m;
        },
      }));

      await svc.fetchPrices(['bitcoin', 'ethereum'], []);
      expect(svc.getPrice('bitcoin')).toBe(60000);
      expect(svc.getPrice('ethereum')).toBe(3500);
      expect(svc.getPrice('nonexistent')).toBeUndefined();

      const all = svc.getAllPrices();
      expect(all.size).toBe(2);
    });
  });

  describe('streaming', () => {
    it('starts streaming on capable providers', async () => {
      const streamFn = vi.fn();
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        supportsStreaming: true,
        startStreaming: streamFn,
      }));

      await svc.startStreaming(['bitcoin']);
      expect(streamFn).toHaveBeenCalledTimes(1);
    });

    it('skips non-streaming providers', async () => {
      const streamFn = vi.fn();
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({
        supportsStreaming: false,
        startStreaming: streamFn,
      }));

      await svc.startStreaming(['bitcoin']);
      expect(streamFn).not.toHaveBeenCalled();
    });
  });

  describe('getProviderStatus', () => {
    it('returns status of all providers', async () => {
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({ name: 'p1' }));
      svc.registerProvider(createMockProvider({
        name: 'p2',
        isAvailable: async () => false,
      }));

      const status = await svc.getProviderStatus();
      expect(status).toHaveLength(2);
      expect(status.find(s => s.name === 'p1')?.available).toBe(true);
      expect(status.find(s => s.name === 'p2')?.available).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('calls shutdown on all providers', async () => {
      const shutdownFn = vi.fn();
      const svc = new MarketDataService();
      svc.registerProvider(createMockProvider({ shutdown: shutdownFn }));

      await svc.shutdown();
      expect(shutdownFn).toHaveBeenCalled();
    });
  });
});
