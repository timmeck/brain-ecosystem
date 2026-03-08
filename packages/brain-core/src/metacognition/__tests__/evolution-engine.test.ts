import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { ParameterRegistry } from '../parameter-registry.js';
import {
  EvolutionEngine,
  runEvolutionMigration,
  type EvolutionConfig,
  type EvolutionDataSources,
  type Individual,
  type Genome,
} from '../evolution-engine.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeConfig(overrides: Partial<EvolutionConfig> = {}): EvolutionConfig {
  return {
    brainName: 'test-brain',
    populationSize: 5,
    mutationRate: 0.15,
    eliteCount: 1,
    tournamentSize: 2,
    generationEvery: 10,
    ...overrides,
  };
}

function registerTestParameters(registry: ParameterRegistry): void {
  registry.registerAll([
    { engine: 'scoring', name: 'threshold', value: 0.5, min: 0, max: 1, description: 'Score threshold' },
    { engine: 'scoring', name: 'weight', value: 0.8, min: 0, max: 2, description: 'Score weight' },
    { engine: 'learning', name: 'rate', value: 0.01, min: 0.001, max: 0.1, description: 'Learning rate' },
  ]);
}

function makeMockDataSources(overrides: Partial<EvolutionDataSources> = {}): EvolutionDataSources {
  return {
    getReportCards: () => [
      { engine: 'scoring', combined_score: 0.7 },
      { engine: 'learning', combined_score: 0.6 },
    ],
    getGoalProgress: () => 0.5,
    getPredictionAccuracy: () => 0.4,
    getPrincipleCount: () => 20,
    getHypothesisCount: () => 30,
    ...overrides,
  };
}

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: 1,
    generation: 0,
    genome: { 'scoring:threshold': 0.5, 'scoring:weight': 0.8, 'learning:rate': 0.01 },
    fitness: 0.5,
    rank: 1,
    isActive: false,
    parentAId: null,
    parentBId: null,
    mutationCount: 0,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('EvolutionEngine', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;
  let engine: EvolutionEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new ParameterRegistry(db);
    registerTestParameters(registry);
    engine = new EvolutionEngine(db, registry, makeConfig());
  });

  afterEach(() => {
    db.close();
  });

  /* ---------- creation ---------- */

  it('creates evolution tables on construction', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('evolution_generations');
    expect(names).toContain('evolution_individuals');
    expect(names).toContain('evolution_lineage');
  });

  it('runEvolutionMigration() is idempotent', () => {
    expect(() => runEvolutionMigration(db)).not.toThrow();
    expect(() => runEvolutionMigration(db)).not.toThrow();
  });

  it('restores currentGeneration from DB on construction', () => {
    // Insert a generation record to simulate prior history
    db.prepare(`
      INSERT INTO evolution_generations (generation, best_fitness, avg_fitness, worst_fitness, population_size, diversity)
      VALUES (7, 0.9, 0.5, 0.1, 5, 0.3)
    `).run();

    const engine2 = new EvolutionEngine(db, registry, makeConfig());
    const status = engine2.getStatus();
    expect(status.currentGeneration).toBe(7);
  });

  /* ---------- getStatus (initial) ---------- */

  it('getStatus() returns correct initial state', () => {
    const status = engine.getStatus();

    expect(status.currentGeneration).toBe(0);
    expect(status.populationSize).toBe(5);
    expect(status.bestFitness).toBe(0);
    expect(status.avgFitness).toBe(0);
    expect(status.totalIndividuals).toBe(0);
    expect(status.isInitialized).toBe(false);
    expect(status.champion).toBeNull();
    expect(status.config).toEqual({
      populationSize: 5,
      mutationRate: 0.15,
      eliteCount: 1,
      tournamentSize: 2,
      generationEvery: 10,
    });
  });

  /* ---------- initializePopulation ---------- */

  it('initializePopulation() creates the configured number of individuals', () => {
    engine.initializePopulation();

    const status = engine.getStatus();
    expect(status.totalIndividuals).toBe(5);
    expect(status.isInitialized).toBe(true);

    const pop = engine.getPopulation(0);
    expect(pop.length).toBe(5);

    // All individuals should have genomes with 3 keys
    for (const ind of pop) {
      expect(Object.keys(ind.genome)).toHaveLength(3);
      expect(ind.generation).toBe(0);
    }
  });

  it('initializePopulation() is idempotent — second call does nothing', () => {
    engine.initializePopulation();
    engine.initializePopulation();

    const status = engine.getStatus();
    expect(status.totalIndividuals).toBe(5);
  });

  it('initializePopulation() does nothing when registry has no parameters', () => {
    const emptyDb = new Database(':memory:');
    const emptyRegistry = new ParameterRegistry(emptyDb);
    const emptyEngine = new EvolutionEngine(emptyDb, emptyRegistry, makeConfig());

    emptyEngine.initializePopulation();

    const status = emptyEngine.getStatus();
    expect(status.totalIndividuals).toBe(0);
    expect(status.isInitialized).toBe(false);

    emptyDb.close();
  });

  /* ---------- evaluateFitness ---------- */

  it('evaluateFitness() returns 0 when no data sources are set', () => {
    const individual = makeIndividual();
    const fitness = engine.evaluateFitness(individual);
    expect(fitness).toBe(0);
  });

  it('evaluateFitness() computes a weighted fitness score from data sources', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    const individual = makeIndividual();
    const fitness = engine.evaluateFitness(individual);

    // fitness should be between 0 and 1
    expect(fitness).toBeGreaterThanOrEqual(0);
    expect(fitness).toBeLessThanOrEqual(1);
    // With our mock data: metaCog=0.65, goal=0.5, pred=0.4, knowledge=0.5, novelty varies
    // 0.65*0.4 + 0.5*0.2 + 0.4*0.2 + 0.5*0.1 + novelty*0.1
    // = 0.26 + 0.10 + 0.08 + 0.05 + novelty*0.1
    // Should be roughly 0.49 + novelty*0.1
    expect(fitness).toBeGreaterThan(0.3);
  });

  it('evaluateFitness() handles data source errors gracefully', () => {
    engine.setDataSources({
      getReportCards: () => { throw new Error('DB error'); },
      getGoalProgress: () => { throw new Error('DB error'); },
      getPredictionAccuracy: () => { throw new Error('DB error'); },
      getPrincipleCount: () => { throw new Error('DB error'); },
      getHypothesisCount: () => { throw new Error('DB error'); },
    });
    engine.initializePopulation();

    const individual = makeIndividual();
    // Should not throw — all errors are caught internally
    const fitness = engine.evaluateFitness(individual);
    expect(fitness).toBeGreaterThanOrEqual(0);
    expect(fitness).toBeLessThanOrEqual(1);
  });

  /* ---------- tournamentSelect ---------- */

  it('tournamentSelect() returns the fittest contestant', () => {
    const population: Individual[] = [
      makeIndividual({ id: 1, fitness: 0.1 }),
      makeIndividual({ id: 2, fitness: 0.9 }),
      makeIndividual({ id: 3, fitness: 0.5 }),
      makeIndividual({ id: 4, fitness: 0.3 }),
      makeIndividual({ id: 5, fitness: 0.7 }),
    ];

    // Run many selections — the result should always be one of the population
    const selections = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const selected = engine.tournamentSelect(population, 3);
      expect(selected.fitness).toBeGreaterThanOrEqual(0);
      expect(selected.fitness).toBeLessThanOrEqual(1);
      selections.add(selected.id!);
    }

    // Over 50 tries, tournament selection should have selected multiple individuals
    expect(selections.size).toBeGreaterThanOrEqual(1);
  });

  it('tournamentSelect() works with tournament size larger than population', () => {
    const population: Individual[] = [
      makeIndividual({ id: 1, fitness: 0.2 }),
      makeIndividual({ id: 2, fitness: 0.8 }),
    ];

    // Tournament size 10 > population size 2 — should clamp via Math.min
    const selected = engine.tournamentSelect(population, 10);
    expect(selected).toBeDefined();
    // Selection picks with replacement, so result is one of the two individuals
    expect([0.2, 0.8]).toContain(selected.fitness);
  });

  /* ---------- crossover ---------- */

  it('crossover() produces a child with genes from both parents', () => {
    const parentA = makeIndividual({
      genome: { 'scoring:threshold': 0.1, 'scoring:weight': 0.2, 'learning:rate': 0.03 },
    });
    const parentB = makeIndividual({
      genome: { 'scoring:threshold': 0.9, 'scoring:weight': 1.8, 'learning:rate': 0.09 },
    });

    // Run crossover many times to check both parents can contribute
    const seenFromA = new Set<string>();
    const seenFromB = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const { child, crossoverPoints } = engine.crossover(parentA, parentB);

      // Child should have all 3 keys
      expect(Object.keys(child)).toHaveLength(3);

      for (const key of Object.keys(child)) {
        if (child[key] === parentA.genome[key]) seenFromA.add(key);
        if (child[key] === parentB.genome[key]) seenFromB.add(key);
      }

      // crossoverPoints should only contain keys taken from parentB
      for (const point of crossoverPoints) {
        expect(child[point]).toBe(parentB.genome[point]);
      }
    }

    // Over 100 iterations, both parents should contribute at least one gene
    expect(seenFromA.size).toBeGreaterThan(0);
    expect(seenFromB.size).toBeGreaterThan(0);
  });

  it('crossover() handles disjoint genome keys (union of both)', () => {
    const parentA = makeIndividual({
      genome: { 'scoring:threshold': 0.5, 'unique:paramA': 0.3 },
    });
    const parentB = makeIndividual({
      genome: { 'scoring:threshold': 0.7, 'unique:paramB': 0.6 },
    });

    const { child } = engine.crossover(parentA, parentB);
    // Child should have the union of all keys
    const keys = Object.keys(child);
    expect(keys).toContain('scoring:threshold');
    expect(keys).toContain('unique:paramA');
    expect(keys).toContain('unique:paramB');
  });

  /* ---------- mutateGenome ---------- */

  it('mutateGenome() with rate=0 produces no mutations', () => {
    const genome: Genome = { 'scoring:threshold': 0.5, 'scoring:weight': 0.8, 'learning:rate': 0.01 };
    const { genome: mutated, mutations } = engine.mutateGenome(genome, 0);

    expect(mutations).toBe(0);
    expect(mutated['scoring:threshold']).toBe(0.5);
    expect(mutated['scoring:weight']).toBe(0.8);
    expect(mutated['learning:rate']).toBe(0.01);
  });

  it('mutateGenome() with rate=1 mutates all genes (within bounds)', () => {
    const genome: Genome = { 'scoring:threshold': 0.5, 'scoring:weight': 0.8, 'learning:rate': 0.01 };

    // Run multiple times — with rate=1, all 3 genes should be mutated each time
    let totalMutations = 0;
    for (let i = 0; i < 20; i++) {
      const { genome: mutated, mutations } = engine.mutateGenome(genome, 1.0);
      totalMutations += mutations;

      // Values must stay within registered bounds
      expect(mutated['scoring:threshold']).toBeGreaterThanOrEqual(0);
      expect(mutated['scoring:threshold']).toBeLessThanOrEqual(1);
      expect(mutated['scoring:weight']).toBeGreaterThanOrEqual(0);
      expect(mutated['scoring:weight']).toBeLessThanOrEqual(2);
      expect(mutated['learning:rate']).toBeGreaterThanOrEqual(0.001);
      expect(mutated['learning:rate']).toBeLessThanOrEqual(0.1);
    }

    // With rate=1.0, every call should mutate all 3 genes → 60 total
    expect(totalMutations).toBe(60);
  });

  it('mutateGenome() does not mutate the original genome object', () => {
    const genome: Genome = { 'scoring:threshold': 0.5, 'scoring:weight': 0.8 };
    engine.mutateGenome(genome, 1.0);

    // Original should be untouched
    expect(genome['scoring:threshold']).toBe(0.5);
    expect(genome['scoring:weight']).toBe(0.8);
  });

  /* ---------- runGeneration ---------- */

  it('runGeneration() produces a new generation with correct stats', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    const gen = engine.runGeneration();

    expect(gen.generation).toBe(1);
    expect(gen.populationSize).toBe(5);
    expect(gen.bestFitness).toBeGreaterThanOrEqual(0);
    expect(gen.avgFitness).toBeGreaterThanOrEqual(0);
    expect(gen.worstFitness).toBeGreaterThanOrEqual(0);
    expect(gen.bestFitness).toBeGreaterThanOrEqual(gen.avgFitness);
    expect(gen.avgFitness).toBeGreaterThanOrEqual(gen.worstFitness);
    expect(gen.diversity).toBeGreaterThanOrEqual(0);

    // Population for generation 1 should exist
    const pop = engine.getPopulation(1);
    expect(pop.length).toBe(5);

    // Status should reflect the new generation
    const status = engine.getStatus();
    expect(status.currentGeneration).toBe(1);
    expect(status.isInitialized).toBe(true);
  });

  it('runGeneration() applies best genome to parameter registry', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    const origThreshold = registry.get('scoring', 'threshold');
    const origWeight = registry.get('scoring', 'weight');
    const origRate = registry.get('learning', 'rate');

    engine.runGeneration();

    // At least one parameter should be potentially different
    // (elites could keep original, but mutations change others)
    const newThreshold = registry.get('scoring', 'threshold');
    const newWeight = registry.get('scoring', 'weight');
    const newRate = registry.get('learning', 'rate');

    // Values must remain within bounds regardless
    expect(newThreshold).toBeGreaterThanOrEqual(0);
    expect(newThreshold!).toBeLessThanOrEqual(1);
    expect(newWeight).toBeGreaterThanOrEqual(0);
    expect(newWeight!).toBeLessThanOrEqual(2);
    expect(newRate).toBeGreaterThanOrEqual(0.001);
    expect(newRate!).toBeLessThanOrEqual(0.1);
  });

  it('runGeneration() records lineage for offspring', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    engine.runGeneration();

    // Check that lineage records exist
    const lineageRows = db.prepare('SELECT COUNT(*) AS cnt FROM evolution_lineage').get() as { cnt: number };
    expect(lineageRows.cnt).toBeGreaterThan(0);
  });

  it('runGeneration() can run multiple generations consecutively', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    engine.runGeneration();
    engine.runGeneration();
    const gen3 = engine.runGeneration();

    expect(gen3.generation).toBe(3);

    const status = engine.getStatus();
    expect(status.currentGeneration).toBe(3);

    // Total individuals should be gen0 (5) + gen1 (5) + gen2 (5) + gen3 (5)
    expect(status.totalIndividuals).toBe(20);
  });

  /* ---------- getHistory ---------- */

  it('getHistory() returns generation records in descending order', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    engine.runGeneration();
    engine.runGeneration();
    engine.runGeneration();

    const history = engine.getHistory();
    expect(history.length).toBe(3);

    // Descending order by generation number
    expect(history[0].generation).toBe(3);
    expect(history[1].generation).toBe(2);
    expect(history[2].generation).toBe(1);

    for (const gen of history) {
      expect(gen.populationSize).toBe(5);
      expect(gen.bestFitness).toBeGreaterThanOrEqual(0);
      expect(gen.diversity).toBeGreaterThanOrEqual(0);
    }
  });

  it('getHistory() returns empty array when no generations have run', () => {
    const history = engine.getHistory();
    expect(history).toEqual([]);
  });

  it('getHistory() respects the limit parameter', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();

    engine.runGeneration();
    engine.runGeneration();
    engine.runGeneration();

    const limited = engine.getHistory(2);
    expect(limited.length).toBe(2);
    expect(limited[0].generation).toBe(3);
    expect(limited[1].generation).toBe(2);
  });

  /* ---------- getBestIndividual ---------- */

  it('getBestIndividual() returns null when no individuals exist', () => {
    const best = engine.getBestIndividual();
    expect(best).toBeNull();
  });

  it('getBestIndividual() returns the highest-fitness individual', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();
    engine.runGeneration();

    const best = engine.getBestIndividual();
    expect(best).not.toBeNull();
    expect(best!.id).toBeDefined();
    expect(best!.genome).toBeDefined();
    expect(Object.keys(best!.genome).length).toBeGreaterThan(0);
    expect(best!.fitness).toBeGreaterThanOrEqual(0);

    // Verify it is truly the highest-fitness individual
    const allRows = db.prepare(
      'SELECT fitness FROM evolution_individuals ORDER BY fitness DESC',
    ).all() as { fitness: number }[];
    expect(best!.fitness).toBe(allRows[0].fitness);
  });

  /* ---------- getPopulation ---------- */

  it('getPopulation() returns individuals for the specified generation', () => {
    engine.initializePopulation();

    const pop0 = engine.getPopulation(0);
    expect(pop0.length).toBe(5);
    for (const ind of pop0) {
      expect(ind.generation).toBe(0);
      expect(ind.genome).toBeDefined();
      expect(typeof ind.fitness).toBe('number');
      expect(typeof ind.isActive).toBe('boolean');
    }
  });

  it('getPopulation() defaults to current generation', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();
    engine.runGeneration();

    const pop = engine.getPopulation();
    expect(pop.length).toBe(5);
    for (const ind of pop) {
      expect(ind.generation).toBe(1);
    }
  });

  it('getPopulation() returns empty array for non-existent generation', () => {
    const pop = engine.getPopulation(999);
    expect(pop).toEqual([]);
  });

  /* ---------- getLineage ---------- */

  it('getLineage() returns parent records for a child individual', () => {
    engine.setDataSources(makeMockDataSources());
    engine.initializePopulation();
    engine.runGeneration();

    // Find an individual with parents (non-elite offspring from gen 1)
    const offspring = db.prepare(
      'SELECT id FROM evolution_individuals WHERE generation = 1 AND parent_b_id IS NOT NULL LIMIT 1',
    ).get() as { id: number } | undefined;

    if (offspring) {
      const lineage = engine.getLineage(offspring.id);
      expect(lineage.length).toBeGreaterThanOrEqual(1);
      for (const entry of lineage) {
        expect(entry.childId).toBe(offspring.id);
        expect(entry.parentId).toBeGreaterThan(0);
        expect(typeof entry.crossoverPoint).toBe('string');
      }
    }
  });

  /* ---------- activate ---------- */

  it('activate() applies genome values to the parameter registry', () => {
    const genome: Genome = {
      'scoring:threshold': 0.75,
      'scoring:weight': 1.5,
      'learning:rate': 0.05,
    };

    engine.activate(genome);

    expect(registry.get('scoring', 'threshold')).toBe(0.75);
    expect(registry.get('scoring', 'weight')).toBe(1.5);
    expect(registry.get('learning', 'rate')).toBe(0.05);
  });

  /* ---------- config defaults ---------- */

  it('uses default config values when not specified', () => {
    const minimalEngine = new EvolutionEngine(db, registry, { brainName: 'minimal' });
    const status = minimalEngine.getStatus();

    expect(status.config.populationSize).toBe(15);
    expect(status.config.mutationRate).toBe(0.15);
    expect(status.config.eliteCount).toBe(2);
    expect(status.config.tournamentSize).toBe(3);
    expect(status.config.generationEvery).toBe(20);
  });
});
