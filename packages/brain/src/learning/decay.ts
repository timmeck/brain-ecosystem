import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import { wilsonScore, timeDecayFactor } from '@timmeck/brain-core';

/**
 * Update confidence scores for all solutions based on their attempt history.
 */
export function updateSolutionConfidences(solutionRepo: SolutionRepository): number {
  const solutions = solutionRepo.getAll();
  let updated = 0;

  for (const sol of solutions) {
    const total = sol.success_count + sol.fail_count;
    if (total === 0) continue;

    const newConfidence = wilsonScore(sol.success_count, total);
    if (Math.abs(newConfidence - sol.confidence) > 0.001) {
      solutionRepo.update(sol.id, { confidence: newConfidence });
      updated++;
    }
  }

  return updated;
}

/**
 * Compute relevance decay factor for a timestamp.
 */
export function relevanceDecay(timestamp: string, halfLifeDays: number): number {
  return timeDecayFactor(timestamp, halfLifeDays);
}

/**
 * Determine if a rule should be pruned based on its performance.
 */
export function shouldPruneRule(
  confidence: number,
  rejectionCount: number,
  totalUsage: number,
  pruneThreshold: number,
  maxRejectionRate: number,
): boolean {
  if (confidence < pruneThreshold) return true;
  if (totalUsage > 0 && rejectionCount / totalUsage > maxRejectionRate) return true;
  return false;
}
