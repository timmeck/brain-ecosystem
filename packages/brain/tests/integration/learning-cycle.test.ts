import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/setup-db.js';
import { LearningEngine } from '../../src/learning/learning-engine.js';
import { SynapseManager } from '../../src/synapses/synapse-manager.js';

const learningConfig = {
  intervalMs: 900000,
  minOccurrences: 3,
  minSuccessRate: 0.7,
  minConfidence: 0.6,
  pruneThreshold: 0.2,
  maxRejectionRate: 0.5,
  decayHalfLifeDays: 30,
};

const synapsesConfig = {
  initialWeight: 0.1,
  learningRate: 0.15,
  decayHalfLifeDays: 45,
  pruneThreshold: 0.05,
  decayAfterDays: 14,
  maxDepth: 3,
  minActivationWeight: 0.2,
};

describe('Learning Cycle Integration', () => {
  let testDb: TestDb;
  let learningEngine: LearningEngine;

  beforeEach(() => {
    testDb = createTestDb();
    const synapseManager = new SynapseManager(testDb.repos.synapse, synapsesConfig);

    learningEngine = new LearningEngine(
      learningConfig,
      testDb.repos.error,
      testDb.repos.solution,
      testDb.repos.rule,
      testDb.repos.antipattern,
      synapseManager,
    );

    // Seed data
    testDb.repos.project.create({ name: 'test', path: '/test' } as any);
    for (let i = 0; i < 5; i++) {
      testDb.repos.error.create({
        project_id: 1,
        terminal_id: null,
        type: 'TypeError',
        message: "Cannot read properties of undefined (reading 'map')",
        fingerprint: 'fp_type_error',
        raw_output: `TypeError: Cannot read properties of undefined`,
        context: null,
        file_path: null,
        line_number: null,
        column_number: null,
      } as any);
    }
  });

  it('runs a learning cycle without error', () => {
    const result = learningEngine.runCycle();
    expect(result).toBeTruthy();
    expect(typeof result.newPatterns).toBe('number');
    expect(typeof result.updatedRules).toBe('number');
    expect(typeof result.prunedRules).toBe('number');
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('tracks last cycle time', () => {
    expect(learningEngine.getLastCycleAt()).toBeNull();
    learningEngine.runCycle();
    expect(learningEngine.getLastCycleAt()).toBeTruthy();
  });

  it('start/stop controls scheduling', () => {
    learningEngine.start();
    learningEngine.stop();
    // Should not throw
  });
});
