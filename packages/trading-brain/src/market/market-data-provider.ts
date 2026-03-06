/**
 * Market Data Provider Interface — Multi-Source Price Feeds
 *
 * ═══════════════════════════════════════════════════════════════
 *  PROVIDER EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  CoinGecko (default, REST, kostenlos):
 *    → Funktioniert out of the box, keine Konfiguration nötig.
 *    → Polling alle 60s, OHLCV alle 15min.
 *
 *  CCXT WebSocket (optional, Echtzeit):
 *    1. npm install ccxt (bereits installiert)
 *    2. In .env oder config:
 *       CCXT_EXCHANGES=binance          # Kommasepariert: binance,coinbase,kraken
 *    3. Optional für private APIs (nicht nötig für Preise):
 *       BINANCE_API_KEY=...
 *       BINANCE_SECRET=...
 *    → Trading Brain erkennt CCXT automatisch.
 *      Preise kommen per WebSocket in Echtzeit.
 *      Fallback auf CoinGecko wenn WS disconnected.
 *
 *  Yahoo Finance (default für Stocks, REST):
 *    → Funktioniert out of the box.
 *
 *  Eigenen Provider bauen:
 *    Implementiere MarketDataProvider, registriere mit
 *    marketDataService.registerProvider(new MyProvider())
 * ═══════════════════════════════════════════════════════════════
 */

import type { OHLCVCandle } from '../paper/types.js';

// ── Price Event ──────────────────────────────────────────

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
  bid?: number;
  ask?: number;
  volume24h?: number;
}

// ── Provider Interface ───────────────────────────────────

export interface MarketDataProvider {
  /** Unique provider name (e.g. 'coingecko', 'ccxt-binance', 'yahoo') */
  readonly name: string;

  /** What asset types this provider supports */
  readonly assetTypes: readonly ('crypto' | 'stock' | 'forex')[];

  /** Whether this provider supports real-time streaming */
  readonly supportsStreaming: boolean;

  /** Check if provider is reachable */
  isAvailable(): Promise<boolean>;

  /** Fetch current prices for symbols. Returns Map<symbol, price>. */
  fetchPrices(symbols: string[]): Promise<Map<string, number>>;

  /** Fetch OHLCV candles for a symbol. */
  fetchOHLCV(symbol: string, timeframe?: string, limit?: number): Promise<OHLCVCandle[]>;

  /**
   * Start streaming prices (optional — only for real-time providers).
   * Calls onPrice for each price update.
   */
  startStreaming?(symbols: string[], onPrice: (update: PriceUpdate) => void): Promise<void>;

  /** Stop streaming */
  stopStreaming?(): Promise<void>;

  /** Graceful shutdown */
  shutdown?(): Promise<void>;
}

// ── Provider Status ──────────────────────────────────────

export interface MarketDataProviderStatus {
  name: string;
  available: boolean;
  assetTypes: string[];
  streaming: boolean;
  lastUpdate: number | null;
}
