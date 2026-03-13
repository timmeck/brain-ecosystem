import type { SynapseRecord } from '../db/repositories/synapse.repository.js';

/**
 * Hebbian strengthen — "neurons that fire together wire together"
 * Bounded multiplicative: w_new = min(1.0, w_old * (1 + learningRate))
 *
 * Unlike the old additive formula (w + (1-w)*rate) which saturated to ~1.0
 * too fast, multiplicative growth preserves relative weight differences
 * and doesn't collapse all synapses to the ceiling.
 */
export function strengthen(synapse: Omit<SynapseRecord, 'created_at'>, learningRate: number): void {
  synapse.wins++;
  synapse.activations++;
  synapse.weight = Math.min(1.0, synapse.weight * (1 + learningRate));
  synapse.last_activated = new Date().toISOString();
}

/**
 * Hebbian weaken — multiplicative decay on loss
 * weight *= weakenPenalty (e.g. 0.7)
 */
export function weaken(synapse: Omit<SynapseRecord, 'created_at'>, weakenPenalty: number): void {
  synapse.losses++;
  synapse.activations++;
  synapse.weight *= weakenPenalty;
  synapse.last_activated = new Date().toISOString();
}
