import { describe, it, expect, beforeEach } from 'vitest';
import { strengthen, weaken } from '../../../src/synapses/hebbian.js';
import { createTestDb, type TestDb } from '../../helpers/setup-db.js';

describe('Hebbian Learning', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.repos.project.create({ name: 'test-project', path: '/test' } as any);
    testDb.repos.error.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp1', type: 'TypeError',
      message: 'test error', raw_output: 'TypeError: test',
      context: null, file_path: null, line_number: null, column_number: null,
    } as any);
    testDb.repos.error.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp2', type: 'TypeError',
      message: 'test error 2', raw_output: 'TypeError: test2',
      context: null, file_path: null, line_number: null, column_number: null,
    } as any);
  });

  const defaultConfig = {
    initialWeight: 0.1,
    learningRate: 0.15,
    decayHalfLifeDays: 45,
    pruneThreshold: 0.05,
    decayAfterDays: 14,
    maxDepth: 3,
    minActivationWeight: 0.2,
  };

  it('creates a new synapse', () => {
    const synapse = strengthen(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
      defaultConfig,
    );
    expect(synapse).toBeTruthy();
    expect(synapse.weight).toBeCloseTo(defaultConfig.initialWeight);
  });

  it('strengthens existing synapse', () => {
    const first = strengthen(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
      defaultConfig,
    );
    const second = strengthen(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
      defaultConfig,
    );
    expect(second.weight).toBeGreaterThan(first.weight);
  });

  it('weight approaches but never exceeds 1', () => {
    let last: any;
    for (let i = 0; i < 100; i++) {
      last = strengthen(
        testDb.repos.synapse,
        { type: 'error', id: 1 },
        { type: 'error', id: 2 },
        'similar_to',
        defaultConfig,
      );
    }
    expect(last.weight).toBeLessThanOrEqual(1.0);
    expect(last.weight).toBeGreaterThan(0.8);
  });

  it('weaken reduces weight', () => {
    const synapse = strengthen(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
      defaultConfig,
    );
    weaken(testDb.repos.synapse, synapse.id, defaultConfig, 0.5);
    const updated = testDb.repos.synapse.getById(synapse.id);
    // weaken either reduces weight or deletes if below threshold
    if (updated) {
      expect(updated.weight).toBeLessThan(synapse.weight);
    } else {
      // was pruned — that counts as weakened
      expect(true).toBe(true);
    }
  });
});
