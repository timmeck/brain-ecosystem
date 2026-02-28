import type { CalibrationConfig } from '../types/config.types.js';

/**
 * Adaptive Calibration — dynamically adjust learning parameters based on data volume.
 * Ported from tradingBrain.js calibrate() function.
 */
export function calibrate(current: CalibrationConfig, outcomeCount: number, synapseCount: number): CalibrationConfig {
  const cal = { ...current };

  if (outcomeCount < 20) {
    // Very early: conservative, wide thresholds
    cal.learningRate = 0.08;
    cal.weakenPenalty = 0.8;
    cal.patternMinSamples = 5;
    cal.patternWilsonThreshold = 0.3;
    cal.wilsonZ = 1.64; // 90% CI
    cal.minActivationsForWeight = 2;
    cal.minOutcomesForWeights = 3;
  } else if (outcomeCount < 100) {
    // Growing: moderate
    cal.learningRate = 0.12;
    cal.weakenPenalty = 0.75;
    cal.patternMinSamples = 8;
    cal.patternWilsonThreshold = 0.4;
    cal.wilsonZ = 1.80;
    cal.minActivationsForWeight = 3;
    cal.minOutcomesForWeights = 5;
  } else if (outcomeCount < 500) {
    // Mature: standard
    cal.learningRate = 0.15;
    cal.weakenPenalty = 0.7;
    cal.patternMinSamples = 10;
    cal.patternWilsonThreshold = 0.5;
    cal.wilsonZ = 1.96; // 95% CI
    cal.minActivationsForWeight = 3;
    cal.minOutcomesForWeights = 5;
  } else {
    // Large dataset: high confidence, fine-grained
    cal.learningRate = 0.10;
    cal.weakenPenalty = 0.75;
    cal.patternMinSamples = 15;
    cal.patternWilsonThreshold = 0.55;
    cal.wilsonZ = 2.33; // 99% CI
    cal.minActivationsForWeight = 5;
    cal.minOutcomesForWeights = 8;
    cal.patternExtractionInterval = 30;
  }

  // Adjust decay based on synapse density
  if (synapseCount > 100) {
    cal.decayHalfLifeDays = 10; // faster cleanup
  } else if (synapseCount < 10) {
    cal.decayHalfLifeDays = 21; // preserve early knowledge
  }

  return cal;
}
