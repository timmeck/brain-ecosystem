import type { TradeRecord } from '../db/repositories/trade.repository.js';

export interface DetectedChain {
  pair: string;
  type: 'winning_streak' | 'losing_streak';
  length: number;
  fingerprints: string[];
  total_profit: number;
}

/**
 * Detect winning/losing streaks from recent trade outcomes.
 * Ported from tradingBrain.js _detectChain().
 *
 * @param recentTrades - Last N trades (should be ~10)
 * @param latestTrade - The most recent trade
 * @param minLength - Minimum consecutive trades for a chain (default: 3)
 */
export function detectChain(
  recentTrades: TradeRecord[],
  latestTrade: TradeRecord,
  minLength: number = 3,
): DetectedChain | null {
  if (recentTrades.length < minLength) return null;

  const recent = recentTrades.slice(-5);
  const samePair = recent.filter(o => o.pair === latestTrade.pair);
  if (samePair.length < minLength) return null;

  const lastThree = samePair.slice(-minLength);
  const allLosses = lastThree.every(o => o.win === 0);
  const allWins = lastThree.every(o => o.win === 1);

  if (!allLosses && !allWins) return null;

  return {
    pair: latestTrade.pair,
    type: allLosses ? 'losing_streak' : 'winning_streak',
    length: lastThree.length,
    fingerprints: lastThree.map(o => o.fingerprint),
    total_profit: lastThree.reduce((s, o) => s + o.profit_pct, 0),
  };
}
