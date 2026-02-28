import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { CalibrationConfig } from '../../types/config.types.js';

export interface CalibrationRecord {
  id: string;
  learning_rate: number;
  weaken_penalty: number;
  decay_half_life_days: number;
  pattern_extraction_interval: number;
  pattern_min_samples: number;
  pattern_wilson_threshold: number;
  wilson_z: number;
  spreading_activation_decay: number;
  spreading_activation_threshold: number;
  min_activations_for_weight: number;
  min_outcomes_for_weights: number;
  last_calibration: string;
  updated_at: string;
}

export class CalibrationRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      upsert: db.prepare(`
        INSERT INTO calibration (id, learning_rate, weaken_penalty, decay_half_life_days,
          pattern_extraction_interval, pattern_min_samples, pattern_wilson_threshold,
          wilson_z, spreading_activation_decay, spreading_activation_threshold,
          min_activations_for_weight, min_outcomes_for_weights, last_calibration, updated_at)
        VALUES ('main', @learning_rate, @weaken_penalty, @decay_half_life_days,
          @pattern_extraction_interval, @pattern_min_samples, @pattern_wilson_threshold,
          @wilson_z, @spreading_activation_decay, @spreading_activation_threshold,
          @min_activations_for_weight, @min_outcomes_for_weights, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          learning_rate = @learning_rate, weaken_penalty = @weaken_penalty,
          decay_half_life_days = @decay_half_life_days,
          pattern_extraction_interval = @pattern_extraction_interval,
          pattern_min_samples = @pattern_min_samples,
          pattern_wilson_threshold = @pattern_wilson_threshold,
          wilson_z = @wilson_z,
          spreading_activation_decay = @spreading_activation_decay,
          spreading_activation_threshold = @spreading_activation_threshold,
          min_activations_for_weight = @min_activations_for_weight,
          min_outcomes_for_weights = @min_outcomes_for_weights,
          last_calibration = datetime('now'), updated_at = datetime('now')
      `),
      get: db.prepare('SELECT * FROM calibration WHERE id = "main"'),
    };
  }

  save(cal: CalibrationConfig): void {
    this.stmts['upsert']!.run({
      learning_rate: cal.learningRate,
      weaken_penalty: cal.weakenPenalty,
      decay_half_life_days: cal.decayHalfLifeDays,
      pattern_extraction_interval: cal.patternExtractionInterval,
      pattern_min_samples: cal.patternMinSamples,
      pattern_wilson_threshold: cal.patternWilsonThreshold,
      wilson_z: cal.wilsonZ,
      spreading_activation_decay: cal.spreadingActivationDecay,
      spreading_activation_threshold: cal.spreadingActivationThreshold,
      min_activations_for_weight: cal.minActivationsForWeight,
      min_outcomes_for_weights: cal.minOutcomesForWeights,
    });
  }

  get(): CalibrationConfig | null {
    const row = this.stmts['get']!.get() as CalibrationRecord | undefined;
    if (!row) return null;
    return {
      learningRate: row.learning_rate,
      weakenPenalty: row.weaken_penalty,
      decayHalfLifeDays: row.decay_half_life_days,
      patternExtractionInterval: row.pattern_extraction_interval,
      patternMinSamples: row.pattern_min_samples,
      patternWilsonThreshold: row.pattern_wilson_threshold,
      wilsonZ: row.wilson_z,
      spreadingActivationDecay: row.spreading_activation_decay,
      spreadingActivationThreshold: row.spreading_activation_threshold,
      minActivationsForWeight: row.min_activations_for_weight,
      minOutcomesForWeights: row.min_outcomes_for_weights,
    };
  }
}
