/**
 * CoinGecko Provider — REST Crypto Prices (default, kostenlos)
 *
 * Kein API-Key nötig. Rate limit: ~30 req/min (free tier).
 * OHLCV nur 1-day/7-day granularity.
 */

import { getLogger } from '../utils/logger.js';
import type { OHLCVCandle } from '../paper/types.js';
import type { MarketDataProvider } from './market-data-provider.js';

export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = 'coingecko';
  readonly assetTypes = ['crypto'] as const;
  readonly supportsStreaming = false;

  private readonly log = getLogger();
  private consecutiveErrors = 0;

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/ping', {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (symbols.length === 0) return prices;

    try {
      const ids = symbols.join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
      const response = await fetch(url);

      if (!response.ok) {
        this.consecutiveErrors++;
        this.log.warn(`CoinGecko price fetch failed: ${response.status}`);
        return prices;
      }

      const data = await response.json() as Record<string, { usd?: number }>;
      for (const [id, priceData] of Object.entries(data)) {
        if (priceData?.usd) {
          prices.set(id, priceData.usd);
        }
      }

      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      this.log.warn(`CoinGecko price error: ${(err as Error).message}`);
    }

    return prices;
  }

  async fetchOHLCV(symbol: string, _timeframe = '1h', _limit = 24): Promise<OHLCVCandle[]> {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${symbol}/ohlc?vs_currency=usd&days=1`;
      const response = await fetch(url);

      if (!response.ok) {
        this.log.warn(`CoinGecko OHLCV ${symbol}: ${response.status}`);
        return [];
      }

      const data = await response.json() as number[][];
      if (!Array.isArray(data)) return [];

      return data.map(d => ({
        timestamp: d[0]!,
        open: d[1]!,
        high: d[2]!,
        low: d[3]!,
        close: d[4]!,
        volume: 0,
      }));
    } catch (err) {
      this.log.warn(`CoinGecko OHLCV ${symbol} error: ${(err as Error).message}`);
      return [];
    }
  }
}
