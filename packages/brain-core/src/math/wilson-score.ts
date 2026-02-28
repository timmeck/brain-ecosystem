/**
 * Wilson Score Interval lower bound for low-sample-size confidence.
 * Prevents unrealistic 100% from single success/failure.
 *
 * @param successes Number of successes
 * @param total Total number of trials
 * @param z Z-score for confidence level (1.64=90%, 1.96=95%, 2.33=99%)
 * @returns Conservative lower bound estimate (0-1)
 */
export function wilsonScore(successes: number, total: number, z: number = 1.96): number {
  if (total === 0) return 0;

  const p = successes / total;
  const z2 = z * z;
  const n = total;

  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);

  return Math.max(0, (centre - spread) / denominator);
}
