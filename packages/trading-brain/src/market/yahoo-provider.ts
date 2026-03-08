/**
 * Yahoo Finance Provider — REST Stock Prices (default, kostenlos)
 *
 * Kein API-Key nötig. Rate limit: casual use OK.
 */

import { getLogger } from '../utils/logger.js';
import type { OHLCVCandle } from '../paper/types.js';
import type { MarketDataProvider } from './market-data-provider.js';

interface YahooChartResult {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: number[];
          high?: number[];
          low?: number[];
          close?: number[];
          volume?: number[];
        }>;
      };
    }>;
  };
}

/** Max age in ms before a price is considered stale (15 minutes) */
const STALE_THRESHOLD_MS = 15 * 60 * 1000;

export class YahooProvider implements MarketDataProvider {
  readonly name = 'yahoo';
  readonly assetTypes = ['stock'] as const;
  readonly supportsStreaming = false;

  private readonly log = getLogger();
  /** Track which symbols returned stale prices */
  private staleSymbols = new Set<string>();

  /** Check if last fetched price for a symbol was stale */
  isStale(symbol: string): boolean {
    return this.staleSymbols.has(symbol);
  }

  /** Get all currently stale symbols */
  getStaleSymbols(): string[] {
    return [...this.staleSymbols];
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d', {
        headers: { 'User-Agent': 'TradingBrain/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    for (const symbol of symbols) {
      try {
        await this.delay(500); // rate limit
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'TradingBrain/1.0' },
        });

        if (!response.ok) continue;

        const data = await response.json() as YahooChartResult;
        const result = data?.chart?.result?.[0];
        const closes = result?.indicators?.quote?.[0]?.close;
        const timestamps = result?.timestamp;
        if (closes && closes.length > 0) {
          for (let i = closes.length - 1; i >= 0; i--) {
            if (closes[i] != null) {
              prices.set(symbol, closes[i]!);

              // Stale detection: check timestamp of last valid data point
              if (timestamps && timestamps[i] != null) {
                const priceAgeMs = Date.now() - timestamps[i]! * 1000;
                if (priceAgeMs > STALE_THRESHOLD_MS) {
                  this.staleSymbols.add(symbol);
                  this.log.warn(`[yahoo] ${symbol} price is stale (${Math.round(priceAgeMs / 60_000)}min old)`);
                } else {
                  this.staleSymbols.delete(symbol);
                }
              }
              break;
            }
          }
        }
      } catch (err) {
        this.log.warn(`Yahoo ${symbol} error: ${(err as Error).message}`);
      }
    }

    return prices;
  }

  async fetchOHLCV(symbol: string, _timeframe = '5m', _limit = 100): Promise<OHLCVCandle[]> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=5m`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TradingBrain/1.0' },
      });

      if (!response.ok) return [];

      const data = await response.json() as YahooChartResult;
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp) return [];

      const quotes = result.indicators?.quote?.[0];
      if (!quotes) return [];

      const candles: OHLCVCandle[] = [];
      for (let i = 0; i < result.timestamp.length; i++) {
        const o = quotes.open?.[i];
        const h = quotes.high?.[i];
        const l = quotes.low?.[i];
        const c = quotes.close?.[i];
        const v = quotes.volume?.[i];
        if (o != null && h != null && l != null && c != null) {
          candles.push({
            timestamp: result.timestamp[i]! * 1000,
            open: o, high: h, low: l, close: c, volume: v ?? 0,
          });
        }
      }

      return candles;
    } catch (err) {
      this.log.warn(`Yahoo OHLCV ${symbol} error: ${(err as Error).message}`);
      return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
