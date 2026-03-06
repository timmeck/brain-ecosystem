import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { DebateEngine } from '../../../src/debate/debate-engine.js';

describe('DebateEngine', () => {
  let db: Database.Database;
  let engine: DebateEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new DebateEngine(db, { brainName: 'test-brain' });
  });

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'debate%'").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('debates');
    expect(names).toContain('debate_perspectives');
  });

  it('should return empty status initially', () => {
    const status = engine.getStatus();
    expect(status.totalDebates).toBe(0);
    expect(status.openDebates).toBe(0);
    expect(status.synthesizedDebates).toBe(0);
    expect(status.avgConfidence).toBe(0);
    expect(status.avgParticipants).toBe(0);
    expect(status.recentDebates).toHaveLength(0);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should start a debate and generate perspective', () => {
    const debate = engine.startDebate('Why do errors increase at night?');
    expect(debate.id).toBeDefined();
    expect(debate.question).toBe('Why do errors increase at night?');
    expect(debate.status).toBe('deliberating');
    expect(debate.perspectives.length).toBe(1);
    expect(debate.perspectives[0].brainName).toBe('test-brain');
    expect(debate.synthesis).toBeNull();
  });

  it('should generate perspective with no data sources', () => {
    const perspective = engine.generatePerspective('test question');
    expect(perspective.brainName).toBe('test-brain');
    expect(perspective.position).toContain('limited knowledge');
    expect(perspective.arguments).toHaveLength(0);
    expect(perspective.confidence).toBe(0);
  });

  it('should generate perspective from principles', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [
          { id: 'p1', domain: 'test', statement: 'Errors increase under high CPU load', success_rate: 0.8, sample_size: 20, confidence: 0.85, source: 'data' },
        ],
        anti_patterns: [
          { statement: 'Never ignore stack traces in production', confidence: 0.9 },
        ],
        strategies: [],
      }),
    };

    engine.setDataSources({ knowledgeDistiller: mockDistiller as never });
    const p = engine.generatePerspective('Why do errors increase?');

    expect(p.arguments.length).toBeGreaterThan(0);
    expect(p.arguments.some(a => a.source === 'principle')).toBe(true);
    expect(p.confidence).toBeGreaterThan(0);
  });

  it('should generate perspective from hypotheses', () => {
    const mockHypothesis = {
      list: (status?: string) => {
        if (status === 'confirmed') {
          return [{
            id: 1, statement: 'Errors spike during deployments', confidence: 0.9,
            p_value: 0.01, evidence_for: 5, evidence_against: 1, status: 'confirmed', variables: [],
          }];
        }
        if (status === 'testing') return [];
        return [];
      },
    };

    engine.setDataSources({ hypothesisEngine: mockHypothesis as never });
    const p = engine.generatePerspective('Why do errors spike?');

    expect(p.arguments.some(a => a.source === 'hypothesis')).toBe(true);
  });

  it('should generate perspective from journal entries', () => {
    const mockJournal = {
      search: () => [{
        id: 10, title: 'Error patterns during peak hours', content: 'Significant correlation found.',
        significance: 'breakthrough', tags: ['errors', 'peak'], created_at: '2026-01-01', references: [],
        type: 'discovery', timestamp: Date.now(), data: {},
      }],
    };

    engine.setDataSources({ journal: mockJournal as never });
    const p = engine.generatePerspective('What happens during peak hours?');

    expect(p.arguments.some(a => a.source === 'journal')).toBe(true);
  });

  it('should generate perspective from anomalies', () => {
    const mockAnomalyDetective = {
      getAnomalies: () => [{
        id: 1, title: 'CPU spike anomaly', metric: 'cpu_usage',
        deviation: 4.5, severity: 'high', timestamp: Date.now(),
        type: 'z_score', expected_value: 50, actual_value: 95, description: 'Unusual CPU spike',
      }],
    };

    engine.setDataSources({ anomalyDetective: mockAnomalyDetective as never });
    const p = engine.generatePerspective('Why did CPU spike?');

    expect(p.arguments.some(a => a.source === 'anomaly')).toBe(true);
  });

  it('should add external perspective to a debate', () => {
    const debate = engine.startDebate('Test question?');
    expect(debate.perspectives.length).toBe(1);

    engine.addPerspective(debate.id!, {
      brainName: 'trading-brain',
      position: 'From trading perspective: market volatility is the cause.',
      arguments: [{ claim: 'Volatility spikes precede errors', evidence: ['hypothesis:42'], source: 'hypothesis', strength: 0.8 }],
      confidence: 0.75,
      relevance: 0.6,
    });

    const updated = engine.getDebate(debate.id!);
    expect(updated!.perspectives.length).toBe(2);
    expect(updated!.perspectives.some(p => p.brainName === 'trading-brain')).toBe(true);
  });

  it('should synthesize a debate with single perspective', () => {
    const debate = engine.startDebate('Simple question?');
    const synthesis = engine.synthesize(debate.id!);

    expect(synthesis).not.toBeNull();
    expect(synthesis!.participantCount).toBe(1);
    expect(synthesis!.conflicts).toHaveLength(0);
    expect(synthesis!.resolution).toContain('align');
  });

  it('should synthesize a debate with multiple agreeing perspectives', () => {
    const debate = engine.startDebate('Errors?');

    engine.addPerspective(debate.id!, {
      brainName: 'trading-brain',
      position: 'Errors are related to system load.',
      arguments: [{ claim: 'System load causes instability', evidence: ['data'], source: 'principle', strength: 0.7 }],
      confidence: 0.7,
      relevance: 0.5,
    });

    const synthesis = engine.synthesize(debate.id!);
    expect(synthesis).not.toBeNull();
    expect(synthesis!.participantCount).toBe(2);
  });

  it('should detect conflicts between perspectives', () => {
    // Insert debate directly to avoid auto-generated empty perspective from startDebate
    const info = db.prepare('INSERT INTO debates (question, status) VALUES (?, ?)').run('CPU question?', 'deliberating');
    const debateId = Number(info.lastInsertRowid);

    // Add two conflicting perspectives
    engine.addPerspective(debateId, {
      brainName: 'brain-a',
      position: 'Increase resource allocation for production servers',
      arguments: [
        { claim: 'Increasing resource allocation for production servers improves overall performance', evidence: ['p1'], source: 'principle', strength: 0.9 },
      ],
      confidence: 0.8,
      relevance: 0.8,
    });

    engine.addPerspective(debateId, {
      brainName: 'brain-b',
      position: 'Avoid resource allocation changes',
      arguments: [
        { claim: 'Warning: avoid increasing resource allocation for production servers because of risk', evidence: ['ap1'], source: 'principle', strength: 0.7 },
      ],
      confidence: 0.6,
      relevance: 0.7,
    });

    const synthesis = engine.synthesize(debateId);
    expect(synthesis).not.toBeNull();
    expect(synthesis!.conflicts.length).toBeGreaterThan(0);
    const conflict = synthesis!.conflicts[0];
    expect(conflict.perspectiveA).toBeDefined();
    expect(conflict.perspectiveB).toBeDefined();
    expect(['a_wins', 'b_wins', 'compromise', 'unresolved']).toContain(conflict.resolution);
  });

  it('should persist synthesis to database', () => {
    const debate = engine.startDebate('Test persistence?');
    engine.synthesize(debate.id!);

    const retrieved = engine.getDebate(debate.id!);
    expect(retrieved!.status).toBe('synthesized');
    expect(retrieved!.synthesis).not.toBeNull();
    expect(retrieved!.synthesis!.participantCount).toBe(1);
  });

  it('should list debates in reverse chronological order', () => {
    engine.startDebate('First question?');
    engine.startDebate('Second question?');
    engine.startDebate('Third question?');

    const list = engine.listDebates(10);
    expect(list.length).toBe(3);
    expect(list[0].question).toBe('Third question?');
    expect(list[2].question).toBe('First question?');
  });

  it('should return null for non-existent debate', () => {
    const debate = engine.getDebate(999);
    expect(debate).toBeNull();
  });

  it('should return null for synthesize on non-existent debate', () => {
    const result = engine.synthesize(999);
    expect(result).toBeNull();
  });

  it('should compute relevance based on argument count and strength', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [
          { id: 'p1', statement: 'CPU load matters a lot', confidence: 0.9, sample_size: 50 },
          { id: 'p2', statement: 'CPU load correlates with errors', confidence: 0.8, sample_size: 30 },
          { id: 'p3', statement: 'CPU monitoring is essential', confidence: 0.7, sample_size: 20 },
        ],
        anti_patterns: [],
        strategies: [],
      }),
    };

    engine.setDataSources({ knowledgeDistiller: mockDistiller as never });
    const p = engine.generatePerspective('CPU load impact?');

    expect(p.relevance).toBeGreaterThan(0);
    expect(p.relevance).toBeLessThanOrEqual(1);
  });

  it('should generate recommendations for multi-brain agreement', () => {
    const debate = engine.startDebate('dummy?');

    // Two brains with overlapping claims
    engine.addPerspective(debate.id!, {
      brainName: 'brain-a',
      position: 'Errors increase at night.',
      arguments: [{ claim: 'Night shift has fewer ops engineers', evidence: ['data'], source: 'journal', strength: 0.8 }],
      confidence: 0.7,
      relevance: 0.6,
    });

    engine.addPerspective(debate.id!, {
      brainName: 'brain-b',
      position: 'Night errors are a staffing issue.',
      arguments: [{ claim: 'Night shift has fewer ops engineers', evidence: ['data'], source: 'principle', strength: 0.7 }],
      confidence: 0.8,
      relevance: 0.7,
    });

    const synthesis = engine.synthesize(debate.id!);
    expect(synthesis!.recommendations.length).toBeGreaterThan(0);
  });

  it('should track status correctly after multiple debates', () => {
    const d1 = engine.startDebate('Q1?');
    engine.synthesize(d1.id!);

    const d2 = engine.startDebate('Q2?');
    engine.synthesize(d2.id!);

    engine.startDebate('Q3?'); // Still open/deliberating

    const status = engine.getStatus();
    expect(status.totalDebates).toBe(3);
    expect(status.synthesizedDebates).toBe(2);
    expect(status.openDebates).toBe(1); // deliberating counts as open
    expect(status.recentDebates.length).toBe(3);
  });

  it('should handle perspective generation from predictions', () => {
    const mockPrediction = {
      getSummary: () => ({
        total_predictions: 50,
        accuracy_rate: 0.72,
        pending: 5,
        resolved: 45,
        by_domain: [],
        calibration_offset: 0,
      }),
    };

    engine.setDataSources({ predictionEngine: mockPrediction as never });
    const p = engine.generatePerspective('prediction accuracy matters');

    expect(p.arguments.some(a => a.source === 'prediction')).toBe(true);
  });

  it('should handle perspective generation from narrative', () => {
    const mockNarrative = {
      explain: () => ({
        topic: 'errors',
        summary: 'Error patterns show clear temporal correlation with deployment cycles.',
        details: ['Detail 1', 'Detail 2'],
        confidence: 0.75,
        sources: ['data'],
        generatedAt: Date.now(),
      }),
    };

    engine.setDataSources({ narrativeEngine: mockNarrative as never });
    const p = engine.generatePerspective('What about errors?');

    expect(p.arguments.some(a => a.source === 'narrative')).toBe(true);
  });

  it('should sort arguments by strength', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [
          { id: 'weak', statement: 'Errors sometimes happen at night', confidence: 0.3, sample_size: 2 },
          { id: 'strong', statement: 'Errors always spike during deploy', confidence: 0.95, sample_size: 100 },
        ],
        anti_patterns: [],
        strategies: [],
      }),
    };

    engine.setDataSources({ knowledgeDistiller: mockDistiller as never });
    const p = engine.generatePerspective('errors at night during deploy?');

    expect(p.arguments.length).toBe(2);
    expect(p.arguments[0].strength).toBeGreaterThanOrEqual(p.arguments[1].strength);
  });

  // ── Advocatus Diaboli: Principle Challenges ──────────

  it('should challenge a principle with no data sources', () => {
    const result = engine.challenge('Errors always increase at night');
    expect(result.principleStatement).toBe('Errors always increase at night');
    expect(result.resilienceScore).toBeDefined();
    expect(result.outcome).toBeDefined();
    expect(['survived', 'weakened', 'disproved']).toContain(result.outcome);
    expect(result.challengeArguments).toBeInstanceOf(Array);
    expect(result.supportingEvidence).toBeInstanceOf(Array);
    expect(result.contradictingEvidence).toBeInstanceOf(Array);
    expect(result.challengedAt).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it('should mark principle as survived with only supporting evidence', () => {
    const mockDistiller = {
      getPackage: () => ({
        principles: [
          { id: '1', statement: 'Deploy causes errors', confidence: 0.9, sample_size: 50 },
          { id: '2', statement: 'Errors happen at deploy time', confidence: 0.85, sample_size: 40 },
        ],
        anti_patterns: [],
        strategies: [],
      }),
    };
    const mockHypothesis = {
      list: (status: string) => status === 'confirmed'
        ? [{ statement: 'Deploy correlates with error spikes', status: 'confirmed' }]
        : [],
    };

    engine.setDataSources({
      knowledgeDistiller: mockDistiller as never,
      hypothesisEngine: mockHypothesis as never,
    });

    const result = engine.challenge('Deploy causes errors');
    expect(result.supportingEvidence.length).toBeGreaterThan(0);
    expect(result.resilienceScore).toBeGreaterThan(0.5);
    expect(result.outcome).toBe('survived');
  });

  it('should mark principle as weakened/disproved with contradicting evidence', () => {
    const mockHypothesis = {
      list: (status: string) => status === 'rejected'
        ? [
            { statement: 'Night errors are just noise' },
            { statement: 'Night errors correlate with timezone' },
            { statement: 'Night errors are batch job failures' },
          ]
        : [],
    };

    engine.setDataSources({ hypothesisEngine: mockHypothesis as never });

    const result = engine.challenge('Errors increase at night');
    expect(result.contradictingEvidence.length).toBeGreaterThan(0);
    expect(result.resilienceScore).toBeLessThan(0.5);
    expect(['weakened', 'disproved']).toContain(result.outcome);
  });

  it('should persist challenges and retrieve history', () => {
    engine.challenge('Principle A');
    engine.challenge('Principle B');
    engine.challenge('Principle C');

    const history = engine.getChallengeHistory(10);
    expect(history.length).toBe(3);
    // Most recent first
    expect(history[0].principleStatement).toBe('Principle C');
  });

  it('should return most vulnerable principles sorted by resilience', () => {
    // Create challenges with different resilience scores
    const mockHigh = {
      list: (status: string) => status === 'confirmed'
        ? [{ statement: 'Strong evidence for strong principle' }]
        : [],
      getPackage: () => ({ principles: [{ id: '1', statement: 'Strong principle', confidence: 0.95, sample_size: 100 }], anti_patterns: [], strategies: [] }),
    };
    engine.setDataSources({ hypothesisEngine: mockHigh as never, knowledgeDistiller: mockHigh as never });
    engine.challenge('Strong principle');

    // Reset for weak challenge
    const mockLow = {
      list: (status: string) => status === 'rejected'
        ? [{ statement: 'Counter to weak' }, { statement: 'More counter' }]
        : [],
    };
    engine.setDataSources({ hypothesisEngine: mockLow as never, knowledgeDistiller: undefined as never });
    engine.challenge('Weak principle');

    const vulnerable = engine.getMostVulnerable(5);
    expect(vulnerable.length).toBe(2);
    // Lowest resilience first
    expect(vulnerable[0].resilienceScore).toBeLessThanOrEqual(vulnerable[1].resilienceScore);
  });

  it('should include challenge stats in getStatus', () => {
    engine.challenge('Test principle');
    const status = engine.getStatus();
    expect(status.totalChallenges).toBe(1);
    expect(status.vulnerablePrinciples).toHaveLength(1);
  });
});
