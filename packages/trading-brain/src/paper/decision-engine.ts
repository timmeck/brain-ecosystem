import type { PaperConfig, PaperPosition, IndicatorResult } from './types.js';
import type { SignalService } from '../services/signal.service.js';
import { fingerprint, type SignalInput } from '../signals/fingerprint.js';
import { getLogger } from '../utils/logger.js';

export interface EntrySignal {
  symbol: string;
  price: number;
  indicators: IndicatorResult;
  fingerprint: string;
  confidence: number;
  score: number;
  regime: string;
  signalsJson: string;
}

export interface ExitSignal {
  position: PaperPosition;
  reason: string;
  currentPrice: number;
}

export class DecisionEngine {
  private logger = getLogger();
  private totalClosedTrades = 0;

  constructor(
    private config: PaperConfig,
    private signalService: SignalService,
  ) {}

  /** Update closed trade count for cold-start logic. */
  setTradeCount(count: number): void {
    this.totalClosedTrades = count;
  }

  /**
   * Detect market regime from indicators.
   */
  detectRegime(indicators: IndicatorResult): string {
    if (indicators.trendScore > 2) return 'bullish_trend';
    if (indicators.trendScore < -2) return 'bearish_trend';
    if (indicators.volatility > 60) return 'volatile';
    return 'ranging';
  }

  /**
   * Check all positions for exit conditions.
   */
  checkExits(positions: PaperPosition[], prices: Map<string, number>): ExitSignal[] {
    const exits: ExitSignal[] = [];

    for (const pos of positions) {
      const currentPrice = prices.get(pos.symbol);
      if (currentPrice === undefined) continue;

      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const reason = this.getExitReason(pos, currentPrice, pnlPct);

      if (reason) {
        exits.push({ position: pos, reason, currentPrice });
      }
    }

    return exits;
  }

  /**
   * Check which symbols qualify for entry.
   */
  checkEntries(
    symbols: string[],
    prices: Map<string, number>,
    indicatorMap: Map<string, IndicatorResult>,
    openSymbols: Set<string>,
  ): EntrySignal[] {
    const entries: EntrySignal[] = [];

    for (const symbol of symbols) {
      if (openSymbols.has(symbol)) continue;

      const price = prices.get(symbol);
      const indicators = indicatorMap.get(symbol);
      if (!price || !indicators) continue;

      const regime = this.detectRegime(indicators);
      const signals: SignalInput = {
        rsi14: indicators.rsi14,
        macd: indicators.macd.line,
        trendScore: indicators.trendScore,
        volatility: indicators.volatility,
        regime,
      };

      const fp = fingerprint(signals);
      const confidence = this.signalService.getConfidence(signals, regime);
      const weights = this.signalService.getSignalWeights(signals, regime);
      const score = this.calcScore(weights);

      // Entry conditions
      if (!this.shouldEnter(indicators, confidence, score, regime)) continue;

      entries.push({
        symbol,
        price,
        indicators,
        fingerprint: fp,
        confidence,
        score,
        regime,
        signalsJson: JSON.stringify(signals),
      });
    }

    // Sort by confidence descending, take best ones
    entries.sort((a, b) => b.confidence - a.confidence);
    return entries;
  }

  private getExitReason(pos: PaperPosition, currentPrice: number, pnlPct: number): string | null {
    // Stop-Loss
    if (pnlPct <= this.config.stopLossPct) {
      return 'stop_loss';
    }

    // Take-Profit
    if (pnlPct >= this.config.takeProfitPct) {
      return 'take_profit';
    }

    // Trailing Stop: activate at +trailingStopActivation%, trail by trailingStopDistance%
    if (pnlPct >= this.config.trailingStopActivation) {
      const drawdownFromHigh = ((pos.highWaterMark - currentPrice) / pos.highWaterMark) * 100;
      if (drawdownFromHigh >= this.config.trailingStopDistance) {
        return 'trailing_stop';
      }
    }

    // Time Exit
    const openTime = new Date(pos.openedAt).getTime();
    const holdHours = (Date.now() - openTime) / 3600000;
    if (holdHours > this.config.timeExitHours) {
      return 'time_exit';
    }

    return null;
  }

  private shouldEnter(
    indicators: IndicatorResult,
    confidence: number,
    score: number,
    regime: string,
  ): boolean {
    // Don't enter in bearish regime
    if (regime === 'bearish_trend') return false;

    // Cold-start mode: relaxed thresholds when Brain has <20 closed trades
    const coldStart = this.totalClosedTrades < 20;
    const confThreshold = coldStart ? 0.0 : this.config.confidenceThreshold;

    // Confidence threshold
    if (confidence < confThreshold) {
      const hasBullishDiv = indicators.rsi14 < 30 && indicators.macd.line > 0;
      const hasStrongTrend = indicators.trendScore > 2 && indicators.volatility < 60;
      if (!hasBullishDiv && !hasStrongTrend) return false;
    }

    // Score threshold (skip during cold-start — no learned data yet)
    if (!coldStart && score > 0 && score < this.config.scoreThreshold) {
      const hasBullishDiv = indicators.rsi14 < 30 && indicators.macd.line > 0;
      if (!hasBullishDiv) return false;
    }

    // At least one bullish condition must be true
    // During cold-start, conditions are more relaxed to collect training data
    const conditions = coldStart ? [
      indicators.rsi14 < 45 && indicators.macd.line > 0,              // Moderate RSI + MACD positive
      indicators.trendScore > 1 && indicators.volatility < 80,        // Mild trend, not too volatile
      indicators.rsi14 < 35 && indicators.trendScore > 0,             // Low RSI + any uptrend
      indicators.macd.histogram > 0 && indicators.trendScore > 0,     // MACD bullish + trend
      indicators.rsi14 < 50 && indicators.trendScore > 2,             // Normal RSI + strong trend
    ] : [
      indicators.rsi14 < 30 && indicators.macd.line > 0,              // Bullish divergence
      indicators.trendScore > 2 && indicators.volatility < 60,        // Strong trend, low vol
      indicators.rsi14 < 40 && indicators.trendScore > 1,             // Low RSI + uptrend
      indicators.macd.histogram > 0 && indicators.trendScore > 0,     // MACD bullish + trend
    ];

    return conditions.some(c => c);
  }

  private calcScore(weights: Record<string, number>): number {
    return Object.values(weights).reduce((sum, w) => sum + w, 0);
  }
}
