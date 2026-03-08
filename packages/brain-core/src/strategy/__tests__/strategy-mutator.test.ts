import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { StrategyMutator } from '../strategy-mutator.js';
import type { Strategy } from '../strategy-forge.js';

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: 1,
    brainName: 'test',
    type: 'trade',
    name: 'Test Strategy',
    description: 'Test',
    rules: [
      { condition: 'BTC > 50000', action: 'buy', confidence: 0.8, source: 'signal' },
      { condition: 'ETH < 2000', action: 'sell', confidence: 0.6, source: 'signal' },
    ],
    performance: { executions: 10, successes: 7, avgReturn: 0.05 },
    status: 'active',
    ...overrides,
  };
}

describe('StrategyMutator', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates with default config', () => {
    const mutator = new StrategyMutator(db);
    expect(mutator.getGeneration()).toBe(0);
  });

  it('mutates a strategy (high mutation rate)', () => {
    const mutator = new StrategyMutator(db, { mutationRate: 1.0 });
    const strategy = makeStrategy();
    const mutated = mutator.mutate(strategy);

    expect(mutated.name).toContain('mutant');
    expect(mutated.status).toBe('draft');
    expect(mutated.parentId).toBe(strategy.id);
    expect(mutated.rules.length).toBe(strategy.rules.length);
  });

  it('mutated rules have jittered confidence', () => {
    const mutator = new StrategyMutator(db, { mutationRate: 1.0, confidenceJitter: 0.5 });
    const strategy = makeStrategy({
      rules: [{ condition: 'X', action: 'buy', confidence: 0.5, source: 'test' }],
    });

    // Run multiple times to check jitter
    const confidences = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const m = mutator.mutate(strategy);
      confidences.add(m.rules[0].confidence);
    }
    // Should have different values (probabilistic, but with 0.5 jitter on 20 runs, extremely unlikely all same)
    expect(confidences.size).toBeGreaterThan(1);
  });

  it('confidence stays in [0, 1] range', () => {
    const mutator = new StrategyMutator(db, { mutationRate: 1.0, confidenceJitter: 2.0 });
    const strategy = makeStrategy({
      rules: [{ condition: 'X', action: 'buy', confidence: 0.99, source: 'test' }],
    });

    for (let i = 0; i < 50; i++) {
      const m = mutator.mutate(strategy);
      expect(m.rules[0].confidence).toBeGreaterThanOrEqual(0);
      expect(m.rules[0].confidence).toBeLessThanOrEqual(1);
    }
  });

  it('crossover combines rules from two parents', () => {
    const mutator = new StrategyMutator(db);
    const parentA = makeStrategy({ id: 1, rules: [
      { condition: 'BTC > 50000', action: 'buy', confidence: 0.9, source: 'a' },
    ]});
    const parentB = makeStrategy({ id: 2, rules: [
      { condition: 'ETH < 2000', action: 'sell', confidence: 0.7, source: 'b' },
    ]});

    const child = mutator.crossover(parentA, parentB);
    expect(child.name).toContain('x');
    expect(child.rules.length).toBeGreaterThanOrEqual(1);
    expect(child.status).toBe('draft');
    expect(child.performance.executions).toBe(0);
  });

  it('crossover deduplicates by condition', () => {
    const mutator = new StrategyMutator(db);
    const parentA = makeStrategy({ rules: [
      { condition: 'BTC > 50000', action: 'buy', confidence: 0.9, source: 'a' },
      { condition: 'BTC > 50000', action: 'buy', confidence: 0.5, source: 'a' },
    ]});
    const parentB = makeStrategy({ rules: [
      { condition: 'BTC > 50000', action: 'buy', confidence: 0.7, source: 'b' },
    ]});

    const child = mutator.crossover(parentA, parentB);
    const btcRules = child.rules.filter(r => r.condition === 'BTC > 50000');
    expect(btcRules.length).toBe(1);
  });

  it('selectSurvivors keeps best and eliminates worst', () => {
    const mutator = new StrategyMutator(db, { maxPopulation: 2 });
    const strategies = [
      makeStrategy({ id: 1, performance: { executions: 10, successes: 9, avgReturn: 0.1 } }),
      makeStrategy({ id: 2, performance: { executions: 10, successes: 5, avgReturn: 0.02 } }),
      makeStrategy({ id: 3, performance: { executions: 10, successes: 2, avgReturn: -0.05 } }),
    ];

    const { survivors, eliminated } = mutator.selectSurvivors(strategies);
    expect(survivors).toHaveLength(2);
    expect(eliminated).toHaveLength(1);
    expect(eliminated[0].id).toBe(3); // worst
  });

  it('selectSurvivors keeps all when under limit', () => {
    const mutator = new StrategyMutator(db, { maxPopulation: 10 });
    const strategies = [makeStrategy(), makeStrategy({ id: 2 })];
    const { survivors, eliminated } = mutator.selectSurvivors(strategies);
    expect(survivors).toHaveLength(2);
    expect(eliminated).toHaveLength(0);
  });

  it('fitnessScore is 0 for no executions', () => {
    const mutator = new StrategyMutator(db);
    const s = makeStrategy({ performance: { executions: 0, successes: 0, avgReturn: 0 } });
    expect(mutator.fitnessScore(s)).toBe(0);
  });

  it('fitnessScore increases with better performance', () => {
    const mutator = new StrategyMutator(db);
    const bad = makeStrategy({ performance: { executions: 10, successes: 2, avgReturn: -0.1 } });
    const good = makeStrategy({ performance: { executions: 10, successes: 9, avgReturn: 0.1 } });
    expect(mutator.fitnessScore(good)).toBeGreaterThan(mutator.fitnessScore(bad));
  });

  it('evolveGeneration increments generation', () => {
    const mutator = new StrategyMutator(db, { maxPopulation: 5 });
    mutator.evolveGeneration([makeStrategy()]);
    expect(mutator.getGeneration()).toBe(1);
    mutator.evolveGeneration([makeStrategy()]);
    expect(mutator.getGeneration()).toBe(2);
  });

  it('evolveGeneration returns result stats', () => {
    const mutator = new StrategyMutator(db, { mutationRate: 1.0, crossoverRate: 1.0, maxPopulation: 5, eliteCount: 1 });
    const strategies = [
      makeStrategy({ id: 1, performance: { executions: 10, successes: 8, avgReturn: 0.1 } }),
      makeStrategy({ id: 2, performance: { executions: 10, successes: 6, avgReturn: 0.05 } }),
      makeStrategy({ id: 3, performance: { executions: 10, successes: 4, avgReturn: 0.01 } }),
    ];

    const result = mutator.evolveGeneration(strategies);
    expect(result.generation).toBe(1);
    expect(result.mutated).toBeGreaterThanOrEqual(0);
  });
});
