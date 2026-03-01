import { describe, it, expect } from 'vitest';
import { strengthen, weaken } from '../../../src/synapses/hebbian.js';
import type { SynapseRecord } from '../../../src/db/repositories/synapse.repository.js';

type SynapseData = Omit<SynapseRecord, 'created_at'>;

function makeSynapse(overrides: Partial<SynapseData> = {}): SynapseData {
  return {
    id: 'syn_test',
    fingerprint: 'neutral|neutral|flat|low',
    weight: 0.5,
    wins: 0,
    losses: 0,
    activations: 0,
    total_profit: 0,
    last_activated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('hebbian', () => {
  describe('strengthen', () => {
    it('should increase weight asymptotically toward 1.0', () => {
      const syn = makeSynapse({ weight: 0.5 });
      strengthen(syn, 0.1);

      // weight += (1.0 - 0.5) * 0.1 = 0.5 + 0.05 = 0.55
      expect(syn.weight).toBeCloseTo(0.55);
    });

    it('should increment wins and activations', () => {
      const syn = makeSynapse({ wins: 3, activations: 5 });
      strengthen(syn, 0.1);

      expect(syn.wins).toBe(4);
      expect(syn.activations).toBe(6);
    });

    it('should update last_activated', () => {
      const syn = makeSynapse({ last_activated: '2020-01-01T00:00:00.000Z' });
      strengthen(syn, 0.1);

      expect(syn.last_activated).not.toBe('2020-01-01T00:00:00.000Z');
      // Should be a valid ISO string
      expect(() => new Date(syn.last_activated)).not.toThrow();
    });

    it('should approach but never exceed 1.0 with repeated strengthening', () => {
      const syn = makeSynapse({ weight: 0.9 });

      for (let i = 0; i < 100; i++) {
        strengthen(syn, 0.1);
      }

      expect(syn.weight).toBeLessThanOrEqual(1.0);
      expect(syn.weight).toBeGreaterThan(0.99);
    });

    it('should increase more for lower weights (more room to grow)', () => {
      const lowSyn = makeSynapse({ weight: 0.2 });
      const highSyn = makeSynapse({ weight: 0.8 });

      const lowBefore = lowSyn.weight;
      const highBefore = highSyn.weight;

      strengthen(lowSyn, 0.1);
      strengthen(highSyn, 0.1);

      const lowDelta = lowSyn.weight - lowBefore;
      const highDelta = highSyn.weight - highBefore;

      expect(lowDelta).toBeGreaterThan(highDelta);
    });

    it('should handle zero learning rate', () => {
      const syn = makeSynapse({ weight: 0.5 });
      strengthen(syn, 0);

      expect(syn.weight).toBeCloseTo(0.5);
      expect(syn.wins).toBe(1);
    });
  });

  describe('weaken', () => {
    it('should multiply weight by weaken penalty', () => {
      const syn = makeSynapse({ weight: 0.5 });
      weaken(syn, 0.7);

      expect(syn.weight).toBeCloseTo(0.35);
    });

    it('should increment losses and activations', () => {
      const syn = makeSynapse({ losses: 2, activations: 5 });
      weaken(syn, 0.8);

      expect(syn.losses).toBe(3);
      expect(syn.activations).toBe(6);
    });

    it('should update last_activated', () => {
      const syn = makeSynapse({ last_activated: '2020-01-01T00:00:00.000Z' });
      weaken(syn, 0.8);

      expect(syn.last_activated).not.toBe('2020-01-01T00:00:00.000Z');
    });

    it('should approach 0 with repeated weakening', () => {
      const syn = makeSynapse({ weight: 0.5 });

      for (let i = 0; i < 50; i++) {
        weaken(syn, 0.8);
      }

      expect(syn.weight).toBeLessThan(0.001);
    });

    it('should handle penalty of 1.0 (no change)', () => {
      const syn = makeSynapse({ weight: 0.5 });
      weaken(syn, 1.0);

      expect(syn.weight).toBeCloseTo(0.5);
    });

    it('should handle penalty of 0.0 (zero weight)', () => {
      const syn = makeSynapse({ weight: 0.5 });
      weaken(syn, 0.0);

      expect(syn.weight).toBe(0);
    });
  });
});
