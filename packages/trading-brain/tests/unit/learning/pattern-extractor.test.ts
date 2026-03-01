import { describe, it, expect, vi } from 'vitest';
import type { CalibrationConfig } from '../../../src/types/config.types.js';
import type { TradeRecord } from '../../../src/db/repositories/trade.repository.js';

// Mock the dependencies before importing the module under test
vi.mock('../../../src/signals/fingerprint.js', () => ({
  fingerprintSimilarity: (fp1: string, fp2: string) => {
    // Simple equality-based similarity for testing
    return fp1 === fp2 ? 1.0 : 0.0;
  },
}));

vi.mock('@timmeck/brain-core', () => ({
  wilsonScore: (wins: number, total: number, z: number) => {
    // Simplified Wilson score for testing
    const p = wins / total;
    const n = total;
    const denominator = 1 + (z * z) / n;
    const centre = p + (z * z) / (2 * n);
    const adjustment = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return (centre - adjustment) / denominator;
  },
}));

// Import after mocks are set up
const { extractPatterns } = await import('../../../src/learning/pattern-extractor.js');

function makeCalibration(overrides: Partial<CalibrationConfig> = {}): CalibrationConfig {
  return {
    learningRate: 0.1,
    weakenPenalty: 0.8,
    decayHalfLifeDays: 30,
    patternExtractionInterval: 60000,
    patternMinSamples: 3,
    patternWilsonThreshold: 0.1,
    wilsonZ: 1.96,
    spreadingActivationDecay: 0.6,
    spreadingActivationThreshold: 0.05,
    minActivationsForWeight: 3,
    minOutcomesForWeights: 10,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 1,
    fingerprint: 'neutral|neutral|flat|low',
    pair: 'BTC/USDT',
    bot_type: 'dca',
    regime: null,
    profit_pct: 1.5,
    win: 1,
    signals_json: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('extractPatterns', () => {
  it('should return empty array when not enough trades', () => {
    const cal = makeCalibration({ patternMinSamples: 10 });
    const trades = [makeTrade(), makeTrade()];

    const result = extractPatterns(trades, cal);
    expect(result).toHaveLength(0);
  });

  it('should return empty array when no group meets min samples', () => {
    const cal = makeCalibration({ patternMinSamples: 5 });
    const trades = [
      makeTrade({ fingerprint: 'a' }),
      makeTrade({ fingerprint: 'b' }),
      makeTrade({ fingerprint: 'c' }),
      makeTrade({ fingerprint: 'd' }),
      makeTrade({ fingerprint: 'e' }),
    ];

    const result = extractPatterns(trades, cal);
    expect(result).toHaveLength(0);
  });

  it('should extract patterns from fingerprint groups with high win rate', () => {
    const cal = makeCalibration({ patternMinSamples: 3, patternWilsonThreshold: 0.1 });
    const trades = [
      makeTrade({ fingerprint: 'good', win: 1, profit_pct: 2.0 }),
      makeTrade({ fingerprint: 'good', win: 1, profit_pct: 3.0 }),
      makeTrade({ fingerprint: 'good', win: 1, profit_pct: 1.5 }),
      makeTrade({ fingerprint: 'good', win: 0, profit_pct: -0.5 }),
    ];

    const result = extractPatterns(trades, cal);
    expect(result.length).toBeGreaterThanOrEqual(1);

    const rule = result[0];
    expect(rule.pattern).toBe('good');
    expect(rule.sample_count).toBe(4);
    expect(rule.win_rate).toBeCloseTo(0.75);
  });

  it('should calculate avg_profit correctly', () => {
    const cal = makeCalibration({ patternMinSamples: 3, patternWilsonThreshold: 0.0 });
    const trades = [
      makeTrade({ fingerprint: 'fp', win: 1, profit_pct: 2.0 }),
      makeTrade({ fingerprint: 'fp', win: 1, profit_pct: 4.0 }),
      makeTrade({ fingerprint: 'fp', win: 0, profit_pct: -1.0 }),
    ];

    const result = extractPatterns(trades, cal);
    expect(result).toHaveLength(1);
    // avg = (2 + 4 + -1) / 3 = 5/3 ≈ 1.667
    expect(result[0].avg_profit).toBeCloseTo(5 / 3);
  });

  it('should sort rules by confidence descending', () => {
    const cal = makeCalibration({ patternMinSamples: 3, patternWilsonThreshold: 0.0 });

    // Create two groups with different win rates
    const trades = [
      // Group "high" - 100% win rate, higher confidence
      makeTrade({ fingerprint: 'high', win: 1, profit_pct: 2.0 }),
      makeTrade({ fingerprint: 'high', win: 1, profit_pct: 2.0 }),
      makeTrade({ fingerprint: 'high', win: 1, profit_pct: 2.0 }),
      // Group "low" - 67% win rate, lower confidence
      makeTrade({ fingerprint: 'low', win: 1, profit_pct: 1.0 }),
      makeTrade({ fingerprint: 'low', win: 1, profit_pct: 1.0 }),
      makeTrade({ fingerprint: 'low', win: 0, profit_pct: -1.0 }),
    ];

    const result = extractPatterns(trades, cal);
    expect(result.length).toBe(2);
    expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
  });

  it('should filter out groups below wilson threshold', () => {
    const cal = makeCalibration({ patternMinSamples: 3, patternWilsonThreshold: 0.9 });

    const trades = [
      makeTrade({ fingerprint: 'mediocre', win: 1, profit_pct: 1.0 }),
      makeTrade({ fingerprint: 'mediocre', win: 0, profit_pct: -1.0 }),
      makeTrade({ fingerprint: 'mediocre', win: 1, profit_pct: 0.5 }),
    ];

    const result = extractPatterns(trades, cal);
    // 67% win rate unlikely to have Wilson score > 0.9
    expect(result).toHaveLength(0);
  });

  it('should handle trades with all losses', () => {
    const cal = makeCalibration({ patternMinSamples: 3, patternWilsonThreshold: 0.0 });

    const trades = [
      makeTrade({ fingerprint: 'bad', win: 0, profit_pct: -1.0 }),
      makeTrade({ fingerprint: 'bad', win: 0, profit_pct: -2.0 }),
      makeTrade({ fingerprint: 'bad', win: 0, profit_pct: -1.5 }),
    ];

    const result = extractPatterns(trades, cal);
    if (result.length > 0) {
      expect(result[0].win_rate).toBe(0);
    }
  });
});
