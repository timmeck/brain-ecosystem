import { describe, it, expect } from 'vitest';
import { calibrate } from '../../../src/learning/calibrator.js';
import type { CalibrationConfig } from '../../../src/types/config.types.js';

function makeCalibration(overrides: Partial<CalibrationConfig> = {}): CalibrationConfig {
  return {
    learningRate: 0.1,
    weakenPenalty: 0.8,
    decayHalfLifeDays: 14,
    patternExtractionInterval: 60000,
    patternMinSamples: 5,
    patternWilsonThreshold: 0.55,
    wilsonZ: 1.96,
    spreadingActivationDecay: 0.6,
    spreadingActivationThreshold: 0.05,
    minActivationsForWeight: 3,
    minOutcomesForWeights: 10,
    ...overrides,
  };
}

describe('calibrate', () => {
  it('should return conservative settings for < 20 outcomes', () => {
    const cal = makeCalibration();
    const result = calibrate(cal, 10, 5);

    expect(result.learningRate).toBe(0.08);
    expect(result.weakenPenalty).toBe(0.8);
    expect(result.patternMinSamples).toBe(5);
    expect(result.patternWilsonThreshold).toBe(0.3);
    expect(result.wilsonZ).toBe(1.64);
    expect(result.minActivationsForWeight).toBe(2);
    expect(result.minOutcomesForWeights).toBe(3);
  });

  it('should return moderate settings for 20-99 outcomes', () => {
    const cal = makeCalibration();
    const result = calibrate(cal, 50, 15);

    expect(result.learningRate).toBe(0.12);
    expect(result.weakenPenalty).toBe(0.75);
    expect(result.patternMinSamples).toBe(8);
    expect(result.patternWilsonThreshold).toBe(0.4);
    expect(result.wilsonZ).toBe(1.80);
    expect(result.minActivationsForWeight).toBe(3);
    expect(result.minOutcomesForWeights).toBe(5);
  });

  it('should return standard settings for 100-499 outcomes', () => {
    const cal = makeCalibration();
    const result = calibrate(cal, 200, 30);

    expect(result.learningRate).toBe(0.15);
    expect(result.weakenPenalty).toBe(0.7);
    expect(result.patternMinSamples).toBe(10);
    expect(result.patternWilsonThreshold).toBe(0.5);
    expect(result.wilsonZ).toBe(1.96);
  });

  it('should return high-confidence settings for >= 500 outcomes', () => {
    const cal = makeCalibration();
    const result = calibrate(cal, 600, 50);

    expect(result.learningRate).toBe(0.10);
    expect(result.weakenPenalty).toBe(0.75);
    expect(result.patternMinSamples).toBe(15);
    expect(result.patternWilsonThreshold).toBe(0.55);
    expect(result.wilsonZ).toBe(2.33);
    expect(result.patternExtractionInterval).toBe(30);
    expect(result.minActivationsForWeight).toBe(5);
    expect(result.minOutcomesForWeights).toBe(8);
  });

  it('should reduce decay half-life for high synapse count (> 100)', () => {
    const cal = makeCalibration({ decayHalfLifeDays: 14 });
    const result = calibrate(cal, 50, 150);

    expect(result.decayHalfLifeDays).toBe(10);
  });

  it('should increase decay half-life for low synapse count (< 10)', () => {
    const cal = makeCalibration({ decayHalfLifeDays: 14 });
    const result = calibrate(cal, 50, 5);

    expect(result.decayHalfLifeDays).toBe(21);
  });

  it('should not modify decay half-life for synapse count 10-100', () => {
    const cal = makeCalibration({ decayHalfLifeDays: 14 });
    const result = calibrate(cal, 50, 50);

    expect(result.decayHalfLifeDays).toBe(14);
  });

  it('should not mutate the input config', () => {
    const cal = makeCalibration({ learningRate: 0.1 });
    calibrate(cal, 10, 5);

    expect(cal.learningRate).toBe(0.1);
  });

  it('should preserve fields not explicitly set in the tier', () => {
    const cal = makeCalibration({
      spreadingActivationDecay: 0.7,
      spreadingActivationThreshold: 0.08,
    });
    const result = calibrate(cal, 10, 5);

    expect(result.spreadingActivationDecay).toBe(0.7);
    expect(result.spreadingActivationThreshold).toBe(0.08);
  });

  it('should handle boundary values correctly', () => {
    const cal = makeCalibration();

    // Exactly 20 => moderate tier
    expect(calibrate(cal, 20, 10).learningRate).toBe(0.12);
    // Exactly 100 => mature tier
    expect(calibrate(cal, 100, 10).learningRate).toBe(0.15);
    // Exactly 500 => large tier
    expect(calibrate(cal, 500, 10).learningRate).toBe(0.10);
  });
});
