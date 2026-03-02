import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ParameterRegistry } from '../../../src/metacognition/parameter-registry.js';
import { EvolutionEngine } from '../../../src/metacognition/evolution-engine.js';
import type { EvolutionDataSources, Individual } from '../../../src/metacognition/evolution-engine.js';

describe('EvolutionEngine', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;
  let engine: EvolutionEngine;

  const mockDataSources: EvolutionDataSources = {
    getReportCards: () => [
      { engine: 'dream', combined_score: 0.7 },
      { engine: 'attention', combined_score: 0.8 },
    ],
    getGoalProgress: () => 0.5,
    getPredictionAccuracy: () => 0.6,
    getPrincipleCount: () => 20,
    getHypothesisCount: () => 15,
  };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    registry = new ParameterRegistry(db);
    registry.registerAll([
      { engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 0.5, description: 'Synapse prune cutoff' },
      { engine: 'dream', name: 'learning_rate', value: 0.15, min: 0.01, max: 0.5, description: 'Dream learning rate' },
      { engine: 'attention', name: 'decay_rate', value: 0.85, min: 0.5, max: 0.99, description: 'Attention decay' },
      { engine: 'curiosity', name: 'explore_weight', value: 1.4, min: 0.5, max: 3.0, description: 'UCB exploration' },
    ]);
    engine = new EvolutionEngine(db, registry, { brainName: 'test-brain', populationSize: 8 });
  });

  it('should create 3 tables on construction', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'evolution%'",
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('evolution_generations');
    expect(names).toContain('evolution_individuals');
    expect(names).toContain('evolution_lineage');
  });

  it('should initialize population with N individuals', () => {
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    expect(pop).toHaveLength(8);
  });

  it('should be idempotent on initializePopulation', () => {
    engine.initializePopulation();
    engine.initializePopulation(); // Second call should be no-op
    const pop = engine.getPopulation(0);
    expect(pop).toHaveLength(8);
  });

  it('should evaluate fitness returning 0-1', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    const fitness = engine.evaluateFitness(pop[0]);
    expect(fitness).toBeGreaterThanOrEqual(0);
    expect(fitness).toBeLessThanOrEqual(1);
  });

  it('should evaluate fitness with data sources', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    const fitness = engine.evaluateFitness(pop[0]);
    // With our mock data: 0.75*0.4 + 0.5*0.2 + 0.6*0.2 + 0.35*0.1 + novelty*0.1
    expect(fitness).toBeGreaterThan(0);
  });

  it('should handle empty data sources', () => {
    const emptyDS: EvolutionDataSources = {
      getReportCards: () => [],
      getGoalProgress: () => 0,
      getPredictionAccuracy: () => 0,
      getPrincipleCount: () => 0,
      getHypothesisCount: () => 0,
    };
    engine.setDataSources(emptyDS);
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    const fitness = engine.evaluateFitness(pop[0]);
    expect(fitness).toBeGreaterThanOrEqual(0);
    expect(fitness).toBeLessThanOrEqual(1);
  });

  it('should select from population via tournament', () => {
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    // Give them varying fitness
    pop[0].fitness = 0.9;
    pop[1].fitness = 0.3;
    pop[2].fitness = 0.1;

    const selected = engine.tournamentSelect(pop, 3);
    expect(selected).toBeDefined();
    expect(pop).toContainEqual(selected);
  });

  it('should crossover two parents', () => {
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    const parentA = pop[0];
    const parentB = pop[1];
    const { child, crossoverPoints } = engine.crossover(parentA, parentB);

    // Child should have all parameter keys
    const keys = Object.keys(parentA.genome);
    for (const key of keys) {
      expect(child[key]).toBeDefined();
      // Value should come from either parent
      expect([parentA.genome[key], parentB.genome[key]]).toContainEqual(child[key]);
    }
    expect(Array.isArray(crossoverPoints)).toBe(true);
  });

  it('should mutate genome respecting bounds', () => {
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    const genome = { ...pop[0].genome };
    const { genome: mutated, mutations } = engine.mutateGenome(genome, 1.0); // 100% mutation rate

    // All values should respect bounds
    const params = registry.list();
    for (const [key, val] of Object.entries(mutated)) {
      const [eng, name] = key.split(':');
      const def = params.find(p => p.engine === eng && p.name === name);
      if (def) {
        expect(val).toBeGreaterThanOrEqual(def.min);
        expect(val).toBeLessThanOrEqual(def.max);
      }
    }
    expect(mutations).toBeGreaterThan(0);
  });

  it('should run a generation and advance counter', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    const gen = engine.runGeneration();
    expect(gen.generation).toBe(1);
    expect(gen.populationSize).toBe(8);
    expect(gen.bestFitness).toBeGreaterThanOrEqual(0);
    expect(gen.avgFitness).toBeGreaterThanOrEqual(0);
  });

  it('should preserve elites across generations', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    engine.runGeneration();

    // After generation, should have individuals in gen 1
    const pop = engine.getPopulation(1);
    expect(pop.length).toBe(8);
  });

  it('should activate genome — apply to registry', () => {
    engine.initializePopulation();
    const pop = engine.getPopulation(0);
    // Manually set a genome value
    const genome = { ...pop[0].genome };
    genome['dream:prune_threshold'] = 0.3;
    engine.activate(genome);

    expect(registry.get('dream', 'prune_threshold')).toBe(0.3);
  });

  it('should return complete status', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    const status = engine.getStatus();

    expect(status.currentGeneration).toBe(0);
    expect(status.populationSize).toBe(8);
    expect(status.isInitialized).toBe(true);
    expect(status.totalIndividuals).toBe(8);
    expect(status.config.populationSize).toBe(8);
    expect(status.config.mutationRate).toBe(0.15);
    expect(status.config.eliteCount).toBe(2);
    expect(status.config.tournamentSize).toBe(3);
  });

  it('should return generation history', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    engine.runGeneration();
    engine.runGeneration();

    const history = engine.getHistory(10);
    expect(history.length).toBe(2);
    expect(history[0].generation).toBe(2); // Most recent first
    expect(history[1].generation).toBe(1);
  });

  it('should compute non-negative diversity', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    const gen = engine.runGeneration();
    expect(gen.diversity).toBeGreaterThanOrEqual(0);
  });

  it('should keep population at populationSize', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    engine.runGeneration();
    engine.runGeneration();
    engine.runGeneration();

    const pop = engine.getPopulation(3);
    expect(pop.length).toBe(8);
  });

  it('should return best individual as champion', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    engine.runGeneration();

    const best = engine.getBestIndividual();
    expect(best).not.toBeNull();
    expect(best!.genome).toBeDefined();
    expect(best!.fitness).toBeGreaterThanOrEqual(0);
  });

  it('should return lineage for an individual', () => {
    engine.setDataSources(mockDataSources);
    engine.initializePopulation();
    engine.runGeneration();

    // Find an individual with parents
    const pop = engine.getPopulation(1);
    const withParents = pop.find(i => i.parentAId !== null);
    if (withParents?.id) {
      const lineage = engine.getLineage(withParents.id);
      expect(lineage.length).toBeGreaterThan(0);
      expect(lineage[0].childId).toBe(withParents.id);
    }
  });
});
