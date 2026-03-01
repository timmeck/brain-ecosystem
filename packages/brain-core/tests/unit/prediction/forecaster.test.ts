import { describe, it, expect } from 'vitest';
import { holtWintersForecast, ewmaForecast, calibrateConfidence } from '../../../src/prediction/forecaster.js';

describe('holtWintersForecast', () => {
  it('should predict uptrend with direction "up"', () => {
    const data = [10, 12, 14, 16, 18, 20];
    const result = holtWintersForecast(data, 1);
    expect(result.direction).toBe('up');
    expect(result.value).toBeGreaterThan(20);
    expect(result.method).toBe('holt_winters');
    expect(result.dataPoints).toBe(6);
  });

  it('should predict downtrend with direction "down"', () => {
    const data = [20, 18, 16, 14, 12, 10];
    const result = holtWintersForecast(data, 1);
    expect(result.direction).toBe('down');
    expect(result.value).toBeLessThan(10);
  });

  it('should predict stable with high confidence for constant data', () => {
    const data = [5, 5, 5, 5, 5, 5];
    const result = holtWintersForecast(data, 1);
    expect(result.direction).toBe('stable');
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.value).toBeCloseTo(5, 0);
  });

  it('should have lower confidence for noisy data', () => {
    const stable = holtWintersForecast([5, 5, 5, 5, 5], 1);
    const noisy = holtWintersForecast([5, 20, 3, 18, 7], 1);
    expect(noisy.confidence).toBeLessThan(stable.confidence);
  });

  it('should handle 2 data points', () => {
    const result = holtWintersForecast([10, 20], 1);
    expect(result.direction).toBe('up');
    expect(result.value).toBeGreaterThan(20);
  });

  it('should handle 1 data point gracefully', () => {
    const result = holtWintersForecast([42], 1);
    expect(result.value).toBe(42);
    expect(result.confidence).toBe(0.1);
  });

  it('should return positive trend for increasing data', () => {
    const result = holtWintersForecast([1, 2, 3, 4, 5], 1);
    expect(result.trend).toBeGreaterThan(0);
  });

  it('should return negative trend for decreasing data', () => {
    const result = holtWintersForecast([5, 4, 3, 2, 1], 1);
    expect(result.trend).toBeLessThan(0);
  });
});

describe('ewmaForecast', () => {
  it('should return direction "up" for 2 increasing points', () => {
    const result = ewmaForecast([5, 10]);
    expect(result.direction).toBe('up');
    expect(result.method).toBe('ewma');
  });

  it('should return direction "down" for 2 decreasing points', () => {
    const result = ewmaForecast([10, 5]);
    expect(result.direction).toBe('down');
  });

  it('should return a reasonable value', () => {
    const result = ewmaForecast([10, 12, 14]);
    // EWMA should be between the min and max of the data
    expect(result.value).toBeGreaterThan(9);
    expect(result.value).toBeLessThan(15);
  });

  it('should have limited confidence', () => {
    const result = ewmaForecast([1, 2, 3, 4]);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle empty data', () => {
    const result = ewmaForecast([]);
    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0.1);
    expect(result.direction).toBe('stable');
    expect(result.dataPoints).toBe(0);
  });

  it('should handle single data point', () => {
    const result = ewmaForecast([42]);
    expect(result.value).toBe(42);
    expect(result.confidence).toBe(0.15);
    expect(result.direction).toBe('stable');
  });
});

describe('calibrateConfidence', () => {
  it('should adjust overconfident predictions downward', () => {
    // Bucket 0.8-1.0: predicted at 0.9 confidence, but only 60% were correct
    const buckets = [
      { range_start: 0.8, range_end: 1.0, predicted_count: 10, actual_accuracy: 0.6 },
    ];
    const adjusted = calibrateConfidence(0.9, buckets);
    expect(adjusted).toBeLessThan(0.9);
  });

  it('should adjust underconfident predictions upward', () => {
    // Bucket 0.2-0.4: predicted at 0.3 confidence, but 70% were correct
    const buckets = [
      { range_start: 0.2, range_end: 0.4, predicted_count: 10, actual_accuracy: 0.7 },
    ];
    const adjusted = calibrateConfidence(0.3, buckets);
    expect(adjusted).toBeGreaterThan(0.3);
  });

  it('should clamp to [0.01, 0.99]', () => {
    const bucketsLow = [
      { range_start: 0.0, range_end: 0.2, predicted_count: 10, actual_accuracy: 0.0 },
    ];
    const adjustedLow = calibrateConfidence(0.05, bucketsLow);
    expect(adjustedLow).toBeGreaterThanOrEqual(0.01);

    const bucketsHigh = [
      { range_start: 0.8, range_end: 1.0, predicted_count: 10, actual_accuracy: 1.0 },
    ];
    const adjustedHigh = calibrateConfidence(0.95, bucketsHigh);
    expect(adjustedHigh).toBeLessThanOrEqual(0.99);
  });

  it('should return raw confidence when no buckets', () => {
    const adjusted = calibrateConfidence(0.7, []);
    expect(adjusted).toBe(0.7);
  });

  it('should return raw confidence when bucket has too few predictions', () => {
    const buckets = [
      { range_start: 0.6, range_end: 0.8, predicted_count: 2, actual_accuracy: 0.5 },
    ];
    const adjusted = calibrateConfidence(0.7, buckets);
    expect(adjusted).toBe(0.7);
  });
});
