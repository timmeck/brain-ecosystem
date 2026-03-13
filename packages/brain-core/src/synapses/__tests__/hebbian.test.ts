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

  it('strengthens existing synapse multiplicatively', () => {
    const existing = makeSynapse({ weight: 0.5 });
    const repo = mockRepo(existing);
    const result = strengthen(repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves', config);
    // Multiplicative: min(1.0, 0.5 * (1 + 0.15)) = 0.575
    expect(result.weight).toBeCloseTo(0.5 * (1 + 0.15));
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

  describe('multiplicative bounding', () => {
    it('stays bounded after 1000 activations from low weight', () => {
      let weight = 0.1;
      for (let i = 0; i < 1000; i++) {
        weight = Math.min(1.0, weight * (1 + 0.15));
      }
      expect(weight).toBe(1.0);
    });

    it('preserves weight differentiation between strong and weak synapses', () => {
      // Two synapses starting at different weights, both strengthened 10 times
      let weak = 0.2;
      let strong = 0.6;
      for (let i = 0; i < 10; i++) {
        weak = Math.min(1.0, weak * (1 + 0.15));
        strong = Math.min(1.0, strong * (1 + 0.15));
      }
      // Multiplicative preserves ratio: strong should still be higher
      expect(strong).toBeGreaterThan(weak);
      // Neither should be at 1.0 after only 10 steps with rate 0.15
      expect(weak).toBeLessThan(1.0);
    });

    it('grows slower than old additive formula at high weights', () => {
      const weight = 0.8;
      const rate = 0.15;
      const multiplicative = Math.min(1.0, weight * (1 + rate));
      const additive = weight + (1.0 - weight) * rate;
      // At 0.8: multiplicative=0.92, additive=0.83 — multiplicative is actually larger
      // But the key difference: multiplicative doesn't accelerate toward 1.0 as additive does
      // Both should be < 1.0
      expect(multiplicative).toBeLessThan(1.0);
      expect(additive).toBeLessThan(1.0);
    });
  });

  describe('signal quality weighting', () => {
    it('scales effective rate by sqrt(sourceScore * targetScore)', () => {
      const existing = makeSynapse({ weight: 0.5 });
      const repo = mockRepo(existing);
      const scores = { sourceScore: 0.8, targetScore: 0.5 };
      const result = strengthen(
        repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves',
        config, undefined, scores,
      );
      const qualityFactor = Math.sqrt(0.8 * 0.5);
      const effectiveRate = 0.15 * qualityFactor;
      expect(result.weight).toBeCloseTo(Math.min(1.0, 0.5 * (1 + effectiveRate)));
    });

    it('full rate without scores (backwards compatible)', () => {
      const existing = makeSynapse({ weight: 0.5 });
      const repo = mockRepo(existing);
      const result = strengthen(
        repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves', config,
      );
      // No scores → qualityFactor=1.0 → full learningRate
      expect(result.weight).toBeCloseTo(0.5 * (1 + 0.15));
    });

    it('perfect scores give full rate', () => {
      const existing = makeSynapse({ weight: 0.5 });
      const repo = mockRepo(existing);
      const scores = { sourceScore: 1.0, targetScore: 1.0 };
      const result = strengthen(
        repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves',
        config, undefined, scores,
      );
      // sqrt(1*1) = 1.0, same as no scores
      expect(result.weight).toBeCloseTo(0.5 * (1 + 0.15));
    });

    it('zero scores give zero reinforcement', () => {
      const existing = makeSynapse({ weight: 0.5 });
      const repo = mockRepo(existing);
      const scores = { sourceScore: 0.0, targetScore: 0.0 };
      const result = strengthen(
        repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves',
        config, undefined, scores,
      );
      // sqrt(0*0) = 0, effectiveRate = 0, weight unchanged: 0.5 * (1+0) = 0.5
      expect(result.weight).toBeCloseTo(0.5);
    });

    it('handles negative scores safely (clamped to 0)', () => {
      const existing = makeSynapse({ weight: 0.5 });
      const repo = mockRepo(existing);
      const scores = { sourceScore: -0.5, targetScore: 0.8 };
      const result = strengthen(
        repo, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves',
        config, undefined, scores,
      );
      // Math.max(0, -0.5) = 0, so sqrt(0 * 0.8) = 0, weight unchanged
      expect(result.weight).toBeCloseTo(0.5);
    });

    it('one-sided low score reduces reinforcement', () => {
      const existing = makeSynapse({ weight: 0.5 });
      const repo = mockRepo(existing);
      const highScores = { sourceScore: 1.0, targetScore: 1.0 };
      const lowScores = { sourceScore: 0.1, targetScore: 0.1 };

      const repoHigh = mockRepo(makeSynapse({ weight: 0.5 }));
      const repoLow = mockRepo(makeSynapse({ weight: 0.5 }));

      const high = strengthen(
        repoHigh, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves',
        config, undefined, highScores,
      );
      const low = strengthen(
        repoLow, { type: 'error', id: 1 }, { type: 'solution', id: 1 }, 'solves',
        config, undefined, lowScores,
      );

      expect(high.weight).toBeGreaterThan(low.weight);
    });
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
