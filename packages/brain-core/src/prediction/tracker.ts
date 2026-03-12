// ── Prediction Tracker — DB-backed Storage + Resolution ──────

import type Database from 'better-sqlite3';
import type {
  Prediction,
  PredictionDomain,
  PredictionStatus,
  PredictionAccuracy,
  CalibrationBucket,
} from './types.js';

export class PredictionTracker {
  constructor(private db: Database.Database) {}

  /** Store a new prediction in the DB. */
  store(prediction: Prediction): string {
    this.db.prepare(`
      INSERT INTO predictions (
        prediction_id, domain, metric, predicted_value, predicted_direction,
        confidence, horizon_ms, reasoning, method, status,
        created_at, expires_at, evidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prediction.prediction_id,
      prediction.domain,
      prediction.metric,
      prediction.predicted_value,
      prediction.predicted_direction,
      prediction.confidence,
      prediction.horizon_ms,
      prediction.reasoning,
      prediction.method,
      prediction.status,
      prediction.created_at,
      prediction.expires_at,
      JSON.stringify(prediction.evidence),
    );
    return prediction.prediction_id;
  }

  /** Resolve a prediction against actual value. Returns the determined status. */
  resolve(predictionId: string, actualValue: number): PredictionStatus {
    const row = this.db.prepare(`
      SELECT * FROM predictions WHERE prediction_id = ?
    `).get(predictionId) as Record<string, unknown> | undefined;

    if (!row) return 'expired';

    const predicted = row.predicted_value as number;
    const predictedDir = row.predicted_direction as string;

    // Calculate error
    const error = predicted !== 0
      ? Math.abs(predicted - actualValue) / Math.abs(predicted)
      : Math.abs(actualValue);

    // Determine actual direction
    let actualDir: string;
    if (actualValue > predicted * 1.02) actualDir = 'up';
    else if (actualValue < predicted * 0.98) actualDir = 'down';
    else actualDir = 'stable';

    const directionCorrect = predictedDir === actualDir;

    // Determine status
    let status: PredictionStatus;
    if (error < 0.10 && directionCorrect) {
      status = 'correct';
    } else if (error < 0.25 || directionCorrect) {
      status = 'partial';
    } else {
      status = 'wrong';
    }

    const now = Date.now();
    this.db.prepare(`
      UPDATE predictions SET
        status = ?, actual_value = ?, error = ?, resolved_at = ?
      WHERE prediction_id = ?
    `).run(status, actualValue, error, now, predictionId);

    return status;
  }

  /** List predictions with optional filters. */
  list(domain?: PredictionDomain, status?: PredictionStatus, limit = 50): Prediction[] {
    let sql = 'SELECT * FROM predictions WHERE 1=1';
    const params: unknown[] = [];

    if (domain) {
      sql += ' AND domain = ?';
      params.push(domain);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToPrediction(r));
  }

  /** Get accuracy statistics, optionally by domain. */
  getAccuracy(domain?: PredictionDomain): PredictionAccuracy[] {
    let sql = `
      SELECT
        domain,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) as correct,
        SUM(CASE WHEN status = 'wrong' THEN 1 ELSE 0 END) as wrong,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
        AVG(CASE WHEN error IS NOT NULL THEN error ELSE NULL END) as mean_error,
        AVG(confidence) as avg_confidence
      FROM predictions
      WHERE status != 'pending'
    `;
    const params: unknown[] = [];

    if (domain) {
      sql += ' AND domain = ?';
      params.push(domain);
    }

    sql += ' GROUP BY domain';

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map(r => {
      const total = (r.total as number) || 0;
      const correct = (r.correct as number) || 0;
      const wrong = (r.wrong as number) || 0;
      const partial = (r.partial as number) || 0;
      const expired = (r.expired as number) || 0;

      // Direction accuracy: correct + partial count as direction-correct
      const resolved = total - expired;
      const directionCorrect = correct + partial;

      // Calibration score: how close avg confidence is to actual accuracy
      const actualAccuracy = resolved > 0 ? correct / resolved : 0;
      const avgConfidence = (r.avg_confidence as number) || 0;
      const calibrationScore = 1 - Math.abs(actualAccuracy - avgConfidence);

      return {
        domain: r.domain as PredictionDomain,
        total,
        correct,
        wrong,
        partial,
        expired,
        accuracy_rate: resolved > 0 ? (correct + partial * 0.5) / resolved : 0,
        mean_absolute_error: (r.mean_error as number) || 0,
        calibration_score: Math.max(0, calibrationScore),
        direction_accuracy: resolved > 0 ? directionCorrect / resolved : 0,
      };
    });
  }

  /** Get calibration offset — average (confidence - actual_accuracy) across buckets. */
  getCalibrationOffset(): number {
    const buckets = this.getCalibrationBuckets();
    if (buckets.length === 0) return 0;

    let totalOffset = 0;
    let count = 0;
    for (const b of buckets) {
      if (b.predicted_count >= 3) {
        const midpoint = (b.range_start + b.range_end) / 2;
        totalOffset += midpoint - b.actual_accuracy;
        count++;
      }
    }

    return count > 0 ? totalOffset / count : 0;
  }

  /** Get calibration buckets for confidence adjustment. */
  getCalibrationBuckets(): CalibrationBucket[] {
    const bucketRanges = [
      [0.0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01],
    ] as const;

    const buckets: CalibrationBucket[] = [];

    for (const [start, end] of bucketRanges) {
      const row = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) as correct
        FROM predictions
        WHERE status != 'pending'
          AND confidence >= ? AND confidence < ?
      `).get(start, end) as Record<string, unknown>;

      const total = (row.total as number) ?? 0;
      const correct = (row.correct as number) ?? 0;

      buckets.push({
        range_start: start,
        range_end: end === 1.01 ? 1.0 : end,
        predicted_count: total,
        actual_accuracy: total > 0 ? correct / total : 0,
      });
    }

    return buckets;
  }

  /** Get pending predictions that have expired (past expires_at). */
  getPendingExpired(): Prediction[] {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT * FROM predictions
      WHERE status = 'pending' AND expires_at < ?
      ORDER BY created_at ASC
    `).all(now) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToPrediction(r));
  }

  /** Get pending predictions that are within their horizon (ready for resolution check). */
  getPendingResolvable(): Prediction[] {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT * FROM predictions
      WHERE status = 'pending' AND (created_at + horizon_ms) <= ? AND expires_at >= ?
      ORDER BY created_at ASC
    `).all(now, now) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToPrediction(r));
  }

  /** Mark a prediction as expired. */
  markExpired(predictionId: string): void {
    this.db.prepare(`
      UPDATE predictions SET status = 'expired', resolved_at = ? WHERE prediction_id = ?
    `).run(Date.now(), predictionId);
  }

  /** Get metrics with pending predictions (to skip in autoPredictAll). */
  getMetricsWithPending(): Set<string> {
    const rows = this.db.prepare(`
      SELECT DISTINCT metric FROM predictions WHERE status = 'pending'
    `).all() as Array<{ metric: string }>;
    return new Set(rows.map(r => r.metric));
  }

  private rowToPrediction(r: Record<string, unknown>): Prediction {
    return {
      prediction_id: r.prediction_id as string,
      domain: r.domain as PredictionDomain,
      metric: r.metric as string,
      predicted_value: r.predicted_value as number,
      predicted_direction: r.predicted_direction as 'up' | 'down' | 'stable',
      confidence: r.confidence as number,
      horizon_ms: r.horizon_ms as number,
      reasoning: r.reasoning as string,
      method: r.method as 'ewma' | 'holt_winters',
      status: r.status as PredictionStatus,
      actual_value: r.actual_value as number | undefined,
      error: r.error as number | undefined,
      created_at: r.created_at as number,
      resolved_at: r.resolved_at as number | undefined,
      expires_at: r.expires_at as number,
      evidence: typeof r.evidence === 'string' ? JSON.parse(r.evidence as string) : (r.evidence as Record<string, unknown>) ?? {},
    };
  }
}
