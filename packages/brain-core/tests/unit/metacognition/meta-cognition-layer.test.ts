import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MetaCognitionLayer } from '../../../src/metacognition/meta-cognition-layer.js';

describe('MetaCognitionLayer', () => {
  let db: Database.Database;
  let layer: MetaCognitionLayer;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    layer = new MetaCognitionLayer(db);
  });

  it('should create tables on construction', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('engine_metrics', 'engine_report_cards', 'cycle_frequency_adjustments')",
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('engine_metrics');
    expect(names).toContain('engine_report_cards');
    expect(names).toContain('cycle_frequency_adjustments');
  });

  it('should record engine step metrics', () => {
    layer.recordStep('self_observer', 1, { insights: 3, duration_ms: 150 });
    const rows = db.prepare('SELECT * FROM engine_metrics WHERE engine = ?').all('self_observer') as { insights: number; duration_ms: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].insights).toBe(3);
    expect(rows[0].duration_ms).toBe(150);
  });

  it('should accumulate metrics for same engine+cycle', () => {
    layer.recordStep('obs', 1, { insights: 2 });
    layer.recordStep('obs', 1, { insights: 3 });
    const rows = db.prepare('SELECT insights FROM engine_metrics WHERE engine = ? AND cycle = ?').all('obs', 1) as { insights: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].insights).toBe(5);
  });

  it('should evaluate engines and produce report cards', () => {
    // Record some good metrics for engine A
    for (let i = 1; i <= 5; i++) {
      layer.recordStep('good_engine', i, { insights: 2, journal_entries: 1, thoughts: 5, errors: 0, duration_ms: 100 });
    }
    // Record some bad metrics for engine B
    for (let i = 1; i <= 5; i++) {
      layer.recordStep('bad_engine', i, { insights: 0, journal_entries: 0, thoughts: 10, errors: 3, duration_ms: 4000 });
    }

    const cards = layer.evaluate(5);
    expect(cards.length).toBe(2);

    const good = cards.find(c => c.engine === 'good_engine')!;
    const bad = cards.find(c => c.engine === 'bad_engine')!;

    expect(good.combined_score).toBeGreaterThan(bad.combined_score);
    expect(['A', 'B']).toContain(good.grade);
    expect(['D', 'F']).toContain(bad.grade);
  });

  it('should adjust frequencies based on grades', () => {
    const cards = [
      { engine: 'fast', grade: 'A' as const, health_score: 0.9, value_score: 0.9, signal_to_noise: 0.8, combined_score: 0.9 },
      { engine: 'slow', grade: 'F' as const, health_score: 0.1, value_score: 0.0, signal_to_noise: 0.0, combined_score: 0.05 },
    ];

    const adjustments = layer.adjustFrequencies(cards);
    // 'fast' starts at 1, A grade but can't go below 1
    // 'slow' starts at 1, F grade → should increase frequency (run less often)
    const slowAdj = adjustments.find(a => a.engine === 'slow');
    expect(slowAdj).toBeDefined();
    expect(slowAdj!.new_frequency).toBe(2);
    expect(layer.getFrequency('slow')).toBe(2);
  });

  it('should check shouldRun based on frequency', () => {
    // Default frequency is 1 — runs every cycle
    expect(layer.shouldRun('anything', 1)).toBe(true);
    expect(layer.shouldRun('anything', 2)).toBe(true);

    // Set custom frequency
    layer.adjustFrequencies([
      { engine: 'rare', grade: 'F' as const, health_score: 0, value_score: 0, signal_to_noise: 0, combined_score: 0 },
    ]);
    // Now frequency is 2 — runs every other cycle
    expect(layer.shouldRun('rare', 2)).toBe(true);
    expect(layer.shouldRun('rare', 3)).toBe(false);
    expect(layer.shouldRun('rare', 4)).toBe(true);
  });

  it('should get latest report cards', () => {
    layer.recordStep('eng1', 1, { insights: 1, thoughts: 2 });
    layer.recordStep('eng2', 1, { insights: 0, errors: 1, thoughts: 5 });
    layer.evaluate(1);

    const cards = layer.getLatestReportCards();
    expect(cards.length).toBe(2);
    expect(cards[0].engine).toBeDefined();
    expect(cards[0].grade).toBeDefined();
  });

  it('should get trend for an engine', () => {
    // Two evaluation rounds
    layer.recordStep('eng', 1, { insights: 1 });
    layer.evaluate(1);
    layer.recordStep('eng', 2, { insights: 3 });
    layer.evaluate(2);

    const trend = layer.getTrend('eng');
    expect(trend.length).toBe(2);
  });

  it('should get status summary', () => {
    layer.recordStep('eng', 1, { insights: 1 });
    layer.evaluate(1);

    const status = layer.getStatus();
    expect(status.totalEngines).toBeGreaterThanOrEqual(1);
    expect(status.cycleMetrics).toBeGreaterThanOrEqual(1);
  });
});
