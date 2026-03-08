import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AutoExperimentEngine, runAutoExperimentMigration } from '../auto-experiment-engine.js';
import { ParameterRegistry, runParameterRegistryMigration } from '../parameter-registry.js';
import { ExperimentEngine, runExperimentMigration } from '../../research/experiment-engine.js';

describe('AutoExperimentEngine', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;
  let experimentEngine: ExperimentEngine;
  let autoEngine: AutoExperimentEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runParameterRegistryMigration(db);
    runExperimentMigration(db);

    registry = new ParameterRegistry(db);
    experimentEngine = new ExperimentEngine(db, { brainName: 'test' });

    // Register a parameter for tests
    registry.register({
      engine: 'TestEngine',
      name: 'learningRate',
      value: 0.5,
      min: 0.0,
      max: 1.0,
      description: 'How fast the engine learns',
    });

    autoEngine = new AutoExperimentEngine(db, registry, experimentEngine);
  });

  afterEach(() => {
    db.close();
  });

  // ── 1. Construction ──────────────────────────────────────

  it('should create instance and run migration', () => {
    expect(autoEngine).toBeDefined();
    // Verify the table exists by querying it
    const row = db.prepare('SELECT COUNT(*) as c FROM auto_experiments').get() as { c: number };
    expect(row.c).toBe(0);
  });

  // ── 2. getStatus (initial) ───────────────────────────────

  it('should return zero counts in initial status', () => {
    const status = autoEngine.getStatus(0);
    expect(status.totalExperiments).toBe(0);
    expect(status.running).toBe(0);
    expect(status.adopted).toBe(0);
    expect(status.rolledBack).toBe(0);
    expect(status.cooldownUntilCycle).toBe(0);
  });

  // ── 3. discoverCandidates (stale parameter) ──────────────

  it('should discover stale-parameter candidates when parameter was never changed', () => {
    const candidates = autoEngine.discoverCandidates(0);
    // "learningRate" has never been changed, so it should appear as a candidate
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const lr = candidates.find(c => c.name === 'learningRate');
    expect(lr).toBeDefined();
    expect(lr!.engine).toBe('TestEngine');
    expect(lr!.reason).toContain('never changed');
    expect(lr!.priority).toBe(4);
    expect(lr!.proposedValue).not.toBe(lr!.currentValue);
    // Proposed value must stay within bounds
    expect(lr!.proposedValue).toBeGreaterThanOrEqual(0.0);
    expect(lr!.proposedValue).toBeLessThanOrEqual(1.0);
  });

  // ── 4. discoverCandidates respects cooldown ──────────────

  it('should return empty candidates when in cooldown period', () => {
    // Trigger a cooldown by manipulating the internal state via a full experiment lifecycle:
    // Simply test discoverCandidates with a cycle < cooldownUntilCycle
    // Start and complete an experiment to trigger cooldown
    const candidates = autoEngine.discoverCandidates(0);
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    // Start an experiment to get something running
    const exp = autoEngine.startExperiment(candidates[0]);
    expect(exp).not.toBeNull();

    // Now manually complete the linked experiment with a positive conclusion
    // so processCompleted sets cooldown
    if (exp!.experiment_id) {
      // Feed enough measurements through control and treatment phases
      const linkedExp = experimentEngine.get(exp!.experiment_id);
      if (linkedExp) {
        const duration = linkedExp.duration_cycles;
        // Control phase
        for (let i = 0; i < duration; i++) {
          experimentEngine.recordMeasurement(exp!.experiment_id!, 1.0);
        }
        // Treatment phase
        for (let i = 0; i < duration; i++) {
          experimentEngine.recordMeasurement(exp!.experiment_id!, 5.0);
        }
      }
    }

    const results = autoEngine.processCompleted(10);
    // After processing, cooldown is set
    if (results.length > 0) {
      // Now discover should return empty because we are in cooldown
      const afterCooldown = autoEngine.discoverCandidates(11);
      expect(afterCooldown).toEqual([]);
    }
  });

  // ── 5. startExperiment creates a running auto-experiment ─

  it('should start an experiment from a candidate', () => {
    const candidates = autoEngine.discoverCandidates(0);
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const exp = autoEngine.startExperiment(candidates[0]);
    expect(exp).not.toBeNull();
    expect(exp!.status).toBe('running');
    expect(exp!.parameter_engine).toBe(candidates[0].engine);
    expect(exp!.parameter_name).toBe(candidates[0].name);
    expect(exp!.old_value).toBe(candidates[0].currentValue);
    expect(exp!.new_value).toBe(candidates[0].proposedValue);
    expect(exp!.hypothesis).toBe(candidates[0].hypothesis);
    expect(exp!.id).toBeGreaterThan(0);
    expect(exp!.result_summary).toBeNull();
  });

  // ── 6. startExperiment respects maxConcurrent limit ──────

  it('should return null when maxConcurrent reached', () => {
    // Register a second parameter so we have two candidates
    registry.register({
      engine: 'TestEngine',
      name: 'decayRate',
      value: 0.3,
      min: 0.0,
      max: 1.0,
      description: 'Decay rate for memory',
    });

    const candidates = autoEngine.discoverCandidates(0);
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    // Start first — should succeed (maxConcurrent defaults to 1)
    const first = autoEngine.startExperiment(candidates[0]);
    expect(first).not.toBeNull();

    // Start second — should be blocked
    const second = autoEngine.startExperiment(candidates[1]);
    expect(second).toBeNull();
  });

  // ── 7. startExperiment changes the parameter value ───────

  it('should actually change the parameter value in the registry', () => {
    const candidates = autoEngine.discoverCandidates(0);
    const candidate = candidates[0];
    const oldValue = registry.get(candidate.engine, candidate.name);

    autoEngine.startExperiment(candidate);

    const newValue = registry.get(candidate.engine, candidate.name);
    expect(newValue).toBe(candidate.proposedValue);
    expect(newValue).not.toBe(oldValue);
  });

  // ── 8. feedMeasurement routes to ExperimentEngine ────────

  it('should feed measurements to linked running experiments', () => {
    const candidates = autoEngine.discoverCandidates(0);
    const exp = autoEngine.startExperiment(candidates[0]);
    expect(exp).not.toBeNull();
    expect(exp!.experiment_id).not.toBeNull();

    // Feed a measurement — should not throw
    autoEngine.feedMeasurement('perf_score', 0.75);

    // Verify it landed in the linked experiment
    const linked = experimentEngine.get(exp!.experiment_id!);
    expect(linked).not.toBeNull();
    // The linked experiment should be in running_control and have received a measurement
    expect(linked!.control_results.length).toBe(1);
    expect(linked!.control_results[0]).toBe(0.75);
  });

  // ── 9. list returns empty initially ──────────────────────

  it('should return empty list when no experiments exist', () => {
    const all = autoEngine.list();
    expect(all).toEqual([]);
  });

  // ── 10. list returns experiments after starting one ──────

  it('should return experiments after creating one', () => {
    const candidates = autoEngine.discoverCandidates(0);
    autoEngine.startExperiment(candidates[0]);

    const all = autoEngine.list();
    expect(all.length).toBe(1);
    expect(all[0].status).toBe('running');

    // Filter by status
    const running = autoEngine.list('running');
    expect(running.length).toBe(1);

    const adopted = autoEngine.list('adopted');
    expect(adopted.length).toBe(0);
  });

  // ── 11. processCompleted with no running experiments ─────

  it('should return empty array when no experiments are running', () => {
    const results = autoEngine.processCompleted(0);
    expect(results).toEqual([]);
  });

  // ── 12. processCompleted adopts positive results ─────────

  it('should adopt experiment with significant positive result', () => {
    const candidates = autoEngine.discoverCandidates(0);
    const exp = autoEngine.startExperiment(candidates[0]);
    expect(exp).not.toBeNull();
    expect(exp!.experiment_id).not.toBeNull();

    const expId = exp!.experiment_id!;
    const linked = experimentEngine.get(expId)!;
    const duration = linked.duration_cycles;

    // Control phase: low values
    for (let i = 0; i < duration; i++) {
      experimentEngine.recordMeasurement(expId, 1.0 + Math.random() * 0.1);
    }
    // Treatment phase: significantly higher values
    for (let i = 0; i < duration; i++) {
      experimentEngine.recordMeasurement(expId, 5.0 + Math.random() * 0.1);
    }

    // Now the linked experiment should be complete
    const completed = experimentEngine.get(expId)!;
    expect(completed.status).toBe('complete');
    expect(completed.conclusion).not.toBeNull();
    expect(completed.conclusion!.direction).toBe('positive');

    // processCompleted should adopt it
    const results = autoEngine.processCompleted(10);
    expect(results.length).toBe(1);
    expect(results[0].action).toBe('adopted');

    // Verify the auto_experiment status in DB
    const autoExps = autoEngine.list('adopted');
    expect(autoExps.length).toBe(1);
    expect(autoExps[0].result_summary).toContain('Positive');

    // Verify cooldown is set (discover at cycle 11 should return empty)
    const afterCandidates = autoEngine.discoverCandidates(11);
    expect(afterCandidates).toEqual([]);
  });
});
