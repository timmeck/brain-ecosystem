import type { SynapseRecord } from '../db/repositories/synapse.repository.js';

// Re-export timeDecayFactor from brain-core for consumers
export { timeDecayFactor } from '@timmeck/brain-core';

/**
 * Apply temporal decay to a synapse.
 * Formula: new_weight = max(0.01, weight * 0.5^(age/halfLifeMs))
 */
export function decaySynapse(synapse: Omit<SynapseRecord, 'created_at'>, halfLifeMs: number): boolean {
  const now = Date.now();
  const lastActivated = new Date(synapse.last_activated).getTime();
  const age = now - lastActivated;

  if (age > halfLifeMs) {
    const periods = age / halfLifeMs;
    const oldWeight = synapse.weight;
    synapse.weight = Math.max(0.01, synapse.weight * Math.pow(0.5, periods));
    return synapse.weight !== oldWeight;
  }
  return false;
}
