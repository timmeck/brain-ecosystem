import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ParameterRegistry } from './parameter-registry.js';
import type { MetaCognitionLayer, EngineReportCard } from './meta-cognition-layer.js';
import type { ExperimentEngine } from '../research/experiment-engine.js';
import type { SelfObserver } from '../research/self-observer.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';

// ── Types ───────────────────────────────────────────────

export type AutoExperimentStatus = 'proposed' | 'running' | 'adopted' | 'rolled_back' | 'extended' | 'expired';

export interface AutoExperiment {
  id?: number;
  parameter_engine: string;
  parameter_name: string;
  experiment_id: number | null;
  snapshot_id: number;
  old_value: number;
  new_value: number;
  status: AutoExperimentStatus;
  hypothesis: string;
  result_summary: string | null;
  created_at?: string;
  completed_at?: string;
}

export interface ExperimentCandidate {
  engine: string;
  name: string;
  currentValue: number;
  proposedValue: number;
  hypothesis: string;
  priority: number;
  reason: string;
}

export interface AutoExperimentEngineStatus {
  totalExperiments: number;
  running: number;
  adopted: number;
  rolledBack: number;
  candidates: ExperimentCandidate[];
  cooldownUntilCycle: number;
}

// ── Migration ───────────────────────────────────────────

export function runAutoExperimentMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parameter_engine TEXT NOT NULL,
      parameter_name TEXT NOT NULL,
      experiment_id INTEGER,
      snapshot_id INTEGER NOT NULL,
      old_value REAL NOT NULL,
      new_value REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      hypothesis TEXT NOT NULL,
      result_summary TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auto_exp_status ON auto_experiments(status);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class AutoExperimentEngine {
  private db: Database.Database;
  private registry: ParameterRegistry;
  private experimentEngine: ExperimentEngine;
  private selfObserver: SelfObserver | null;
  private metaCognition: MetaCognitionLayer | null;
  private predictionEngine: PredictionEngine | null = null;
  private log = getLogger();

  /** Cooldown: don't start new experiments for N cycles after completing one. */
  private cooldownCycles = 3;
  private cooldownUntilCycle = 0;

  /** Maximum concurrent auto-experiments. */
  private maxConcurrent = 1;

  /** Measurement cycles before evaluating. */
  private measurementCycles = 8;

  constructor(
    db: Database.Database,
    registry: ParameterRegistry,
    experimentEngine: ExperimentEngine,
    selfObserver: SelfObserver | null = null,
    metaCognition: MetaCognitionLayer | null = null,
  ) {
    this.db = db;
    this.registry = registry;
    this.experimentEngine = experimentEngine;
    this.selfObserver = selfObserver;
    this.metaCognition = metaCognition;
    runAutoExperimentMigration(db);
  }

  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine;
  }

  /** Discover which parameters should be tuned. */
  discoverCandidates(cycle: number): ExperimentCandidate[] {
    if (cycle < this.cooldownUntilCycle) return [];

    const candidates: ExperimentCandidate[] = [];
    const params = this.registry.list();

    // Don't re-test parameters with recent auto-experiments
    const recentlyTested = new Set(
      (this.db.prepare(`
        SELECT parameter_engine || '.' || parameter_name as key
        FROM auto_experiments WHERE created_at > datetime('now', '-1 day')
      `).all() as { key: string }[]).map(r => r.key),
    );

    // 1. MetaCognition Report Cards: underperforming engines
    const reportCards = this.metaCognition?.getLatestReportCards() ?? [];
    const weakEngines = reportCards.filter((c: EngineReportCard) => c.grade === 'D' || c.grade === 'F');
    for (const card of weakEngines) {
      const engineParams = params.filter(p => p.engine === card.engine);
      for (const ep of engineParams) {
        const key = `${ep.engine}.${ep.name}`;
        if (recentlyTested.has(key)) continue;
        // Propose moving toward midpoint of range
        const mid = (ep.min + ep.max) / 2;
        const direction = ep.value < mid ? 1 : -1;
        const step = (ep.max - ep.min) * 0.15;
        const proposedValue = Math.max(ep.min, Math.min(ep.max, ep.value + direction * step));
        if (Math.abs(proposedValue - ep.value) < 0.001) continue;

        candidates.push({
          engine: ep.engine, name: ep.name,
          currentValue: ep.value, proposedValue,
          hypothesis: `Adjusting ${ep.name} from ${ep.value.toFixed(3)} to ${proposedValue.toFixed(3)} may improve ${card.engine} performance (currently grade ${card.grade})`,
          priority: card.grade === 'F' ? 9 : 7,
          reason: `Engine ${card.engine} underperforming (grade ${card.grade}, score ${card.combined_score.toFixed(2)})`,
        });
      }
    }

    // 2. Parameters that haven't changed in a long time (stale)
    for (const p of params) {
      const key = `${p.engine}.${p.name}`;
      if (recentlyTested.has(key)) continue;

      const lastChange = this.registry.getHistory(p.engine, p.name, 1);
      if (lastChange.length === 0) {
        // Never changed — worth exploring
        const range = p.max - p.min;
        const step = range * 0.1;
        // Try slightly lower or higher than default
        const direction = Math.random() < 0.5 ? 1 : -1;
        const proposedValue = Math.max(p.min, Math.min(p.max, p.value + direction * step));
        if (Math.abs(proposedValue - p.value) < 0.001) continue;

        candidates.push({
          engine: p.engine, name: p.name,
          currentValue: p.value, proposedValue,
          hypothesis: `${p.name} has never been tuned. Testing ${proposedValue.toFixed(3)} (±10% of range) vs current ${p.value.toFixed(3)}`,
          priority: 4,
          reason: 'Parameter never changed — exploring sensitivity',
        });
      }
    }

    // 3. SelfObserver performance signals
    if (this.selfObserver) {
      const insights = this.selfObserver.getInsights(undefined, 20);
      for (const insight of insights) {
        if (insight.type !== 'quality_issue' && insight.type !== 'anomaly') continue;
        // Find related engine parameters
        const relatedParams = params.filter(p =>
          insight.title.toLowerCase().includes(p.engine.toLowerCase()) ||
          insight.description.toLowerCase().includes(p.name.toLowerCase()),
        );
        for (const rp of relatedParams) {
          const key = `${rp.engine}.${rp.name}`;
          if (recentlyTested.has(key)) continue;

          const range = rp.max - rp.min;
          const step = range * 0.1;
          const proposedValue = Math.max(rp.min, Math.min(rp.max, rp.value - step));
          if (Math.abs(proposedValue - rp.value) < 0.001) continue;

          candidates.push({
            engine: rp.engine, name: rp.name,
            currentValue: rp.value, proposedValue,
            hypothesis: `SelfObserver detected "${insight.title}" — adjusting ${rp.name} may help`,
            priority: 6,
            reason: `Performance regression: ${insight.title}`,
          });
        }
      }
    }

    // Sort by priority (highest first), limit to top 5
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates.slice(0, 5);
  }

  /** Start an auto-experiment: snapshot, change parameter, track. */
  startExperiment(candidate: ExperimentCandidate): AutoExperiment | null {
    // Check concurrent limit
    const running = (this.db.prepare(
      "SELECT COUNT(*) as c FROM auto_experiments WHERE status = 'running'",
    ).get() as { c: number }).c;
    if (running >= this.maxConcurrent) return null;

    // Snapshot current state
    const snapshotId = this.registry.snapshot(`auto_exp_${candidate.engine}_${candidate.name}`);

    // Create ExperimentEngine proposal for statistical tracking
    let experimentId: number | null = null;
    try {
      const exp = this.experimentEngine.propose({
        name: `AutoExp: ${candidate.engine}.${candidate.name}`,
        hypothesis: candidate.hypothesis,
        independent_variable: `${candidate.engine}.${candidate.name}`,
        dependent_variable: 'combined_engine_performance',
        control_value: candidate.currentValue,
        treatment_value: candidate.proposedValue,
        duration_cycles: this.measurementCycles,
      });
      if (exp.id) {
        this.experimentEngine.start(exp.id);
        experimentId = exp.id;
      }
    } catch {
      // ExperimentEngine may reject — continue with auto-experiment tracking only
    }

    // Actually change the parameter
    this.registry.set(
      candidate.engine, candidate.name, candidate.proposedValue,
      'auto_experiment', candidate.hypothesis,
    );

    // Record auto-experiment
    const result = this.db.prepare(`
      INSERT INTO auto_experiments (parameter_engine, parameter_name, experiment_id, snapshot_id, old_value, new_value, status, hypothesis)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
    `).run(
      candidate.engine, candidate.name, experimentId, snapshotId,
      candidate.currentValue, candidate.proposedValue, candidate.hypothesis,
    );

    const autoExp: AutoExperiment = {
      id: result.lastInsertRowid as number,
      parameter_engine: candidate.engine,
      parameter_name: candidate.name,
      experiment_id: experimentId,
      snapshot_id: snapshotId,
      old_value: candidate.currentValue,
      new_value: candidate.proposedValue,
      status: 'running',
      hypothesis: candidate.hypothesis,
      result_summary: null,
    };

    this.log.info(`[auto-experiment] Started: ${candidate.engine}.${candidate.name} ${candidate.currentValue} → ${candidate.proposedValue}`);
    return autoExp;
  }

  /** Feed a measurement into running auto-experiments. Maps to ExperimentEngine. */
  feedMeasurement(metricName: string, value: number): void {
    const running = this.db.prepare(
      "SELECT experiment_id FROM auto_experiments WHERE status = 'running' AND experiment_id IS NOT NULL",
    ).all() as { experiment_id: number }[];

    for (const { experiment_id } of running) {
      try {
        this.experimentEngine.recordMeasurement(experiment_id, value);
      } catch {
        // Experiment may have been analyzed already
      }
    }
  }

  /** Process completed experiments: adopt, rollback, or extend. */
  processCompleted(cycle: number): Array<{ autoExpId: number; action: 'adopted' | 'rolled_back' | 'extended' }> {
    const results: Array<{ autoExpId: number; action: 'adopted' | 'rolled_back' | 'extended' }> = [];

    const runningExps = this.db.prepare(
      "SELECT id, parameter_engine, parameter_name, experiment_id, snapshot_id, old_value, new_value, hypothesis FROM auto_experiments WHERE status = 'running'",
    ).all() as AutoExperiment[];

    for (const exp of runningExps) {
      if (!exp.experiment_id) {
        // No ExperimentEngine tracking — check by age
        continue;
      }

      // Check if the linked experiment has a conclusion
      const linkedExp = this.experimentEngine.list(undefined, 100).find(e => e.id === exp.experiment_id);
      if (!linkedExp) continue;

      if (linkedExp.status === 'complete' || linkedExp.status === 'aborted') {
        const conclusion = linkedExp.conclusion;
        let action: 'adopted' | 'rolled_back' | 'extended';
        let summary: string;

        if (conclusion && conclusion.significant && conclusion.direction === 'positive') {
          // Positive result → adopt the change
          action = 'adopted';
          summary = `Positive: effect_size=${conclusion.effect_size.toFixed(3)}, p=${conclusion.p_value.toFixed(4)}. Parameter kept at ${exp.new_value}.`;
          this.cooldownUntilCycle = cycle + this.cooldownCycles;
        } else if (conclusion && conclusion.significant && conclusion.direction === 'negative') {
          // Negative result → rollback
          action = 'rolled_back';
          summary = `Negative: effect_size=${conclusion.effect_size.toFixed(3)}, p=${conclusion.p_value.toFixed(4)}. Rolled back to ${exp.old_value}.`;
          this.registry.restore(exp.snapshot_id!, 'auto_experiment_rollback');
          this.cooldownUntilCycle = cycle + this.cooldownCycles;
        } else {
          // Inconclusive → extend or abandon
          action = 'extended';
          summary = 'Inconclusive — keeping parameter at new value for more observation.';
        }

        this.db.prepare(`
          UPDATE auto_experiments SET status = ?, result_summary = ?, completed_at = datetime('now')
          WHERE id = ?
        `).run(action, summary, exp.id);

        results.push({ autoExpId: exp.id!, action });
        this.log.info(`[auto-experiment] ${action}: ${exp.parameter_engine}.${exp.parameter_name} — ${summary}`);
      }
    }

    return results;
  }

  /** Get all auto-experiments. */
  list(status?: AutoExperimentStatus, limit = 20): AutoExperiment[] {
    if (status) {
      return this.db.prepare(`
        SELECT * FROM auto_experiments WHERE status = ? ORDER BY id DESC LIMIT ?
      `).all(status, limit) as AutoExperiment[];
    }
    return this.db.prepare(`
      SELECT * FROM auto_experiments ORDER BY id DESC LIMIT ?
    `).all(limit) as AutoExperiment[];
  }

  /** Get status summary. */
  getStatus(cycle = 0): AutoExperimentEngineStatus {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM auto_experiments').get() as { c: number }).c;
    const running = (this.db.prepare("SELECT COUNT(*) as c FROM auto_experiments WHERE status = 'running'").get() as { c: number }).c;
    const adopted = (this.db.prepare("SELECT COUNT(*) as c FROM auto_experiments WHERE status = 'adopted'").get() as { c: number }).c;
    const rolledBack = (this.db.prepare("SELECT COUNT(*) as c FROM auto_experiments WHERE status = 'rolled_back'").get() as { c: number }).c;
    const candidates = this.discoverCandidates(cycle);

    return {
      totalExperiments: total, running, adopted, rolledBack,
      candidates, cooldownUntilCycle: this.cooldownUntilCycle,
    };
  }
}
