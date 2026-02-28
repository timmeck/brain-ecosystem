import { describe, it, expect, beforeEach } from 'vitest';
import { spreadingActivation } from '@timmeck/brain-core';
import { createTestDb, type TestDb } from '../../helpers/setup-db.js';

describe('spreadingActivation', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.repos.project.create({ name: 'test', path: '/test' } as any);
    for (let i = 0; i < 3; i++) {
      testDb.repos.error.create({
        project_id: 1, terminal_id: null, fingerprint: `fp${i}`, type: 'TypeError',
        message: `error ${i}`, raw_output: `TypeError: ${i}`,
        context: null, file_path: null, line_number: null, column_number: null,
      } as any);
    }

    // Create synapses directly via DB: error1 → error2, error2 → error3
    testDb.repos.synapse.create({
      source_type: 'error', source_id: 1,
      target_type: 'error', target_id: 2,
      synapse_type: 'similar_to', weight: 0.8, metadata: null,
    } as any);
    testDb.repos.synapse.create({
      source_type: 'error', source_id: 2,
      target_type: 'error', target_id: 3,
      synapse_type: 'similar_to', weight: 0.7, metadata: null,
    } as any);
  });

  it('finds directly connected nodes', () => {
    const results = spreadingActivation(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      1,
    );
    expect(results.length).toBeGreaterThan(0);
  });

  it('finds multi-hop connections', () => {
    const results = spreadingActivation(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      2,
    );
    // Should reach error3 through error2
    const nodeIds = results.map(r => r.node.id);
    expect(nodeIds).toContain(3);
  });

  it('returns empty for isolated node', () => {
    // error3 has no outgoing connections (only incoming)
    // Add an isolated error
    testDb.repos.error.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp_isolated', type: 'TypeError',
      message: 'isolated', raw_output: 'TypeError: isolated',
      context: null, file_path: null, line_number: null, column_number: null,
    } as any);
    const results = spreadingActivation(
      testDb.repos.synapse,
      { type: 'error', id: 4 },
      3,
    );
    expect(results).toEqual([]);
  });

  it('activation decays with depth', () => {
    const results = spreadingActivation(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      2,
    );
    const direct = results.find(r => r.node.id === 2);
    const twoHop = results.find(r => r.node.id === 3);
    if (direct && twoHop) {
      expect(direct.activation).toBeGreaterThan(twoHop.activation);
    }
  });
});
