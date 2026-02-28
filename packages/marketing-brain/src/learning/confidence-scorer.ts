// Re-export from brain-core
export { wilsonScore } from '@timmeck/brain-core';

/**
 * Compute engagement score from raw metrics.
 * Weights: shares > comments > clicks > likes > impressions
 */
export function engagementScore(metrics: {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
  clicks?: number;
  saves?: number;
}): number {
  return (
    (metrics.likes ?? 0) * 1 +
    (metrics.comments ?? 0) * 3 +
    (metrics.shares ?? 0) * 5 +
    (metrics.clicks ?? 0) * 2 +
    (metrics.saves ?? 0) * 4 +
    (metrics.impressions ?? 0) * 0.01
  );
}
