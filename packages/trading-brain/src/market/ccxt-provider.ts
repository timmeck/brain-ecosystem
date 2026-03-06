/**
 * CCXT WebSocket Provider — Echtzeit-Preise von 100+ Exchanges
 *
 * ═══════════════════════════════════════════════════════════════
 *  EINRICHTEN (optional)
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. ccxt ist bereits installiert (npm install ccxt)
 *  2. In .env:
 *     CCXT_EXCHANGES=binance             # Welche Exchange(s)
 *     # Optional für private API (nicht nötig für Preis-Feeds):
 *     BINANCE_API_KEY=...
 *     BINANCE_SECRET=...
 *  3. Trading Brain registriert CCXT automatisch beim Start.
 *
 *  Unterstützte Exchanges (Auswahl):
 *  - binance, coinbase, kraken, okx, bybit, bitget, gate
 *  - Alle 100+ CCXT Pro Exchanges
 *
 *  Ohne CCXT: CoinGecko REST Polling (15-Min OHLCV).
 *  Mit CCXT: Echtzeit Ticker + 1h Candles via WebSocket.
 * ═══════════════════════════════════════════════════════════════
 */

import { getLogger } from '../utils/logger.js';
import type { OHLCVCandle } from '../paper/types.js';
import type { MarketDataProvider, PriceUpdate } from './market-data-provider.js';

export interface CCXTProviderConfig {
  /** Exchange ID (e.g. 'binance', 'coinbase'). Default: 'binance' */
  exchangeId?: string;
  /** API key (optional, not needed for public data) */
  apiKey?: string;
  /** API secret (optional) */
  secret?: string;
  /** Sandbox mode. Default: false */
  sandbox?: boolean;
}

export class CCXTProvider implements MarketDataProvider {
  readonly name: string;
  readonly assetTypes = ['crypto'] as const;
  readonly supportsStreaming = true;

  private readonly exchangeId: string;
  private readonly config: CCXTProviderConfig;
  private readonly log = getLogger();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private exchange: any = null;
  private streaming = false;
  private stopRequested = false;

  constructor(config: CCXTProviderConfig = {}) {
    this.exchangeId = config.exchangeId ?? process.env.CCXT_EXCHANGE ?? 'binance';
    this.name = `ccxt-${this.exchangeId}`;
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const exchange = await this.getExchange();
      if (!exchange) return false;
      await exchange.loadMarkets();
      return true;
    } catch {
      return false;
    }
  }

  async fetchPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    try {
      const exchange = await this.getExchange();
      if (!exchange) return prices;

      // Convert symbols to CCXT format (e.g. 'bitcoin' → 'BTC/USDT')
      const ccxtSymbols = symbols.map(s => this.toCCXTSymbol(s)).filter(Boolean) as string[];

      for (const symbol of ccxtSymbols) {
        try {
          const ticker = await exchange.fetchTicker(symbol);
          if (ticker?.last) {
            // Map back to our format
            const ourSymbol = this.fromCCXTSymbol(symbol);
            prices.set(ourSymbol, ticker.last);
          }
        } catch {
          // Individual symbol fetch can fail, continue
        }
      }
    } catch (err) {
      this.log.warn(`CCXT ${this.exchangeId} fetchPrices error: ${(err as Error).message}`);
    }

    return prices;
  }

  async fetchOHLCV(symbol: string, timeframe = '1h', limit = 100): Promise<OHLCVCandle[]> {
    try {
      const exchange = await this.getExchange();
      if (!exchange) return [];

      const ccxtSymbol = this.toCCXTSymbol(symbol);
      if (!ccxtSymbol) return [];

      const ohlcv = await exchange.fetchOHLCV(ccxtSymbol, timeframe, undefined, limit);
      if (!Array.isArray(ohlcv)) return [];

      return ohlcv.map((candle: number[]) => ({
        timestamp: candle[0]!,
        open: candle[1]!,
        high: candle[2]!,
        low: candle[3]!,
        close: candle[4]!,
        volume: candle[5] ?? 0,
      }));
    } catch (err) {
      this.log.warn(`CCXT ${this.exchangeId} OHLCV error: ${(err as Error).message}`);
      return [];
    }
  }

  async startStreaming(symbols: string[], onPrice: (update: PriceUpdate) => void): Promise<void> {
    const exchange = await this.getExchange();
    if (!exchange || !exchange.has?.watchTicker) {
      this.log.warn(`CCXT ${this.exchangeId}: WebSocket not supported, use REST fallback`);
      return;
    }

    this.streaming = true;
    this.stopRequested = false;

    const ccxtSymbols = symbols.map(s => this.toCCXTSymbol(s)).filter(Boolean) as string[];

    // Watch each symbol in parallel
    for (const symbol of ccxtSymbols) {
      this.watchSymbol(exchange, symbol, onPrice).catch(err => {
        if (!this.stopRequested) {
          this.log.warn(`CCXT watch ${symbol} error: ${(err as Error).message}`);
        }
      });
    }

    this.log.debug(`CCXT ${this.exchangeId} streaming ${ccxtSymbols.length} symbols`);
  }

  async stopStreaming(): Promise<void> {
    this.stopRequested = true;
    this.streaming = false;

    if (this.exchange?.close) {
      try {
        await this.exchange.close();
      } catch {
        // Best effort
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.stopStreaming();
    this.exchange = null;
  }

  // ── Private ────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getExchange(): Promise<any> {
    if (this.exchange) return this.exchange;

    try {
      // Dynamic import — ccxt is optional
      const ccxt = await import('ccxt');
      const ExchangeClass = (ccxt as any).pro?.[this.exchangeId] ?? (ccxt as any)[this.exchangeId];

      if (!ExchangeClass) {
        this.log.warn(`CCXT exchange '${this.exchangeId}' not found`);
        return null;
      }

      this.exchange = new ExchangeClass({
        apiKey: this.config.apiKey,
        secret: this.config.secret,
        ...(this.config.sandbox ? { sandbox: true } : {}),
      });

      return this.exchange;
    } catch (err) {
      this.log.debug(`CCXT not available: ${(err as Error).message}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async watchSymbol(exchange: any, symbol: string, onPrice: (update: PriceUpdate) => void): Promise<void> {
    while (this.streaming && !this.stopRequested) {
      try {
        const ticker = await exchange.watchTicker(symbol);
        if (ticker?.last) {
          onPrice({
            symbol: this.fromCCXTSymbol(symbol),
            price: ticker.last,
            timestamp: ticker.timestamp ?? Date.now(),
            source: this.name,
            bid: ticker.bid,
            ask: ticker.ask,
            volume24h: ticker.quoteVolume,
          });
        }
      } catch (err) {
        if (this.stopRequested) break;
        this.log.warn(`CCXT watch ${symbol} reconnecting: ${(err as Error).message}`);
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s before reconnect
      }
    }
  }

  /** Convert our symbol (e.g. 'bitcoin') to CCXT format (e.g. 'BTC/USDT') */
  private toCCXTSymbol(symbol: string): string | null {
    // Common CoinGecko ID → CCXT symbol mapping
    const map: Record<string, string> = {
      'bitcoin': 'BTC/USDT',
      'ethereum': 'ETH/USDT',
      'solana': 'SOL/USDT',
      'cardano': 'ADA/USDT',
      'ripple': 'XRP/USDT',
      'dogecoin': 'DOGE/USDT',
      'polkadot': 'DOT/USDT',
      'avalanche-2': 'AVAX/USDT',
      'chainlink': 'LINK/USDT',
      'polygon': 'MATIC/USDT',
      'litecoin': 'LTC/USDT',
      'uniswap': 'UNI/USDT',
    };

    // If it's already in CCXT format (contains /), pass through
    if (symbol.includes('/')) return symbol;

    return map[symbol.toLowerCase()] ?? null;
  }

  /** Convert CCXT symbol back to our format */
  private fromCCXTSymbol(symbol: string): string {
    const reverseMap: Record<string, string> = {
      'BTC/USDT': 'bitcoin',
      'ETH/USDT': 'ethereum',
      'SOL/USDT': 'solana',
      'ADA/USDT': 'cardano',
      'XRP/USDT': 'ripple',
      'DOGE/USDT': 'dogecoin',
      'DOT/USDT': 'polkadot',
      'AVAX/USDT': 'avalanche-2',
      'LINK/USDT': 'chainlink',
      'MATIC/USDT': 'polygon',
      'LTC/USDT': 'litecoin',
      'UNI/USDT': 'uniswap',
    };

    return reverseMap[symbol] ?? symbol.split('/')[0]?.toLowerCase() ?? symbol;
  }
}
