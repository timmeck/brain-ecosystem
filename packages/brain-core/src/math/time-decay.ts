/**
 * Exponential time-decay factor based on half-life.
 * Returns a multiplier between 0 and 1 — recent items are near 1.0,
 * older items decay toward 0.
 *
 * @param lastActivatedAt ISO date string of last activation
 * @param halfLifeDays Number of days for half-life
 * @returns Decay factor (0-1)
 */
export function timeDecayFactor(lastActivatedAt: string, halfLifeDays: number): number {
  const now = Date.now();
  const activated = new Date(lastActivatedAt).getTime();
  const ageDays = (now - activated) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}
