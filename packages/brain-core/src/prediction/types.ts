// ── Prediction Engine Types ─────────────────────────────────

export type PredictionDomain = 'error' | 'trade' | 'engagement' | 'metric' | 'custom' | 'scanner' | 'codegen';

export type PredictionStatus = 'pending' | 'correct' | 'wrong' | 'expired' | 'partial';

export interface PredictionEngineConfig {
  brainName: string;
  /** Default forecast horizon in ms. Default: 3_600_000 (1h) */
  defaultHorizonMs?: number;
  /** Max time before prediction expires in ms. Default: 86_400_000 (24h) */
  expirationMs?: number;
  /** EWMA smoothing factor (0–1). Default: 0.3 */
  ewmaAlpha?: number;
  /** Holt-Winters trend smoothing factor (0–1). Default: 0.1 */
  trendBeta?: number;
  /** Min data points for Holt-Winters (falls back to EWMA below). Default: 5 */
  minDataPoints?: number;
  /** Predictions below this confidence are suppressed. Default: 0.3 */
  minConfidence?: number;
  /** Max predictions generated per autoPredictAll cycle. Default: 5 */
  maxPredictionsPerCycle?: number;
  /** Interval for resolving expired predictions in ms. Default: 60_000 (1 min) */
  resolveIntervalMs?: number;
}

export interface Prediction {
  prediction_id: string;
  domain: PredictionDomain;
  metric: string;
  predicted_value: number;
  predicted_direction: 'up' | 'down' | 'stable';
  confidence: number;
  horizon_ms: number;
  reasoning: string;
  method: 'ewma' | 'holt_winters';
  status: PredictionStatus;
  actual_value?: number;
  error?: number;
  created_at: number;
  resolved_at?: number;
  expires_at: number;
  evidence: Record<string, unknown>;
}

export interface PredictionAccuracy {
  domain: PredictionDomain;
  total: number;
  correct: number;
  wrong: number;
  partial: number;
  expired: number;
  accuracy_rate: number;
  mean_absolute_error: number;
  calibration_score: number;
  direction_accuracy: number;
}

export interface PredictionSummary {
  total_predictions: number;
  pending: number;
  resolved: number;
  accuracy_rate: number;
  by_domain: PredictionAccuracy[];
  calibration_offset: number;
  recent: Prediction[];
}

export interface ForecastResult {
  value: number;
  trend: number;
  confidence: number;
  direction: 'up' | 'down' | 'stable';
  method: 'ewma' | 'holt_winters';
  dataPoints: number;
}

export interface PredictionInput {
  domain: PredictionDomain;
  metric: string;
  horizon_ms?: number;
  reasoning?: string;
  evidence?: Record<string, unknown>;
}

export interface MetricDataPoint {
  value: number;
  timestamp: number;
}

export interface CalibrationBucket {
  range_start: number;
  range_end: number;
  predicted_count: number;
  actual_accuracy: number;
}
