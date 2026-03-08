import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { PortfolioOptimizer } from '../portfolio-optimizer.js';

describe('PortfolioOptimizer', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates with default config', () => {
    const opt = new PortfolioOptimizer(db);
    const history = opt.getHistory();
    expect(history).toHaveLength(0);
  });

  it('calculates position size based on Kelly criterion', () => {
    const opt = new PortfolioOptimizer(db);
    const rec = opt.calcPositionSize(10000, 'BTC', 0.6, 100, 50, []);
    expect(rec.symbol).toBe('BTC');
    expect(rec.recommendedSize).toBeGreaterThan(0);
    expect(rec.kellyPct).toBeGreaterThan(0);
    expect(rec.diversificationOk).toBe(true);
  });

  it('caps position at maxPositionPct', () => {
    const opt = new PortfolioOptimizer(db, { maxPositionPct: 5 });
    const rec = opt.calcPositionSize(10000, 'BTC', 0.9, 200, 50, []);
    expect(rec.recommendedSize).toBeLessThanOrEqual(500); // 5% of 10000
  });

  it('limits concentration in single asset', () => {
    const opt = new PortfolioOptimizer(db, { maxConcentrationPct: 20 });
    const existing = [
      { symbol: 'BTC', usdtAmount: 1500 }, // already 15% of 10000
    ];
    const rec = opt.calcPositionSize(10000, 'BTC', 0.7, 100, 50, existing);
    // Max 20% concentration = 2000 total, 1500 existing → max 500 more
    expect(rec.recommendedSize).toBeLessThanOrEqual(500);
  });

  it('returns 0 size when fully concentrated', () => {
    const opt = new PortfolioOptimizer(db, { maxConcentrationPct: 10 });
    const existing = [{ symbol: 'BTC', usdtAmount: 1000 }]; // already at 10%
    const rec = opt.calcPositionSize(10000, 'BTC', 0.7, 100, 50, existing);
    expect(rec.recommendedSize).toBe(0);
  });

  it('handles zero equity', () => {
    const opt = new PortfolioOptimizer(db);
    const rec = opt.calcPositionSize(0, 'BTC', 0.6, 100, 50, []);
    expect(rec.recommendedSize).toBe(0);
  });

  it('handles zero loss (no loss ratio)', () => {
    const opt = new PortfolioOptimizer(db);
    const rec = opt.calcPositionSize(10000, 'ETH', 0.6, 100, 0, []);
    expect(rec.recommendedSize).toBeGreaterThanOrEqual(0);
  });

  it('checks portfolio health with positions', () => {
    const opt = new PortfolioOptimizer(db);
    const health = opt.checkHealth(10000, [
      { symbol: 'BTC', usdtAmount: 2000 },
      { symbol: 'ETH', usdtAmount: 1500 },
      { symbol: 'SOL', usdtAmount: 1000 },
    ]);
    expect(health.positionCount).toBe(3);
    expect(health.largestPositionPct).toBe(20);
    expect(health.smallestPositionPct).toBe(10);
    expect(health.diversificationScore).toBeGreaterThan(0);
    expect(health.concentrationRisk).toBe('medium'); // 20% > 25%*0.7 = 17.5%
  });

  it('detects high concentration risk', () => {
    const opt = new PortfolioOptimizer(db, { maxConcentrationPct: 20 });
    const health = opt.checkHealth(10000, [
      { symbol: 'BTC', usdtAmount: 5000 }, // 50%!
      { symbol: 'ETH', usdtAmount: 500 },
    ]);
    expect(health.concentrationRisk).toBe('high');
    expect(health.recommendations.length).toBeGreaterThan(0);
  });

  it('warns about low diversification', () => {
    const opt = new PortfolioOptimizer(db, { minDiversification: 5 });
    const health = opt.checkHealth(10000, [
      { symbol: 'BTC', usdtAmount: 2000 },
      { symbol: 'ETH', usdtAmount: 2000 },
    ]);
    expect(health.recommendations.some(r => r.includes('diversification'))).toBe(true);
  });

  it('returns empty health for no positions', () => {
    const opt = new PortfolioOptimizer(db);
    const health = opt.checkHealth(10000, []);
    expect(health.positionCount).toBe(0);
    expect(health.concentrationRisk).toBe('low');
  });

  it('records snapshots', () => {
    const opt = new PortfolioOptimizer(db);
    opt.checkHealth(10000, [{ symbol: 'BTC', usdtAmount: 1000 }]);
    opt.checkHealth(12000, [{ symbol: 'BTC', usdtAmount: 1200 }]);
    const history = opt.getHistory();
    expect(history).toHaveLength(2);
  });

  it('needsRebalance detects drift', () => {
    const opt = new PortfolioOptimizer(db, { rebalanceThresholdPct: 5 });
    expect(opt.needsRebalance(15, 10)).toBe(true);
    expect(opt.needsRebalance(11, 10)).toBe(false);
  });
});
