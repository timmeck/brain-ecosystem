import { describe, it, expect, vi } from 'vitest';
import { spreadingActivation } from '../activation.js';
import type { SynapseRepoInterface, SynapseRecord } from '../types.js';

function synapse(overrides: Partial<SynapseRecord>): SynapseRecord {
  return {
    id: 1,
    source_type: 'a', source_id: 1,
    target_type: 'b', target_id: 1,
    synapse_type: 'test',
    weight: 0.8,
    activation_count: 1,
    last_activated_at: new Date().toISOString(),
    metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockRepo(outgoingMap: Record<string, SynapseRecord[]> = {}, incomingMap: Record<string, SynapseRecord[]> = {}): SynapseRepoInterface {
  return {
    findBySourceTarget: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getOutgoing: vi.fn().mockImplementation((type: string, id: number) => outgoingMap[`${type}:${id}`] ?? []),
    getIncoming: vi.fn().mockImplementation((type: string, id: number) => incomingMap[`${type}:${id}`] ?? []),
    findInactiveSince: vi.fn().mockReturnValue([]),
    topByWeight: vi.fn().mockReturnValue([]),
    topDiverse: vi.fn().mockReturnValue([]),
    countNodes: vi.fn().mockReturnValue(0),
    totalCount: vi.fn().mockReturnValue(0),
    avgWeight: vi.fn().mockReturnValue(0),
    countByType: vi.fn().mockReturnValue({}),
  };
}

describe('spreadingActivation', () => {
  it('returns empty for isolated node', () => {
    const repo = mockRepo();
    const results = spreadingActivation(repo, { type: 'a', id: 1 });
    expect(results).toEqual([]);
  });

  it('finds directly connected nodes', () => {
    const s = synapse({ target_type: 'b', target_id: 2, weight: 0.8 });
    const repo = mockRepo({ 'a:1': [s] });
    const results = spreadingActivation(repo, { type: 'a', id: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].node).toEqual({ type: 'b', id: 2 });
    expect(results[0].activation).toBe(0.8);
    expect(results[0].depth).toBe(1);
  });

  it('propagates through multiple hops', () => {
    const s1 = synapse({ target_type: 'b', target_id: 2, weight: 0.8 });
    const s2 = synapse({ target_type: 'c', target_id: 3, weight: 0.5 });
    const repo = mockRepo({ 'a:1': [s1], 'b:2': [s2] });
    const results = spreadingActivation(repo, { type: 'a', id: 1 });
    expect(results).toHaveLength(2);
    expect(results.find(r => r.node.type === 'c')?.activation).toBeCloseTo(0.4);
  });

  it('respects maxDepth', () => {
    const s1 = synapse({ target_type: 'b', target_id: 2, weight: 0.9 });
    const s2 = synapse({ target_type: 'c', target_id: 3, weight: 0.9 });
    const repo = mockRepo({ 'a:1': [s1], 'b:2': [s2] });
    const results = spreadingActivation(repo, { type: 'a', id: 1 }, 1);
    expect(results).toHaveLength(1);
  });

  it('filters by minWeight', () => {
    const s = synapse({ target_type: 'b', target_id: 2, weight: 0.1 });
    const repo = mockRepo({ 'a:1': [s] });
    const results = spreadingActivation(repo, { type: 'a', id: 1 }, 3, 0.2);
    expect(results).toHaveLength(0);
  });

  it('follows incoming synapses too', () => {
    const s = synapse({ source_type: 'b', source_id: 2, weight: 0.7 });
    const repo = mockRepo({}, { 'a:1': [s] });
    const results = spreadingActivation(repo, { type: 'a', id: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].node).toEqual({ type: 'b', id: 2 });
  });

  it('sorts by activation descending', () => {
    const s1 = synapse({ target_type: 'b', target_id: 2, weight: 0.3 });
    const s2 = synapse({ target_type: 'c', target_id: 3, weight: 0.9 });
    const repo = mockRepo({ 'a:1': [s1, s2] });
    const results = spreadingActivation(repo, { type: 'a', id: 1 });
    expect(results[0].activation).toBeGreaterThan(results[1].activation);
  });
});
