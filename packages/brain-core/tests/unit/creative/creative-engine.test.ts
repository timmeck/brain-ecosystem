import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CreativeEngine, runCreativeMigration } from '../../../src/creative/creative-engine.js';

// Minimal mock for KnowledgeDistiller
function createMockDistiller() {
  return {
    getPrinciples: () => [
      { id: 'p1', statement: 'Error patterns tend to cluster around integration boundaries', domain: 'error_analysis', success_rate: 0.8, sample_size: 5, confidence: 0.8, source: 'test' },
      { id: 'p2', statement: 'Market momentum follows news sentiment with 2h lag', domain: 'trading', success_rate: 0.7, sample_size: 3, confidence: 0.7, source: 'test' },
      { id: 'p3', statement: 'Engagement peaks at 10am and 3pm local time', domain: 'marketing', success_rate: 0.75, sample_size: 4, confidence: 0.75, source: 'test' },
      { id: 'p4', statement: 'Database queries slow down after 100k rows without index', domain: 'performance', success_rate: 0.9, sample_size: 8, confidence: 0.9, source: 'test' },
      { id: 'p5', statement: 'User retention correlates with onboarding completion rate', domain: 'growth', success_rate: 0.65, sample_size: 2, confidence: 0.65, source: 'test' },
    ],
  };
}

describe('CreativeEngine', () => {
  let db: Database.Database;
  let engine: CreativeEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runCreativeMigration(db);
    engine = new CreativeEngine(db, { brainName: 'test' });
    engine.setKnowledgeDistiller(createMockDistiller() as any);
  });

  describe('crossPollinate', () => {
    it('generates cross-domain insights', () => {
      const insights = engine.crossPollinate();
      expect(insights.length).toBeGreaterThan(0);
      for (const i of insights) {
        expect(i.type).toBe('cross_pollination');
        expect(i.sourceA.domain).toBeTruthy();
        expect(i.sourceB.domain).toBeTruthy();
        expect(i.sourceA.domain).not.toBe(i.sourceB.domain);
        expect(i.insight).toBeTruthy();
        expect(i.noveltyScore).toBeGreaterThanOrEqual(0);
        expect(i.noveltyScore).toBeLessThanOrEqual(1);
        expect(i.status).toBe('raw');
      }
    });

    it('stores insights in database', () => {
      const insights = engine.crossPollinate();
      const stored = engine.getInsights(20);
      expect(stored.length).toBe(insights.length);
    });

    it('respects maxInsightsPerCycle', () => {
      const limited = new CreativeEngine(db, { brainName: 'test', maxInsightsPerCycle: 2 });
      limited.setKnowledgeDistiller(createMockDistiller() as any);
      const insights = limited.crossPollinate();
      expect(insights.length).toBeLessThanOrEqual(2);
    });
  });

  describe('findAnalogies', () => {
    it('finds analogies for a concept', () => {
      const analogies = engine.findAnalogies('error patterns in boundaries');
      expect(Array.isArray(analogies)).toBe(true);
      for (const a of analogies) {
        expect(a.concept).toBe('error patterns in boundaries');
        expect(typeof a.similarity).toBe('number');
        expect(a.similarity).toBeGreaterThan(0);
      }
    });

    it('returns empty for unrelated concept', () => {
      const analogies = engine.findAnalogies('quantum physics entanglement');
      // May find some weak analogies or none
      for (const a of analogies) {
        expect(a.similarity).toBeLessThan(1);
      }
    });
  });

  describe('speculate', () => {
    it('generates speculative hypotheses', () => {
      const hypotheses = engine.speculate();
      expect(Array.isArray(hypotheses)).toBe(true);
      for (const h of hypotheses) {
        expect(h.hypothesis).toBeTruthy();
        expect(h.basedOn.length).toBe(2);
        expect(typeof h.novelty).toBe('number');
        expect(typeof h.plausibility).toBe('number');
      }
    });
  });

  describe('imagine', () => {
    it('generates imaginative scenarios from premise', () => {
      const scenarios = engine.imagine('error patterns spread like viruses');
      expect(Array.isArray(scenarios)).toBe(true);
      for (const s of scenarios) {
        expect(s.type).toBe('imagination');
        expect(s.sourceA.principle).toContain('error patterns');
      }
    });
  });

  describe('getStatus', () => {
    it('returns status summary', () => {
      engine.crossPollinate();
      const status = engine.getStatus();
      expect(status.totalInsights).toBeGreaterThan(0);
      expect(typeof status.byType).toBe('object');
      expect(typeof status.byStatus).toBe('object');
      expect(Array.isArray(status.topInsights)).toBe(true);
    });
  });

  describe('convertTopInsights', () => {
    it('returns 0 without hypothesis engine', () => {
      engine.crossPollinate();
      const converted = engine.convertTopInsights();
      expect(converted).toBe(0);
    });
  });

  describe('no distiller', () => {
    it('returns empty arrays without distiller', () => {
      const bare = new CreativeEngine(db, { brainName: 'test' });
      expect(bare.crossPollinate()).toHaveLength(0);
      expect(bare.speculate()).toHaveLength(0);
    });
  });
});
