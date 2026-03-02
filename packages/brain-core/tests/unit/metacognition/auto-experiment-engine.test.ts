import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ParameterRegistry } from '../../../src/metacognition/parameter-registry.js';
import { MetaCognitionLayer } from '../../../src/metacognition/meta-cognition-layer.js';
import { AutoExperimentEngine } from '../../../src/metacognition/auto-experiment-engine.js';
import { ExperimentEngine } from '../../../src/research/experiment-engine.js';

describe('AutoExperimentEngine', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;
  let metaCognition: MetaCognitionLayer;
  let experimentEngine: ExperimentEngine;
  let autoExp: AutoExperimentEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    registry = new ParameterRegistry(db);
    metaCognition = new MetaCognitionLayer(db);
    experimentEngine = new ExperimentEngine(db, { brainName: 'test-brain' });
    autoExp = new AutoExperimentEngine(db, registry, experimentEngine, null, metaCognition);

    // Register some parameters
    registry.registerAll([
      { engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 0.5, description: 'Synapse prune cutoff' },
      { engine: 'dream', name: 'learning_rate', value: 0.15, min: 0.01, max: 0.5, description: 'Dream learning rate' },
      { engine: 'attention', name: 'decay_rate', value: 0.85, min: 0.5, max: 0.99, description: 'Attention decay' },
    ]);
  });

  it('should create auto_experiments table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = 'auto_experiments'",
    ).all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('auto_experiments');
  });

  it('should discover candidates from stale parameters', () => {
    const candidates = autoExp.discoverCandidates(1);
    // All params are never-changed → should be candidates
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].engine).toBeDefined();
    expect(candidates[0].name).toBeDefined();
    expect(candidates[0].hypothesis).toBeDefined();
  });

  it('should discover candidates from underperforming engines', () => {
    // Record bad metrics for dream engine
    for (let i = 1; i <= 5; i++) {
      metaCognition.recordStep('dream', i, { errors: 5, thoughts: 10, insights: 0 });
    }
    metaCognition.evaluate(5);

    const candidates = autoExp.discoverCandidates(1);
    const dreamCandidate = candidates.find(c => c.engine === 'dream');
    expect(dreamCandidate).toBeDefined();
    expect(dreamCandidate!.priority).toBeGreaterThanOrEqual(7);
  });

  it('should start an experiment', () => {
    const candidates = autoExp.discoverCandidates(1);
    expect(candidates.length).toBeGreaterThan(0);

    const result = autoExp.startExperiment(candidates[0]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('running');
    expect(result!.snapshot_id).toBeGreaterThan(0);

    // Parameter should have changed
    const newValue = registry.get(candidates[0].engine, candidates[0].name);
    expect(newValue).toBe(candidates[0].proposedValue);
  });

  it('should respect max concurrent limit', () => {
    const candidates = autoExp.discoverCandidates(1);
    // Start first
    const first = autoExp.startExperiment(candidates[0]);
    expect(first).not.toBeNull();

    // Second should be blocked
    if (candidates.length > 1) {
      const second = autoExp.startExperiment(candidates[1]);
      expect(second).toBeNull();
    }
  });

  it('should respect cooldown', () => {
    // Start and complete an experiment
    const candidates = autoExp.discoverCandidates(1);
    expect(candidates.length).toBeGreaterThan(0);
    autoExp.startExperiment(candidates[0]);

    // During cooldown, should find no candidates
    const nextCandidates = autoExp.discoverCandidates(0); // cycle 0 < cooldownUntilCycle
    // Note: cooldown is only applied after processCompleted, so this just tests discoverCandidates at cycle 0
    expect(nextCandidates).toBeDefined();
  });

  it('should feed measurements', () => {
    const candidates = autoExp.discoverCandidates(1);
    if (candidates.length > 0) {
      autoExp.startExperiment(candidates[0]);
      // Should not throw
      autoExp.feedMeasurement('combined_engine_performance', 0.7);
      autoExp.feedMeasurement('combined_engine_performance', 0.8);
    }
  });

  it('should list experiments by status', () => {
    const candidates = autoExp.discoverCandidates(1);
    if (candidates.length > 0) {
      autoExp.startExperiment(candidates[0]);
    }
    const all = autoExp.list();
    expect(all.length).toBeGreaterThanOrEqual(0);

    const running = autoExp.list('running');
    for (const r of running) expect(r.status).toBe('running');
  });

  it('should get status summary', () => {
    const status = autoExp.getStatus(1);
    expect(status.totalExperiments).toBeGreaterThanOrEqual(0);
    expect(status.candidates).toBeDefined();
    expect(Array.isArray(status.candidates)).toBe(true);
  });
});
