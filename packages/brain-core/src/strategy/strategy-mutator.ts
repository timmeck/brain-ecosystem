import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { Strategy, StrategyRule, StrategyPerformance } from './strategy-forge.js';

// ── Types ──────────────────────────────────────────────────

export interface MutationConfig {
  mutationRate?: number;        // Probability of mutating each rule (0-1, default 0.3)
  crossoverRate?: number;       // Probability of crossover (0-1, default 0.5)
  eliteCount?: number;          // Number of top strategies to keep unchanged (default 2)
  maxPopulation?: number;       // Max strategies before selection (default 20)
  confidenceJitter?: number;    // Max random change to confidence (default 0.15)
}

export interface MutationResult {
  mutated: number;
  crossovers: number;
  eliminated: number;
  generation: number;
}

// ── Mutator ──────────────────────────────────────────────────

const log = getLogger();

/**
 * StrategyMutator — evolutionary operations on strategies.
 * Mutation: random confidence/action tweaks.
 * Crossover: combine rules from two parents.
 * Selection: keep best, eliminate worst.
 */
export class StrategyMutator {
  private readonly db: Database.Database;
  private readonly config: Required<MutationConfig>;
  private generation = 0;

  constructor(db: Database.Database, config?: MutationConfig) {
    this.db = db;
    this.config = {
      mutationRate: config?.mutationRate ?? 0.3,
      crossoverRate: config?.crossoverRate ?? 0.5,
      eliteCount: config?.eliteCount ?? 2,
      maxPopulation: config?.maxPopulation ?? 20,
      confidenceJitter: config?.confidenceJitter ?? 0.15,
    };
  }

  /** Mutate rules within a strategy — tweak confidence values and occasionally swap actions */
  mutate(strategy: Strategy): Strategy {
    const mutatedRules = strategy.rules.map(rule => {
      if (Math.random() > this.config.mutationRate) return rule;

      const jitter = (Math.random() * 2 - 1) * this.config.confidenceJitter;
      const newConfidence = Math.max(0, Math.min(1, rule.confidence + jitter));

      return {
        ...rule,
        confidence: parseFloat(newConfidence.toFixed(3)),
        source: `mutated:${rule.source}`,
      };
    });

    return {
      ...strategy,
      rules: mutatedRules,
      name: `${strategy.name} (mutant)`,
      status: 'draft' as const,
      parentId: strategy.id,
    };
  }

  /** Crossover rules from two parent strategies */
  crossover(parentA: Strategy, parentB: Strategy): Strategy {
    const allRules = [...parentA.rules, ...parentB.rules];

    // Select rules: take best from each parent based on confidence
    const sorted = allRules.sort((a, b) => b.confidence - a.confidence);
    const childRules = sorted.slice(0, Math.max(3, Math.ceil(allRules.length / 2)));

    // Deduplicate by condition
    const seen = new Set<string>();
    const uniqueRules = childRules.filter(r => {
      if (seen.has(r.condition)) return false;
      seen.add(r.condition);
      return true;
    });

    return {
      id: 0,
      brainName: parentA.brainName,
      type: parentA.type,
      name: `${parentA.name} x ${parentB.name}`,
      description: `Crossover of #${parentA.id} and #${parentB.id}`,
      rules: uniqueRules,
      performance: { executions: 0, successes: 0, avgReturn: 0 },
      status: 'draft',
      parentId: parentA.id,
    };
  }

  /** Select survivors: keep elite + best performers, eliminate the rest */
  selectSurvivors(strategies: Strategy[]): { survivors: Strategy[]; eliminated: Strategy[] } {
    if (strategies.length <= this.config.maxPopulation) {
      return { survivors: strategies, eliminated: [] };
    }

    // Score each strategy
    const scored = strategies.map(s => ({
      strategy: s,
      score: this.fitnessScore(s),
    }));

    // Sort by fitness (higher = better)
    scored.sort((a, b) => b.score - a.score);

    const survivors = scored.slice(0, this.config.maxPopulation).map(s => s.strategy);
    const eliminated = scored.slice(this.config.maxPopulation).map(s => s.strategy);

    return { survivors, eliminated };
  }

  /** Run a full generation: mutate, crossover, select */
  evolveGeneration(strategies: Strategy[]): MutationResult {
    this.generation++;
    let mutated = 0;
    let crossovers = 0;

    // Sort by fitness
    const sorted = [...strategies].sort((a, b) => this.fitnessScore(b) - this.fitnessScore(a));

    // Elite: keep unchanged
    const elite = sorted.slice(0, this.config.eliteCount);
    const offspring: Strategy[] = [...elite];

    // Mutate non-elite strategies
    for (const strategy of sorted.slice(this.config.eliteCount)) {
      if (Math.random() < this.config.mutationRate) {
        offspring.push(this.mutate(strategy));
        mutated++;
      } else {
        offspring.push(strategy);
      }
    }

    // Crossover: pair top strategies
    for (let i = 0; i < sorted.length - 1; i += 2) {
      if (Math.random() < this.config.crossoverRate && offspring.length < this.config.maxPopulation) {
        offspring.push(this.crossover(sorted[i], sorted[i + 1]));
        crossovers++;
      }
    }

    // Select
    const { eliminated } = this.selectSurvivors(offspring);

    log.info(`[strategy-mutator] Generation ${this.generation}: ${mutated} mutations, ${crossovers} crossovers, ${eliminated.length} eliminated`);

    return {
      mutated,
      crossovers,
      eliminated: eliminated.length,
      generation: this.generation,
    };
  }

  /** Compute fitness score for a strategy */
  fitnessScore(strategy: Strategy): number {
    const perf = strategy.performance;
    if (perf.executions === 0) return 0;

    const winRate = perf.successes / perf.executions;
    const avgReturn = perf.avgReturn;
    const ruleQuality = strategy.rules.reduce((sum, r) => sum + r.confidence, 0) / Math.max(1, strategy.rules.length);

    // Weighted fitness: 40% win rate, 40% avg return, 20% rule quality
    return winRate * 0.4 + Math.tanh(avgReturn) * 0.4 + ruleQuality * 0.2;
  }

  /** Get current generation */
  getGeneration(): number {
    return this.generation;
  }
}
