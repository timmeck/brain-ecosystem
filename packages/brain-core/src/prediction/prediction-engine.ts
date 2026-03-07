// ── Prediction Engine — Proactive Forecasting ────────────────
//
// Records domain metrics, generates Holt-Winters / EWMA predictions,
// resolves them against reality, and auto-calibrates confidence.

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import { holtWintersForecast, ewmaForecast, calibrateConfidence } from './forecaster.js';
import { PredictionTracker } from './tracker.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { ResearchJournal } from '../research/journal.js';
import type {
  PredictionEngineConfig,
  Prediction,
  PredictionDomain,
  PredictionStatus,
  PredictionAccuracy,
  PredictionSummary,
  PredictionInput,
  ForecastResult,
  MetricDataPoint,
} from './types.js';

// ── Migration ───────────────────────────────────────────

export function runPredictionMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      metric TEXT NOT NULL,
      predicted_value REAL NOT NULL,
      predicted_direction TEXT NOT NULL,
      confidence REAL NOT NULL,
      horizon_ms INTEGER NOT NULL,
      reasoning TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actual_value REAL,
      error REAL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      expires_at INTEGER NOT NULL,
      evidence TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
    CREATE INDEX IF NOT EXISTS idx_predictions_domain ON predictions(domain);
    CREATE INDEX IF NOT EXISTS idx_predictions_metric ON predictions(metric);
    CREATE INDEX IF NOT EXISTS idx_predictions_expires ON predictions(expires_at);

    CREATE TABLE IF NOT EXISTS prediction_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      domain TEXT NOT NULL DEFAULT 'metric',
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pred_metrics_metric ON prediction_metrics(metric);
    CREATE INDEX IF NOT EXISTS idx_pred_metrics_ts ON prediction_metrics(timestamp);

    CREATE TABLE IF NOT EXISTS prediction_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      total_predictions INTEGER NOT NULL DEFAULT 0,
      total_resolved INTEGER NOT NULL DEFAULT 0,
      total_correct INTEGER NOT NULL DEFAULT 0,
      calibration_offset REAL NOT NULL DEFAULT 0.0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO prediction_state (id) VALUES (1);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class PredictionEngine {
  private db: Database.Database;
  private config: Required<PredictionEngineConfig>;
  private tracker: PredictionTracker;
  private thoughtStream: ThoughtStream | null = null;
  private journal: ResearchJournal | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private calibrationOffset = 0;
  private log = getLogger();

  constructor(db: Database.Database, config: PredictionEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      defaultHorizonMs: config.defaultHorizonMs ?? 600_000,
      expirationMs: config.expirationMs ?? 3_600_000,
      ewmaAlpha: config.ewmaAlpha ?? 0.3,
      trendBeta: config.trendBeta ?? 0.1,
      minDataPoints: config.minDataPoints ?? 5,
      minConfidence: config.minConfidence ?? 0.5,
      maxPredictionsPerCycle: config.maxPredictionsPerCycle ?? 5,
      resolveIntervalMs: config.resolveIntervalMs ?? 60_000,
    };
    runPredictionMigration(db);
    this.tracker = new PredictionTracker(db);

    // Load calibration offset from DB
    this.calibrationOffset = this.tracker.getCalibrationOffset();
  }

  /** Set the ThoughtStream for consciousness integration. */
  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  /** Set the Research Journal for logging notable predictions. */
  setJournal(journal: ResearchJournal): void {
    this.journal = journal;
  }

  /** Update config values at runtime (for A/B testing / parameter sync). */
  updateConfig(partial: Partial<PredictionEngineConfig>): void {
    if (partial.ewmaAlpha !== undefined) this.config.ewmaAlpha = partial.ewmaAlpha;
    if (partial.trendBeta !== undefined) this.config.trendBeta = partial.trendBeta;
    if (partial.minConfidence !== undefined) this.config.minConfidence = partial.minConfidence;
    if (partial.minDataPoints !== undefined) this.config.minDataPoints = partial.minDataPoints;
    if (partial.maxPredictionsPerCycle !== undefined) this.config.maxPredictionsPerCycle = partial.maxPredictionsPerCycle;
    if (partial.defaultHorizonMs !== undefined) this.config.defaultHorizonMs = partial.defaultHorizonMs;
    if (partial.expirationMs !== undefined) this.config.expirationMs = partial.expirationMs;
    if (partial.resolveIntervalMs !== undefined) this.config.resolveIntervalMs = partial.resolveIntervalMs;
  }

  /** Get current config (read-only copy). */
  getConfig(): Readonly<Required<PredictionEngineConfig>> {
    return { ...this.config };
  }

  /** Start periodic resolution timer. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try { this.cycle(); }
      catch (err) { this.log.error(`[prediction] Cycle error: ${(err as Error).message}`); }
    }, this.config.resolveIntervalMs);
    this.log.info(`[prediction] Engine started (resolve interval: ${this.config.resolveIntervalMs}ms)`);
  }

  /** Stop the resolution timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Record a metric data point. Called by domain event handlers. */
  recordMetric(metric: string, value: number, domain: PredictionDomain = 'metric'): void {
    this.db.prepare(`
      INSERT INTO prediction_metrics (metric, value, domain, timestamp) VALUES (?, ?, ?, ?)
    `).run(metric, value, domain, Date.now());
  }

  /**
   * Generate a prediction for a specific metric.
   * Returns null if insufficient data or confidence too low.
   */
  predict(input: PredictionInput): Prediction | null {
    const horizonMs = input.horizon_ms ?? this.config.defaultHorizonMs;
    const history = this.getMetricHistory(input.metric, 100);

    if (history.length < 2) return null;

    const data = history.map(h => h.value);
    const forecast = this.forecast(data, horizonMs);

    // Apply calibration
    const calibratedConfidence = this.applyCalibration(forecast.confidence);
    if (calibratedConfidence < this.config.minConfidence) return null;

    const now = Date.now();
    const prediction: Prediction = {
      prediction_id: randomUUID(),
      domain: input.domain,
      metric: input.metric,
      predicted_value: forecast.value,
      predicted_direction: forecast.direction,
      confidence: calibratedConfidence,
      horizon_ms: horizonMs,
      reasoning: input.reasoning ?? `${forecast.method} forecast (${forecast.dataPoints} points, trend: ${forecast.trend.toFixed(4)})`,
      method: forecast.method,
      status: 'pending',
      created_at: now,
      expires_at: now + this.config.expirationMs,
      evidence: {
        ...input.evidence,
        dataPoints: forecast.dataPoints,
        trend: forecast.trend,
        rawConfidence: forecast.confidence,
        calibrationOffset: this.calibrationOffset,
      },
    };

    this.tracker.store(prediction);

    // Update state
    this.db.prepare(`
      UPDATE prediction_state SET total_predictions = total_predictions + 1, updated_at = datetime('now') WHERE id = 1
    `).run();

    // Emit thought
    this.thoughtStream?.emit(
      'prediction',
      'predicting',
      `Predicted ${input.metric}: ${forecast.direction} to ${forecast.value.toFixed(2)} (${(calibratedConfidence * 100).toFixed(0)}% confidence)`,
      calibratedConfidence > 0.7 ? 'notable' : 'routine',
    );

    // Journal high-confidence predictions
    if (calibratedConfidence > 0.6 && this.journal) {
      try {
        this.journal.recordDiscovery(
          `Prediction: ${input.metric} → ${forecast.direction}`,
          `Forecasted ${input.metric} will go ${forecast.direction} to ${forecast.value.toFixed(2)} within ${(horizonMs / 60_000).toFixed(0)}min. Method: ${forecast.method}, confidence: ${(calibratedConfidence * 100).toFixed(0)}%.`,
          { prediction_id: prediction.prediction_id, ...prediction.evidence },
          calibratedConfidence > 0.8 ? 'notable' : 'routine',
        );
      } catch { /* best effort */ }
    }

    return prediction;
  }

  /**
   * Auto-predict for all tracked metrics that have enough data.
   * Skips metrics with pending predictions. Respects maxPredictionsPerCycle.
   */
  autoPredictAll(): Prediction[] {
    const trackedMetrics = this.getTrackedMetrics();
    const pendingMetrics = this.tracker.getMetricsWithPending();
    const predictions: Prediction[] = [];

    for (const { metric, domain } of trackedMetrics) {
      if (predictions.length >= this.config.maxPredictionsPerCycle) break;
      if (pendingMetrics.has(metric)) continue;

      const prediction = this.predict({ domain, metric });
      if (prediction) predictions.push(prediction);
    }

    return predictions;
  }

  /**
   * Resolve expired/due predictions against current metric values.
   * Returns count of resolved predictions.
   */
  resolveExpired(): number {
    let resolved = 0;

    // 1. Mark truly expired (past expiration, no data)
    const expired = this.tracker.getPendingExpired();
    for (const pred of expired) {
      this.tracker.markExpired(pred.prediction_id);
      resolved++;
    }

    // 2. Resolve predictions past their horizon
    const resolvable = this.tracker.getPendingResolvable();
    for (const pred of resolvable) {
      // Get the average of the 10 most recent metric values recorded after the prediction was made
      const row = this.db.prepare(`
        SELECT AVG(value) as avg_value FROM (
          SELECT value FROM prediction_metrics
          WHERE metric = ? AND timestamp > ?
          ORDER BY timestamp DESC LIMIT 10
        )
      `).get(pred.metric, pred.created_at) as { avg_value: number | null } | undefined;

      if (row?.avg_value != null) {
        this.tracker.resolve(pred.prediction_id, row.avg_value);
        resolved++;
      }
    }

    // 3. Recalibrate if we resolved anything
    if (resolved > 0) {
      this.recalibrate();
    }

    return resolved;
  }

  /** List predictions with optional filters. */
  list(domain?: PredictionDomain, status?: PredictionStatus, limit?: number): Prediction[] {
    return this.tracker.list(domain, status, limit);
  }

  /** Get accuracy statistics. */
  getAccuracy(domain?: PredictionDomain): PredictionAccuracy[] {
    return this.tracker.getAccuracy(domain);
  }

  /** Get full prediction summary. */
  getSummary(): PredictionSummary {
    const state = this.db.prepare('SELECT * FROM prediction_state WHERE id = 1').get() as Record<string, unknown> | undefined;
    const accuracy = this.tracker.getAccuracy();
    const recent = this.tracker.list(undefined, undefined, 10);

    const totalPredictions = (state?.total_predictions as number) ?? 0;
    const pending = this.tracker.list(undefined, 'pending', 1000).length;
    const resolved = totalPredictions - pending;

    // Overall accuracy
    const totalCorrect = accuracy.reduce((sum, a) => sum + a.correct, 0);
    const totalResolved = accuracy.reduce((sum, a) => sum + a.total - a.expired, 0);

    return {
      total_predictions: totalPredictions,
      pending,
      resolved,
      accuracy_rate: totalResolved > 0 ? totalCorrect / totalResolved : 0,
      by_domain: accuracy,
      calibration_offset: this.calibrationOffset,
      recent,
    };
  }

  /** Run a forecast on raw data. Uses Holt-Winters (≥ minDataPoints) or EWMA. */
  forecast(data: number[], _horizonMs: number): ForecastResult {
    // steps = horizon / avg interval between data points (default 1)
    const steps = 1;

    if (data.length >= this.config.minDataPoints) {
      return holtWintersForecast(data, steps, this.config.ewmaAlpha, this.config.trendBeta);
    }
    return ewmaForecast(data, this.config.ewmaAlpha);
  }

  /** Get metric history as time series. */
  getMetricHistory(metric: string, limit = 100): MetricDataPoint[] {
    return this.db.prepare(`
      SELECT value, timestamp FROM prediction_metrics
      WHERE metric = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(metric, limit) as MetricDataPoint[];
  }

  // ── Private ─────────────────────────────────────────────

  /** Periodic cycle: resolve + auto-predict. */
  private cycle(): void {
    const resolved = this.resolveExpired();
    if (resolved > 0) {
      this.log.debug(`[prediction] Resolved ${resolved} predictions`);
    }
  }

  /** Recalibrate confidence offset based on historical accuracy. */
  private recalibrate(): void {
    this.calibrationOffset = this.tracker.getCalibrationOffset();
    this.db.prepare(`
      UPDATE prediction_state SET calibration_offset = ?, updated_at = datetime('now') WHERE id = 1
    `).run(this.calibrationOffset);
  }

  /** Apply calibration to raw confidence. */
  private applyCalibration(rawConfidence: number): number {
    const buckets = this.tracker.getCalibrationBuckets();
    return calibrateConfidence(rawConfidence, buckets);
  }

  /** Get all unique tracked metrics with their domains. */
  private getTrackedMetrics(): Array<{ metric: string; domain: PredictionDomain }> {
    return this.db.prepare(`
      SELECT DISTINCT metric, domain FROM prediction_metrics
      GROUP BY metric
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
    `).all() as Array<{ metric: string; domain: PredictionDomain }>;
  }
}
