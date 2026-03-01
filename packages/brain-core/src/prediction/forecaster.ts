// ── Prediction Forecaster — Pure Math ────────────────────────
//
// Holt-Winters Double Exponential Smoothing + EWMA fallback.
// No DB dependency — pure functions, easy to test.

import type { ForecastResult, CalibrationBucket } from './types.js';

/**
 * Holt-Winters Double Exponential Smoothing.
 * Requires ≥ 5 data points. Returns forecast + trend + confidence.
 *
 * Level:    l_t = α * y_t + (1-α) * (l_{t-1} + b_{t-1})
 * Trend:    b_t = β * (l_t - l_{t-1}) + (1-β) * b_{t-1}
 * Forecast: ŷ_{t+h} = l_t + h * b_t
 */
export function holtWintersForecast(
  data: number[],
  stepsAhead: number,
  alpha = 0.3,
  beta = 0.1,
): ForecastResult {
  if (data.length < 2) {
    return { value: data[0] ?? 0, trend: 0, confidence: 0.1, direction: 'stable', method: 'holt_winters', dataPoints: data.length };
  }

  // Initialize level and trend
  let level = data[0]!;
  let trend = data[1]! - data[0]!;

  const residuals: number[] = [];

  for (let t = 1; t < data.length; t++) {
    const y = data[t]!;
    const prevLevel = level;

    // Update level
    level = alpha * y + (1 - alpha) * (prevLevel + trend);

    // Update trend
    trend = beta * (level - prevLevel) + (1 - beta) * trend;

    // Track residuals for confidence calculation
    const predicted = prevLevel + trend;
    residuals.push(Math.abs(y - predicted));
  }

  // Forecast
  const value = level + stepsAhead * trend;

  // Confidence based on normalized MAE (1 - MAE/range)
  const mae = residuals.length > 0
    ? residuals.reduce((a, b) => a + b, 0) / residuals.length
    : 0;
  const range = Math.max(...data) - Math.min(...data);
  const normalizedMae = range > 0 ? mae / range : 0;
  const confidence = Math.max(0.05, Math.min(0.95, 1 - normalizedMae));

  // Direction
  const trendRatio = range > 0 ? Math.abs(trend) / range : 0;
  let direction: 'up' | 'down' | 'stable';
  if (trendRatio < 0.02) {
    direction = 'stable';
  } else {
    direction = trend > 0 ? 'up' : 'down';
  }

  return {
    value,
    trend,
    confidence,
    direction,
    method: 'holt_winters',
    dataPoints: data.length,
  };
}

/**
 * Exponentially Weighted Moving Average.
 * Fallback for < 5 data points.
 */
export function ewmaForecast(data: number[], alpha = 0.3): ForecastResult {
  if (data.length === 0) {
    return { value: 0, trend: 0, confidence: 0.1, direction: 'stable', method: 'ewma', dataPoints: 0 };
  }

  if (data.length === 1) {
    return { value: data[0]!, trend: 0, confidence: 0.15, direction: 'stable', method: 'ewma', dataPoints: 1 };
  }

  let ewma = data[0]!;
  for (let i = 1; i < data.length; i++) {
    ewma = alpha * data[i]! + (1 - alpha) * ewma;
  }

  // Simple trend from last two values
  const last = data[data.length - 1]!;
  const prev = data[data.length - 2]!;
  const trend = last - prev;

  // Low confidence for few data points
  const confidence = Math.min(0.5, 0.15 + data.length * 0.08);

  // Direction
  const range = Math.max(...data) - Math.min(...data);
  const trendRatio = range > 0 ? Math.abs(trend) / range : 0;
  let direction: 'up' | 'down' | 'stable';
  if (trendRatio < 0.05) {
    direction = 'stable';
  } else {
    direction = trend > 0 ? 'up' : 'down';
  }

  return {
    value: ewma,
    trend,
    confidence,
    direction,
    method: 'ewma',
    dataPoints: data.length,
  };
}

/**
 * Calibrate raw confidence using historical accuracy buckets.
 * If the model was overconfident in a range, it adjusts downward — and vice versa.
 *
 * Returns value clamped to [0.01, 0.99].
 */
export function calibrateConfidence(rawConfidence: number, buckets: CalibrationBucket[]): number {
  if (buckets.length === 0) return Math.max(0.01, Math.min(0.99, rawConfidence));

  // Find the matching bucket
  const bucket = buckets.find(b => rawConfidence >= b.range_start && rawConfidence < b.range_end);
  if (!bucket || bucket.predicted_count < 3) {
    // Not enough data in this bucket — return raw
    return Math.max(0.01, Math.min(0.99, rawConfidence));
  }

  // Adjust: if predicted 0.8 confidence but actual accuracy was 0.6, offset = -0.2
  const midpoint = (bucket.range_start + bucket.range_end) / 2;
  const offset = bucket.actual_accuracy - midpoint;
  const adjusted = rawConfidence + offset;

  return Math.max(0.01, Math.min(0.99, adjusted));
}
