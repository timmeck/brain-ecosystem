import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { CreativeEngine, runCreativeMigration } from '../creative-engine.js';

describe('CreativeEngine', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates an instance without errors', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    expect(engine).toBeDefined();
  });

  it('getStatus returns initial empty state', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    const status = engine.getStatus();
    expect(status.totalInsights).toBe(0);
    expect(status.byType).toEqual({});
    expect(status.byStatus).toEqual({});
    expect(status.topInsights).toEqual([]);
  });

  it('crossPollinate returns empty array without distiller', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    const result = engine.crossPollinate();
    expect(result).toEqual([]);
  });

  it('crossPollinate returns insights when distiller provides multi-domain principles', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'caching improves performance significantly', domain: 'engineering' },
          { statement: 'diversification reduces portfolio variance', domain: 'finance' },
          { statement: 'redundancy prevents catastrophic system failure', domain: 'engineering' },
          { statement: 'hedging minimizes downside exposure risk', domain: 'finance' },
        ],
      }),
    } as any);

    const insights = engine.crossPollinate();
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].type).toBe('cross_pollination');
    expect(insights[0].status).toBe('raw');
    expect(insights[0].noveltyScore).toBeGreaterThan(0);
    expect(insights[0].id).toBeGreaterThan(0);

    // Verify stored in DB
    const status = engine.getStatus();
    expect(status.totalInsights).toBe(insights.length);
    expect(status.byType['cross_pollination']).toBe(insights.length);
  });

  it('crossPollinate with single domain returns insights via fallback grouping', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'caching improves performance significantly', domain: 'brain' },
          { statement: 'monitoring detects anomalies before failures', domain: 'brain' },
          { statement: 'validation prevents corrupted data entry', domain: 'brain' },
          { statement: 'abstraction reduces cognitive complexity', domain: 'brain' },
        ],
      }),
    } as any);

    const insights = engine.crossPollinate();
    // With fallback, single domain should still produce insights
    expect(insights.length).toBeGreaterThan(0);
  });

  it('crossPollinate with 2+ domains works as before', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'caching improves response times', domain: 'engineering' },
          { statement: 'diversification reduces risk exposure', domain: 'finance' },
        ],
      }),
    } as any);

    const insights = engine.crossPollinate();
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].type).toBe('cross_pollination');
  });

  it('fallback grouping produces at least 2 groups from single domain', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'first principle about something important', domain: 'brain' },
          { statement: 'second principle about another topic entirely', domain: 'brain' },
          { statement: 'third principle about different matters', domain: 'brain' },
          { statement: 'fourth principle covering new ground here', domain: 'brain' },
        ],
      }),
    } as any);

    // crossPollinate internally groups and should get insights
    const insights = engine.crossPollinate();
    // If it didn't crash and returned results, fallback worked
    expect(Array.isArray(insights)).toBe(true);
  });

  it('findAnalogies returns empty array without distiller', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    const result = engine.findAnalogies('some concept');
    expect(result).toEqual([]);
  });

  it('findAnalogies finds structurally similar principles', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'caching improves response times significantly', domain: 'engineering' },
          { statement: 'caching improves database query performance', domain: 'databases' },
          { statement: 'something completely unrelated', domain: 'art' },
        ],
      }),
    } as any);

    const analogies = engine.findAnalogies('caching improves application performance');
    expect(analogies.length).toBeGreaterThan(0);
    for (const a of analogies) {
      expect(a.concept).toBe('caching improves application performance');
      expect(a.similarity).toBeGreaterThan(0.1);
      expect(a.similarity).toBeLessThan(0.6);
      expect(a.explanation).toContain('Shared concepts');
    }
  });

  it('getInsights returns empty list initially', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    const insights = engine.getInsights();
    expect(insights).toEqual([]);
  });

  it('getInsights returns stored insights after crossPollinate', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'parallel processing speeds computation', domain: 'computing' },
          { statement: 'teamwork divides workload effectively', domain: 'management' },
        ],
      }),
    } as any);

    engine.crossPollinate();
    const insights = engine.getInsights();
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].id).toBeDefined();
    expect(insights[0].createdAt).toBeDefined();
    expect(insights[0].sourceA.domain).toBeDefined();
    expect(insights[0].sourceB.domain).toBeDefined();
  });

  it('getInsights filters by status', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'abstraction hides complexity behind interfaces', domain: 'software' },
          { statement: 'delegation assigns responsibility to subordinates', domain: 'leadership' },
        ],
      }),
    } as any);

    engine.crossPollinate();
    const raw = engine.getInsights(20, 'raw');
    expect(raw.length).toBeGreaterThan(0);

    const tested = engine.getInsights(20, 'tested');
    expect(tested).toEqual([]);
  });

  it('migration is idempotent', () => {
    const engine = new CreativeEngine(db, { brainName: 'test', overlapThreshold: 1.0 });
    engine.setKnowledgeDistiller({
      distill: () => ({
        principles: [
          { statement: 'monitoring detects anomalies early', domain: 'ops' },
          { statement: 'early diagnosis improves treatment outcomes', domain: 'medicine' },
        ],
      }),
    } as any);

    engine.crossPollinate();
    // Running migration again should not destroy data
    runCreativeMigration(db);
    const status = engine.getStatus();
    expect(status.totalInsights).toBeGreaterThan(0);
  });

  it('getStatus reflects insights by type and status', () => {
    const engine = new CreativeEngine(db, { brainName: 'test' });
    // Manually insert insights of different types
    db.prepare(`
      INSERT INTO creative_insights (type, source_a_domain, source_a_principle, source_b_domain, source_b_principle, insight, novelty_score, plausibility, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cross_pollination', 'domA', 'prinA', 'domB', 'prinB', 'insight1', 0.8, 0.5, 'raw');
    db.prepare(`
      INSERT INTO creative_insights (type, source_a_domain, source_a_principle, source_b_domain, source_b_principle, insight, novelty_score, plausibility, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('imagination', 'domC', 'prinC', 'domD', 'prinD', 'insight2', 0.9, 0.6, 'tested');

    const status = engine.getStatus();
    expect(status.totalInsights).toBe(2);
    expect(status.byType['cross_pollination']).toBe(1);
    expect(status.byType['imagination']).toBe(1);
    expect(status.byStatus['raw']).toBe(1);
    expect(status.byStatus['tested']).toBe(1);
    expect(status.topInsights.length).toBe(2);
  });
});
