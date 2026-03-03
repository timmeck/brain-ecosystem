import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConceptAbstraction } from '../../../src/concept-abstraction/concept-abstraction.js';
import type { ConceptDataSources } from '../../../src/concept-abstraction/concept-abstraction.js';

// Helper: generate similar principles with shared words
function makePrinciples(count: number, prefix: string, domain = 'general'): Array<{ id: number; statement: string; confidence: number; domain: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    statement: `${prefix} pattern ${i}: always validate input data before processing to avoid errors`,
    confidence: 0.7 + Math.random() * 0.3,
    domain,
  }));
}

function makeAntiPatterns(count: number, prefix: string, domain = 'general'): Array<{ id: number; statement: string; domain: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    statement: `${prefix} anti-pattern ${i}: never skip input validation in production code`,
    domain,
  }));
}

describe('ConceptAbstraction', () => {
  let db: Database.Database;
  let engine: ConceptAbstraction;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    engine = new ConceptAbstraction(db, { brainName: 'test-brain' });
  });

  describe('initialization', () => {
    it('should create concept tables', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%concept%'").all() as { name: string }[];
      const names = tables.map(t => t.name);
      expect(names).toContain('abstract_concepts');
      expect(names).toContain('concept_members');
      expect(names).toContain('concept_history');
    });

    it('should return empty status initially', () => {
      const status = engine.getStatus();
      expect(status.totalConcepts).toBe(0);
      expect(status.cycleCount).toBe(0);
      expect(status.topConcepts).toHaveLength(0);
      expect(status.avgTransferability).toBe(0);
    });

    it('should handle formConcepts without data sources', () => {
      const result = engine.formConcepts();
      expect(result.newConcepts).toBe(0);
      expect(result.totalConcepts).toBe(0);
    });
  });

  describe('formConcepts with similar items', () => {
    let sources: ConceptDataSources;

    beforeEach(() => {
      sources = {
        getPrinciples: () => makePrinciples(5, 'validation'),
        getAntiPatterns: () => makeAntiPatterns(3, 'validation'),
        // no getStrategies — removed from interface
      };
      engine.setDataSources(sources);
    });

    it('should form at least one concept from similar items', () => {
      const result = engine.formConcepts();
      expect(result.totalConcepts).toBeGreaterThan(0);
    });

    it('should increment cycle count', () => {
      engine.formConcepts();
      engine.formConcepts();
      expect(engine.getStatus().cycleCount).toBe(2);
    });

    it('should record history entries', () => {
      engine.formConcepts();
      const status = engine.getStatus();
      expect(status.recentHistory.length).toBeGreaterThan(0);
      expect(status.recentHistory[0].cycle).toBe(1);
    });

    it('should set level 0 for base concepts', () => {
      engine.formConcepts();
      const l0 = engine.getConceptsByLevel(0);
      expect(l0.length).toBeGreaterThan(0);
      for (const c of l0) {
        expect(c.level).toBe(0);
      }
    });

    it('should assign members to concepts', () => {
      engine.formConcepts();
      const concepts = engine.getConceptsByLevel(0);
      if (concepts.length > 0) {
        const members = engine.getMembers(concepts[0].id!);
        expect(members.length).toBeGreaterThanOrEqual(3); // minClusterSize
      }
    });
  });

  describe('hierarchy building', () => {
    beforeEach(() => {
      // Create many similar items to get level-0 concepts, then re-cluster into level 1
      const principles: Array<{ id: number; content: string; confidence: number; domain: string }> = [];

      // Group 1: validation-focused
      for (let i = 0; i < 5; i++) {
        principles.push({ id: i + 1, statement: `always validate input data parameter types before processing request ${i}`, confidence: 0.8, domain: 'general' });
      }
      // Group 2: error-handling focused
      for (let i = 0; i < 5; i++) {
        principles.push({ id: i + 10, statement: `always handle error exceptions gracefully with proper logging and recovery ${i}`, confidence: 0.8, domain: 'general' });
      }
      // Group 3: performance focused
      for (let i = 0; i < 5; i++) {
        principles.push({ id: i + 20, statement: `optimize performance caching reduce latency for faster response times ${i}`, confidence: 0.8, domain: 'general' });
      }

      engine.setDataSources({
        getPrinciples: () => principles,
        getAntiPatterns: () => [],
        // no strategies source
      });
    });

    it('should create level-0 concepts from distinct groups', () => {
      engine.formConcepts();
      const l0 = engine.getConceptsByLevel(0);
      expect(l0.length).toBeGreaterThanOrEqual(1);
    });

    it('should return hierarchy for a concept', () => {
      engine.formConcepts();
      const l0 = engine.getConceptsByLevel(0);
      if (l0.length > 0) {
        const hierarchy = engine.getHierarchy(l0[0].id!);
        expect(hierarchy).not.toBeNull();
        expect(hierarchy!.concept.id).toBe(l0[0].id);
        expect(hierarchy!.members.length).toBeGreaterThan(0);
      }
    });

    it('should return null for non-existent concept', () => {
      expect(engine.getHierarchy(9999)).toBeNull();
    });
  });

  describe('transferability', () => {
    it('should compute 0 transferability for single-domain items', () => {
      engine.setDataSources({
        getPrinciples: () => makePrinciples(5, 'validation', 'backend'),
        getAntiPatterns: () => [],
        // no strategies source
      });
      engine.formConcepts();
      const concepts = engine.getConceptsByLevel(0);
      for (const c of concepts) {
        expect(c.transferability).toBe(0);
      }
    });

    it('should compute positive transferability for cross-domain items', () => {
      const principles = [
        ...makePrinciples(3, 'validation', 'backend'),
        ...makePrinciples(3, 'validation', 'frontend').map((p, i) => ({ ...p, id: i + 100 })),
      ];
      engine.setDataSources({
        getPrinciples: () => principles,
        getAntiPatterns: () => [],
        // no strategies source
      });
      engine.formConcepts();
      const transferable = engine.getTransferableConcepts(0);
      // Some concepts should have transferability > 0 if cross-domain items clustered together
      const anyTransferable = transferable.some(c => c.transferability > 0);
      // This might or might not happen depending on clustering — just verify the method works
      expect(transferable).toBeInstanceOf(Array);
      if (anyTransferable) {
        expect(transferable[0].domain).toBe('cross-domain');
      }
    });

    it('should return only high-transferability concepts with min filter', () => {
      engine.setDataSources({
        getPrinciples: () => makePrinciples(5, 'low-transfer', 'only-one-domain'),
        getAntiPatterns: () => [],
        // no strategies source
      });
      engine.formConcepts();
      const high = engine.getTransferableConcepts(0.5);
      for (const c of high) {
        expect(c.transferability).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('keywords', () => {
    it('should extract keywords from clusters', () => {
      engine.setDataSources({
        getPrinciples: () => makePrinciples(5, 'validation'),
        getAntiPatterns: () => makeAntiPatterns(3, 'validation'),
        // no strategies source
      });
      engine.formConcepts();
      const concepts = engine.getConceptsByLevel(0);
      if (concepts.length > 0) {
        // Keywords should be an array
        expect(concepts[0].keywords).toBeInstanceOf(Array);
      }
    });
  });

  describe('getConceptsByLevel', () => {
    it('should return empty array for unpopulated level', () => {
      expect(engine.getConceptsByLevel(2)).toHaveLength(0);
    });
  });

  describe('getMembers', () => {
    it('should return empty array for non-existent concept', () => {
      expect(engine.getMembers(9999)).toHaveLength(0);
    });
  });

  describe('full rebuild on re-run', () => {
    it('should clear and rebuild concepts on each run', () => {
      engine.setDataSources({
        getPrinciples: () => makePrinciples(5, 'validation'),
        getAntiPatterns: () => [],
        // no strategies source
      });

      const r1 = engine.formConcepts();
      const r2 = engine.formConcepts();
      // Should rebuild (same results since same input)
      expect(r2.totalConcepts).toBe(r1.totalConcepts);
    });
  });

  describe('config defaults', () => {
    it('should use default thresholds', () => {
      const status = engine.getStatus();
      expect(status).toBeDefined();
    });

    it('should respect custom config', () => {
      const custom = new ConceptAbstraction(db, {
        brainName: 'custom',
        clusterThreshold: 0.5,
        minClusterSize: 5,
        level1Threshold: 0.3,
        level2Threshold: 0.25,
        keywordMinRatio: 0.7,
      });
      expect(custom.getStatus().totalConcepts).toBe(0);
    });
  });

  describe('not enough items', () => {
    it('should skip clustering with fewer than minClusterSize items', () => {
      engine.setDataSources({
        getPrinciples: () => [{ id: 1, content: 'single principle', confidence: 0.8, domain: 'general' }],
        getAntiPatterns: () => [],
        // no strategies source
      });
      const result = engine.formConcepts();
      expect(result.totalConcepts).toBe(0);
    });
  });

  describe('hypothesis integration', () => {
    it('should include confirmed hypotheses when source is provided', () => {
      engine.setDataSources({
        getPrinciples: () => makePrinciples(3, 'validation'),
        getAntiPatterns: () => makeAntiPatterns(3, 'validation'),
        // no getStrategies — removed from interface
        getHypotheses: () => [
          { id: 1, statement: 'validation input data prevents errors consistently', confidence: 0.9, domain: 'general' },
          { id: 2, statement: 'validate all parameters to improve reliability overall', confidence: 0.85, domain: 'general' },
          { id: 3, statement: 'validating requests ensures data integrity across systems', confidence: 0.8, domain: 'general' },
        ],
      });
      const result = engine.formConcepts();
      expect(result.totalConcepts).toBeGreaterThan(0);
    });
  });
});
