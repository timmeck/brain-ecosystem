import type Database from 'better-sqlite3';
import type { ParameterRegistry } from './parameter-registry.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export interface EvolutionConfig {
  brainName: string;
  populationSize?: number;
  mutationRate?: number;
  eliteCount?: number;
  tournamentSize?: number;
  generationEvery?: number;
}

export interface Genome {
  [key: string]: number; // "engine:name" → value
}

export interface Individual {
  id?: number;
  generation: number;
  genome: Genome;
  fitness: number;
  rank: number;
  isActive: boolean;
  parentAId: number | null;
  parentBId: number | null;
  mutationCount: number;
  createdAt?: string;
}

export interface Generation {
  id?: number;
  generation: number;
  bestFitness: number;
  avgFitness: number;
  worstFitness: number;
  populationSize: number;
  diversity: number;
  timestamp?: string;
}

export interface LineageEntry {
  id?: number;
  childId: number;
  parentId: number;
  crossoverPoint: string;
  createdAt?: string;
}

export interface EvolutionDataSources {
  getReportCards: () => Array<{ engine: string; combined_score: number }>;
  getGoalProgress: () => number;
  getPredictionAccuracy: () => number;
  getPrincipleCount: () => number;
  getHypothesisCount: () => number;
}

export interface EvolutionStatus {
  currentGeneration: number;
  populationSize: number;
  bestFitness: number;
  avgFitness: number;
  totalIndividuals: number;
  isInitialized: boolean;
  config: {
    populationSize: number;
    mutationRate: number;
    eliteCount: number;
    tournamentSize: number;
    generationEvery: number;
  };
  champion: Individual | null;
}

// ── Migration ───────────────────────────────────────────

export function runEvolutionMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evolution_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation INTEGER NOT NULL,
      best_fitness REAL NOT NULL DEFAULT 0,
      avg_fitness REAL NOT NULL DEFAULT 0,
      worst_fitness REAL NOT NULL DEFAULT 0,
      population_size INTEGER NOT NULL DEFAULT 0,
      diversity REAL NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evolution_individuals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation INTEGER NOT NULL,
      genome_json TEXT NOT NULL,
      fitness REAL NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      parent_a_id INTEGER,
      parent_b_id INTEGER,
      mutation_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evolution_lineage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      parent_id INTEGER NOT NULL,
      crossover_point TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Engine ──────────────────────────────────────────────

export class EvolutionEngine {
  private readonly db: Database.Database;
  private readonly registry: ParameterRegistry;
  private readonly brainName: string;
  private readonly populationSize: number;
  private readonly mutationRate: number;
  private readonly eliteCount: number;
  private readonly tournamentSize: number;
  readonly generationEvery: number;
  private thoughtStream: ThoughtStream | null = null;
  private dataSources: EvolutionDataSources | null = null;
  private currentGeneration = 0;

  constructor(db: Database.Database, registry: ParameterRegistry, config: EvolutionConfig) {
    this.db = db;
    this.registry = registry;
    this.brainName = config.brainName;
    this.populationSize = config.populationSize ?? 15;
    this.mutationRate = config.mutationRate ?? 0.15;
    this.eliteCount = config.eliteCount ?? 2;
    this.tournamentSize = config.tournamentSize ?? 3;
    this.generationEvery = config.generationEvery ?? 20;

    runEvolutionMigration(db);

    // Restore generation counter from DB
    const row = db.prepare('SELECT MAX(generation) AS gen FROM evolution_generations').get() as { gen: number | null } | undefined;
    if (row?.gen) this.currentGeneration = row.gen;
  }

  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  setDataSources(sources: EvolutionDataSources): void {
    this.dataSources = sources;
  }

  // ── Population Initialization ─────────────────────────

  initializePopulation(): void {
    // Idempotent — skip if we already have individuals
    const existing = this.db.prepare('SELECT COUNT(*) AS cnt FROM evolution_individuals').get() as { cnt: number };
    if (existing.cnt > 0) return;

    const currentGenome = this.getCurrentGenome();
    if (Object.keys(currentGenome).length === 0) return;

    // Individual 0: current parameter configuration
    this.insertIndividual(0, currentGenome, 0, null, null, 0, true);

    // Remaining: random variants around current genome
    for (let i = 1; i < this.populationSize; i++) {
      const variant = this.randomVariant(currentGenome);
      this.insertIndividual(0, variant.genome, 0, null, null, variant.mutations, false);
    }
  }

  // ── Fitness Evaluation ────────────────────────────────

  evaluateFitness(individual: Individual): number {
    // Apply this individual's genome temporarily — we just score it
    // Fitness = weighted combination of data source metrics
    if (!this.dataSources) return 0;

    let metaCogScore = 0;
    try {
      const cards = this.dataSources.getReportCards();
      if (cards.length > 0) {
        metaCogScore = cards.reduce((sum, c) => sum + c.combined_score, 0) / cards.length;
      }
    } catch { /* empty */ }

    let goalProgress = 0;
    try { goalProgress = this.dataSources.getGoalProgress(); } catch { /* empty */ }

    let predAccuracy = 0;
    try { predAccuracy = this.dataSources.getPredictionAccuracy(); } catch { /* empty */ }

    let knowledgeQuality = 0;
    try {
      const principles = this.dataSources.getPrincipleCount();
      const hypotheses = this.dataSources.getHypothesisCount();
      knowledgeQuality = Math.min(1, (principles + hypotheses) / 100);
    } catch { /* empty */ }

    const novelty = this.computeNovelty(individual.genome);

    const fitness = metaCogScore * 0.4
      + goalProgress * 0.2
      + predAccuracy * 0.2
      + knowledgeQuality * 0.1
      + novelty * 0.1;

    return Math.max(0, Math.min(1, fitness));
  }

  // ── Run a Generation ──────────────────────────────────

  runGeneration(): Generation {
    this.currentGeneration++;
    const ts = this.thoughtStream;
    ts?.emit('evolution', 'reflecting', `Running Evolution Generation #${this.currentGeneration}...`, 'notable');

    // 1. Get current population (or initialize if empty)
    let population = this.getPopulationInternal(this.currentGeneration - 1);
    if (population.length === 0) {
      // Re-initialize if somehow empty
      this.initializePopulation();
      population = this.getPopulationInternal(0);
    }

    // 2. Evaluate fitness for each individual
    for (const ind of population) {
      ind.fitness = this.evaluateFitness(ind);
    }

    // 3. Sort by fitness descending
    population.sort((a, b) => b.fitness - a.fitness);
    for (let i = 0; i < population.length; i++) {
      population[i].rank = i + 1;
    }

    // 4. Build next generation
    const nextPop: Individual[] = [];

    // 4a. Elitism — carry top N unchanged
    for (let i = 0; i < Math.min(this.eliteCount, population.length); i++) {
      const elite = population[i];
      nextPop.push({
        generation: this.currentGeneration,
        genome: { ...elite.genome },
        fitness: elite.fitness,
        rank: 0,
        isActive: false,
        parentAId: elite.id ?? null,
        parentBId: null,
        mutationCount: 0,
      });
    }

    // 4b. Fill rest via tournament selection + crossover + mutation
    while (nextPop.length < this.populationSize) {
      const parentA = this.tournamentSelect(population, this.tournamentSize);
      const parentB = this.tournamentSelect(population, this.tournamentSize);
      const { child, crossoverPoints } = this.crossover(parentA, parentB);
      const { genome: mutated, mutations } = this.mutateGenome(child, this.mutationRate);

      nextPop.push({
        generation: this.currentGeneration,
        genome: mutated,
        fitness: 0,
        rank: 0,
        isActive: false,
        parentAId: parentA.id ?? null,
        parentBId: parentB.id ?? null,
        mutationCount: mutations,
        _crossoverPoints: crossoverPoints,
      } as Individual & { _crossoverPoints: string[] });
    }

    // 5. Deactivate all previous individuals
    this.db.prepare('UPDATE evolution_individuals SET is_active = 0').run();

    // 6. Insert new population and record lineage
    for (const ind of nextPop) {
      const id = this.insertIndividual(
        ind.generation, ind.genome, ind.fitness,
        ind.parentAId, ind.parentBId, ind.mutationCount, false,
      );
      // Record lineage
      const points = (ind as Individual & { _crossoverPoints?: string[] })._crossoverPoints;
      if (ind.parentAId) {
        this.db.prepare('INSERT INTO evolution_lineage (child_id, parent_id, crossover_point) VALUES (?, ?, ?)').run(
          id, ind.parentAId, points?.join(',') ?? 'elite',
        );
      }
      if (ind.parentBId) {
        this.db.prepare('INSERT INTO evolution_lineage (child_id, parent_id, crossover_point) VALUES (?, ?, ?)').run(
          id, ind.parentBId, points?.join(',') ?? 'crossover',
        );
      }
    }

    // 7. Activate best individual (apply its genome to registry)
    const best = nextPop[0]; // Elites are first
    this.activate(best.genome);
    // Mark as active in DB
    const bestRow = this.db.prepare(
      'SELECT id FROM evolution_individuals WHERE generation = ? ORDER BY fitness DESC LIMIT 1',
    ).get(this.currentGeneration) as { id: number } | undefined;
    if (bestRow) {
      this.db.prepare('UPDATE evolution_individuals SET is_active = 1 WHERE id = ?').run(bestRow.id);
    }

    // 8. Record generation stats
    const fitnesses = population.map(p => p.fitness);
    const avgFitness = fitnesses.length > 0 ? fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length : 0;
    const bestFitness = fitnesses.length > 0 ? Math.max(...fitnesses) : 0;
    const worstFitness = fitnesses.length > 0 ? Math.min(...fitnesses) : 0;
    const diversity = this.computeDiversity(nextPop.map(i => i.genome));

    this.db.prepare(`
      INSERT INTO evolution_generations (generation, best_fitness, avg_fitness, worst_fitness, population_size, diversity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(this.currentGeneration, bestFitness, avgFitness, worstFitness, nextPop.length, diversity);

    const gen: Generation = {
      generation: this.currentGeneration,
      bestFitness,
      avgFitness,
      worstFitness,
      populationSize: nextPop.length,
      diversity,
    };

    ts?.emit('evolution', 'reflecting',
      `Generation #${this.currentGeneration}: best=${bestFitness.toFixed(3)} avg=${avgFitness.toFixed(3)} diversity=${diversity.toFixed(3)}`,
      bestFitness > avgFitness * 1.2 ? 'notable' : 'routine',
    );

    return gen;
  }

  // ── Selection ─────────────────────────────────────────

  tournamentSelect(population: Individual[], size: number): Individual {
    const contestants: Individual[] = [];
    for (let i = 0; i < Math.min(size, population.length); i++) {
      const idx = Math.floor(Math.random() * population.length);
      contestants.push(population[idx]);
    }
    contestants.sort((a, b) => b.fitness - a.fitness);
    return contestants[0];
  }

  // ── Crossover ─────────────────────────────────────────

  crossover(parentA: Individual, parentB: Individual): { child: Genome; crossoverPoints: string[] } {
    const child: Genome = {};
    const crossoverPoints: string[] = [];
    const keys = new Set([...Object.keys(parentA.genome), ...Object.keys(parentB.genome)]);

    for (const key of keys) {
      const fromA = Math.random() < 0.5;
      if (fromA && key in parentA.genome) {
        child[key] = parentA.genome[key];
      } else if (key in parentB.genome) {
        child[key] = parentB.genome[key];
        crossoverPoints.push(key);
      } else {
        child[key] = parentA.genome[key];
      }
    }

    return { child, crossoverPoints };
  }

  // ── Mutation ──────────────────────────────────────────

  mutateGenome(genome: Genome, rate: number): { genome: Genome; mutations: number } {
    const mutated: Genome = { ...genome };
    let mutations = 0;
    const params = this.registry.list();

    for (const key of Object.keys(mutated)) {
      if (Math.random() >= rate) continue;

      const [engine, name] = key.split(':');
      const def = params.find(p => p.engine === engine && p.name === name);
      if (!def) continue;

      const range = def.max - def.min;
      const noise = this.gaussianNoise() * range * 0.1; // σ = 10% of range
      let newVal = mutated[key] + noise;
      // Clamp to bounds
      newVal = Math.max(def.min, Math.min(def.max, newVal));
      mutated[key] = newVal;
      mutations++;
    }

    return { genome: mutated, mutations };
  }

  // ── Genome Application ────────────────────────────────

  activate(genome: Genome): void {
    for (const [key, value] of Object.entries(genome)) {
      const [engine, name] = key.split(':');
      if (engine && name) {
        this.registry.set(engine, name, value, 'evolution', `Generation #${this.currentGeneration}`);
      }
    }
  }

  // ── Queries ───────────────────────────────────────────

  getStatus(): EvolutionStatus {
    const totalIndividuals = (this.db.prepare('SELECT COUNT(*) AS cnt FROM evolution_individuals').get() as { cnt: number }).cnt;
    const champion = this.getBestIndividual();

    // Get latest generation stats
    const latestGen = this.db.prepare(
      'SELECT * FROM evolution_generations ORDER BY generation DESC LIMIT 1',
    ).get() as { best_fitness: number; avg_fitness: number } | undefined;

    return {
      currentGeneration: this.currentGeneration,
      populationSize: this.populationSize,
      bestFitness: latestGen?.best_fitness ?? 0,
      avgFitness: latestGen?.avg_fitness ?? 0,
      totalIndividuals,
      isInitialized: totalIndividuals > 0,
      config: {
        populationSize: this.populationSize,
        mutationRate: this.mutationRate,
        eliteCount: this.eliteCount,
        tournamentSize: this.tournamentSize,
        generationEvery: this.generationEvery,
      },
      champion,
    };
  }

  getHistory(limit = 20): Generation[] {
    const rows = this.db.prepare(
      'SELECT * FROM evolution_generations ORDER BY generation DESC LIMIT ?',
    ).all(limit) as Array<{
      id: number; generation: number; best_fitness: number; avg_fitness: number;
      worst_fitness: number; population_size: number; diversity: number; timestamp: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      generation: r.generation,
      bestFitness: r.best_fitness,
      avgFitness: r.avg_fitness,
      worstFitness: r.worst_fitness,
      populationSize: r.population_size,
      diversity: r.diversity,
      timestamp: r.timestamp,
    }));
  }

  getBestIndividual(): Individual | null {
    const row = this.db.prepare(
      'SELECT * FROM evolution_individuals ORDER BY fitness DESC LIMIT 1',
    ).get() as {
      id: number; generation: number; genome_json: string; fitness: number;
      rank: number; is_active: number; parent_a_id: number | null; parent_b_id: number | null;
      mutation_count: number; created_at: string;
    } | undefined;

    if (!row) return null;
    return this.rowToIndividual(row);
  }

  getPopulation(generation?: number): Individual[] {
    const gen = generation ?? this.currentGeneration;
    return this.getPopulationInternal(gen);
  }

  getLineage(individualId: number): LineageEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM evolution_lineage WHERE child_id = ? ORDER BY id',
    ).all(individualId) as Array<{
      id: number; child_id: number; parent_id: number; crossover_point: string; created_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      childId: r.child_id,
      parentId: r.parent_id,
      crossoverPoint: r.crossover_point,
      createdAt: r.created_at,
    }));
  }

  // ── Private Helpers ───────────────────────────────────

  private getCurrentGenome(): Genome {
    const genome: Genome = {};
    const params = this.registry.list();
    for (const p of params) {
      genome[`${p.engine}:${p.name}`] = p.value;
    }
    return genome;
  }

  private randomVariant(base: Genome): { genome: Genome; mutations: number } {
    const variant: Genome = { ...base };
    let mutations = 0;
    const params = this.registry.list();

    for (const key of Object.keys(variant)) {
      // Each parameter has a 40% chance of mutation for initial diversity
      if (Math.random() >= 0.4) continue;

      const [engine, name] = key.split(':');
      const def = params.find(p => p.engine === engine && p.name === name);
      if (!def) continue;

      const range = def.max - def.min;
      // Wider noise for initialization: σ = 20% of range
      const noise = this.gaussianNoise() * range * 0.2;
      variant[key] = Math.max(def.min, Math.min(def.max, variant[key] + noise));
      mutations++;
    }

    return { genome: variant, mutations };
  }

  private insertIndividual(
    generation: number, genome: Genome, fitness: number,
    parentAId: number | null, parentBId: number | null,
    mutationCount: number, isActive: boolean,
  ): number {
    const result = this.db.prepare(`
      INSERT INTO evolution_individuals (generation, genome_json, fitness, rank, is_active, parent_a_id, parent_b_id, mutation_count)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    `).run(generation, JSON.stringify(genome), fitness, isActive ? 1 : 0, parentAId, parentBId, mutationCount);
    return Number(result.lastInsertRowid);
  }

  private computeNovelty(genome: Genome): number {
    // Compare to existing population — how different is this genome?
    const rows = this.db.prepare(
      'SELECT genome_json FROM evolution_individuals WHERE generation = ? LIMIT 50',
    ).all(this.currentGeneration) as Array<{ genome_json: string }>;

    if (rows.length === 0) return 0.5; // Neutral novelty for first individual

    const keys = Object.keys(genome);
    if (keys.length === 0) return 0;

    let totalDist = 0;
    for (const row of rows) {
      const other: Genome = JSON.parse(row.genome_json);
      let dist = 0;
      for (const key of keys) {
        const a = genome[key] ?? 0;
        const b = other[key] ?? 0;
        const [engine, name] = key.split(':');
        const def = this.registry.list().find(p => p.engine === engine && p.name === name);
        const range = def ? (def.max - def.min) : 1;
        dist += range > 0 ? Math.abs(a - b) / range : 0;
      }
      totalDist += keys.length > 0 ? dist / keys.length : 0;
    }

    return Math.min(1, totalDist / rows.length);
  }

  private computeDiversity(genomes: Genome[]): number {
    if (genomes.length < 2) return 0;

    const keys = Object.keys(genomes[0] ?? {});
    if (keys.length === 0) return 0;

    let totalVariance = 0;
    for (const key of keys) {
      const values = genomes.map(g => g[key] ?? 0);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

      const [engine, name] = key.split(':');
      const def = this.registry.list().find(p => p.engine === engine && p.name === name);
      const range = def ? (def.max - def.min) : 1;
      // Normalize variance by range^2
      totalVariance += range > 0 ? variance / (range * range) : 0;
    }

    return Math.min(1, Math.sqrt(totalVariance / keys.length));
  }

  private getPopulationInternal(generation: number): Individual[] {
    const rows = this.db.prepare(
      'SELECT * FROM evolution_individuals WHERE generation = ? ORDER BY fitness DESC',
    ).all(generation) as Array<{
      id: number; generation: number; genome_json: string; fitness: number;
      rank: number; is_active: number; parent_a_id: number | null; parent_b_id: number | null;
      mutation_count: number; created_at: string;
    }>;

    return rows.map(r => this.rowToIndividual(r));
  }

  private rowToIndividual(r: {
    id: number; generation: number; genome_json: string; fitness: number;
    rank: number; is_active: number; parent_a_id: number | null; parent_b_id: number | null;
    mutation_count: number; created_at: string;
  }): Individual {
    return {
      id: r.id,
      generation: r.generation,
      genome: JSON.parse(r.genome_json),
      fitness: r.fitness,
      rank: r.rank,
      isActive: r.is_active === 1,
      parentAId: r.parent_a_id,
      parentBId: r.parent_b_id,
      mutationCount: r.mutation_count,
      createdAt: r.created_at,
    };
  }

  /** Box-Muller transform for Gaussian noise with mean=0, σ=1 */
  private gaussianNoise(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}
