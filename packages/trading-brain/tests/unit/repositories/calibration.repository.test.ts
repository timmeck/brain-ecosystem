import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CalibrationRepository } from '../../../src/db/repositories/calibration.repository.js';
import type { CalibrationConfig } from '../../../src/types/config.types.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calibration (
      id TEXT PRIMARY KEY DEFAULT 'main',
      learning_rate REAL NOT NULL,
      weaken_penalty REAL NOT NULL,
      decay_half_life_days INTEGER NOT NULL,
      pattern_extraction_interval INTEGER NOT NULL,
      pattern_min_samples INTEGER NOT NULL,
      pattern_wilson_threshold REAL NOT NULL,
      wilson_z REAL NOT NULL,
      spreading_activation_decay REAL NOT NULL,
      spreading_activation_threshold REAL NOT NULL,
      min_activations_for_weight INTEGER NOT NULL,
      min_outcomes_for_weights INTEGER NOT NULL,
      last_calibration TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calibration_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_count INTEGER NOT NULL,
      synapse_count INTEGER NOT NULL,
      learning_rate REAL NOT NULL,
      weaken_penalty REAL NOT NULL,
      decay_half_life_days INTEGER NOT NULL,
      pattern_extraction_interval INTEGER NOT NULL,
      pattern_min_samples INTEGER NOT NULL,
      pattern_wilson_threshold REAL NOT NULL,
      wilson_z REAL NOT NULL,
      spreading_activation_decay REAL NOT NULL,
      spreading_activation_threshold REAL NOT NULL,
      min_activations_for_weight INTEGER NOT NULL,
      min_outcomes_for_weights INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function makeCal(overrides: Partial<CalibrationConfig> = {}): CalibrationConfig {
  return {
    learningRate: 0.1,
    weakenPenalty: 0.8,
    decayHalfLifeDays: 30,
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

describe('CalibrationRepository', () => {
  let db: Database.Database;
  let repo: CalibrationRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new CalibrationRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('get', () => {
    it('should return null when no calibration exists', () => {
      expect(repo.get()).toBeNull();
    });
  });

  describe('save', () => {
    it('should insert calibration and be retrievable via get', () => {
      const cal = makeCal();
      repo.save(cal);

      const loaded = repo.get();
      expect(loaded).not.toBeNull();
      expect(loaded!.learningRate).toBeCloseTo(0.1);
      expect(loaded!.weakenPenalty).toBeCloseTo(0.8);
      expect(loaded!.decayHalfLifeDays).toBe(30);
    });

    it('should upsert (update) on subsequent calls', () => {
      repo.save(makeCal({ learningRate: 0.1 }));
      repo.save(makeCal({ learningRate: 0.2 }));

      const loaded = repo.get();
      expect(loaded!.learningRate).toBeCloseTo(0.2);
    });

    it('should preserve all calibration fields on round-trip', () => {
      const cal = makeCal({
        learningRate: 0.15,
        weakenPenalty: 0.7,
        decayHalfLifeDays: 45,
        patternExtractionInterval: 120000,
        patternMinSamples: 10,
        patternWilsonThreshold: 0.6,
        wilsonZ: 2.58,
        spreadingActivationDecay: 0.5,
        spreadingActivationThreshold: 0.1,
        minActivationsForWeight: 5,
        minOutcomesForWeights: 20,
      });

      repo.save(cal);
      const loaded = repo.get()!;

      expect(loaded.learningRate).toBeCloseTo(0.15);
      expect(loaded.weakenPenalty).toBeCloseTo(0.7);
      expect(loaded.decayHalfLifeDays).toBe(45);
      expect(loaded.patternExtractionInterval).toBe(120000);
      expect(loaded.patternMinSamples).toBe(10);
      expect(loaded.patternWilsonThreshold).toBeCloseTo(0.6);
      expect(loaded.wilsonZ).toBeCloseTo(2.58);
      expect(loaded.spreadingActivationDecay).toBeCloseTo(0.5);
      expect(loaded.spreadingActivationThreshold).toBeCloseTo(0.1);
      expect(loaded.minActivationsForWeight).toBe(5);
      expect(loaded.minOutcomesForWeights).toBe(20);
    });
  });

  describe('saveSnapshot', () => {
    it('should store a history snapshot', () => {
      repo.saveSnapshot(makeCal(), 100, 50);

      const history = repo.getHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0].trade_count).toBe(100);
      expect(history[0].synapse_count).toBe(50);
    });

    it('should store multiple snapshots', () => {
      repo.saveSnapshot(makeCal(), 50, 20);
      repo.saveSnapshot(makeCal(), 100, 40);
      repo.saveSnapshot(makeCal(), 150, 60);

      const history = repo.getHistory(10);
      expect(history).toHaveLength(3);
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history exists', () => {
      expect(repo.getHistory(10)).toHaveLength(0);
    });

    it('should respect limit parameter', () => {
      repo.saveSnapshot(makeCal(), 10, 5);
      repo.saveSnapshot(makeCal(), 20, 10);
      repo.saveSnapshot(makeCal(), 30, 15);

      const history = repo.getHistory(2);
      expect(history).toHaveLength(2);
    });

    it('should return snapshots in reverse chronological order', () => {
      db.exec(`
        INSERT INTO calibration_history (trade_count, synapse_count,
          learning_rate, weaken_penalty, decay_half_life_days,
          pattern_extraction_interval, pattern_min_samples, pattern_wilson_threshold,
          wilson_z, spreading_activation_decay, spreading_activation_threshold,
          min_activations_for_weight, min_outcomes_for_weights, created_at)
        VALUES (10, 5, 0.1, 0.8, 30, 60000, 5, 0.55, 1.96, 0.6, 0.05, 3, 10, '2026-01-01 00:00:00')
      `);
      db.exec(`
        INSERT INTO calibration_history (trade_count, synapse_count,
          learning_rate, weaken_penalty, decay_half_life_days,
          pattern_extraction_interval, pattern_min_samples, pattern_wilson_threshold,
          wilson_z, spreading_activation_decay, spreading_activation_threshold,
          min_activations_for_weight, min_outcomes_for_weights, created_at)
        VALUES (50, 20, 0.12, 0.75, 30, 60000, 8, 0.4, 1.80, 0.6, 0.05, 3, 5, '2026-02-01 00:00:00')
      `);

      const history = repo.getHistory(10);
      expect(history[0].trade_count).toBe(50);
      expect(history[1].trade_count).toBe(10);
    });
  });
});
