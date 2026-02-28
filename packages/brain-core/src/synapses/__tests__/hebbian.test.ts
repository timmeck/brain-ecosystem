import { describe, it, expect, vi } from 'vitest';
import { strengthen, weaken } from '../hebbian.js';
import type { SynapseRepoInterface, SynapseRecord } from '../types.js';

function makeSynapse(overrides: Partial<SynapseRecord> = {}): SynapseRecord {
  return {
    id: 1,
    source_type: 'error', source_id: 1,
    target_type: 'solution', target_id: 1,
    synapse_type: 'solves',
    weight: 0.5,
    activation_count: 3,
    last_activated_at: new Date().toISOString(),
    metadata: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockRepo(existing?: SynapseRecord): SynapseRepoInterface {
  return {
    findBySourceTarget: vi.fn().mockReturnValue(existing),
    create: vi.fn().mockReturnValue(42),
    getById: vi.fn().mockReturnValue(existing ?? makeSynapse({ id: 42, weight: 0.1, activation_count: 1 })),
    update: vi.fn(),
    delete: vi.fn(),
    getOutgoing: vi.fn().mockReturnValue([]),
    getIncoming: vi.fn().mockReturnValue([]),
    findInactiveSince: vi.fn().mockReturnValue([]),
    topByWeight: vi.fn().mockReturnValue([]),
    topDiverse: vi.fn().mockReturnValue([]),
    countNodes: vi.fn().mockReturnValue(0),
    totalCount: vi.fn().mockReturnValue(0),
    avgWeight: vi.fn().mockReturnValue(0),
    countByType: vi.fn().mockReturnValue({}),
  };
}

const config = { initialWeight: 0.1, learningRate: 0.15, pruneThreshold: 0.05 };

describe('strengthen', () => {
  it('creates a new synapse when none exists', () => {
    const repo = mockRepo(undefined);
    strengthen(repo, { type: 'error', id: 1 }, { type: 'solution', id: 2 }, 'solves', config);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      weight: 0.1,
      source_type: 'error',
      target_type: 'solution',
    }));
  });

  it('strengthens existing synapse asymptotically', () => {
    const existing = makeSynapse({ weight: 0.5 });
    const repo = mockRepo(existing);
    const result = strengthen(repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves', config);
    expect(result.weight).toBeCloseTo(0.5 + (1.0 - 0.5) * 0.15);
    expect(repo.update).toHaveBeenCalled();
  });

  it('never exceeds 1.0', () => {
    const existing = makeSynapse({ weight: 0.99 });
    const repo = mockRepo(existing);
    const result = strengthen(repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves', config);
    expect(result.weight).toBeLessThanOrEqual(1.0);
  });

  it('increments activation count', () => {
    const existing = makeSynapse({ activation_count: 5 });
    const repo = mockRepo(existing);
    const result = strengthen(repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves', config);
    expect(result.activation_count).toBe(6);
  });

  it('stores context as JSON metadata', () => {
    const repo = mockRepo(undefined);
    strengthen(repo, { type: 'error', id: 1 }, { type: 'solution', id: 2 }, 'solves', config, { reason: 'test' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: '{"reason":"test"}',
    }));
  });
});

describe('weaken', () => {
  it('reduces weight by factor', () => {
    const existing = makeSynapse({ weight: 0.5 });
    const repo = mockRepo(existing);
    weaken(repo, 1, config, 0.5);
    expect(repo.update).toHaveBeenCalledWith(1, { weight: 0.25 });
  });

  it('prunes when below threshold', () => {
    const existing = makeSynapse({ weight: 0.08 });
    const repo = mockRepo(existing);
    weaken(repo, 1, config, 0.5);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('does nothing for non-existent synapse', () => {
    const repo = mockRepo(undefined);
    (repo.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    weaken(repo, 999, config);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
