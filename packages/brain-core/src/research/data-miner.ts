import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { SelfObserver } from './self-observer.js';
import type { AnomalyDetective } from './anomaly-detective.js';
import type { CrossDomainEngine } from './cross-domain-engine.js';
import type { CausalGraph } from '../causal/engine.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';

// ── Types ───────────────────────────────────────────────

export interface MinedObservation {
  category: 'tool_usage' | 'query_quality' | 'resolution_rate' | 'latency' | 'cross_brain';
  event_type: string;
  metrics: Record<string, unknown>;
}

export interface MinedCausalEvent {
  source: string;
  type: string;
  data?: unknown;
}

export interface MinedMetric {
  name: string;
  value: number;
}

export interface MinedHypothesisObservation {
  source: string;
  type: string;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface MinedCrossDomainEvent {
  brain: string;
  eventType: string;
  data?: Record<string, unknown>;
}

export interface MineResult {
  observations: MinedObservation[];
  causalEvents: MinedCausalEvent[];
  metrics: MinedMetric[];
  hypothesisObservations: MinedHypothesisObservation[];
  crossDomainEvents: MinedCrossDomainEvent[];
}

export interface DataMinerAdapter {
  /** Human-readable name for logging. */
  readonly name: string;
  /** Mine observations for SelfObserver from domain tables. */
  mineObservations(db: Database.Database, since: number): MinedObservation[];
  /** Mine causal events for CausalGraph from domain tables. */
  mineCausalEvents(db: Database.Database, since: number): MinedCausalEvent[];
  /** Mine metric values for AnomalyDetective from domain tables. */
  mineMetrics(db: Database.Database, since: number): MinedMetric[];
  /** Mine observations for HypothesisEngine from domain tables. */
  mineHypothesisObservations(db: Database.Database, since: number): MinedHypothesisObservation[];
  /** Mine cross-domain events for CrossDomainEngine from domain tables. */
  mineCrossDomainEvents(db: Database.Database, since: number): MinedCrossDomainEvent[];
}

export interface DataMinerEngines {
  selfObserver: SelfObserver;
  anomalyDetective: AnomalyDetective;
  crossDomain: CrossDomainEngine;
  causalGraph?: CausalGraph;
  hypothesisEngine?: HypothesisEngine;
}

export interface DataMinerState {
  last_mined_at: number;
  bootstrap_complete: boolean;
  bootstrap_attempts: number;
  total_observations_mined: number;
  total_causal_events_mined: number;
  total_metrics_mined: number;
}

// ── Migration ───────────────────────────────────────────

export function runDataMinerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_miner_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_mined_at INTEGER NOT NULL DEFAULT 0,
      bootstrap_complete INTEGER NOT NULL DEFAULT 0,
      bootstrap_attempts INTEGER NOT NULL DEFAULT 0,
      total_observations_mined INTEGER NOT NULL DEFAULT 0,
      total_causal_events_mined INTEGER NOT NULL DEFAULT 0,
      total_metrics_mined INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO data_miner_state (id) VALUES (1);
  `);

  // Graceful ALTER TABLE for existing DBs
  try {
    db.exec('ALTER TABLE data_miner_state ADD COLUMN bootstrap_attempts INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists
  }
}

// ── DataMiner ───────────────────────────────────────────

export class DataMiner {
  private db: Database.Database;
  private adapters: DataMinerAdapter[];
  private engines: DataMinerEngines;
  private log = getLogger();
  private state: DataMinerState;

  constructor(db: Database.Database, adapter: DataMinerAdapter, engines: DataMinerEngines) {
    this.db = db;
    this.adapters = [adapter];
    this.engines = engines;

    runDataMinerMigration(db);
    this.state = this.loadState();
  }

  /** Register an additional adapter for mining. */
  addAdapter(adapter: DataMinerAdapter): void {
    this.adapters.push(adapter);
    this.log.info(`[data-miner] Added adapter: ${adapter.name}`);
  }

  /** Bootstrap: scan ALL historical data and feed into engines. Only runs once. */
  bootstrap(): void {
    if (this.state.bootstrap_complete) {
      const names = this.adapters.map(a => a.name).join(', ');
      this.log.info(`[data-miner] Bootstrap already complete for ${names}`);
      return;
    }

    const names = this.adapters.map(a => a.name).join(', ');
    this.state.bootstrap_attempts++;
    this.log.info(`[data-miner] Bootstrapping ${names} — attempt ${this.state.bootstrap_attempts}, scanning all historical data...`);
    const start = Date.now();

    // Mine everything from epoch
    const result = this.mineFrom(0);

    // Only mark complete if we actually mined something, OR safety valve after 10 attempts
    if (result.total > 0 || this.state.bootstrap_attempts >= 10) {
      this.state.bootstrap_complete = true;
      if (result.total === 0) {
        this.log.info(`[data-miner] Safety valve: marking bootstrap complete after ${this.state.bootstrap_attempts} attempts with 0 items (BootstrapService will seed data instead)`);
      }
    }
    this.state.last_mined_at = Date.now();
    this.saveState();

    const duration = Date.now() - start;
    this.log.info(
      `[data-miner] Bootstrap ${this.state.bootstrap_complete ? 'complete' : 'incomplete (0 items)'} for ${names} in ${duration}ms — ` +
      `${result.observations} observations, ${result.causalEvents} causal events, ` +
      `${result.metrics} metrics, ${result.hypothesisObs} hypothesis observations, ` +
      `${result.crossDomain} cross-domain events`,
    );
  }

  /** Incremental mine: fetch new data since last run and feed into engines. */
  mine(): void {
    const since = this.state.last_mined_at;
    const now = Date.now();

    const result = this.mineFrom(since);

    this.state.last_mined_at = now;
    this.saveState();

    if (result.total > 0) {
      const names = this.adapters.map(a => a.name).join(', ');
      this.log.info(
        `[data-miner] Mined ${result.total} items from ${names} ` +
        `(obs: ${result.observations}, causal: ${result.causalEvents}, ` +
        `metrics: ${result.metrics}, hypo: ${result.hypothesisObs}, cross: ${result.crossDomain})`,
      );
    }
  }

  /** Get current miner state. */
  getState(): DataMinerState {
    return { ...this.state };
  }

  // ── Internal ─────────────────────────────────────────

  private mineFrom(since: number): { observations: number; causalEvents: number; metrics: number; hypothesisObs: number; crossDomain: number; total: number } {
    let observations = 0;
    let causalEvents = 0;
    let metrics = 0;
    let hypothesisObs = 0;
    let crossDomain = 0;

    for (const adapter of this.adapters) {
      // 1. Mine observations → SelfObserver
      try {
        const obs = adapter.mineObservations(this.db, since);
        for (const o of obs) {
          this.engines.selfObserver.record({
            category: o.category,
            event_type: o.event_type,
            metrics: o.metrics,
          });
        }
        observations += obs.length;
        this.state.total_observations_mined += obs.length;
      } catch (err) {
        this.log.error(`[data-miner] Error mining observations from ${adapter.name}: ${(err as Error).message}`);
      }

      // 2. Mine causal events → CausalGraph
      try {
        const events = adapter.mineCausalEvents(this.db, since);
        if (this.engines.causalGraph) {
          for (const e of events) {
            this.engines.causalGraph.recordEvent(e.source, e.type, e.data);
          }
        }
        causalEvents += events.length;
        this.state.total_causal_events_mined += events.length;
      } catch (err) {
        this.log.error(`[data-miner] Error mining causal events from ${adapter.name}: ${(err as Error).message}`);
      }

      // 3. Mine metrics → AnomalyDetective
      try {
        const m = adapter.mineMetrics(this.db, since);
        for (const metric of m) {
          this.engines.anomalyDetective.recordMetric(metric.name, metric.value);
        }
        metrics += m.length;
      } catch (err) {
        this.log.error(`[data-miner] Error mining metrics from ${adapter.name}: ${(err as Error).message}`);
      }

      // 4. Mine hypothesis observations → HypothesisEngine
      try {
        const hypo = adapter.mineHypothesisObservations(this.db, since);
        if (this.engines.hypothesisEngine) {
          for (const h of hypo) {
            this.engines.hypothesisEngine.observe({
              source: h.source,
              type: h.type,
              value: h.value,
              timestamp: Date.now(),
              metadata: h.metadata,
            });
          }
        }
        hypothesisObs += hypo.length;
      } catch (err) {
        this.log.error(`[data-miner] Error mining hypothesis observations from ${adapter.name}: ${(err as Error).message}`);
      }

      // 5. Mine cross-domain events → CrossDomainEngine
      try {
        const cd = adapter.mineCrossDomainEvents(this.db, since);
        for (const c of cd) {
          this.engines.crossDomain.recordEvent(c.brain, c.eventType, c.data);
        }
        crossDomain += cd.length;
      } catch (err) {
        this.log.error(`[data-miner] Error mining cross-domain events from ${adapter.name}: ${(err as Error).message}`);
      }
    }

    const total = observations + causalEvents + metrics + hypothesisObs + crossDomain;
    return { observations, causalEvents, metrics, hypothesisObs, crossDomain, total };
  }

  private loadState(): DataMinerState {
    const row = this.db.prepare('SELECT * FROM data_miner_state WHERE id = 1').get() as
      { last_mined_at: number; bootstrap_complete: number; bootstrap_attempts: number; total_observations_mined: number; total_causal_events_mined: number; total_metrics_mined: number } | undefined;

    if (!row) {
      return { last_mined_at: 0, bootstrap_complete: false, bootstrap_attempts: 0, total_observations_mined: 0, total_causal_events_mined: 0, total_metrics_mined: 0 };
    }

    return {
      last_mined_at: row.last_mined_at,
      bootstrap_complete: row.bootstrap_complete === 1,
      bootstrap_attempts: row.bootstrap_attempts ?? 0,
      total_observations_mined: row.total_observations_mined,
      total_causal_events_mined: row.total_causal_events_mined,
      total_metrics_mined: row.total_metrics_mined,
    };
  }

  private saveState(): void {
    this.db.prepare(`
      UPDATE data_miner_state SET
        last_mined_at = ?,
        bootstrap_complete = ?,
        bootstrap_attempts = ?,
        total_observations_mined = ?,
        total_causal_events_mined = ?,
        total_metrics_mined = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      this.state.last_mined_at,
      this.state.bootstrap_complete ? 1 : 0,
      this.state.bootstrap_attempts,
      this.state.total_observations_mined,
      this.state.total_causal_events_mined,
      this.state.total_metrics_mined,
    );
  }
}
