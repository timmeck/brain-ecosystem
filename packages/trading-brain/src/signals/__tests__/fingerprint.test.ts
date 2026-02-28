import { describe, it, expect } from 'vitest';
import {
  classifyRSI,
  classifyMACD,
  classifyTrend,
  classifyVolatility,
  fingerprint,
  fingerprintSimilarity,
  decomposeFingerprint,
} from '../fingerprint.js';

describe('classifyRSI', () => {
  it('returns extreme_oversold for RSI < 25', () => {
    expect(classifyRSI(10)).toBe('extreme_oversold');
    expect(classifyRSI(24)).toBe('extreme_oversold');
  });

  it('returns oversold for 25 <= RSI < 30', () => {
    expect(classifyRSI(25)).toBe('oversold');
    expect(classifyRSI(29)).toBe('oversold');
  });

  it('returns low for 30 <= RSI < 40', () => {
    expect(classifyRSI(30)).toBe('low');
    expect(classifyRSI(39)).toBe('low');
  });

  it('returns neutral for 40 <= RSI <= 60', () => {
    expect(classifyRSI(40)).toBe('neutral');
    expect(classifyRSI(50)).toBe('neutral');
    expect(classifyRSI(60)).toBe('neutral');
  });

  it('returns high for 60 < RSI <= 70', () => {
    expect(classifyRSI(61)).toBe('high');
    expect(classifyRSI(70)).toBe('high');
  });

  it('returns overbought for 70 < RSI <= 75', () => {
    expect(classifyRSI(71)).toBe('overbought');
    expect(classifyRSI(75)).toBe('overbought');
  });

  it('returns extreme_overbought for RSI > 75', () => {
    expect(classifyRSI(76)).toBe('extreme_overbought');
    expect(classifyRSI(95)).toBe('extreme_overbought');
  });
});

describe('classifyMACD', () => {
  it('returns bullish when MACD > 0 and trendScore > 0', () => {
    expect(classifyMACD(1, 2)).toBe('bullish');
  });

  it('returns bearish when MACD < 0 and trendScore < 0', () => {
    expect(classifyMACD(-1, -2)).toBe('bearish');
  });

  it('returns neutral when MACD and trendScore disagree', () => {
    expect(classifyMACD(1, -1)).toBe('neutral');
    expect(classifyMACD(-1, 1)).toBe('neutral');
  });

  it('returns neutral when MACD is 0', () => {
    expect(classifyMACD(0, 5)).toBe('neutral');
  });

  it('returns neutral when trendScore is 0', () => {
    expect(classifyMACD(5, 0)).toBe('neutral');
  });
});

describe('classifyTrend', () => {
  it('returns strong_up for trendScore > 3', () => {
    expect(classifyTrend(4)).toBe('strong_up');
  });

  it('returns up for 1 < trendScore <= 3', () => {
    expect(classifyTrend(2)).toBe('up');
    expect(classifyTrend(3)).toBe('up');
  });

  it('returns flat for -1 <= trendScore <= 1', () => {
    expect(classifyTrend(0)).toBe('flat');
    expect(classifyTrend(1)).toBe('flat');
    expect(classifyTrend(-1)).toBe('flat');
  });

  it('returns down for -3 <= trendScore < -1', () => {
    expect(classifyTrend(-2)).toBe('down');
    expect(classifyTrend(-3)).toBe('down');
  });

  it('returns strong_down for trendScore < -3', () => {
    expect(classifyTrend(-4)).toBe('strong_down');
  });
});

describe('classifyVolatility', () => {
  it('returns low for volatility <= 30', () => {
    expect(classifyVolatility(10)).toBe('low');
    expect(classifyVolatility(30)).toBe('low');
  });

  it('returns medium for 30 < volatility <= 50', () => {
    expect(classifyVolatility(31)).toBe('medium');
    expect(classifyVolatility(50)).toBe('medium');
  });

  it('returns high for 50 < volatility <= 80', () => {
    expect(classifyVolatility(51)).toBe('high');
    expect(classifyVolatility(80)).toBe('high');
  });

  it('returns extreme for volatility > 80', () => {
    expect(classifyVolatility(81)).toBe('extreme');
    expect(classifyVolatility(100)).toBe('extreme');
  });
});

describe('fingerprint', () => {
  it('returns pipe-separated classification string', () => {
    const fp = fingerprint({ rsi14: 20, macd: 1, trendScore: 4, volatility: 90 });
    expect(fp).toBe('extreme_oversold|bullish|strong_up|extreme');
  });

  it('uses defaults when signals are missing', () => {
    const fp = fingerprint({});
    // rsi14=50 -> neutral, macd=0/trend=0 -> neutral, trend=0 -> flat, vol=30 -> low
    expect(fp).toBe('neutral|neutral|flat|low');
  });

  it('appends regime when provided', () => {
    const fp = fingerprint({ regime: 'trending' });
    expect(fp).toBe('neutral|neutral|flat|low|trending');
  });

  it('does not append regime when absent', () => {
    const fp = fingerprint({ rsi14: 50 });
    expect(fp.split('|')).toHaveLength(4);
  });
});

describe('fingerprintSimilarity', () => {
  it('returns 1 for identical fingerprints', () => {
    expect(fingerprintSimilarity('a|b|c', 'a|b|c')).toBe(1);
  });

  it('returns 0 for completely different fingerprints', () => {
    expect(fingerprintSimilarity('a|b|c', 'x|y|z')).toBe(0);
  });

  it('returns partial match ratio', () => {
    // 2 of 3 match
    expect(fingerprintSimilarity('a|b|c', 'a|b|z')).toBeCloseTo(2 / 3);
  });

  it('handles different lengths by using max length', () => {
    // parts: ['a','b','c'] vs ['a','b'] -> maxLen=3, matches=2
    expect(fingerprintSimilarity('a|b|c', 'a|b')).toBeCloseTo(2 / 3);
  });

  it('returns 1 for two empty strings', () => {
    expect(fingerprintSimilarity('', '')).toBe(1);
  });
});

describe('decomposeFingerprint', () => {
  it('creates signal nodes for each fingerprint part', () => {
    const nodes = decomposeFingerprint('oversold|bullish|up|high');
    const ids = nodes.map(n => n.id);
    expect(ids).toContain('sig_rsi_oversold');
    expect(ids).toContain('sig_macd_bullish');
    expect(ids).toContain('sig_trend_up');
    expect(ids).toContain('sig_vol_high');
    expect(ids).toContain('combo_oversold|bullish|up|high');
  });

  it('includes regime node when provided', () => {
    const nodes = decomposeFingerprint('neutral|neutral|flat|low', 'trending');
    const regimeNode = nodes.find(n => n.id === 'regime_trending');
    expect(regimeNode).toBeDefined();
    expect(regimeNode!.type).toBe('regime');
  });

  it('includes pair node when provided', () => {
    const nodes = decomposeFingerprint('neutral|neutral|flat|low', undefined, 'BTC/USD');
    const pairNode = nodes.find(n => n.id === 'pair_BTC/USD');
    expect(pairNode).toBeDefined();
    expect(pairNode!.type).toBe('pair');
  });

  it('includes botType node when provided', () => {
    const nodes = decomposeFingerprint('neutral|neutral|flat|low', undefined, undefined, 'scalper');
    const botNode = nodes.find(n => n.id === 'bot_scalper');
    expect(botNode).toBeDefined();
    expect(botNode!.type).toBe('bot_type');
  });

  it('always includes a combo node', () => {
    const nodes = decomposeFingerprint('a|b|c|d');
    const combo = nodes.find(n => n.type === 'combo');
    expect(combo).toBeDefined();
    expect(combo!.id).toBe('combo_a|b|c|d');
  });
});
