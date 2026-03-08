/**
 * Market Data Service — Aggregiert alle Provider, Event-driven Preise
 *
 * Architektur:
 *   MarketDataService
 *     ├── CoinGeckoProvider (REST, default)
 *     ├── CCXTProvider (WebSocket, optional)
 *     ├── YahooProvider (REST, default für Stocks)
 *     └── priceStream: EventEmitter → emit('price', PriceUpdate)
 */

import { getLogger } from '../utils/logger.js';
import type { OHLCVCandle } from '../paper/types.js';
import type { MarketDataProvider, PriceUpdate, MarketDataProviderStatus } from './market-data-provider.js';

type PriceListener = (update: PriceUpdate) => void;

export class MarketDataService {
  private providers: MarketDataProvider[] = [];
  private priceCache = new Map<string, PriceUpdate>();
  private ohlcvCache = new Map<string, OHLCVCandle[]>();
  private listeners: PriceListener[] = [];
  private readonly log = getLogger();

  /**
   * Register a market data provider.
   *
   * Example:
   * ```typescript
   * const service = new MarketDataService();
   * service.registerProvider(new CoinGeckoProvider());
   * service.registerProvider(new CCXTProvider({ exchangeId: 'binance' }));
   * service.registerProvider(new YahooProvider());
   * ```
   */
  registerProvider(provider: MarketDataProvider): void {
    if (this.providers.some(p => p.name === provider.name)) return;
    this.providers.push(provider);
    this.log.debug(`[MarketData] Registered provider: ${provider.name}`);
  }

  removeProvider(name: string): void {
    this.providers = this.providers.filter(p => p.name !== name);
  }

  getProviders(): MarketDataProvider[] {
    return [...this.providers];
  }

  /** Subscribe to real-time price updates */
  onPrice(listener: PriceListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /** Emit a price update to all listeners */
  private emitPrice(update: PriceUpdate): void {
    this.priceCache.set(update.symbol, update);
    for (const listener of this.listeners) {
      try {
        listener(update);
      } catch (err) {
        this.log.warn(`Price listener error: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Fetch prices for all symbols from best available provider.
   * Tries streaming providers first, then REST.
   */
  async fetchPrices(cryptoSymbols: string[], stockSymbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    // Crypto prices — try each provider that supports crypto
    const cryptoProviders = this.providers.filter(p => p.assetTypes.includes('crypto'));
    for (const provider of cryptoProviders) {
      try {
        const providerPrices = await provider.fetchPrices(cryptoSymbols);
        for (const [symbol, price] of providerPrices) {
          if (!prices.has(symbol)) {
            prices.set(symbol, price);
            this.emitPrice({
              symbol,
              price,
              timestamp: Date.now(),
              source: provider.name,
            });
          }
        }
        // If we got all prices from this provider, skip the rest
        if (cryptoSymbols.every(s => prices.has(s))) break;
      } catch (err) {
        this.log.warn(`[MarketData] ${provider.name} fetchPrices failed: ${(err as Error).message}`);
      }
    }

    // Stock prices — try each provider that supports stocks
    const stockProviders = this.providers.filter(p => p.assetTypes.includes('stock'));
    for (const provider of stockProviders) {
      try {
        const providerPrices = await provider.fetchPrices(stockSymbols);
        for (const [symbol, price] of providerPrices) {
          if (!prices.has(symbol)) {
            prices.set(symbol, price);
            this.emitPrice({
              symbol,
              price,
              timestamp: Date.now(),
              source: provider.name,
            });
          }
        }
        if (stockSymbols.every(s => prices.has(s))) break;
      } catch (err) {
        this.log.warn(`[MarketData] ${provider.name} fetchPrices failed: ${(err as Error).message}`);
      }
    }

    return prices;
  }

  /** Fetch OHLCV from best available provider, with caching */
  async fetchOHLCV(symbol: string, timeframe = '1h', limit = 100): Promise<OHLCVCandle[]> {
    // Check cache first (max 5 minutes)
    const cached = this.ohlcvCache.get(symbol);
    if (cached && cached.length > 0) {
      const lastCandle = cached[cached.length - 1]!;
      if (Date.now() - lastCandle.timestamp < 300_000) {
        return cached;
      }
    }

    // Try providers in order
    for (const provider of this.providers) {
      try {
        const candles = await provider.fetchOHLCV(symbol, timeframe, limit);
        if (candles.length > 0) {
          // Merge with existing cache
          const existing = this.ohlcvCache.get(symbol) ?? [];
          const lastTs = existing.length > 0 ? existing[existing.length - 1]!.timestamp : 0;
          const fresh = candles.filter(c => c.timestamp > lastTs);
          const merged = [...existing, ...fresh].slice(-500);
          this.ohlcvCache.set(symbol, merged);
          return merged;
        }
      } catch (err) {
        this.log.warn(`[MarketData] ${provider.name} OHLCV ${symbol} failed: ${(err as Error).message}`);
      }
    }

    return cached ?? [];
  }

  /** Start real-time streaming from all capable providers */
  async startStreaming(symbols: string[]): Promise<void> {
    for (const provider of this.providers) {
      if (provider.supportsStreaming && provider.startStreaming) {
        try {
          const available = await provider.isAvailable();
          if (!available) continue;

          await provider.startStreaming(symbols, (update) => {
            this.emitPrice(update);
          });
          this.log.info(`[MarketData] Streaming started on ${provider.name}`);
        } catch (err) {
          this.log.warn(`[MarketData] ${provider.name} streaming failed: ${(err as Error).message}`);
        }
      }
    }
  }

  /** Stop all streaming */
  async stopStreaming(): Promise<void> {
    for (const provider of this.providers) {
      if (provider.stopStreaming) {
        try {
          await provider.stopStreaming();
        } catch (err) { this.log.debug(`[MarketData] ${provider.name} stopStreaming error: ${(err as Error).message}`); }
      }
    }
  }

  /** Get last known price for a symbol */
  getPrice(symbol: string): number | undefined {
    return this.priceCache.get(symbol)?.price;
  }

  /** Get all cached prices */
  getAllPrices(): Map<string, number> {
    const prices = new Map<string, number>();
    for (const [symbol, update] of this.priceCache) {
      prices.set(symbol, update.price);
    }
    return prices;
  }

  /** Get cached candles for a symbol */
  getCandles(symbol: string): OHLCVCandle[] {
    return this.ohlcvCache.get(symbol) ?? [];
  }

  /** Get status of all providers */
  async getProviderStatus(): Promise<MarketDataProviderStatus[]> {
    return Promise.all(
      this.providers.map(async p => ({
        name: p.name,
        available: await p.isAvailable(),
        assetTypes: [...p.assetTypes],
        streaming: p.supportsStreaming,
        lastUpdate: this.priceCache.size > 0 ? Date.now() : null,
      })),
    );
  }

  /** Graceful shutdown */
  async shutdown(): Promise<void> {
    await this.stopStreaming();
    for (const provider of this.providers) {
      if (provider.shutdown) {
        try { await provider.shutdown(); } catch (err) { this.log.debug(`[MarketData] ${provider.name} shutdown error: ${(err as Error).message}`); }
      }
    }
    this.listeners = [];
  }
}
