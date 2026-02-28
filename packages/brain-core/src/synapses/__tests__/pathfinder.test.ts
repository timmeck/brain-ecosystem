import { describe, it, expect, vi } from 'vitest';
import { findPath } from '../pathfinder.js';
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

describe('findPath', () => {
  it('returns null when no path exists', () => {
    const repo = mockRepo();
    const result = findPath(repo, { type: 'a', id: 1 }, { type: 'z', id: 99 });
    expect(result).toBeNull();
  });

  it('finds direct path', () => {
    const s = synapse({ target_type: 'b', target_id: 2, weight: 0.8 });
    const repo = mockRepo({ 'a:1': [s] });
    const result = findPath(repo, { type: 'a', id: 1 }, { type: 'b', id: 2 });
    expect(result).not.toBeNull();
    expect(result!.hops).toBe(1);
    expect(result!.totalWeight).toBeCloseTo(0.8);
  });

  it('finds multi-hop path', () => {
    const s1 = synapse({ target_type: 'b', target_id: 2, weight: 0.8 });
    const s2 = synapse({ target_type: 'c', target_id: 3, weight: 0.5 });
    const repo = mockRepo({ 'a:1': [s1], 'b:2': [s2] });
    const result = findPath(repo, { type: 'a', id: 1 }, { type: 'c', id: 3 });
    expect(result).not.toBeNull();
    expect(result!.hops).toBe(2);
    expect(result!.totalWeight).toBeCloseTo(0.4);
  });

  it('respects maxDepth', () => {
    const s1 = synapse({ target_type: 'b', target_id: 2, weight: 0.9 });
    const s2 = synapse({ target_type: 'c', target_id: 3, weight: 0.9 });
    const repo = mockRepo({ 'a:1': [s1], 'b:2': [s2] });
    const result = findPath(repo, { type: 'a', id: 1 }, { type: 'c', id: 3 }, 1);
    expect(result).toBeNull();
  });

  it('follows incoming synapses', () => {
    const s = synapse({ source_type: 'b', source_id: 2, weight: 0.7 });
    const repo = mockRepo({}, { 'a:1': [s] });
    const result = findPath(repo, { type: 'a', id: 1 }, { type: 'b', id: 2 });
    expect(result).not.toBeNull();
    expect(result!.hops).toBe(1);
  });
});
