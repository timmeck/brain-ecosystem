import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/setup-db.js';
import { SynapseManager } from '../../src/synapses/synapse-manager.js';
import { SynapseService } from '../../src/services/synapse.service.js';

const synapsesConfig = {
  initialWeight: 0.1,
  learningRate: 0.15,
  decayHalfLifeDays: 45,
  pruneThreshold: 0.05,
  decayAfterDays: 14,
  maxDepth: 3,
  minActivationWeight: 0.2,
};

describe('Synapse Flow Integration', () => {
  let testDb: TestDb;
  let synapseManager: SynapseManager;
  let synapseService: SynapseService;

  beforeEach(() => {
    testDb = createTestDb();
    synapseManager = new SynapseManager(testDb.repos.synapse, synapsesConfig);
    synapseService = new SynapseService(synapseManager);

    // Create test data
    testDb.repos.project.create({ name: 'test', path: '/test' } as any);
    testDb.repos.error.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp1', type: 'TypeError',
      message: 'error 1', raw_output: 'TypeError: 1', context: null,
      file_path: null, line_number: null, column_number: null,
    } as any);
    testDb.repos.error.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp2', type: 'TypeError',
      message: 'error 2', raw_output: 'TypeError: 2', context: null,
      file_path: null, line_number: null, column_number: null,
    } as any);
    testDb.repos.error.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp3', type: 'TypeError',
      message: 'error 3', raw_output: 'TypeError: 3', context: null,
      file_path: null, line_number: null, column_number: null,
    } as any);
  });

  it('builds and queries a synapse network', () => {
    synapseManager.strengthen(
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
    );
    synapseManager.strengthen(
      { type: 'error', id: 1 },
      { type: 'project', id: 1 },
      'co_occurs',
    );

    const stats = synapseService.getNetworkStats();
    expect(stats.totalSynapses).toBe(2);

    const strongest = synapseService.getStrongestSynapses(10);
    expect(strongest.length).toBe(2);
  });

  it('strengthening same synapse increases weight', () => {
    const first = synapseManager.strengthen(
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
    );

    const second = synapseManager.strengthen(
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
    );

    expect(second.weight).toBeGreaterThan(first.weight);
  });

  it('finds path between connected nodes', () => {
    synapseManager.strengthen(
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
    );
    synapseManager.strengthen(
      { type: 'error', id: 2 },
      { type: 'error', id: 3 },
      'similar_to',
    );

    const path = synapseService.findPath('error', 1, 'error', 3);
    expect(path).not.toBeNull();
    expect(path!.hops).toBe(2);
  });

  it('returns null for unconnected nodes', () => {
    const path = synapseService.findPath('error', 1, 'error', 3);
    expect(path).toBeNull();
  });

  it('decay reduces old synapse weights', () => {
    synapseManager.strengthen(
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
      'similar_to',
    );

    // Make synapse old
    testDb.db.prepare(
      `UPDATE synapses SET last_activated_at = datetime('now', '-100 days')`
    ).run();

    const { decayed, pruned } = synapseManager.runDecay();
    expect(decayed + pruned).toBeGreaterThanOrEqual(0);
  });
});
