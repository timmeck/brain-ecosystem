import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type AnomalyType = 'statistical' | 'behavioral' | 'causal' | 'cross_domain' | 'drift';
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Anomaly {
  id?: number;
  timestamp: number;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  metric: string;
  expected_value: number;
  actual_value: number;
  deviation: number;        // Z-score or percentage
  evidence: Record<string, unknown>;
  resolved: boolean;
  resolution?: string;
}

export interface DriftReport {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  rate_per_day: number;
  cumulative_change: number;
  period_days: number;
  significant: boolean;
  description: string;
}

export interface AnomalyDetectiveConfig {
  brainName: string;
  /** Z-score threshold for statistical anomalies. Default: 2.0 */
  zThreshold?: number;
  /** EWMA smoothing factor (0-1). Default: 0.3 */
  ewmaAlpha?: number;
  /** Minimum data points for drift detection. Default: 7 */
  minDriftPoints?: number;
}

// ── Migration ───────────────────────────────────────────

export function runAnomalyDetectiveMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      metric TEXT NOT NULL,
      expected_value REAL NOT NULL,
      actual_value REAL NOT NULL,
      deviation REAL NOT NULL,
      evidence TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      resolution TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(type);
    CREATE INDEX IF NOT EXISTS idx_anomalies_ts ON anomalies(timestamp);
    CREATE INDEX IF NOT EXISTS idx_anomalies_resolved ON anomalies(resolved);

    CREATE TABLE IF NOT EXISTS metric_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_metric_hist ON metric_history(metric, timestamp);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class AnomalyDetective {
  private db: Database.Database;
  private config: Required<AnomalyDetectiveConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config: AnomalyDetectiveConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      zThreshold: config.zThreshold ?? 2.0,
      ewmaAlpha: config.ewmaAlpha ?? 0.3,
      minDriftPoints: config.minDriftPoints ?? 7,
    };
    runAnomalyDetectiveMigration(db);
  }

  /** Record a metric value for anomaly tracking. */
  recordMetric(metric: string, value: number): void {
    this.db.prepare(`
      INSERT INTO metric_history (metric, value, timestamp)
      VALUES (?, ?, ?)
    `).run(metric, value, Date.now());
  }

  /** Check all tracked metrics for anomalies. */
  detect(): Anomaly[] {
    const anomalies: Anomaly[] = [];

    const metrics = this.db.prepare(`
      SELECT DISTINCT metric FROM metric_history
    `).all() as Array<{ metric: string }>;

    for (const { metric } of metrics) {
      const values = this.db.prepare(`
        SELECT value, timestamp FROM metric_history
        WHERE metric = ? ORDER BY timestamp ASC
      `).all(metric) as Array<{ value: number; timestamp: number }>;

      if (values.length < 3) continue;

      // Statistical anomaly detection (Z-score)
      const statistical = this.detectStatisticalAnomaly(metric, values);
      if (statistical) anomalies.push(statistical);

      // Drift detection (EWMA)
      const drift = this.detectDrift(metric, values);
      if (drift) anomalies.push(drift);
    }

    // Persist new anomalies
    for (const a of anomalies) {
      this.persistAnomaly(a);
    }

    return anomalies;
  }

  /** Get current anomalies. */
  getAnomalies(type?: AnomalyType, limit = 20): Anomaly[] {
    let sql = `SELECT * FROM anomalies`;
    const params: unknown[] = [];
    if (type) {
      sql += ` WHERE type = ?`;
      params.push(type);
    }
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => this.rowToAnomaly(r));
  }

  /** Investigate a specific anomaly — provide context and potential causes. */
  investigate(anomalyId: number): Record<string, unknown> | null {
    const anomaly = this.db.prepare(`SELECT * FROM anomalies WHERE id = ?`).get(anomalyId) as Record<string, unknown> | undefined;
    if (!anomaly) return null;

    const a = this.rowToAnomaly(anomaly);

    // Get metric history around the anomaly
    const window = 86_400_000; // 24h
    const history = this.db.prepare(`
      SELECT value, timestamp FROM metric_history
      WHERE metric = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp
    `).all(a.metric, a.timestamp - window, a.timestamp + window) as Array<{ value: number; timestamp: number }>;

    // Look for related events in causal_events (if available)
    let relatedEvents: unknown[] = [];
    try {
      relatedEvents = this.db.prepare(`
        SELECT type, source, timestamp FROM causal_events
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC LIMIT 20
      `).all(a.timestamp - 3_600_000, a.timestamp);
    } catch { /* table might not exist */ }

    return {
      anomaly: a,
      metric_history: history,
      related_events: relatedEvents,
      context: {
        metric_count: history.length,
        avg_value: history.length > 0 ? history.reduce((s, h) => s + h.value, 0) / history.length : 0,
        max_value: history.length > 0 ? Math.max(...history.map(h => h.value)) : 0,
        min_value: history.length > 0 ? Math.min(...history.map(h => h.value)) : 0,
      },
    };
  }

  /** Get anomaly history (including resolved). */
  getHistory(limit = 50): Anomaly[] {
    return (this.db.prepare(`
      SELECT * FROM anomalies ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(r => this.rowToAnomaly(r));
  }

  /** Get drift reports for all tracked metrics. */
  getDriftReport(): DriftReport[] {
    const reports: DriftReport[] = [];
    const metrics = this.db.prepare(`
      SELECT DISTINCT metric FROM metric_history
    `).all() as Array<{ metric: string }>;

    for (const { metric } of metrics) {
      const values = this.db.prepare(`
        SELECT value, timestamp FROM metric_history
        WHERE metric = ? ORDER BY timestamp ASC
      `).all(metric) as Array<{ value: number; timestamp: number }>;

      if (values.length < this.config.minDriftPoints) continue;

      const report = this.computeDriftReport(metric, values);
      if (report) reports.push(report);
    }

    return reports.sort((a, b) => Math.abs(b.rate_per_day) - Math.abs(a.rate_per_day));
  }

  /** Resolve an anomaly. */
  resolve(anomalyId: number, resolution: string): boolean {
    const result = this.db.prepare(`
      UPDATE anomalies SET resolved = 1, resolution = ? WHERE id = ?
    `).run(resolution, anomalyId);
    return result.changes > 0;
  }

  private detectStatisticalAnomaly(
    metric: string, values: Array<{ value: number; timestamp: number }>,
  ): Anomaly | null {
    if (values.length < 5) return null;

    const nums = values.map(v => v.value);
    const m = mean(nums);
    const s = stddev(nums);
    if (s === 0) return null;

    // Check latest value
    const latest = values[values.length - 1];
    const z = Math.abs(latest.value - m) / s;

    if (z < this.config.zThreshold) return null;

    const severity: AnomalySeverity =
      z > 4 ? 'critical' :
      z > 3 ? 'high' :
      z > 2.5 ? 'medium' : 'low';

    return {
      timestamp: latest.timestamp,
      type: 'statistical',
      severity,
      title: `${metric} deviated ${z.toFixed(1)}σ from mean`,
      description: `${metric} = ${latest.value.toFixed(3)} (mean: ${m.toFixed(3)}, σ: ${s.toFixed(3)}, z-score: ${z.toFixed(2)})`,
      metric,
      expected_value: m,
      actual_value: latest.value,
      deviation: z,
      evidence: { mean: m, stddev: s, z_score: z, n: values.length },
      resolved: false,
    };
  }

  private detectDrift(
    metric: string, values: Array<{ value: number; timestamp: number }>,
  ): Anomaly | null {
    if (values.length < this.config.minDriftPoints) return null;

    // EWMA on the values
    const alpha = this.config.ewmaAlpha;
    let ewma = values[0].value;
    const ewmaValues: number[] = [ewma];

    for (let i = 1; i < values.length; i++) {
      ewma = alpha * values[i].value + (1 - alpha) * ewma;
      ewmaValues.push(ewma);
    }

    // Check if EWMA trend is consistently increasing or decreasing
    const recentWindow = Math.min(values.length, 10);
    const recentEwma = ewmaValues.slice(-recentWindow);
    let increasing = 0, decreasing = 0;

    for (let i = 1; i < recentEwma.length; i++) {
      if (recentEwma[i] > recentEwma[i - 1]) increasing++;
      else if (recentEwma[i] < recentEwma[i - 1]) decreasing++;
    }

    const total = recentEwma.length - 1;
    if (total < 3) return null;

    const driftRatio = Math.max(increasing, decreasing) / total;
    if (driftRatio < 0.7) return null; // Not a consistent trend

    const direction = increasing > decreasing ? 'increasing' : 'decreasing';
    const firstValue = recentEwma[0];
    const lastValue = recentEwma[recentEwma.length - 1];
    const change = lastValue - firstValue;
    const pctChange = firstValue !== 0 ? (change / Math.abs(firstValue)) * 100 : 0;

    if (Math.abs(pctChange) < 5) return null; // Less than 5% drift — ignore

    const severity: AnomalySeverity =
      Math.abs(pctChange) > 30 ? 'high' :
      Math.abs(pctChange) > 15 ? 'medium' : 'low';

    return {
      timestamp: Date.now(),
      type: 'drift',
      severity,
      title: `${metric} is ${direction} (${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}% drift)`,
      description: `${metric} has been consistently ${direction} over the last ${recentWindow} measurements. EWMA: ${firstValue.toFixed(3)} → ${lastValue.toFixed(3)}.`,
      metric,
      expected_value: firstValue,
      actual_value: lastValue,
      deviation: Math.abs(pctChange),
      evidence: { direction, change, pct_change: pctChange, window: recentWindow, drift_ratio: driftRatio },
      resolved: false,
    };
  }

  private computeDriftReport(metric: string, values: Array<{ value: number; timestamp: number }>): DriftReport | null {
    if (values.length < 2) return null;

    const first = values[0];
    const last = values[values.length - 1];
    const periodMs = last.timestamp - first.timestamp;
    const periodDays = periodMs / 86_400_000;
    if (periodDays < 1) return null;

    const change = last.value - first.value;
    const ratePerDay = change / periodDays;

    // Simple linear regression significance
    const xMean = values.reduce((s, v) => s + v.timestamp, 0) / values.length;
    const yMean = values.reduce((s, v) => s + v.value, 0) / values.length;
    let ssXY = 0, ssXX = 0, ssYY = 0;
    for (const v of values) {
      ssXY += (v.timestamp - xMean) * (v.value - yMean);
      ssXX += (v.timestamp - xMean) ** 2;
      ssYY += (v.value - yMean) ** 2;
    }
    const r = ssXX > 0 && ssYY > 0 ? ssXY / Math.sqrt(ssXX * ssYY) : 0;
    const significant = Math.abs(r) > 0.5 && values.length >= 5;

    const direction = Math.abs(ratePerDay) < 0.001 ? 'stable' as const :
      ratePerDay > 0 ? 'increasing' as const : 'decreasing' as const;

    return {
      metric,
      direction,
      rate_per_day: ratePerDay,
      cumulative_change: change,
      period_days: periodDays,
      significant,
      description: `${metric}: ${direction} at ${ratePerDay.toFixed(4)}/day over ${periodDays.toFixed(1)} days (r=${r.toFixed(2)})`,
    };
  }

  private persistAnomaly(a: Anomaly): void {
    // Avoid duplicates: same metric + type within 1 hour
    const existing = this.db.prepare(`
      SELECT id FROM anomalies WHERE metric = ? AND type = ? AND timestamp > ? LIMIT 1
    `).get(a.metric, a.type, Date.now() - 3_600_000);

    if (existing) return;

    this.db.prepare(`
      INSERT INTO anomalies (timestamp, type, severity, title, description, metric,
        expected_value, actual_value, deviation, evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      a.timestamp, a.type, a.severity, a.title, a.description, a.metric,
      a.expected_value, a.actual_value, a.deviation, JSON.stringify(a.evidence),
    );
  }

  private rowToAnomaly(row: Record<string, unknown>): Anomaly {
    return {
      id: row.id as number,
      timestamp: row.timestamp as number,
      type: row.type as AnomalyType,
      severity: row.severity as AnomalySeverity,
      title: row.title as string,
      description: row.description as string,
      metric: row.metric as string,
      expected_value: row.expected_value as number,
      actual_value: row.actual_value as number,
      deviation: row.deviation as number,
      evidence: JSON.parse(row.evidence as string),
      resolved: (row.resolved as number) === 1,
      resolution: row.resolution as string | undefined,
    };
  }
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}
