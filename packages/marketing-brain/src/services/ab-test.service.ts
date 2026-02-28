import type { ABTestRepository, ABTest, ABTestCreate } from '../db/repositories/ab-test.repository.js';
import { getLogger } from '../utils/logger.js';

export interface ABTestResult {
  test: ABTest;
  a_avg: number;
  b_avg: number;
  winner: 'a' | 'b' | 'tie' | null;
  significance: number;
  isSignificant: boolean;
}

export class ABTestService {
  private logger = getLogger();

  constructor(private abTestRepo: ABTestRepository) {}

  create(data: ABTestCreate): ABTest {
    const id = this.abTestRepo.create(data);
    const test = this.abTestRepo.getById(id)!;
    this.logger.info(`A/B test created: ${test.name} (#${test.id})`);
    return test;
  }

  recordDataPoint(testId: number, variant: 'a' | 'b', metricValue: number): ABTestResult {
    const test = this.abTestRepo.getById(testId);
    if (!test) throw new Error(`A/B test #${testId} not found`);
    if (test.status !== 'running') throw new Error(`A/B test #${testId} is not running (status: ${test.status})`);

    this.abTestRepo.recordDataPoint(testId, variant, metricValue);

    // Update aggregates
    const newSamples = variant === 'a' ? test.a_samples + 1 : test.b_samples;
    const newSamplesB = variant === 'b' ? test.b_samples + 1 : test.b_samples;
    const newSum = variant === 'a' ? test.a_metric_sum + metricValue : test.a_metric_sum;
    const newSumB = variant === 'b' ? test.b_metric_sum + metricValue : test.b_metric_sum;

    const aSamples = variant === 'a' ? newSamples : test.a_samples;
    const bSamples = newSamplesB;
    const aSum = newSum;
    const bSum = newSumB;

    // Compute significance using Welch's t-test approximation
    const { significance, winner } = this.computeSignificance(testId, aSamples, bSamples, aSum, bSum);

    // Auto-complete if significance is high and we have enough samples
    const isSignificant = significance >= 0.95;
    const enoughSamples = aSamples >= 10 && bSamples >= 10;
    const shouldComplete = isSignificant && enoughSamples;

    this.abTestRepo.update(testId, {
      a_samples: aSamples,
      b_samples: bSamples,
      a_metric_sum: aSum,
      b_metric_sum: bSum,
      significance,
      winner: shouldComplete ? winner : test.winner,
      status: shouldComplete ? 'completed' : 'running',
      completed_at: shouldComplete ? new Date().toISOString() : null,
    });

    const updated = this.abTestRepo.getById(testId)!;

    if (shouldComplete) {
      this.logger.info(`A/B test #${testId} auto-completed: winner=${winner}, significance=${significance.toFixed(3)}`);
    }

    return {
      test: updated,
      a_avg: aSamples > 0 ? aSum / aSamples : 0,
      b_avg: bSamples > 0 ? bSum / bSamples : 0,
      winner,
      significance,
      isSignificant,
    };
  }

  getStatus(testId: number): ABTestResult {
    const test = this.abTestRepo.getById(testId);
    if (!test) throw new Error(`A/B test #${testId} not found`);

    const aAvg = test.a_samples > 0 ? test.a_metric_sum / test.a_samples : 0;
    const bAvg = test.b_samples > 0 ? test.b_metric_sum / test.b_samples : 0;

    let winner: 'a' | 'b' | 'tie' | null = test.winner as 'a' | 'b' | 'tie' | null;
    if (!winner && test.a_samples > 0 && test.b_samples > 0) {
      if (aAvg > bAvg) winner = 'a';
      else if (bAvg > aAvg) winner = 'b';
      else winner = 'tie';
    }

    return {
      test,
      a_avg: aAvg,
      b_avg: bAvg,
      winner,
      significance: test.significance,
      isSignificant: test.significance >= 0.95,
    };
  }

  listAll(limit: number = 50): ABTest[] {
    return this.abTestRepo.listAll(limit);
  }

  listByStatus(status: string, limit: number = 50): ABTest[] {
    return this.abTestRepo.listByStatus(status, limit);
  }

  /**
   * Compute statistical significance using a simplified z-test on proportions.
   * Returns a value 0-1 representing confidence that there is a real difference.
   */
  private computeSignificance(
    testId: number,
    aSamples: number, bSamples: number,
    aSum: number, bSum: number,
  ): { significance: number; winner: 'a' | 'b' | 'tie' } {
    if (aSamples < 2 || bSamples < 2) {
      return { significance: 0, winner: 'tie' };
    }

    const aAvg = aSum / aSamples;
    const bAvg = bSum / bSamples;

    // Get data points for variance calculation
    const aData = this.abTestRepo.getDataByVariant(testId, 'a');
    const bData = this.abTestRepo.getDataByVariant(testId, 'b');

    const aVar = this.variance(aData.map(d => d.metric_value), aAvg);
    const bVar = this.variance(bData.map(d => d.metric_value), bAvg);

    // Standard error of the difference
    const se = Math.sqrt((aVar / aSamples) + (bVar / bSamples));

    if (se === 0) {
      return {
        significance: aAvg === bAvg ? 0 : 1,
        winner: aAvg > bAvg ? 'a' : aAvg < bAvg ? 'b' : 'tie',
      };
    }

    // Z-score
    const z = Math.abs(aAvg - bAvg) / se;

    // Approximate p-value from z-score using a simple approximation
    // P(Z > z) ≈ erfc(z/sqrt(2))/2
    const significance = 1 - 2 * this.normalCdf(-z);

    const winner: 'a' | 'b' | 'tie' = aAvg > bAvg ? 'a' : aAvg < bAvg ? 'b' : 'tie';

    return { significance: Math.min(1, Math.max(0, significance)), winner };
  }

  private variance(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const sumSquares = values.reduce((s, v) => s + (v - mean) ** 2, 0);
    return sumSquares / (values.length - 1);
  }

  /**
   * Standard normal CDF approximation (Abramowitz & Stegun)
   */
  private normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.SQRT2;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }
}
