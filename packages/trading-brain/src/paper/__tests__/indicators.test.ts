import { describe, it, expect } from 'vitest';
import { calcRSI, calcMACD, calcTrendScore, calcVolatility, calcAllIndicators } from '../indicators.js';
import type { OHLCVCandle } from '../types.js';

function makeCandles(closes: number[], base = 100): OHLCVCandle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() - (closes.length - i) * 300_000,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  }));
}

describe('calcRSI', () => {
  it('returns 50 when not enough data', () => {
    expect(calcRSI(makeCandles([100, 101, 102]))).toBe(50);
  });

  it('returns high RSI for consistent uptrend', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
    const rsi = calcRSI(makeCandles(prices));
    expect(rsi).toBeGreaterThan(70);
  });

  it('returns low RSI for consistent downtrend', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 130 - i);
    const rsi = calcRSI(makeCandles(prices));
    expect(rsi).toBeLessThan(30);
  });

  it('returns ~50 for flat market', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const rsi = calcRSI(makeCandles(prices));
    expect(rsi).toBeGreaterThan(30);
    expect(rsi).toBeLessThan(70);
  });

  it('returns 100 when all gains', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const rsi = calcRSI(makeCandles(prices));
    expect(rsi).toBe(100);
  });
});

describe('calcMACD', () => {
  it('returns zeroes when not enough data', () => {
    const result = calcMACD(makeCandles([100, 101, 102]));
    expect(result.line).toBe(0);
    expect(result.signal).toBe(0);
    expect(result.histogram).toBe(0);
  });

  it('returns positive MACD for uptrend', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calcMACD(makeCandles(prices));
    expect(result.line).toBeGreaterThan(0);
  });

  it('returns negative MACD for downtrend', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 150 - i);
    const result = calcMACD(makeCandles(prices));
    expect(result.line).toBeLessThan(0);
  });

  it('histogram equals line minus signal', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = calcMACD(makeCandles(prices));
    expect(result.histogram).toBeCloseTo(result.line - result.signal, 10);
  });
});

describe('calcTrendScore', () => {
  it('returns 0 when not enough data', () => {
    expect(calcTrendScore(makeCandles([100, 101]))).toBe(0);
  });

  it('returns positive score for uptrend', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    const score = calcTrendScore(makeCandles(prices));
    expect(score).toBeGreaterThan(0);
  });

  it('returns negative score for downtrend', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
    const score = calcTrendScore(makeCandles(prices));
    expect(score).toBeLessThan(0);
  });

  it('clamps to -5..+5 range', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 20);
    const score = calcTrendScore(makeCandles(prices));
    expect(score).toBeLessThanOrEqual(5);
    expect(score).toBeGreaterThanOrEqual(-5);
  });
});

describe('calcVolatility', () => {
  it('returns default when not enough data', () => {
    expect(calcVolatility(makeCandles([100, 101]))).toBe(30);
  });

  it('returns low volatility for stable prices', () => {
    const prices = Array.from({ length: 20 }, () => 100);
    const candles = prices.map((close, i) => ({
      timestamp: Date.now() - (prices.length - i) * 300_000,
      open: close,
      high: close + 0.1,
      low: close - 0.1,
      close,
      volume: 1000,
    }));
    const vol = calcVolatility(candles);
    expect(vol).toBeLessThan(5);
  });

  it('returns high volatility for wild swings', () => {
    const candles: OHLCVCandle[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: Date.now() - (20 - i) * 300_000,
      open: 100,
      high: 120,
      low: 80,
      close: 100,
      volume: 1000,
    }));
    const vol = calcVolatility(candles);
    expect(vol).toBeGreaterThan(20);
  });
});

describe('calcAllIndicators', () => {
  it('returns all four indicators', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calcAllIndicators(makeCandles(prices));
    expect(result).toHaveProperty('rsi14');
    expect(result).toHaveProperty('macd');
    expect(result).toHaveProperty('trendScore');
    expect(result).toHaveProperty('volatility');
    expect(result.macd).toHaveProperty('line');
    expect(result.macd).toHaveProperty('signal');
    expect(result.macd).toHaveProperty('histogram');
  });
});
