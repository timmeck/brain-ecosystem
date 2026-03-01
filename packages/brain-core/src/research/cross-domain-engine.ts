import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface CrossDomainCorrelation {
  id?: number;
  timestamp: number;
  source_brain: string;
  source_event: string;
  target_brain: string;
  target_event: string;
  correlation: number;       // -1 to 1
  lag_seconds: number;
  p_value: number;
  effect_size: number;
  direction: 'positive' | 'negative';
  narrative: string;
  sample_size: number;
  confirmed: boolean;
}

export interface CrossDomainEvent {
  brain: string;
  event_type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface CrossDomainConfig {
  /** Time window for correlation analysis (ms). Default: 7_200_000 (2h) */
  windowMs?: number;
  /** Minimum correlation strength. Default: 0.3 */
  minCorrelation?: number;
  /** Significance level. Default: 0.05 */
  alpha?: number;
  /** Maximum events to keep. Default: 10000 */
  maxEvents?: number;
}

// ── Migration ───────────────────────────────────────────

export function runCrossDomainMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_domain_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brain TEXT NOT NULL,
      event_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_xd_events_brain ON cross_domain_events(brain);
    CREATE INDEX IF NOT EXISTS idx_xd_events_ts ON cross_domain_events(timestamp);

    CREATE TABLE IF NOT EXISTS cross_domain_correlations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      source_brain TEXT NOT NULL,
      source_event TEXT NOT NULL,
      target_brain TEXT NOT NULL,
      target_event TEXT NOT NULL,
      correlation REAL NOT NULL,
      lag_seconds INTEGER NOT NULL,
      p_value REAL NOT NULL,
      effect_size REAL NOT NULL,
      direction TEXT NOT NULL,
      narrative TEXT NOT NULL,
      sample_size INTEGER NOT NULL,
      confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_xd_corr_brains ON cross_domain_correlations(source_brain, target_brain);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class CrossDomainEngine {
  private db: Database.Database;
  private config: Required<CrossDomainConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config?: CrossDomainConfig) {
    this.db = db;
    this.config = {
      windowMs: config?.windowMs ?? 7_200_000,
      minCorrelation: config?.minCorrelation ?? 0.3,
      alpha: config?.alpha ?? 0.05,
      maxEvents: config?.maxEvents ?? 10_000,
    };
    runCrossDomainMigration(db);
  }

  /** Record an event from a brain. */
  recordEvent(brain: string, eventType: string, data?: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT INTO cross_domain_events (brain, event_type, timestamp, data)
      VALUES (?, ?, ?, ?)
    `).run(brain, eventType, Date.now(), data ? JSON.stringify(data) : null);

    // Cleanup old events
    const count = (this.db.prepare(`SELECT COUNT(*) as c FROM cross_domain_events`).get() as { c: number }).c;
    if (count > this.config.maxEvents) {
      this.db.prepare(`
        DELETE FROM cross_domain_events WHERE id IN (
          SELECT id FROM cross_domain_events ORDER BY timestamp ASC LIMIT ?
        )
      `).run(count - this.config.maxEvents);
    }
  }

  /** Run cross-domain correlation analysis. */
  analyze(): CrossDomainCorrelation[] {
    const brains = this.db.prepare(`
      SELECT DISTINCT brain FROM cross_domain_events
    `).all() as Array<{ brain: string }>;

    if (brains.length < 2) return [];

    const cutoff = Date.now() - this.config.windowMs * 10; // Analyze 10 windows of data
    const discoveries: CrossDomainCorrelation[] = [];

    // Get all event types per brain
    const brainEvents = new Map<string, string[]>();
    for (const { brain } of brains) {
      const types = this.db.prepare(`
        SELECT DISTINCT event_type FROM cross_domain_events
        WHERE brain = ? AND timestamp > ?
      `).all(brain, cutoff) as Array<{ event_type: string }>;
      brainEvents.set(brain, types.map(t => t.event_type));
    }

    // Cross-correlate every pair from different brains
    const brainList = [...brainEvents.keys()];
    for (let i = 0; i < brainList.length; i++) {
      for (let j = i + 1; j < brainList.length; j++) {
        const brainA = brainList[i];
        const brainB = brainList[j];
        const typesA = brainEvents.get(brainA) ?? [];
        const typesB = brainEvents.get(brainB) ?? [];

        for (const typeA of typesA) {
          for (const typeB of typesB) {
            const corr = this.computeCorrelation(brainA, typeA, brainB, typeB, cutoff);
            if (corr && Math.abs(corr.correlation) >= this.config.minCorrelation && corr.p_value < this.config.alpha) {
              discoveries.push(corr);
            }
          }
        }
      }
    }

    // Persist new discoveries
    for (const d of discoveries) {
      this.persistCorrelation(d);
    }

    return discoveries;
  }

  /** Get all found correlations. */
  getCorrelations(limit = 20): CrossDomainCorrelation[] {
    return (this.db.prepare(`
      SELECT * FROM cross_domain_correlations
      ORDER BY ABS(correlation) DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(r => this.rowToCorrelation(r));
  }

  /** Generate a narrative summary of the most important cross-domain findings. */
  getNarrative(): string {
    const correlations = this.getCorrelations(10);
    if (correlations.length === 0) return 'No cross-domain correlations discovered yet.';

    const lines = ['Cross-Domain Research Narrative:\n'];
    for (const c of correlations) {
      lines.push(`- ${c.narrative}`);
      lines.push(`  (r=${c.correlation.toFixed(2)}, p=${c.p_value.toFixed(3)}, d=${c.effect_size.toFixed(2)}, lag=${c.lag_seconds}s, n=${c.sample_size})`);
      lines.push('');
    }
    return lines.join('\n');
  }

  private computeCorrelation(
    brainA: string, typeA: string,
    brainB: string, typeB: string,
    since: number,
  ): CrossDomainCorrelation | null {
    // Get event timestamps for both
    const eventsA = this.db.prepare(`
      SELECT timestamp FROM cross_domain_events
      WHERE brain = ? AND event_type = ? AND timestamp > ?
      ORDER BY timestamp
    `).all(brainA, typeA, since) as Array<{ timestamp: number }>;

    const eventsB = this.db.prepare(`
      SELECT timestamp FROM cross_domain_events
      WHERE brain = ? AND event_type = ? AND timestamp > ?
      ORDER BY timestamp
    `).all(brainB, typeB, since) as Array<{ timestamp: number }>;

    if (eventsA.length < 3 || eventsB.length < 3) return null;

    // Compute temporal cross-correlation with varying lag
    // Bin events into time windows
    const binSize = this.config.windowMs;
    const minTs = Math.min(eventsA[0].timestamp, eventsB[0].timestamp);
    const maxTs = Math.max(
      eventsA[eventsA.length - 1].timestamp,
      eventsB[eventsB.length - 1].timestamp,
    );
    const numBins = Math.ceil((maxTs - minTs) / binSize);
    if (numBins < 3) return null;

    const binsA = new Array(numBins).fill(0);
    const binsB = new Array(numBins).fill(0);

    for (const e of eventsA) {
      const bin = Math.min(numBins - 1, Math.floor((e.timestamp - minTs) / binSize));
      binsA[bin]++;
    }
    for (const e of eventsB) {
      const bin = Math.min(numBins - 1, Math.floor((e.timestamp - minTs) / binSize));
      binsB[bin]++;
    }

    // Pearson correlation at different lags (-2 to +2 bins)
    let bestCorr = 0;
    let bestLag = 0;

    for (let lag = -2; lag <= 2; lag++) {
      const r = pearsonCorrelation(binsA, binsB, lag);
      if (Math.abs(r) > Math.abs(bestCorr)) {
        bestCorr = r;
        bestLag = lag;
      }
    }

    if (Math.abs(bestCorr) < this.config.minCorrelation) return null;

    // Approximate p-value for Pearson correlation
    const n = Math.min(binsA.length, binsB.length) - Math.abs(bestLag);
    const t = bestCorr * Math.sqrt((n - 2) / (1 - bestCorr * bestCorr));
    const pValue = n > 2 ? approxPValue(Math.abs(t), n - 2) : 1;

    const narrative = this.generateNarrative(brainA, typeA, brainB, typeB, bestCorr, bestLag * binSize / 1000);

    return {
      timestamp: Date.now(),
      source_brain: brainA,
      source_event: typeA,
      target_brain: brainB,
      target_event: typeB,
      correlation: bestCorr,
      lag_seconds: Math.round(bestLag * binSize / 1000),
      p_value: pValue,
      effect_size: Math.abs(bestCorr),  // r as effect size
      direction: bestCorr > 0 ? 'positive' : 'negative',
      narrative,
      sample_size: eventsA.length + eventsB.length,
      confirmed: false,
    };
  }

  private generateNarrative(
    brainA: string, typeA: string,
    brainB: string, typeB: string,
    correlation: number, lagSeconds: number,
  ): string {
    const direction = correlation > 0 ? 'increases' : 'decreases';
    const strength = Math.abs(correlation) > 0.7 ? 'strongly' : Math.abs(correlation) > 0.5 ? 'moderately' : 'weakly';
    const lagStr = lagSeconds === 0 ? 'simultaneously' :
      lagSeconds > 0 ? `${lagSeconds}s later` : `${Math.abs(lagSeconds)}s before`;

    return `When ${brainA} reports "${typeA}", ${brainB}'s "${typeB}" ${strength} ${direction} (${lagStr}).`;
  }

  private persistCorrelation(corr: CrossDomainCorrelation): void {
    // Upsert: update if same pair exists
    const existing = this.db.prepare(`
      SELECT id FROM cross_domain_correlations
      WHERE source_brain = ? AND source_event = ? AND target_brain = ? AND target_event = ?
    `).get(corr.source_brain, corr.source_event, corr.target_brain, corr.target_event);

    if (existing) {
      this.db.prepare(`
        UPDATE cross_domain_correlations
        SET correlation = ?, lag_seconds = ?, p_value = ?, effect_size = ?,
            direction = ?, narrative = ?, sample_size = ?, timestamp = ?
        WHERE source_brain = ? AND source_event = ? AND target_brain = ? AND target_event = ?
      `).run(
        corr.correlation, corr.lag_seconds, corr.p_value, corr.effect_size,
        corr.direction, corr.narrative, corr.sample_size, corr.timestamp,
        corr.source_brain, corr.source_event, corr.target_brain, corr.target_event,
      );
    } else {
      this.db.prepare(`
        INSERT INTO cross_domain_correlations
        (timestamp, source_brain, source_event, target_brain, target_event,
         correlation, lag_seconds, p_value, effect_size, direction, narrative, sample_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        corr.timestamp, corr.source_brain, corr.source_event,
        corr.target_brain, corr.target_event,
        corr.correlation, corr.lag_seconds, corr.p_value, corr.effect_size,
        corr.direction, corr.narrative, corr.sample_size,
      );
    }
  }

  private rowToCorrelation(row: Record<string, unknown>): CrossDomainCorrelation {
    return {
      id: row.id as number,
      timestamp: row.timestamp as number,
      source_brain: row.source_brain as string,
      source_event: row.source_event as string,
      target_brain: row.target_brain as string,
      target_event: row.target_event as string,
      correlation: row.correlation as number,
      lag_seconds: row.lag_seconds as number,
      p_value: row.p_value as number,
      effect_size: row.effect_size as number,
      direction: row.direction as 'positive' | 'negative',
      narrative: row.narrative as string,
      sample_size: row.sample_size as number,
      confirmed: (row.confirmed as number) === 1,
    };
  }
}

// ── Helper Functions ────────────────────────────────────

function pearsonCorrelation(a: number[], b: number[], lag = 0): number {
  const n = Math.min(a.length, b.length) - Math.abs(lag);
  if (n < 3) return 0;

  let sumA = 0, sumB = 0;
  const offsetA = lag > 0 ? lag : 0;
  const offsetB = lag < 0 ? -lag : 0;

  for (let i = 0; i < n; i++) {
    sumA += a[i + offsetA];
    sumB += b[i + offsetB];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i + offsetA] - meanA;
    const dB = b[i + offsetB] - meanB;
    cov += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }

  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

function approxPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  // Normal approximation for large df
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
  return 2 * (1 - normalCDF(z));
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}
