import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { SelfObserver } from './self-observer.js';
import type { AnomalyDetective } from './anomaly-detective.js';
import type { ResearchJournal } from './journal.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';
import type { ParameterRegistry } from '../metacognition/parameter-registry.js';

// ── Types ───────────────────────────────────────────────

export interface BootstrapConfig {
  brainName: string;
  engineCount: number;
  mcpToolCount: number;
  version: string;
}

export interface BootstrapEngines {
  selfObserver?: SelfObserver;
  anomalyDetective?: AnomalyDetective;
  journal?: ResearchJournal;
  hypothesisEngine?: HypothesisEngine;
  predictionEngine?: PredictionEngine;
  parameterRegistry?: ParameterRegistry;
}

export interface BootstrapState {
  bootstrapped: boolean;
  bootstrapped_at: number | null;
  observations_seeded: number;
  journal_entries_seeded: number;
  hypotheses_seeded: number;
  predictions_seeded: number;
  updated_at: string;
}

export interface BootstrapResult {
  alreadyBootstrapped: boolean;
  observations: number;
  journalEntries: number;
  hypotheses: number;
  predictions: number;
  metrics: number;
}

// ── Known research tables ───────────────────────────────

const RESEARCH_TABLES = [
  'self_observations', 'self_insights', 'research_journal', 'hypotheses', 'observations',
  'anomalies', 'metric_history', 'experiments', 'knowledge_base', 'research_agenda',
  'cross_domain_events', 'cross_domain_correlations', 'causal_events', 'causal_edges',
  'predictions', 'prediction_metrics', 'dream_history',
];

// ── Migration ───────────────────────────────────────────

export function runBootstrapMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bootstrap_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      bootstrapped INTEGER NOT NULL DEFAULT 0,
      bootstrapped_at INTEGER,
      observations_seeded INTEGER NOT NULL DEFAULT 0,
      journal_entries_seeded INTEGER NOT NULL DEFAULT 0,
      hypotheses_seeded INTEGER NOT NULL DEFAULT 0,
      predictions_seeded INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO bootstrap_state (id) VALUES (1);
  `);
}

// ── BootstrapService ────────────────────────────────────

export class BootstrapService {
  private db: Database.Database;
  private config: BootstrapConfig;
  private engines: BootstrapEngines = {};
  private log = getLogger();

  constructor(db: Database.Database, config: BootstrapConfig) {
    this.db = db;
    this.config = config;
    runBootstrapMigration(db);
  }

  /** Wire engines after construction — missing engines are gracefully skipped. */
  setEngines(engines: BootstrapEngines): void {
    this.engines = engines;
  }

  /** Run the 5-phase bootstrap. Idempotent — only runs once. */
  bootstrap(): BootstrapResult {
    const state = this.getState();
    if (state.bootstrapped) {
      this.log.info(`[bootstrap] Already bootstrapped at ${state.bootstrapped_at}`);
      return { alreadyBootstrapped: true, observations: 0, journalEntries: 0, hypotheses: 0, predictions: 0, metrics: 0 };
    }

    this.log.info(`[bootstrap] Starting cold-start bootstrap for ${this.config.brainName}...`);
    const start = Date.now();

    const observations = this.seedObservations();
    const journalEntries = this.seedJournal();
    const hypotheses = this.seedHypotheses();
    const predictions = this.seedPredictions();
    const metrics = this.seedMetrics();

    // Mark as bootstrapped
    this.db.prepare(`
      UPDATE bootstrap_state SET
        bootstrapped = 1,
        bootstrapped_at = ?,
        observations_seeded = ?,
        journal_entries_seeded = ?,
        hypotheses_seeded = ?,
        predictions_seeded = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(Date.now(), observations, journalEntries, hypotheses, predictions);

    const duration = Date.now() - start;
    this.log.info(
      `[bootstrap] Complete in ${duration}ms: ${observations} observations, ${journalEntries} journal, ` +
      `${hypotheses} hypotheses, ${predictions} predictions, ${metrics} metrics seeded`,
    );

    return { alreadyBootstrapped: false, observations, journalEntries, hypotheses, predictions, metrics };
  }

  /** Get current bootstrap state. */
  getState(): BootstrapState {
    const row = this.db.prepare('SELECT * FROM bootstrap_state WHERE id = 1').get() as {
      bootstrapped: number;
      bootstrapped_at: number | null;
      observations_seeded: number;
      journal_entries_seeded: number;
      hypotheses_seeded: number;
      predictions_seeded: number;
      updated_at: string;
    } | undefined;

    if (!row) {
      return { bootstrapped: false, bootstrapped_at: null, observations_seeded: 0, journal_entries_seeded: 0, hypotheses_seeded: 0, predictions_seeded: 0, updated_at: '' };
    }

    return {
      bootstrapped: row.bootstrapped === 1,
      bootstrapped_at: row.bootstrapped_at,
      observations_seeded: row.observations_seeded,
      journal_entries_seeded: row.journal_entries_seeded,
      hypotheses_seeded: row.hypotheses_seeded,
      predictions_seeded: row.predictions_seeded,
      updated_at: row.updated_at,
    };
  }

  // ── Phase 1: Seed Observations ────────────────────────

  private seedObservations(): number {
    if (!this.engines.selfObserver) return 0;

    let count = 0;

    // 1a. DB table sizes — count rows in known research tables
    for (const table of RESEARCH_TABLES) {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
        this.engines.selfObserver.record({
          category: 'tool_usage',
          event_type: `table_size:${table}`,
          metrics: { row_count: row.cnt, table },
        });
        count++;
      } catch {
        // Table doesn't exist yet — skip
      }
    }

    // 1b. Parameter landscape — read up to 15 parameters
    if (this.engines.parameterRegistry) {
      try {
        const params = this.engines.parameterRegistry.list();
        const toSeed = params.slice(0, 15);
        for (const p of toSeed) {
          this.engines.selfObserver.record({
            category: 'tool_usage',
            event_type: `parameter:${p.engine}.${p.name}`,
            metrics: { value: p.value, min: p.min, max: p.max },
          });
          count++;
        }
      } catch {
        // ParameterRegistry not ready
      }
    }

    // 1c. System state — 5 observations
    const systemObs: Array<{ event_type: string; metrics: Record<string, unknown> }> = [
      { event_type: 'system:engine_count', metrics: { count: this.config.engineCount } },
      { event_type: 'system:mcp_tool_count', metrics: { count: this.config.mcpToolCount } },
      { event_type: 'system:startup_time', metrics: { timestamp: Date.now() } },
      { event_type: 'system:memory_rss', metrics: { bytes: process.memoryUsage().rss } },
      { event_type: 'system:version', metrics: { version: this.config.version, brain: this.config.brainName } },
    ];

    for (const obs of systemObs) {
      this.engines.selfObserver.record({
        category: 'tool_usage',
        event_type: obs.event_type,
        metrics: obs.metrics,
      });
      count++;
    }

    this.log.info(`[bootstrap] Phase 1: ${count} observations seeded`);
    return count;
  }

  // ── Phase 2: Seed Journal ─────────────────────────────

  private seedJournal(): number {
    if (!this.engines.journal) return 0;

    let count = 0;
    const { brainName, version, engineCount, mcpToolCount } = this.config;

    // Entry 1: Brain initialized
    this.engines.journal.write({
      type: 'milestone',
      title: `${brainName} initialized (v${version})`,
      content: `Brain started with ${engineCount} engines and ${mcpToolCount} MCP tools. Cold-start bootstrap active.`,
      tags: [brainName, 'bootstrap', 'init'],
      references: [],
      significance: 'notable',
      data: { version, engineCount, mcpToolCount, phase: 'bootstrap' },
    });
    count++;

    // Entry 2: Architecture baseline
    const tableCounts: Record<string, number> = {};
    for (const table of RESEARCH_TABLES) {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
        tableCounts[table] = row.cnt;
      } catch {
        // skip
      }
    }
    this.engines.journal.write({
      type: 'discovery',
      title: 'Architecture baseline recorded',
      content: `Database has ${Object.keys(tableCounts).length} research tables. ${JSON.stringify(tableCounts)}`,
      tags: [brainName, 'bootstrap', 'baseline'],
      references: [],
      significance: 'routine',
      data: { tableCounts },
    });
    count++;

    // Entry 3: Cold-start bootstrap complete
    this.engines.journal.write({
      type: 'discovery',
      title: 'Cold-start bootstrap complete',
      content: 'Initial seed data generated from self-introspection. Engines should now have enough data to produce output from cycle 1.',
      tags: [brainName, 'bootstrap', 'cold-start'],
      references: [],
      significance: 'routine',
      data: { phase: 'complete' },
    });
    count++;

    // Entry 4: Parameter count (only if registry available)
    if (this.engines.parameterRegistry) {
      try {
        const params = this.engines.parameterRegistry.list();
        this.engines.journal.write({
          type: 'discovery',
          title: `${params.length} tunable parameters registered`,
          content: `ParameterRegistry contains ${params.length} parameters across ${new Set(params.map(p => p.engine)).size} engines.`,
          tags: [brainName, 'bootstrap', 'parameters'],
          references: [],
          significance: 'routine',
          data: { parameterCount: params.length },
        });
        count++;
      } catch {
        // skip
      }
    }

    this.log.info(`[bootstrap] Phase 2: ${count} journal entries seeded`);
    return count;
  }

  // ── Phase 3: Seed Hypotheses ──────────────────────────

  private seedHypotheses(): number {
    if (!this.engines.hypothesisEngine) return 0;

    let count = 0;

    const seeds = [
      {
        statement: 'Higher dream.prune_threshold leads to fewer but higher-quality memories',
        variables: ['dream.prune_threshold', 'memory_quality'],
        condition: { type: 'correlation' as const, params: { strategy: 'bootstrap_seed', domain: 'dream' } },
      },
      {
        statement: 'Attention decay rate correlates with focus duration',
        variables: ['attention.decay_rate', 'focus_duration'],
        condition: { type: 'correlation' as const, params: { strategy: 'bootstrap_seed', domain: 'attention' } },
      },
      {
        statement: 'More observation types lead to more hypotheses per cycle',
        variables: ['observation_type_count', 'hypothesis_per_cycle'],
        condition: { type: 'correlation' as const, params: { strategy: 'bootstrap_seed', domain: 'hypothesis' } },
      },
      {
        statement: 'Journal entry count grows linearly over cycles',
        variables: ['journal_entries', 'cycle_count'],
        condition: { type: 'threshold' as const, params: { strategy: 'bootstrap_seed', domain: 'journal' } },
      },
    ];

    for (const seed of seeds) {
      // Duplicate check
      const existing = this.db.prepare(
        "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
      ).get(seed.statement) as { id: number } | undefined;
      if (existing) continue;

      try {
        this.engines.hypothesisEngine.propose({
          statement: seed.statement,
          type: 'correlation',
          source: 'bootstrap',
          variables: seed.variables,
          condition: seed.condition,
        });
        count++;
      } catch {
        // skip
      }
    }

    this.log.info(`[bootstrap] Phase 3: ${count} hypotheses seeded`);
    return count;
  }

  // ── Phase 4: Seed Predictions ─────────────────────────

  private seedPredictions(): number {
    if (!this.engines.predictionEngine) return 0;

    let count = 0;
    const now = Date.now();
    const metricsToSeed = ['journal_entries', 'observation_count', 'hypothesis_count'];

    for (const metric of metricsToSeed) {
      // Seed 5 data points with slightly varying values over the last 5 intervals
      for (let i = 4; i >= 0; i--) {
        const timestamp = now - (i * 300_000); // 5-min intervals
        const baseValue = metric === 'journal_entries' ? 3 + i : metric === 'observation_count' ? 10 + i * 2 : 1 + i;
        this.db.prepare(`
          INSERT INTO prediction_metrics (metric, value, domain, timestamp) VALUES (?, ?, ?, ?)
        `).run(metric, baseValue, 'metric', timestamp);
        count++;
      }
    }

    this.log.info(`[bootstrap] Phase 4: ${count} prediction data points seeded`);
    return count;
  }

  // ── Phase 5: Seed Metrics ─────────────────────────────

  private seedMetrics(): number {
    if (!this.engines.anomalyDetective) return 0;

    let count = 0;
    const now = Date.now();
    const anomalyMetrics = ['insight_count', 'anomaly_count', 'cycle_duration_ms', 'journal_entries', 'hypothesis_count'];

    for (const metric of anomalyMetrics) {
      // Seed 5 baseline data points over the last 5 intervals
      for (let i = 4; i >= 0; i--) {
        const timestamp = now - (i * 300_000);
        let baseValue: number;
        switch (metric) {
          case 'insight_count': baseValue = 1 + Math.floor(i * 0.5); break;
          case 'anomaly_count': baseValue = 0; break;
          case 'cycle_duration_ms': baseValue = 150 + i * 10; break;
          case 'journal_entries': baseValue = 3 + i; break;
          case 'hypothesis_count': baseValue = 1 + i; break;
          default: baseValue = 0;
        }
        this.db.prepare(`
          INSERT INTO metric_history (metric, value, timestamp) VALUES (?, ?, ?)
        `).run(metric, baseValue, timestamp);
        count++;
      }
    }

    this.log.info(`[bootstrap] Phase 5: ${count} anomaly baseline metrics seeded`);
    return count;
  }
}
