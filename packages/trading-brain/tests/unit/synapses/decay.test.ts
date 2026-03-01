import { describe, it, expect } from 'vitest';
import { decaySynapse } from '../../../src/synapses/decay.js';
import type { SynapseRecord } from '../../../src/db/repositories/synapse.repository.js';

type SynapseData = Omit<SynapseRecord, 'created_at'>;

function makeSynapse(overrides: Partial<SynapseData> = {}): SynapseData {
  return {
    id: 'syn_test',
    fingerprint: 'neutral|neutral|flat|low',
    weight: 0.5,
    wins: 5,
    losses: 2,
    activations: 7,
    total_profit: 3.5,
    last_activated: new Date().toISOString(),
    ...overrides,
  };
}

describe('decaySynapse', () => {
  it('should not decay a recently activated synapse', () => {
    const syn = makeSynapse({ last_activated: new Date().toISOString() });
    const halfLifeMs = 86400000; // 1 day

    const changed = decaySynapse(syn, halfLifeMs);

    expect(changed).toBe(false);
    expect(syn.weight).toBeCloseTo(0.5);
  });

  it('should decay a synapse older than halfLife', () => {
    const oldDate = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
    const syn = makeSynapse({ weight: 0.8, last_activated: oldDate });
    const halfLifeMs = 86400000; // 1 day

    const changed = decaySynapse(syn, halfLifeMs);

    expect(changed).toBe(true);
    // After 2 half-lives: 0.8 * 0.5^2 = 0.2
    expect(syn.weight).toBeCloseTo(0.2, 1);
  });

  it('should apply correct formula: weight * 0.5^(age/halfLife)', () => {
    const threeHalfLives = new Date(Date.now() - 3 * 1000).toISOString();
    const syn = makeSynapse({ weight: 0.8, last_activated: threeHalfLives });

    decaySynapse(syn, 1000);

    // 0.8 * 0.5^3 = 0.1
    expect(syn.weight).toBeCloseTo(0.1, 1);
  });

  it('should not decay below 0.01', () => {
    const veryOld = new Date(Date.now() - 100 * 86400000).toISOString(); // 100 days ago
    const syn = makeSynapse({ weight: 0.5, last_activated: veryOld });

    decaySynapse(syn, 86400000);

    expect(syn.weight).toBe(0.01);
  });

  it('should return false when age exactly equals halfLife but weight does change', () => {
    // Edge case: age > halfLife (just barely)
    const justOver = new Date(Date.now() - 86400001).toISOString(); // 1 day + 1ms
    const syn = makeSynapse({ weight: 0.5, last_activated: justOver });

    const changed = decaySynapse(syn, 86400000);

    // After ~1 half-life: 0.5 * 0.5^(~1) ≈ 0.25
    expect(changed).toBe(true);
    expect(syn.weight).toBeLessThan(0.5);
  });

  it('should not change weight when age < halfLife', () => {
    const recent = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    const syn = makeSynapse({ weight: 0.5, last_activated: recent });

    const changed = decaySynapse(syn, 86400000); // Half life = 1 day

    expect(changed).toBe(false);
    expect(syn.weight).toBeCloseTo(0.5);
  });

  it('should handle very small initial weight', () => {
    const old = new Date(Date.now() - 2 * 86400000).toISOString();
    const syn = makeSynapse({ weight: 0.02, last_activated: old });

    decaySynapse(syn, 86400000);

    // 0.02 * 0.5^2 = 0.005, clamped to 0.01
    expect(syn.weight).toBe(0.01);
  });

  it('should handle synapse already at floor weight', () => {
    const old = new Date(Date.now() - 2 * 86400000).toISOString();
    const syn = makeSynapse({ weight: 0.01, last_activated: old });

    const changed = decaySynapse(syn, 86400000);

    // 0.01 * 0.5^2 = 0.0025, but max(0.01, 0.0025) = 0.01, same as before
    expect(changed).toBe(false);
    expect(syn.weight).toBe(0.01);
  });
});
