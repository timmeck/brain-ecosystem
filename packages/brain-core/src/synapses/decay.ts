import type { DecayConfig, SynapseRepoInterface } from './types.js';
import { timeDecayFactor } from '../math/time-decay.js';

/**
 * Apply time-based decay to all stale synapses.
 * Prunes synapses that decay below the threshold.
 */
export function decayAll(
  repo: SynapseRepoInterface,
  config: DecayConfig,
): { decayed: number; pruned: number } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - config.decayAfterDays);

  const stale = repo.findInactiveSince(cutoff.toISOString());
  let pruned = 0;
  let decayed = 0;

  for (const synapse of stale) {
    const factor = timeDecayFactor(synapse.last_activated_at, config.decayHalfLifeDays);
    const newWeight = synapse.weight * factor;

    if (newWeight < config.pruneThreshold) {
      repo.delete(synapse.id);
      pruned++;
    } else {
      repo.update(synapse.id, { weight: newWeight });
      decayed++;
    }
  }

  return { decayed, pruned };
}
