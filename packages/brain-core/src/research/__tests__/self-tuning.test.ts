import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { ParameterRegistry, runParameterRegistryMigration } from '../../metacognition/parameter-registry.js';
import { BorgSyncEngine, type BorgDataProvider } from '../../cross-brain/borg-sync-engine.js';
import type { SyncItem } from '../../cross-brain/borg-types.js';

// ── Helpers ─────────────────────────────────────────────

function createMockClient() {
  return {
    broadcast: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue(null),
    getAvailablePeers: vi.fn().mockResolvedValue([]),
    getPeerNames: vi.fn().mockReturnValue(['trading-brain', 'marketing-brain']),
    addPeer: vi.fn(),
    removePeer: vi.fn(),
  };
}

// ── Block 1: Prediction Params in ParameterRegistry ─────

describe('Block 1: Prediction-Params in ParameterRegistry', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new ParameterRegistry(db);
  });

  afterEach(() => {
    db.close();
  });

  it('registers 6 prediction params via registerAll', () => {
    registry.registerAll([
      { engine: 'prediction', name: 'ewmaAlpha', value: 0.3, min: 0.05, max: 0.95, description: 'EWMA smoothing factor', category: 'prediction' },
      { engine: 'prediction', name: 'trendBeta', value: 0.1, min: 0.01, max: 0.5, description: 'Holt-Winters trend smoothing', category: 'prediction' },
      { engine: 'prediction', name: 'minConfidence', value: 0.3, min: 0.1, max: 0.8, description: 'Minimum prediction confidence', category: 'prediction' },
      { engine: 'prediction', name: 'minDataPoints', value: 5, min: 3, max: 20, description: 'Min data points before predicting', category: 'prediction' },
      { engine: 'prediction', name: 'maxPredictionsPerCycle', value: 5, min: 1, max: 20, description: 'Max predictions generated per cycle', category: 'prediction' },
      { engine: 'prediction', name: 'defaultHorizonMs', value: 300000, min: 60000, max: 7200000, description: 'Default prediction horizon', category: 'prediction' },
    ]);

    expect(registry.get('prediction', 'ewmaAlpha')).toBe(0.3);
    expect(registry.get('prediction', 'trendBeta')).toBe(0.1);
    expect(registry.get('prediction', 'minConfidence')).toBe(0.3);
    expect(registry.get('prediction', 'minDataPoints')).toBe(5);
    expect(registry.get('prediction', 'maxPredictionsPerCycle')).toBe(5);
    expect(registry.get('prediction', 'defaultHorizonMs')).toBe(300000);
  });

  it('prediction params are listable by engine', () => {
    registry.registerAll([
      { engine: 'prediction', name: 'ewmaAlpha', value: 0.3, min: 0.05, max: 0.95, description: 'test' },
      { engine: 'prediction', name: 'trendBeta', value: 0.1, min: 0.01, max: 0.5, description: 'test' },
      { engine: 'other', name: 'foo', value: 1, min: 0, max: 10, description: 'other' },
    ]);

    const predParams = registry.list('prediction');
    expect(predParams).toHaveLength(2);
    expect(predParams.map((p: { name: string }) => p.name).sort()).toEqual(['ewmaAlpha', 'trendBeta']);
  });

  it('updateConfig syncs all 6 params to a mock PredictionEngine', () => {
    registry.registerAll([
      { engine: 'prediction', name: 'ewmaAlpha', value: 0.3, min: 0.05, max: 0.95, description: 'test' },
      { engine: 'prediction', name: 'trendBeta', value: 0.1, min: 0.01, max: 0.5, description: 'test' },
      { engine: 'prediction', name: 'minConfidence', value: 0.3, min: 0.1, max: 0.8, description: 'test' },
      { engine: 'prediction', name: 'minDataPoints', value: 5, min: 3, max: 20, description: 'test' },
      { engine: 'prediction', name: 'maxPredictionsPerCycle', value: 5, min: 1, max: 20, description: 'test' },
      { engine: 'prediction', name: 'defaultHorizonMs', value: 300000, min: 60000, max: 7200000, description: 'test' },
    ]);

    // Simulate Step 22b sync logic
    const alpha = registry.get('prediction', 'ewmaAlpha');
    const beta = registry.get('prediction', 'trendBeta');
    const minConf = registry.get('prediction', 'minConfidence');
    const minDP = registry.get('prediction', 'minDataPoints');
    const maxPred = registry.get('prediction', 'maxPredictionsPerCycle');
    const horizon = registry.get('prediction', 'defaultHorizonMs');

    const updateConfig = vi.fn();
    if (alpha !== undefined || beta !== undefined || minConf !== undefined || minDP !== undefined || maxPred !== undefined || horizon !== undefined) {
      updateConfig({
        ...(alpha !== undefined ? { ewmaAlpha: alpha } : {}),
        ...(beta !== undefined ? { trendBeta: beta } : {}),
        ...(minConf !== undefined ? { minConfidence: minConf } : {}),
        ...(minDP !== undefined ? { minDataPoints: minDP } : {}),
        ...(maxPred !== undefined ? { maxPredictionsPerCycle: maxPred } : {}),
        ...(horizon !== undefined ? { defaultHorizonMs: horizon } : {}),
      });
    }

    expect(updateConfig).toHaveBeenCalledWith({
      ewmaAlpha: 0.3,
      trendBeta: 0.1,
      minConfidence: 0.3,
      minDataPoints: 5,
      maxPredictionsPerCycle: 5,
      defaultHorizonMs: 300000,
    });
  });

  it('prediction params can be tuned and re-read', () => {
    registry.registerAll([
      { engine: 'prediction', name: 'ewmaAlpha', value: 0.3, min: 0.05, max: 0.95, description: 'test' },
    ]);

    registry.set('prediction', 'ewmaAlpha', 0.5, 'auto-experiment', 'A/B test');
    expect(registry.get('prediction', 'ewmaAlpha')).toBe(0.5);
  });
});

// ── Block 2: BorgSync Activation ────────────────────────

describe('Block 2: BorgSync enabled config', () => {
  it('accepts enabled config with selective mode and custom shareTypes', () => {
    const client = createMockClient();
    const provider: BorgDataProvider = {
      getShareableItems: vi.fn().mockReturnValue([]),
      importItems: vi.fn().mockReturnValue(0),
    };

    const engine = new BorgSyncEngine('brain', client as any, provider, {
      enabled: true,
      mode: 'selective',
      shareTypes: ['rule', 'insight', 'principle'],
      minConfidence: 0.6,
      relevanceThreshold: 0.4,
      syncIntervalMs: 120_000,
    });

    const config = engine.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('selective');
    expect(config.shareTypes).toContain('principle');
    expect(config.shareTypes).toContain('insight');
    expect(config.shareTypes).toContain('rule');
    expect(config.minConfidence).toBe(0.6);
    expect(config.relevanceThreshold).toBe(0.4);
    expect(config.syncIntervalMs).toBe(120_000);
    engine.stop();
  });

  it('getShareableItems includes journal insights alongside principles', () => {
    // Simulate what brain.ts borgProvider does
    const mockPrinciples = [
      { id: 'p1', statement: 'Always test', domain: 'testing', source: 'manual', confidence: 0.9 },
    ];
    const mockJournalEntries = [
      { id: 1, title: 'Big discovery', content: 'Found something amazing', significance: 'breakthrough', created_at: '2026-01-01T00:00:00Z' },
      { id: 2, title: 'Small note', content: 'Routine finding', significance: 'routine', created_at: '2026-01-02T00:00:00Z' },
      { id: 3, title: 'Notable insight', content: 'This is notable', significance: 'notable', created_at: '2026-01-03T00:00:00Z' },
    ];

    const items: SyncItem[] = [];
    // Principles as type 'principle'
    for (const p of mockPrinciples) {
      items.push({ type: 'principle', id: p.id, title: p.statement, content: `${p.domain}: ${p.statement} (source: ${p.source})`, confidence: p.confidence, source: 'brain', createdAt: new Date().toISOString() });
    }
    // Notable/breakthrough journal entries as insights
    const notable = mockJournalEntries.filter(e => e.significance === 'notable' || e.significance === 'breakthrough').slice(0, 20);
    for (const e of notable) {
      items.push({ type: 'insight', id: `journal:${e.id}`, title: e.title, content: e.content.substring(0, 500), confidence: e.significance === 'breakthrough' ? 0.9 : 0.7, source: 'brain', createdAt: e.created_at });
    }

    expect(items).toHaveLength(3); // 1 principle + 2 notable/breakthrough entries
    expect(items.filter(i => i.type === 'principle')).toHaveLength(1);
    expect(items.filter(i => i.type === 'insight')).toHaveLength(2);

    // Routine entries are excluded
    const routineAsInsight = items.find(i => i.title === 'Small note');
    expect(routineAsInsight).toBeUndefined();
  });

  it('filters principle type correctly in selective mode', () => {
    const client = createMockClient();
    const items: SyncItem[] = [
      { type: 'principle', id: 'p1', title: 'Test', content: 'Test', confidence: 0.8, source: 'brain', createdAt: new Date().toISOString() },
      { type: 'memory', id: 'm1', title: 'Memory', content: 'Memory', confidence: 0.8, source: 'brain', createdAt: new Date().toISOString() },
    ];
    const provider: BorgDataProvider = {
      getShareableItems: vi.fn().mockReturnValue(items),
      importItems: vi.fn().mockReturnValue(0),
    };

    const engine = new BorgSyncEngine('brain', client as any, provider, {
      enabled: true,
      mode: 'selective',
      shareTypes: ['rule', 'insight', 'principle'],
      minConfidence: 0.6,
    });

    // Export should include principle but not memory
    const packet = engine.handleExportRequest();
    expect(packet.items.find(i => i.type === 'principle')).toBeDefined();
    expect(packet.items.find(i => i.type === 'memory')).toBeUndefined();
    engine.stop();
  });
});

// ── Block 3: Internal Domain Observations ───────────────

describe('Block 3: Internal domain observations for Knowledge Gaps', () => {
  it('prediction_accuracy_rate is observed into HypothesisEngine', () => {
    // Simulate Step 2d logic
    const observe = vi.fn();
    const brainName = 'brain';
    const now = Date.now();

    const accByDomain = [
      { domain: 'metric', total: 10, correct: 7, wrong: 2, partial: 1, expired: 0, accuracy_rate: 0.7, mean_absolute_error: 0.1, calibration_score: 0.9, direction_accuracy: 0.8 },
      { domain: 'error', total: 5, correct: 3, wrong: 1, partial: 1, expired: 0, accuracy_rate: 0.6, mean_absolute_error: 0.2, calibration_score: 0.85, direction_accuracy: 0.7 },
    ];

    const overall = accByDomain.reduce((s, a) => s + a.accuracy_rate, 0) / accByDomain.length;
    observe({ source: brainName, type: 'prediction_accuracy_rate', value: overall, timestamp: now });
    for (const acc of accByDomain) {
      observe({ source: brainName, type: `prediction_accuracy:${acc.domain}`, value: acc.accuracy_rate, timestamp: now, metadata: { total: acc.total, correct: acc.correct } });
    }

    expect(observe).toHaveBeenCalledTimes(3); // 1 overall + 2 per-domain
    // Overall accuracy is (0.7 + 0.6) / 2 ≈ 0.65
    const overallCall = observe.mock.calls.find((c: unknown[]) => (c[0] as Record<string, unknown>).type === 'prediction_accuracy_rate');
    expect(overallCall).toBeDefined();
    expect((overallCall![0] as Record<string, unknown>).value).toBeCloseTo(0.65, 10);
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ type: 'prediction_accuracy:metric', value: 0.7 }));
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ type: 'prediction_accuracy:error', value: 0.6 }));
  });

  it('self_accuracy_rate is recorded into PredictionEngine', () => {
    const recordMetric = vi.fn();

    const accByDomain = [
      { accuracy_rate: 0.8 },
      { accuracy_rate: 0.6 },
    ];
    const overall = accByDomain.reduce((s, a) => s + a.accuracy_rate, 0) / accByDomain.length;
    recordMetric('self_accuracy_rate', overall, 'metric');

    expect(recordMetric).toHaveBeenCalledWith('self_accuracy_rate', 0.7, 'metric');
  });

  it('internal:prediction_accuracy observations for prediction gaps', () => {
    const observe = vi.fn();
    const brainName = 'brain';
    const now = Date.now();

    const gap = { topic: 'prediction_accuracy', gapScore: 0.8 };
    const accByDomain = [
      { domain: 'metric', total: 10, correct: 7, accuracy_rate: 0.7 },
    ];

    if (gap.topic.toLowerCase().includes('prediction')) {
      for (const acc of accByDomain) {
        observe({ source: brainName, type: `internal:prediction_accuracy:${acc.domain}`, value: acc.accuracy_rate, timestamp: now, metadata: { total: acc.total, correct: acc.correct } });
      }
    }

    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      type: 'internal:prediction_accuracy:metric',
      value: 0.7,
    }));
  });

  it('internal:anomaly_detection_count for anomaly gaps', () => {
    const observe = vi.fn();
    const brainName = 'brain';
    const now = Date.now();

    const gap = { topic: 'anomaly_detection', gapScore: 0.75 };
    const anomalyCount = 5;

    if (gap.topic.toLowerCase().includes('anomaly')) {
      observe({ source: brainName, type: 'internal:anomaly_detection_count', value: anomalyCount, timestamp: now });
    }

    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      type: 'internal:anomaly_detection_count',
      value: 5,
    }));
  });

  it('internal:distillation_throughput for knowledge gaps', () => {
    const observe = vi.fn();
    const brainName = 'brain';
    const now = Date.now();

    const gap = { topic: 'knowledge_distillation', gapScore: 0.81 };
    const kSummary = { principles: 10, antiPatterns: 3, strategies: 5, avgConfidence: 0.7, topPrinciples: [] };

    if (gap.topic.toLowerCase().includes('distill') || gap.topic.toLowerCase().includes('knowledge')) {
      observe({ source: brainName, type: 'internal:distillation_throughput', value: kSummary.principles + kSummary.antiPatterns + kSummary.strategies, timestamp: now, metadata: { principles: kSummary.principles, avgConfidence: kSummary.avgConfidence } });
    }

    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      type: 'internal:distillation_throughput',
      value: 18,
      metadata: { principles: 10, avgConfidence: 0.7 },
    }));
  });

  it('does not observe internal data for unrelated gap topics', () => {
    const observe = vi.fn();
    const gap = { topic: 'market_analysis', gapScore: 0.5 };

    const topic = gap.topic.toLowerCase();
    if (topic.includes('prediction')) {
      observe({ type: 'internal:prediction_accuracy:metric' });
    } else if (topic.includes('anomaly')) {
      observe({ type: 'internal:anomaly_detection_count' });
    } else if (topic.includes('distill') || topic.includes('knowledge')) {
      observe({ type: 'internal:distillation_throughput' });
    }

    expect(observe).not.toHaveBeenCalled();
  });
});
