import { describe, it, expect, vi } from 'vitest';
import { decayAll } from '../decay.js';
import type { SynapseRepoInterface, SynapseRecord } from '../types.js';

function synapse(overrides: Partial<SynapseRecord>): SynapseRecord {
  return {
    id: 1,
    source_type: 'a', source_id: 1,
    target_type: 'b', target_id: 1,
    synapse_type: 'test',
    weight: 0.5,
    activation_count: 1,
    last_activated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockRepo(stale: SynapseRecord[] = []): SynapseRepoInterface {
  return {
    findBySourceTarget: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getOutgoing: vi.fn().mockReturnValue([]),
    getIncoming: vi.fn().mockReturnValue([]),
    findInactiveSince: vi.fn().mockReturnValue(stale),
    topByWeight: vi.fn().mockReturnValue([]),
    topDiverse: vi.fn().mockReturnValue([]),
    countNodes: vi.fn().mockReturnValue(0),
    totalCount: vi.fn().mockReturnValue(0),
    avgWeight: vi.fn().mockReturnValue(0),
    countByType: vi.fn().mockReturnValue({}),
  };
}

const config = { decayHalfLifeDays: 30, decayAfterDays: 14, pruneThreshold: 0.05 };

describe('decayAll', () => {
  it('returns zeros when no stale synapses', () => {
    const repo = mockRepo();
    const result = decayAll(repo, config);
    expect(result).toEqual({ decayed: 0, pruned: 0 });
  });

  it('decays stale synapses', () => {
    const s = synapse({ id: 1, weight: 0.5 });
    const repo = mockRepo([s]);
    const result = decayAll(repo, config);
    expect(result.decayed).toBe(1);
    expect(repo.update).toHaveBeenCalled();
  });

  it('prunes synapses that decay below threshold', () => {
    const s = synapse({
      id: 1,
      weight: 0.03,
      last_activated_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const repo = mockRepo([s]);
    const result = decayAll(repo, config);
    expect(result.pruned).toBe(1);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('handles mix of decayed and pruned', () => {
    const healthy = synapse({ id: 1, weight: 0.8 });
    const weak = synapse({
      id: 2,
      weight: 0.02,
      last_activated_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const repo = mockRepo([healthy, weak]);
    const result = decayAll(repo, config);
    expect(result.decayed + result.pruned).toBe(2);
  });
});
