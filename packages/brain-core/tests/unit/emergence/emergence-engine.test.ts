import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EmergenceEngine } from '../../../src/emergence/emergence-engine.js';

describe('EmergenceEngine', () => {
  let db: Database.Database;
  let engine: EmergenceEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new EmergenceEngine(db, { brainName: 'test-brain' });
  });

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'emergence%'").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('emergence_events');
    expect(names).toContain('emergence_metrics');
  });

  it('should return empty status initially', () => {
    const status = engine.getStatus();
    expect(status.totalEvents).toBe(0);
    expect(status.unpredictedCount).toBe(0);
    expect(status.avgSurpriseScore).toBe(0);
    expect(status.latestMetrics).toBeNull();
    expect(status.metricsTrend).toHaveLength(0);
    expect(status.topEvents).toHaveLength(0);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(status.eventsByType).toEqual({});
  });

  it('should detect no events without data sources', () => {
    const events = engine.detect();
    expect(events).toEqual([]);
  });

  it('should increment cycle count on detect()', () => {
    engine.detect();
    engine.detect();
    engine.detect();
    // After 3 detects, cycleCount = 3. No metrics yet because metricsEvery=5.
    expect(engine.getLatestMetrics()).toBeNull();
  });

  it('should record metrics every N cycles', () => {
    const eng = new EmergenceEngine(db, { brainName: 'test', metricsEvery: 2 });
    eng.detect(); // cycle 1
    expect(eng.getLatestMetrics()).toBeNull();
    eng.detect(); // cycle 2 → triggers metrics
    const m = eng.getLatestMetrics();
    expect(m).not.toBeNull();
    expect(m!.cycle).toBe(2);
    expect(m!.compressionComplexity).toBe(0); // No data sources
    expect(m!.knowledgeEntropy).toBe(0);
    expect(m!.networkDensity).toBe(0);
    expect(m!.knowledgeDiversity).toBe(0);
    expect(m!.integrationPhi).toBe(0);
  });

  it('should record and retrieve complexity metrics', () => {
    const metrics = engine.recordMetrics();
    expect(metrics.timestamp).toBeDefined();
    expect(metrics.cycle).toBe(0);
    expect(metrics.compressionComplexity).toBeGreaterThanOrEqual(0);
    expect(metrics.knowledgeEntropy).toBeGreaterThanOrEqual(0);
    expect(metrics.networkDensity).toBeGreaterThanOrEqual(0);
    expect(metrics.knowledgeDiversity).toBeGreaterThanOrEqual(0);
    expect(metrics.integrationPhi).toBeGreaterThanOrEqual(0);

    const latest = engine.getLatestMetrics();
    expect(latest).not.toBeNull();
    expect(latest!.compressionComplexity).toBe(metrics.compressionComplexity);
  });

  it('should compute surprise score with default 0.5', () => {
    const score = engine.computeSurpriseScore('some observation');
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('should compute surprise score boosted by contradiction', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [],
        anti_patterns: [{ statement: 'High CPU always causes failures and downtime' }],
        strategies: [],
      }),
    };

    engine.setDataSources({ knowledgeDistiller: mockDistiller as never });
    const score = engine.computeSurpriseScore('High CPU always causes failures');
    expect(score).toBeGreaterThan(0.5); // contradiction boost
  });

  it('should compute surprise score boosted by deviation', () => {
    const score = engine.computeSurpriseScore('test', { deviation: 3 });
    expect(score).toBeGreaterThan(0.5); // deviation boost: 0.5 + 3*0.1 = 0.8
    expect(score).toBeCloseTo(0.8, 1);
  });

  it('should clamp surprise score to max 1.0', () => {
    const score = engine.computeSurpriseScore('test', { deviation: 100 });
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should detect unpredicted hypotheses', () => {
    const mockHypothesis = {
      list: (status?: string) => {
        if (status === 'confirmed') {
          return [{
            id: 1,
            statement: 'Errors decrease during full moon periods spontaneously',
            confidence: 0.9,
            p_value: 0.01,
            evidence_for: 5,
            evidence_against: 1,
            tested_at: '2026-01-01',
            variables: [],
          }];
        }
        return [];
      },
    };

    const mockDistiller = {
      getPackage: () => ({
        principles: [{ statement: 'High load causes more errors' }], // no overlap with moon
        anti_patterns: [],
        strategies: [],
      }),
    };

    engine.setDataSources({
      hypothesisEngine: mockHypothesis as never,
      knowledgeDistiller: mockDistiller as never,
    });

    const events = engine.detect();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('unpredicted_pattern');
    expect(events[0].sourceEngine).toBe('HypothesisEngine');
    expect(events[0].wasPredicted).toBe(false);
    expect(events[0].surpriseScore).toBeGreaterThanOrEqual(0.5);
  });

  it('should NOT detect hypothesis that matches a principle', () => {
    const mockHypothesis = {
      list: (status?: string) => {
        if (status === 'confirmed') {
          return [{
            id: 1,
            statement: 'high load causes more errors in production systems',
            confidence: 0.9,
            p_value: 0.01,
            evidence_for: 5,
            evidence_against: 1,
            tested_at: '2026-01-01',
            variables: [],
          }];
        }
        return [];
      },
    };

    const mockDistiller = {
      getPackage: () => ({
        principles: [{ statement: 'high load causes more errors in production' }], // overlaps
        anti_patterns: [],
        strategies: [],
      }),
    };

    engine.setDataSources({
      hypothesisEngine: mockHypothesis as never,
      knowledgeDistiller: mockDistiller as never,
    });

    const events = engine.detect();
    expect(events.length).toBe(0); // covered by principle → not emergent
  });

  it('should detect recurring anomalies as self_organization', () => {
    const mockAnomalyDetective = {
      getAnomalies: () => [
        { type: 'z_score', metric: 'cpu_spikes', deviation: 3.5, timestamp: Date.now() - 1000 },
        { type: 'z_score', metric: 'cpu_spikes', deviation: 4.0, timestamp: Date.now() - 500 },
        { type: 'z_score', metric: 'cpu_spikes', deviation: 2.8, timestamp: Date.now() },
      ],
    };

    engine.setDataSources({ anomalyDetective: mockAnomalyDetective as never });
    const events = engine.detect();
    expect(events.length).toBeGreaterThanOrEqual(1);

    const selfOrg = events.find(e => e.type === 'self_organization');
    expect(selfOrg).toBeDefined();
    expect(selfOrg!.title).toContain('cpu_spikes');
    expect(selfOrg!.sourceEngine).toBe('AnomalyDetective');
  });

  it('should NOT detect anomalies with fewer than 3 occurrences', () => {
    const mockAnomalyDetective = {
      getAnomalies: () => [
        { type: 'z_score', metric: 'rare_metric', deviation: 3.5, timestamp: Date.now() - 1000 },
        { type: 'z_score', metric: 'rare_metric', deviation: 4.0, timestamp: Date.now() },
      ],
    };

    engine.setDataSources({ anomalyDetective: mockAnomalyDetective as never });
    const events = engine.detect();
    const selfOrg = events.filter(e => e.type === 'self_organization');
    expect(selfOrg.length).toBe(0);
  });

  it('should detect cross-domain bridges from journal', () => {
    const mockJournal = {
      search: () => [
        {
          id: 42,
          title: 'Trading errors correlate with marketing posts',
          content: 'When marketing posts about crypto, trading errors spike.',
          significance: 'breakthrough',
          tags: ['trading', 'marketing', 'cross-domain'],
          created_at: '2026-01-15',
          references: [],
        },
      ],
      getSummary: () => ({ total_entries: 100, by_type: {} }),
    };

    engine.setDataSources({ journal: mockJournal as never });
    const events = engine.detect();

    const bridge = events.find(e => e.type === 'cross_domain_bridge');
    expect(bridge).toBeDefined();
    expect(bridge!.surpriseScore).toBe(0.9); // breakthrough
    expect(bridge!.sourceEngine).toBe('ResearchJournal');
  });

  it('should detect novel experiments with large effect sizes', () => {
    const mockExperiments = {
      list: () => [
        {
          id: 7,
          name: 'Z-threshold test',
          hypothesis: 'Changing Z reduces false positives',
          conclusion: { significant: true, effect_size: 1.2, p_value: 0.002 },
        },
      ],
    };

    engine.setDataSources({ experimentEngine: mockExperiments as never });
    const events = engine.detect();

    const novel = events.find(e => e.type === 'novel_behavior');
    expect(novel).toBeDefined();
    expect(novel!.title).toContain('Z-threshold test');
    expect(novel!.sourceEngine).toBe('ExperimentEngine');
    expect(novel!.surpriseScore).toBeGreaterThan(0.5);
  });

  it('should NOT detect experiments with small effect sizes', () => {
    const mockExperiments = {
      list: () => [
        {
          id: 8,
          name: 'Small tweak',
          hypothesis: 'Minor change',
          conclusion: { significant: true, effect_size: 0.3, p_value: 0.04 },
        },
      ],
    };

    engine.setDataSources({ experimentEngine: mockExperiments as never });
    const events = engine.detect();
    const novel = events.filter(e => e.type === 'novel_behavior');
    expect(novel.length).toBe(0);
  });

  it('should detect phase transitions from metrics trend', () => {
    // Manually insert metrics to simulate a Phi spike
    const insert = db.prepare(`
      INSERT INTO emergence_metrics (compression_complexity, knowledge_entropy, network_density,
        synapse_count, node_count, avg_weight, knowledge_diversity, integration_phi, cycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(0.3, 2.0, 0.01, 10, 5, 0.5, 0.3, 0.1, 1);
    insert.run(0.3, 2.0, 0.01, 10, 5, 0.5, 0.3, 0.1, 2);
    insert.run(0.3, 2.0, 0.01, 10, 5, 0.5, 0.3, 0.25, 3); // Phi: 0.1 → 0.25 = 150% jump

    const events = engine.detect();
    const transition = events.find(e => e.type === 'phase_transition');
    expect(transition).toBeDefined();
    expect(transition!.title).toContain('Integration spike');
    expect(transition!.sourceEngine).toBe('EmergenceEngine');
  });

  it('should deduplicate events by title', () => {
    const mockHypothesis = {
      list: (status?: string) => {
        if (status === 'confirmed') {
          return [
            { id: 1, statement: 'Same discovery pattern A', confidence: 0.9, p_value: 0.01, evidence_for: 5, evidence_against: 1, tested_at: '2026-01-01', variables: [] },
          ];
        }
        return [];
      },
    };

    engine.setDataSources({ hypothesisEngine: mockHypothesis as never });

    // First detect → persists event
    const first = engine.detect();
    expect(first.length).toBe(1);

    // Second detect → same title → deduped
    const second = engine.detect();
    expect(second.length).toBe(0);
  });

  it('should filter events below surprise threshold', () => {
    const eng = new EmergenceEngine(db, { brainName: 'test', surpriseThreshold: 0.9 });

    const mockHypothesis = {
      list: (status?: string) => {
        if (status === 'confirmed') {
          return [
            { id: 1, statement: 'A mild discovery about error patterns', confidence: 0.5, p_value: 0.04, evidence_for: 3, evidence_against: 2, tested_at: '2026-01-01', variables: [] },
          ];
        }
        return [];
      },
    };

    eng.setDataSources({ hypothesisEngine: mockHypothesis as never });
    const events = eng.detect();
    // High threshold (0.9) should filter most events
    expect(events.length).toBe(0);
  });

  it('should get events by type', () => {
    // Insert some events directly
    db.prepare(`INSERT INTO emergence_events (type, title, description, surprise_score, source_engine) VALUES (?, ?, ?, ?, ?)`).run('phase_transition', 'Phi spike', 'desc', 0.8, 'EmergenceEngine');
    db.prepare(`INSERT INTO emergence_events (type, title, description, surprise_score, source_engine) VALUES (?, ?, ?, ?, ?)`).run('novel_behavior', 'Big effect', 'desc', 0.7, 'ExperimentEngine');
    db.prepare(`INSERT INTO emergence_events (type, title, description, surprise_score, source_engine) VALUES (?, ?, ?, ?, ?)`).run('phase_transition', 'Entropy spike', 'desc', 0.6, 'EmergenceEngine');

    const transitions = engine.getEventsByType('phase_transition');
    expect(transitions.length).toBe(2);
    expect(transitions.every(e => e.type === 'phase_transition')).toBe(true);

    const all = engine.getEventsByType();
    expect(all.length).toBe(3);
  });

  it('should get metrics trend in chronological order', () => {
    const insert = db.prepare(`
      INSERT INTO emergence_metrics (compression_complexity, knowledge_entropy, network_density,
        synapse_count, node_count, avg_weight, knowledge_diversity, integration_phi, cycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(0.1, 1.0, 0.01, 5, 3, 0.3, 0.2, 0.05, 1);
    insert.run(0.2, 1.5, 0.02, 10, 5, 0.4, 0.3, 0.1, 2);
    insert.run(0.3, 2.0, 0.03, 15, 7, 0.5, 0.4, 0.15, 3);

    const trend = engine.getMetricsTrend(10);
    expect(trend.length).toBe(3);
    // Should be chronological (ascending cycle)
    expect(trend[0].cycle).toBe(1);
    expect(trend[1].cycle).toBe(2);
    expect(trend[2].cycle).toBe(3);
    expect(trend[2].integrationPhi).toBe(0.15);
  });

  it('should compute network metrics from getNetworkStats callback', () => {
    engine.setDataSources({
      getNetworkStats: () => ({
        totalNodes: 10,
        totalSynapses: 20,
        avgWeight: 0.6,
        nodesByType: { memory: 5, insight: 5 },
      }),
    });

    const metrics = engine.recordMetrics();
    expect(metrics.nodeCount).toBe(10);
    expect(metrics.synapseCount).toBe(20);
    expect(metrics.avgWeight).toBe(0.6);
    expect(metrics.networkDensity).toBeCloseTo(20 / (10 * 9), 4); // n*(n-1)
  });

  it('should compute compression complexity from knowledge', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [
          { statement: 'Errors increase under high load' },
          { statement: 'CPU spikes correlate with memory issues' },
          { statement: 'Network latency affects response times' },
        ],
        anti_patterns: [{ statement: 'Never ignore stack traces' }],
        strategies: [{ id: 'retry', description: 'Retry failed operations with backoff' }],
      }),
    };

    engine.setDataSources({ knowledgeDistiller: mockDistiller as never });
    const metrics = engine.recordMetrics();
    expect(metrics.compressionComplexity).toBeGreaterThan(0);
    expect(metrics.compressionComplexity).toBeLessThanOrEqual(1);
  });

  it('should compute knowledge entropy from multiple categories', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [{ statement: 'p1' }, { statement: 'p2' }],
        anti_patterns: [{ statement: 'ap1' }],
        strategies: [{ id: 's1', description: 'd1' }],
      }),
    };

    const mockJournal = {
      getSummary: () => ({ total_entries: 5, by_type: { observation: 3, insight: 2 } }),
      search: () => [],
    };

    engine.setDataSources({
      knowledgeDistiller: mockDistiller as never,
      journal: mockJournal as never,
    });

    const metrics = engine.recordMetrics();
    expect(metrics.knowledgeEntropy).toBeGreaterThan(0);
  });

  it('should compute knowledge diversity', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [{ statement: 'p1' }],
        anti_patterns: [{ statement: 'ap1' }],
        strategies: [],
      }),
    };

    const mockCuriosity = {
      getStatus: () => ({ totalGaps: 3, totalExplorations: 2 }),
    };

    engine.setDataSources({
      knowledgeDistiller: mockDistiller as never,
      curiosityEngine: mockCuriosity as never,
    });

    const metrics = engine.recordMetrics();
    // Has principles + anti_patterns out of 3 knowledge categories
    // + knowledge_gaps + explorations out of 2 curiosity categories
    // = 4 out of 5 (no strategies)
    expect(metrics.knowledgeDiversity).toBeGreaterThan(0);
    expect(metrics.knowledgeDiversity).toBeLessThanOrEqual(1);
  });

  it('should compute integration phi from journal cross-references', () => {
    const mockJournal = {
      getSummary: () => ({ total_entries: 10, by_type: {} }),
      search: () => [
        { id: 1, title: 't1', content: 'c1', tags: ['a', 'b', 'c', 'd'], references: [2, 3], created_at: '2026-01-01' },
        { id: 2, title: 't2', content: 'c2', tags: ['a'], references: [], created_at: '2026-01-02' },
      ],
    };

    engine.setDataSources({ journal: mockJournal as never });
    const metrics = engine.recordMetrics();
    expect(metrics.integrationPhi).toBeGreaterThan(0);
  });

  it('should persist events with correct fields', () => {
    const mockHypothesis = {
      list: (status?: string) => {
        if (status === 'confirmed') {
          return [{
            id: 99,
            statement: 'Unique emergent pattern xyz123',
            confidence: 0.85,
            p_value: 0.005,
            evidence_for: 8,
            evidence_against: 1,
            tested_at: '2026-02-01',
            variables: [],
          }];
        }
        return [];
      },
    };

    engine.setDataSources({ hypothesisEngine: mockHypothesis as never });
    const events = engine.detect();
    expect(events.length).toBe(1);
    expect(events[0].id).toBeDefined();

    // Verify persistence
    const retrieved = engine.getEvents(10);
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].type).toBe('unpredicted_pattern');
    expect(retrieved[0].title).toContain('xyz123');
    expect(retrieved[0].evidence).toContain('hypothesis:99');
    expect(retrieved[0].wasPredicted).toBe(false);
  });

  it('should return correct status after events and metrics', () => {
    // Insert events directly for controlled testing
    db.prepare(`INSERT INTO emergence_events (type, title, description, surprise_score, source_engine, was_predicted) VALUES (?, ?, ?, ?, ?, ?)`).run('phase_transition', 'Phi spike', 'desc', 0.8, 'EmergenceEngine', 0);
    db.prepare(`INSERT INTO emergence_events (type, title, description, surprise_score, source_engine, was_predicted) VALUES (?, ?, ?, ?, ?, ?)`).run('novel_behavior', 'Big effect', 'desc', 0.6, 'ExperimentEngine', 1);

    const insert = db.prepare(`
      INSERT INTO emergence_metrics (compression_complexity, knowledge_entropy, network_density,
        synapse_count, node_count, avg_weight, knowledge_diversity, integration_phi, cycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(0.3, 2.0, 0.01, 10, 5, 0.5, 0.3, 0.1, 5);

    const status = engine.getStatus();
    expect(status.totalEvents).toBe(2);
    expect(status.unpredictedCount).toBe(1);
    expect(status.avgSurpriseScore).toBeCloseTo(0.7, 1);
    expect(status.eventsByType).toEqual({ phase_transition: 1, novel_behavior: 1 });
    expect(status.latestMetrics).not.toBeNull();
    expect(status.latestMetrics!.cycle).toBe(5);
    expect(status.topEvents.length).toBe(2);
  });
});
