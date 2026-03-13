import type { NodeRef, SynapseRecord, HebbianConfig, SignalScores, SynapseRepoInterface } from './types.js';

/**
 * Hebbian learning: strengthen a synapse between two nodes.
 * Uses multiplicative update: w_new = min(1.0, w_old * (1 + effectiveRate))
 * where effectiveRate = learningRate * qualityFactor.
 *
 * Signal quality weighting: when scores are provided, the effective rate is
 * scaled by sqrt(sourceScore * targetScore). Strong co-activations reinforce
 * more than weak ones. Without scores, full learningRate applies.
 *
 * This replaces the old additive formula (w + (1-w) * rate) which converged
 * too fast and saturated synapses to ~1.0 with little differentiation.
 */
export function strengthen(
  repo: SynapseRepoInterface,
  source: NodeRef,
  target: NodeRef,
  synapseType: string,
  config: HebbianConfig,
  context?: Record<string, unknown>,
  scores?: SignalScores,
): SynapseRecord {
  const existing = repo.findBySourceTarget(
    source.type, source.id, target.type, target.id, synapseType,
  );

  // Quality factor: sqrt(sourceScore * targetScore), defaults to 1.0
  const qualityFactor = scores
    ? Math.sqrt(Math.max(0, scores.sourceScore) * Math.max(0, scores.targetScore))
    : 1.0;
  const effectiveRate = config.learningRate * qualityFactor;

  if (existing) {
    // Multiplicative Hebbian: w *= (1 + effectiveRate), bounded at 1.0
    const newWeight = Math.min(1.0, existing.weight * (1 + effectiveRate));
    repo.update(existing.id, {
      weight: newWeight,
      activation_count: existing.activation_count + 1,
      last_activated_at: new Date().toISOString(),
    });
    return { ...existing, weight: newWeight, activation_count: existing.activation_count + 1 };
  }

  const id = repo.create({
    source_type: source.type,
    source_id: source.id,
    target_type: target.type,
    target_id: target.id,
    synapse_type: synapseType,
    weight: config.initialWeight,
    metadata: context ? JSON.stringify(context) : null,
  });

  return repo.getById(id)!;
}

/**
 * Weaken a synapse by a multiplicative factor.
 * Prunes if weight drops below threshold.
 */
export function weaken(
  repo: SynapseRepoInterface,
  synapseId: number,
  config: HebbianConfig,
  factor: number = 0.5,
): void {
  const synapse = repo.getById(synapseId);
  if (!synapse) return;

  const newWeight = synapse.weight * factor;
  if (newWeight < config.pruneThreshold) {
    repo.delete(synapseId);
  } else {
    repo.update(synapseId, { weight: newWeight });
  }
}
