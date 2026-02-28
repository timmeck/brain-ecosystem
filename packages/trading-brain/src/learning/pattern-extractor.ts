import type { TradeRecord } from '../db/repositories/trade.repository.js';
import { fingerprintSimilarity } from '../signals/fingerprint.js';
import { wilsonScore } from '@timmeck/brain-core';
import type { CalibrationConfig } from '../types/config.types.js';

export interface ExtractedRule {
  pattern: string;
  confidence: number;
  sample_count: number;
  win_rate: number;
  avg_profit: number;
}

/**
 * Extract trading rules from outcome data using fingerprint grouping + Wilson Score.
 * Ported from tradingBrain.js _extractPatterns().
 */
export function extractPatterns(trades: TradeRecord[], cal: CalibrationConfig): ExtractedRule[] {
  if (trades.length < cal.patternMinSamples) return [];

  // Group by similar fingerprints (threshold: 0.7)
  const groups: Record<string, TradeRecord[]> = {};
  for (const trade of trades) {
    let assigned = false;
    for (const key of Object.keys(groups)) {
      if (fingerprintSimilarity(trade.fingerprint, key) >= 0.7) {
        groups[key]!.push(trade);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      groups[trade.fingerprint] = [trade];
    }
  }

  const rules: ExtractedRule[] = [];
  for (const [pattern, group] of Object.entries(groups)) {
    if (group.length < cal.patternMinSamples) continue;

    const wins = group.filter(o => o.win === 1).length;
    const total = group.length;
    const winRate = wins / total;
    const confidence = wilsonScore(wins, total, cal.wilsonZ);

    if (confidence > cal.patternWilsonThreshold) {
      const avgProfit = group.reduce((s, o) => s + o.profit_pct, 0) / total;
      rules.push({ pattern, confidence, sample_count: total, win_rate: winRate, avg_profit: avgProfit });
    }
  }

  return rules.sort((a, b) => b.confidence - a.confidence);
}
