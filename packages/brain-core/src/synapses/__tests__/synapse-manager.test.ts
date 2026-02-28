import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before importing BaseSynapseManager
vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { BaseSynapseManager } from '../synapse-manager.js';
import type { SynapseRepoInterface, SynapseRecord } from '../types.js';

function synapse(overrides: Partial<SynapseRecord> = {}): SynapseRecord {
  return {
    id: 1,
    source_type: 'a', source_id: 1,
    target_type: 'b', target_id: 1,
    synapse_type: 'test',
    weight: 0.5,
    activation_count: 1,
    last_activated_at: new Date().toISOString(),
    metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockRepo(): SynapseRepoInterface {
  return {
    findBySourceTarget: vi.fn().mockReturnValue(synapse()),
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn().mockReturnValue(synapse()),
    update: vi.fn(),
    delete: vi.fn(),
    getOutgoing: vi.fn().mockReturnValue([]),
    getIncoming: vi.fn().mockReturnValue([]),
    findInactiveSince: vi.fn().mockReturnValue([]),
    topByWeight: vi.fn().mockReturnValue([synapse()]),
    topDiverse: vi.fn().mockReturnValue([synapse()]),
    countNodes: vi.fn().mockReturnValue(10),
    totalCount: vi.fn().mockReturnValue(25),
    avgWeight: vi.fn().mockReturnValue(0.5),
    countByType: vi.fn().mockReturnValue({ test: 25 }),
  };
}

const config = {
  initialWeight: 0.1,
  learningRate: 0.15,
  pruneThreshold: 0.05,
  decayHalfLifeDays: 45,
  decayAfterDays: 14,
  maxDepth: 3,
  minActivationWeight: 0.2,
};

describe('BaseSynapseManager', () => {
  let repo: SynapseRepoInterface;
  let manager: BaseSynapseManager;

  beforeEach(() => {
    repo = mockRepo();
    manager = new BaseSynapseManager(repo, config);
  });

  it('strengthen delegates to hebbian', () => {
    const result = manager.strengthen({ type: 'a', id: 1 }, { type: 'b', id: 2 }, 'test');
    expect(result).toBeDefined();
    expect(repo.update).toHaveBeenCalled();
  });

  it('weaken delegates to hebbian', () => {
    manager.weaken(1, 0.5);
    expect(repo.getById).toHaveBeenCalledWith(1);
  });

  it('find delegates to repo', () => {
    manager.find({ type: 'a', id: 1 }, { type: 'b', id: 1 }, 'test');
    expect(repo.findBySourceTarget).toHaveBeenCalled();
  });

  it('activate uses config defaults', () => {
    manager.activate({ type: 'a', id: 1 });
    expect(repo.getOutgoing).toHaveBeenCalled();
  });

  it('runDecay returns results', () => {
    const result = manager.runDecay();
    expect(result).toEqual({ decayed: 0, pruned: 0 });
  });

  it('getNetworkStats returns stats', () => {
    const stats = manager.getNetworkStats();
    expect(stats.totalNodes).toBe(10);
    expect(stats.totalSynapses).toBe(25);
    expect(stats.avgWeight).toBe(0.5);
  });

  it('getStrongestSynapses delegates to repo', () => {
    const result = manager.getStrongestSynapses(10);
    expect(result).toHaveLength(1);
    expect(repo.topByWeight).toHaveBeenCalledWith(10);
  });
});
