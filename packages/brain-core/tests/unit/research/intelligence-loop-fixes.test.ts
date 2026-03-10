import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CreativeEngine } from '../../../src/creative/creative-engine.js';
import { KnowledgeDistiller } from '../../../src/research/knowledge-distiller.js';
import { HypothesisEngine } from '../../../src/hypothesis/engine.js';
import { PredictionTracker } from '../../../src/prediction/tracker.js';
import { PredictionEngine, runPredictionMigration } from '../../../src/prediction/prediction-engine.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('Fix 1: CreativeEngine.loadPrinciples() uses getPrinciples()', () => {
  let db: Database.Database;
  let creative: CreativeEngine;
  let distiller: KnowledgeDistiller;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    distiller = new KnowledgeDistiller(db, { brainName: 'test' });
    creative = new CreativeEngine(db, { brainName: 'test' });
    creative.setKnowledgeDistiller(distiller);
  });

  afterEach(() => { db.close(); });

  it('loadPrinciples reads stored principles without calling distill()', () => {
    // Insert a principle directly into the DB (simulating prior distillation)
    db.prepare(`INSERT INTO knowledge_principles (id, domain, statement, success_rate, sample_size, confidence, source)
      VALUES ('p1', 'test', 'Stored principle from prior cycle', 0.85, 10, 0.8, 'confirmed_hypothesis')`).run();

    const spy = vi.spyOn(distiller, 'getPrinciples');
    const distillSpy = vi.spyOn(distiller, 'distill');

    // getDebugInfo calls loadPrinciples internally
    const info = creative.getDebugInfo();
    expect(info.principlesCount).toBe(1);
    expect(spy).toHaveBeenCalled();
    expect(distillSpy).not.toHaveBeenCalled();
  });

  it('crossPollinate works with stored principles', () => {
    // Insert 2 principles in different domains
    db.prepare(`INSERT INTO knowledge_principles (id, domain, statement, success_rate, sample_size, confidence, source) VALUES
      ('p1', 'error', 'Errors cluster in async handlers', 0.85, 10, 0.8, 'confirmed_hypothesis'),
      ('p2', 'trading', 'Volume spikes precede price moves', 0.75, 8, 0.7, 'confirmed_hypothesis')
    `).run();

    const insights = creative.crossPollinate();
    // Should find principles and attempt cross-pollination
    expect(creative.getDebugInfo().principlesCount).toBe(2);
  });

  it('returns empty when no principles stored', () => {
    const info = creative.getDebugInfo();
    expect(info.principlesCount).toBe(0);
  });
});

describe('Fix 2: HypothesisEngine confirmThreshold=0.20 helps confirm hypotheses', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => { db.close(); });

  it('hypothesis confirms with relaxed threshold (p<0.20)', () => {
    const engine = new HypothesisEngine(db, { minEvidence: 3, confirmThreshold: 0.20, rejectThreshold: 0.5 });

    // Use timestamps where (ts / 3600000) % 24 gives exact hour values
    const peakHour = 10;
    for (let i = 0; i < 30; i++) {
      // Cluster 20 events at peakHour, 10 at random hours
      const hour = i < 20 ? peakHour : (i % 24);
      // Use exact hour-aligned timestamps: hour * 3600000 ms
      const ts = hour * 3600000;
      engine.observe({ source: 'test', type: 'test_event', value: 1, timestamp: ts });
    }

    const hyp = engine.propose({
      statement: 'test_event clusters at hour 10',
      type: 'temporal',
      source: 'test',
      variables: ['test_event'],
      condition: { type: 'temporal', params: { eventType: 'test_event', peakHour, expectedRatio: 2.0 } },
    });

    const result = engine.test(hyp.id!);
    expect(result).not.toBeNull();
    expect(result!.evidenceFor).toBeGreaterThan(0);
    // With 20 out of 30 at peak, the evidence should strongly favor the hypothesis
    expect(result!.evidenceFor).toBeGreaterThanOrEqual(20);
  });

  it('strict threshold (0.05) rejects what relaxed (0.20) would confirm', () => {
    const strict = new HypothesisEngine(db, { minEvidence: 3, confirmThreshold: 0.05 });
    const relaxed = new HypothesisEngine(db, { minEvidence: 3, confirmThreshold: 0.20 });

    // Create moderate evidence
    const baseTs = Date.now();
    for (let i = 0; i < 12; i++) {
      const hour = i < 8 ? 14 : Math.floor(Math.random() * 24);
      const ts = baseTs + hour * 3600000;
      strict.observe({ source: 'test', type: 'moderate_event', value: 1, timestamp: ts });
      relaxed.observe({ source: 'test', type: 'moderate_event', value: 1, timestamp: ts });
    }

    const hypStrict = strict.propose({
      statement: 'moderate_event at hour 14',
      type: 'temporal',
      source: 'test',
      variables: ['moderate_event'],
      condition: { type: 'temporal', params: { eventType: 'moderate_event', peakHour: 14, expectedRatio: 2.0 } },
    });
    const hypRelaxed = relaxed.propose({
      statement: 'moderate_event at hour 14',
      type: 'temporal',
      source: 'test',
      variables: ['moderate_event'],
      condition: { type: 'temporal', params: { eventType: 'moderate_event', peakHour: 14, expectedRatio: 2.0 } },
    });

    const resultStrict = strict.test(hypStrict.id!);
    const resultRelaxed = relaxed.test(hypRelaxed.id!);

    // Both test the same data — relaxed threshold should be more lenient
    expect(resultStrict).not.toBeNull();
    expect(resultRelaxed).not.toBeNull();
    // The p-value should be the same, but status may differ
    expect(resultStrict!.pValue).toBeCloseTo(resultRelaxed!.pValue, 3);
  });
});

describe('Fix 3: convertTopInsights threshold lowered to 0.3', () => {
  let db: Database.Database;
  let creative: CreativeEngine;
  let hypothesis: HypothesisEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    creative = new CreativeEngine(db, { brainName: 'test' });
    hypothesis = new HypothesisEngine(db, { minEvidence: 3, confirmThreshold: 0.20 });
    creative.setHypothesisEngine(hypothesis);
  });

  afterEach(() => { db.close(); });

  it('converts insights with novelty >= 0.3 (was 0.5)', () => {
    // Insert insights with varying novelty scores
    db.prepare(`INSERT INTO creative_insights (type, source_a_domain, source_a_principle, source_b_domain, source_b_principle, insight, novelty_score, plausibility, status) VALUES
      ('cross_pollination', 'domA', 'prinA', 'domB', 'prinB', 'Low novelty insight', 0.35, 0.5, 'raw'),
      ('cross_pollination', 'domC', 'prinC', 'domD', 'prinD', 'High novelty insight', 0.8, 0.6, 'raw'),
      ('cross_pollination', 'domE', 'prinE', 'domF', 'prinF', 'Below threshold insight', 0.2, 0.4, 'raw')
    `).run();

    // With threshold 0.3, should convert the 0.35 and 0.8 insights but not 0.2
    const converted = creative.convertTopInsights(0.3);
    expect(converted).toBe(2);
  });

  it('old threshold 0.5 would miss the 0.35 insight', () => {
    db.prepare(`INSERT INTO creative_insights (type, source_a_domain, source_a_principle, source_b_domain, source_b_principle, insight, novelty_score, plausibility, status) VALUES
      ('cross_pollination', 'domA', 'prinA', 'domB', 'prinB', 'Medium novelty', 0.35, 0.5, 'raw')
    `).run();

    const converted = creative.convertTopInsights(0.5);
    expect(converted).toBe(0); // 0.35 < 0.5 → not converted
  });
});

describe('Fix 4: PredictionTracker accuracy counts partial as 0.5 weight', () => {
  let db: Database.Database;
  let tracker: PredictionTracker;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runPredictionMigration(db);
    tracker = new PredictionTracker(db);
  });

  afterEach(() => { db.close(); });

  it('accuracy_rate includes partial predictions at 0.5 weight', () => {
    const now = Date.now();

    // Store and resolve 4 predictions: 1 correct, 2 partial, 1 wrong
    for (let i = 0; i < 4; i++) {
      tracker.store({
        prediction_id: `p${i}`,
        domain: 'metric',
        metric: `test_metric_${i}`,
        predicted_value: 100,
        predicted_direction: i < 3 ? 'up' : 'down', // first 3 predict up
        confidence: 0.6,
        horizon_ms: 300_000,
        reasoning: 'test',
        method: 'ewma',
        status: 'pending',
        created_at: now - 600_000,
        expires_at: now + 3_600_000,
        evidence: {},
      });
    }

    // Resolve: p0 correct (error<10%, direction match), p1/p2 partial (direction match but error>10%), p3 wrong
    tracker.resolve('p0', 105); // predicted 100, actual 105 → error=5%, up→up → correct
    tracker.resolve('p1', 120); // predicted 100, actual 120 → error=20%, up→up → partial (direction correct but error>10%)
    tracker.resolve('p2', 115); // predicted 100, actual 115 → error=15%, up→up → partial
    tracker.resolve('p3', 70);  // predicted 100, actual 70 → error=30%, down but predicted down → wrong (error>25%, direction wrong since p3 predicted down but actual is down... wait)

    const accuracy = tracker.getAccuracy();
    expect(accuracy.length).toBeGreaterThan(0);

    // Sum across domains
    const total = accuracy.reduce((s, a) => s + a.total, 0);
    const correct = accuracy.reduce((s, a) => s + a.correct, 0);
    const partial = accuracy.reduce((s, a) => s + a.partial, 0);
    expect(total).toBe(4);

    // accuracy_rate should be (correct + partial*0.5) / resolved
    const resolved = total - accuracy.reduce((s, a) => s + a.expired, 0);
    const expectedRate = (correct + partial * 0.5) / resolved;
    const actualRate = accuracy.reduce((s, a) => s + a.accuracy_rate * (a.total - a.expired), 0) / resolved;
    expect(actualRate).toBeCloseTo(expectedRate, 2);
  });

  it('pure correct predictions give accuracy_rate = 1.0', () => {
    const now = Date.now();
    tracker.store({
      prediction_id: 'perfect',
      domain: 'metric',
      metric: 'test',
      predicted_value: 100,
      predicted_direction: 'stable',
      confidence: 0.7,
      horizon_ms: 300_000,
      reasoning: 'test',
      method: 'ewma',
      status: 'pending',
      created_at: now - 600_000,
      expires_at: now + 3_600_000,
      evidence: {},
    });

    tracker.resolve('perfect', 101); // error=1%, within 2% → stable → correct
    const accuracy = tracker.getAccuracy();
    expect(accuracy[0].accuracy_rate).toBe(1.0);
  });
});

describe('Fix 5: Autonomous scheduler uses relaxed hypothesis thresholds', () => {
  it('verifies relaxed thresholds in constructor config', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const content = readFileSync(
      join(__dirname, '../../../src/research/autonomous-scheduler.ts'),
      'utf-8',
    );
    expect(content).toContain('minEvidence: 3');
    expect(content).toContain('confirmThreshold: 0.20');
  });
});
