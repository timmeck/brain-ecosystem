import { NODE_TYPES } from '../graph/weighted-graph.js';

export interface SignalInput {
  rsi14?: number;
  macd?: number;
  trendScore?: number;
  volatility?: number;
  regime?: string;
}

export interface DecomposedNode {
  id: string;
  type: string;
  label: string;
}

export function classifyRSI(rsi: number): string {
  if (rsi < 25) return 'extreme_oversold';
  if (rsi < 30) return 'oversold';
  if (rsi < 40) return 'low';
  if (rsi > 75) return 'extreme_overbought';
  if (rsi > 70) return 'overbought';
  if (rsi > 60) return 'high';
  return 'neutral';
}

export function classifyMACD(macd: number, trendScore: number): string {
  if (macd > 0 && trendScore > 0) return 'bullish';
  if (macd < 0 && trendScore < 0) return 'bearish';
  return 'neutral';
}

export function classifyTrend(trendScore: number): string {
  if (trendScore > 3) return 'strong_up';
  if (trendScore > 1) return 'up';
  if (trendScore < -3) return 'strong_down';
  if (trendScore < -1) return 'down';
  return 'flat';
}

export function classifyVolatility(volatility: number): string {
  if (volatility > 80) return 'extreme';
  if (volatility > 50) return 'high';
  if (volatility > 30) return 'medium';
  return 'low';
}

/**
 * Create a signal fingerprint string from input signals.
 * Format: rsi_class|macd_class|trend_class|vol_class[|regime]
 */
export function fingerprint(signals: SignalInput): string {
  const parts = [
    classifyRSI(signals.rsi14 ?? 50),
    classifyMACD(signals.macd ?? 0, signals.trendScore ?? 0),
    classifyTrend(signals.trendScore ?? 0),
    classifyVolatility(signals.volatility ?? 30),
  ];
  if (signals.regime) parts.push(signals.regime);
  return parts.join('|');
}

/**
 * Compare two fingerprints for similarity (0-1).
 */
export function fingerprintSimilarity(fp1: string, fp2: string): number {
  const parts1 = fp1.split('|');
  const parts2 = fp2.split('|');
  const maxLen = Math.max(parts1.length, parts2.length);
  if (maxLen === 0) return 1;
  let matches = 0;
  for (let i = 0; i < maxLen; i++) {
    if (parts1[i] === parts2[i]) matches++;
  }
  return matches / maxLen;
}

/**
 * Decompose a fingerprint into individual graph node IDs for the weighted graph.
 */
export function decomposeFingerprint(fp: string, regime?: string, pair?: string, botType?: string): DecomposedNode[] {
  const parts = fp.split('|');
  const nodes: DecomposedNode[] = [];
  if (parts[0]) nodes.push({ id: `sig_rsi_${parts[0]}`, type: NODE_TYPES.SIGNAL, label: parts[0] });
  if (parts[1]) nodes.push({ id: `sig_macd_${parts[1]}`, type: NODE_TYPES.SIGNAL, label: parts[1] });
  if (parts[2]) nodes.push({ id: `sig_trend_${parts[2]}`, type: NODE_TYPES.SIGNAL, label: parts[2] });
  if (parts[3]) nodes.push({ id: `sig_vol_${parts[3]}`, type: NODE_TYPES.SIGNAL, label: parts[3] });
  if (regime) nodes.push({ id: `regime_${regime}`, type: NODE_TYPES.REGIME, label: regime });
  if (pair) nodes.push({ id: `pair_${pair}`, type: NODE_TYPES.PAIR, label: pair });
  if (botType) nodes.push({ id: `bot_${botType}`, type: NODE_TYPES.BOT_TYPE, label: botType });
  nodes.push({ id: `combo_${fp}`, type: NODE_TYPES.COMBO, label: fp });
  return nodes;
}
