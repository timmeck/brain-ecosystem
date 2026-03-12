import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { KnowledgeDistiller } from '../knowledge-distiller.js';

describe('KnowledgeDistiller — Anti-Pattern Auto-Generation', () => {
  let db: Database.Database;
  let distiller: KnowledgeDistiller;

  beforeEach(() => {
    db = new Database(':memory:');
    distiller = new KnowledgeDistiller(db, { brainName: 'test' });
  });

  describe('createAntiPatternFromRejection', () => {
    it('should create anti-pattern from a rejected hypothesis with enough evidence', () => {
      const result = distiller.createAntiPatternFromRejection({
        statement: 'X correlates with Y',
        type: 'correlation',
        evidence_for: 2,
        evidence_against: 8,
        confidence: 0.2,
      });

      expect(result).not.toBeNull();
      expect(result!.domain).toBe('correlation');
      expect(result!.failure_rate).toBe(0.8);
      expect(result!.statement).toContain('X correlates with Y');
    });

    it('should NOT create anti-pattern from weak rejection (failure_rate < 0.4)', () => {
      const result = distiller.createAntiPatternFromRejection({
        statement: 'Mild hypothesis',
        type: 'temporal',
        evidence_for: 7,
        evidence_against: 3,
        confidence: 0.7,
      });

      // 3/10 = 0.3 failure rate, clearly below threshold
      expect(result).toBeNull();
    });

    it('should NOT create anti-pattern with no evidence', () => {
      const result = distiller.createAntiPatternFromRejection({
        statement: 'No evidence',
        type: 'temporal',
        evidence_for: 0,
        evidence_against: 1,
        confidence: 0,
      });

      expect(result).toBeNull();
    });

    it('should dedup — same hypothesis does not create second anti-pattern', () => {
      distiller.createAntiPatternFromRejection({
        statement: 'Duplicate test',
        type: 'correlation',
        evidence_for: 1,
        evidence_against: 9,
        confidence: 0.1,
      });

      const second = distiller.createAntiPatternFromRejection({
        statement: 'Duplicate test',
        type: 'correlation',
        evidence_for: 1,
        evidence_against: 9,
        confidence: 0.1,
      });

      expect(second).toBeNull();
    });
  });

  describe('createAntiPatternFromPredictionFailure', () => {
    it('should create anti-pattern from wrong prediction with significant error', () => {
      const result = distiller.createAntiPatternFromPredictionFailure({
        domain: 'scanner',
        metric: 'scanner_avg_score',
        predicted_direction: 'up',
        confidence: 0.8,
        error: 0.5,
        reasoning: 'EWMA forecast',
      });

      expect(result).not.toBeNull();
      expect(result!.domain).toBe('scanner');
      expect(result!.statement).toContain('scanner_avg_score');
    });

    it('should NOT create anti-pattern for small errors', () => {
      const result = distiller.createAntiPatternFromPredictionFailure({
        domain: 'metric',
        metric: 'some_metric',
        predicted_direction: 'up',
        confidence: 0.6,
        error: 0.1,
        reasoning: 'test',
      });

      expect(result).toBeNull();
    });
  });

  describe('createStrategyFromHypotheses', () => {
    it('should create strategy from confirmed hypothesis cluster', () => {
      const result = distiller.createStrategyFromHypotheses(
        'correlation',
        ['A correlates with B', 'B correlates with C', 'A+B predict D'],
        5,
      );

      expect(result).not.toBeNull();
      expect(result!.domain).toBe('correlation');
      expect(result!.conditions).toHaveLength(3);
      expect(result!.evidence_count).toBe(5);
    });

    it('should dedup — same domain+statements does not create second strategy', () => {
      distiller.createStrategyFromHypotheses('correlation', ['A', 'B', 'C'], 3);
      const second = distiller.createStrategyFromHypotheses('correlation', ['A', 'B', 'C'], 3);
      expect(second).toBeNull();
    });
  });
});
