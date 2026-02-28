import type { SynapseRecord } from '../db/repositories/synapse.repository.js';

/**
 * Hebbian strengthen — "neurons that fire together wire together"
 * Asymptotic approach to 1.0: weight += (1 - weight) * learningRate
 */
export function strengthen(synapse: Omit<SynapseRecord, 'created_at'>, learningRate: number): void {
  synapse.wins++;
  synapse.activations++;
  synapse.weight += (1.0 - synapse.weight) * learningRate;
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
