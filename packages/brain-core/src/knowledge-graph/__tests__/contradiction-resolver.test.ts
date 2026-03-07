import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContradictionResolver } from '../contradiction-resolver.js';
import { KnowledgeGraphEngine, runKnowledgeGraphMigration } from '../graph-engine.js';

describe('ContradictionResolver', () => {
  let db: Database.Database;
  let resolver: ContradictionResolver;
  let kg: KnowledgeGraphEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runKnowledgeGraphMigration(db);
    resolver = new ContradictionResolver(db);
    kg = new KnowledgeGraphEngine(db, { brainName: 'test' });
    resolver.setKnowledgeGraph(kg);
  });

  describe('migration', () => {
    it('should create fact_resolutions table', () => {
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name = 'fact_resolutions'`,
      ).all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });
  });

  describe('resolve', () => {
    it('should return 0 when no contradictions exist', () => {
      const resolved = resolver.resolve();
      expect(resolved).toBe(0);
    });

    it('should return 0 without knowledge graph', () => {
      const standalone = new ContradictionResolver(db);
      expect(standalone.resolve()).toBe(0);
    });

    it('should resolve confidence_gap contradictions by demoting weaker fact', () => {
      // Both facts must be above the highConfidenceThreshold (0.5) to be detected as contradictions
      // But with a >0.3 gap to classify as confidence_gap
      kg.addFact('TypeScript', 'is_best_for', 'large projects', 'enterprise', 0.95);
      kg.addFact('TypeScript', 'is_best_for', 'small scripts', 'personal', 0.55);

      const resolved = resolver.resolve();
      expect(resolved).toBe(1);

      const history = resolver.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]!.contradiction_type).toBe('confidence_gap');
      expect(history[0]!.strategy).toBe('demote');

      // Verify the weaker fact was demoted
      const facts = kg.query({ subject: 'TypeScript', predicate: 'is_best_for' });
      const demoted = facts.find(f => f.object === 'small scripts');
      expect(demoted!.confidence).toBeLessThan(0.55);
    });

    it('should not re-resolve already resolved contradictions', () => {
      kg.addFact('Node', 'is_best_for', 'servers', undefined, 0.9);
      kg.addFact('Node', 'is_best_for', 'desktop apps', undefined, 0.6);

      resolver.resolve();
      const first = resolver.getHistory().length;
      resolver.resolve();
      const second = resolver.getHistory().length;
      expect(second).toBe(first);
    });

    it('should classify contextual contradictions when context exists', () => {
      // Two facts with similar confidence but different context
      kg.addFact('React', 'performs', 'fast', 'client-side rendering', 0.8);
      kg.addFact('React', 'performs', 'slow', 'server-side rendering', 0.75);

      const resolved = resolver.resolve();
      expect(resolved).toBe(1);

      const history = resolver.getHistory();
      expect(history[0]!.strategy).toBe('contextualize');
    });
  });

  describe('getStatus', () => {
    it('should return empty status initially', () => {
      const status = resolver.getStatus();
      expect(status.totalResolved).toBe(0);
      expect(status.byType.confidence_gap).toBe(0);
      expect(status.byType.temporal).toBe(0);
      expect(status.byType.contextual).toBe(0);
      expect(status.byType.trade_off).toBe(0);
      expect(status.byStrategy.demote).toBe(0);
      expect(status.lastResolveAt).toBeNull();
    });

    it('should track resolution stats', () => {
      kg.addFact('Go', 'is_best_for', 'systems', undefined, 0.9);
      kg.addFact('Go', 'is_best_for', 'web apps', undefined, 0.6);

      resolver.resolve();
      const status = resolver.getStatus();
      expect(status.totalResolved).toBe(1);
      expect(status.lastResolveAt).not.toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return empty array initially', () => {
      expect(resolver.getHistory()).toEqual([]);
    });

    it('should limit results', () => {
      // Create multiple contradictions
      for (let i = 0; i < 5; i++) {
        kg.addFact(`Topic${i}`, 'relates_to', 'A', undefined, 0.9);
        kg.addFact(`Topic${i}`, 'relates_to', 'B', undefined, 0.6);
      }
      resolver.resolve();
      const limited = resolver.getHistory(3);
      expect(limited.length).toBeLessThanOrEqual(3);
    });
  });

  describe('trade_off classification', () => {
    it('should accept trade-offs when facts have similar confidence and no context', () => {
      // Similar confidence, no context, not temporal
      kg.addFact('Architecture', 'favors', 'microservices', undefined,0.7);
      kg.addFact('Architecture', 'favors', 'monolith', undefined,0.65);

      resolver.resolve();
      const history = resolver.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]!.strategy).toBe('accept_tradeoff');
    });
  });
});
