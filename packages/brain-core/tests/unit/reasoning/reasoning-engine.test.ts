import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReasoningEngine } from '../../../src/reasoning/reasoning-engine.js';

describe('ReasoningEngine', () => {
  let db: Database.Database;
  let engine: ReasoningEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new ReasoningEngine(db, { brainName: 'test-brain' });
  });

  // ── Table creation ────────────────────────────────────

  it('should create tables on construction', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('inference_rules', 'inference_chains', 'reasoning_log')",
    ).all() as { name: string }[];
    const names = tables.map(t => t.name).sort();
    expect(names).toContain('inference_chains');
    expect(names).toContain('inference_rules');
    expect(names).toContain('reasoning_log');
  });

  // ── getStatus ─────────────────────────────────────────

  it('should return empty status initially', () => {
    const status = engine.getStatus();
    expect(status.ruleCount).toBe(0);
    expect(status.chainCount).toBe(0);
    expect(status.avgConfidence).toBe(0);
    expect(status.domains).toEqual([]);
    expect(status.recentChains).toBe(0);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  // ── buildRules ────────────────────────────────────────

  it('should build rules from confirmed hypotheses', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Error rate increases during deployments', variables: ['error_rate', 'deployment'], condition: { type: 'correlation', params: {} }, confidence: 0.85 },
        { id: 2, statement: 'Memory usage spikes cause crashes', variables: ['memory_usage'], condition: { type: 'threshold', params: {} }, confidence: 0.72 },
      ],
    });
    const result = engine.buildRules();
    expect(result.added).toBe(2);
    expect(result.total).toBe(2);
  });

  it('should build rules from high-confidence principles', () => {
    engine.setDataSources({
      getPrinciples: () => [
        { id: 'p1', statement: 'High complexity leads to more errors', confidence: 0.8, domain: 'coding' },
        { id: 'p2', statement: 'Low test coverage is risky', confidence: 0.6, domain: 'quality' },
        { id: 'p3', statement: 'Ignored due to low confidence', confidence: 0.3, domain: 'misc' },
      ],
    });
    const result = engine.buildRules();
    expect(result.added).toBe(2); // p3 below 0.5 threshold
    expect(result.total).toBe(2);
  });

  it('should build rules from causal edges', () => {
    engine.setDataSources({
      getCausalEdges: () => [
        { cause: 'deploy', effect: 'error_spike', strength: 0.7, confidence: 0.8, lag_ms: 5000 },
        { cause: 'error_spike', effect: 'rollback', strength: 0.6, confidence: 0.9, lag_ms: 30000 },
      ],
    });
    const result = engine.buildRules();
    expect(result.added).toBe(2);
    expect(result.total).toBe(2);
  });

  it('should upsert rules on repeated buildRules', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Error rate increases', variables: ['error_rate'], condition: { type: 'correlation', params: {} }, confidence: 0.8 },
      ],
    });
    engine.buildRules();
    const r2 = engine.buildRules();
    expect(r2.total).toBe(1); // Still 1, upserted
  });

  it('should build rules from all sources combined', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Hypothesis one', variables: ['var1'], condition: { type: 'correlation', params: {} }, confidence: 0.9 },
      ],
      getPrinciples: () => [
        { id: 'p1', statement: 'Principle leads to outcome', confidence: 0.75, domain: 'general' },
      ],
      getCausalEdges: () => [
        { cause: 'event_a', effect: 'event_b', strength: 0.8, confidence: 0.7, lag_ms: 1000 },
      ],
    });
    const result = engine.buildRules();
    expect(result.added).toBe(3);
    expect(result.total).toBe(3);
  });

  // ── getRules ──────────────────────────────────────────

  it('should return rules filtered by confidence', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'High conf', variables: ['x'], condition: { type: 'correlation', params: {} }, confidence: 0.9 },
        { id: 2, statement: 'Low conf', variables: ['y'], condition: { type: 'correlation', params: {} }, confidence: 0.3 },
      ],
    });
    engine.buildRules();

    const highConf = engine.getRules(50, 0.5);
    expect(highConf.length).toBe(1);
    expect(highConf[0]!.confidence).toBe(0.9);

    const allRules = engine.getRules(50, 0);
    expect(allRules.length).toBe(2);
  });

  // ── infer ─────────────────────────────────────────────

  it('should return null for empty query', () => {
    const result = engine.infer('');
    expect(result).toBeNull();
  });

  it('should return null when no rules exist', () => {
    const result = engine.infer('error patterns');
    expect(result).toBeNull();
  });

  it('should infer a single-step chain', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Error rate increases during deployments', variables: ['error_rate', 'deployment'], condition: { type: 'correlation', params: {} }, confidence: 0.85 },
      ],
    });
    engine.buildRules();

    const chain = engine.infer('error rate deployment');
    expect(chain).not.toBeNull();
    expect(chain!.steps.length).toBeGreaterThanOrEqual(1);
    expect(chain!.final_confidence).toBeGreaterThan(0);
    expect(chain!.chain_type).toBe('forward');
    expect(chain!.id).toBeGreaterThan(0);
  });

  it('should infer multi-step chains', () => {
    engine.setDataSources({
      getCausalEdges: () => [
        { cause: 'deploy', effect: 'error_spike', strength: 0.8, confidence: 0.9, lag_ms: 5000 },
        { cause: 'error_spike', effect: 'rollback', strength: 0.7, confidence: 0.85, lag_ms: 30000 },
      ],
    });
    engine.buildRules();

    const chain = engine.infer('deploy');
    expect(chain).not.toBeNull();
    expect(chain!.steps.length).toBeGreaterThanOrEqual(1);
    expect(chain!.conclusion).toBeTruthy();
  });

  it('should not revisit rules in forward chaining', () => {
    engine.setDataSources({
      getCausalEdges: () => [
        { cause: 'alpha', effect: 'beta', strength: 0.9, confidence: 0.9, lag_ms: 1000 },
        { cause: 'beta', effect: 'alpha', strength: 0.8, confidence: 0.8, lag_ms: 1000 }, // cycle
      ],
    });
    engine.buildRules();

    const chain = engine.infer('alpha beta');
    // Should not loop forever
    expect(chain).not.toBeNull();
    expect(chain!.steps.length).toBeLessThanOrEqual(2);
  });

  // ── abduce ────────────────────────────────────────────

  it('should return empty for no matching observation', () => {
    const explanations = engine.abduce('completely unknown phenomenon xyz123');
    expect(explanations).toEqual([]);
  });

  it('should find explanations via abductive reasoning', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Error rate increases during deployments', variables: ['error_rate', 'deployment'], condition: { type: 'correlation', params: {} }, confidence: 0.85 },
        { id: 2, statement: 'Memory spikes cause crashes and downtime', variables: ['memory', 'crash'], condition: { type: 'threshold', params: {} }, confidence: 0.7 },
      ],
    });
    engine.buildRules();

    const explanations = engine.abduce('error rate increases');
    expect(explanations.length).toBeGreaterThanOrEqual(1);
    expect(explanations[0]!.score).toBeGreaterThan(0);
    expect(explanations[0]!.coverage).toBeGreaterThan(0);
  });

  it('should limit abductive results to top 5', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () =>
        Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          statement: `error pattern variant ${i} explanation`,
          variables: ['error', 'pattern'],
          condition: { type: 'correlation' as const, params: {} },
          confidence: 0.9 - i * 0.05,
        })),
    });
    engine.buildRules();

    const explanations = engine.abduce('error pattern explanation');
    expect(explanations.length).toBeLessThanOrEqual(5);
  });

  // ── temporalInfer ─────────────────────────────────────

  it('should return null without causal data sources', () => {
    const result = engine.temporalInfer('deploy');
    expect(result).toBeNull();
  });

  it('should build temporal chains from causal effects', () => {
    engine.setDataSources({
      getCausalEffects: (eventType: string) => {
        const graph: Record<string, Array<{ cause: string; effect: string; strength: number; confidence: number; lag_ms: number }>> = {
          deploy: [{ cause: 'deploy', effect: 'build', strength: 0.9, confidence: 0.8, lag_ms: 5000 }],
          build: [{ cause: 'build', effect: 'test', strength: 0.85, confidence: 0.75, lag_ms: 30000 }],
          test: [{ cause: 'test', effect: 'release', strength: 0.8, confidence: 0.7, lag_ms: 60000 }],
        };
        return graph[eventType] ?? [];
      },
    });

    const chain = engine.temporalInfer('deploy');
    expect(chain).not.toBeNull();
    expect(chain!.steps.length).toBe(3);
    expect(chain!.total_lag_ms).toBe(95000);
    expect(chain!.narrative).toContain('deploy');
    expect(chain!.narrative).toContain('release');
  });

  it('should stop temporal chain on low confidence', () => {
    engine.setDataSources({
      getCausalEffects: (eventType: string) => {
        const graph: Record<string, Array<{ cause: string; effect: string; strength: number; confidence: number; lag_ms: number }>> = {
          a: [{ cause: 'a', effect: 'b', strength: 0.5, confidence: 0.2, lag_ms: 100 }],
          b: [{ cause: 'b', effect: 'c', strength: 0.5, confidence: 0.2, lag_ms: 100 }],
          c: [{ cause: 'c', effect: 'd', strength: 0.5, confidence: 0.2, lag_ms: 100 }],
        };
        return graph[eventType] ?? [];
      },
    });

    const chain = engine.temporalInfer('a');
    // Should stop early due to confidence dampening
    expect(chain).not.toBeNull();
    expect(chain!.steps.length).toBeLessThanOrEqual(2);
  });

  // ── counterfactual ────────────────────────────────────

  it('should return empty result for event with no effects', () => {
    engine.setDataSources({
      getCausalEffects: () => [],
    });
    const result = engine.counterfactual('isolated_event');
    expect(result.affected_effects).toEqual([]);
    expect(result.narrative).toContain('no known downstream effects');
  });

  it('should find downstream effects via BFS', () => {
    engine.setDataSources({
      getCausalEffects: (eventType: string) => {
        const graph: Record<string, Array<{ cause: string; effect: string; strength: number; confidence: number; lag_ms: number }>> = {
          root: [
            { cause: 'root', effect: 'child_a', strength: 0.8, confidence: 0.9, lag_ms: 1000 },
            { cause: 'root', effect: 'child_b', strength: 0.7, confidence: 0.8, lag_ms: 2000 },
          ],
          child_a: [{ cause: 'child_a', effect: 'grandchild', strength: 0.6, confidence: 0.7, lag_ms: 3000 }],
        };
        return graph[eventType] ?? [];
      },
    });

    const result = engine.counterfactual('root');
    expect(result.affected_effects).toContain('child_a');
    expect(result.affected_effects).toContain('child_b');
    expect(result.affected_effects).toContain('grandchild');
    expect(result.affected_effects.length).toBe(3);
    expect(result.narrative).toContain('3 downstream effects');
  });

  // ── getProofTree ──────────────────────────────────────

  it('should retrieve stored proof tree by chain ID', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Error rate increases during deployments', variables: ['error_rate', 'deployment'], condition: { type: 'correlation', params: {} }, confidence: 0.85 },
      ],
    });
    engine.buildRules();
    const chain = engine.infer('error rate deployment');
    expect(chain).not.toBeNull();

    const proof = engine.getProofTree(chain!.id!);
    expect(proof).not.toBeNull();
    expect(proof!.id).toBe(chain!.id);
    expect(proof!.steps.length).toBeGreaterThanOrEqual(1);
    expect(proof!.conclusion).toBe(chain!.conclusion);
  });

  it('should return null for non-existent chain ID', () => {
    const proof = engine.getProofTree(9999);
    expect(proof).toBeNull();
  });

  // ── Integration ───────────────────────────────────────

  it('should handle all source types simultaneously', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Hypothesis about error patterns', variables: ['error'], condition: { type: 'correlation', params: {} }, confidence: 0.8 },
      ],
      getPrinciples: () => [
        { id: 'p1', statement: 'Complexity causes errors', confidence: 0.7, domain: 'dev' },
      ],
      getCausalEdges: () => [
        { cause: 'high_load', effect: 'slow_response', strength: 0.75, confidence: 0.85, lag_ms: 200 },
      ],
    });

    const buildResult = engine.buildRules();
    expect(buildResult.total).toBe(3);

    const status = engine.getStatus();
    expect(status.ruleCount).toBe(3);
    expect(status.domains.length).toBeGreaterThanOrEqual(1);
  });

  it('should persist reasoning log entries', () => {
    engine.setDataSources({
      getConfirmedHypotheses: () => [
        { id: 1, statement: 'Test statement about patterns', variables: ['patterns'], condition: { type: 'correlation', params: {} }, confidence: 0.8 },
      ],
    });
    engine.buildRules();

    // Trigger some reasoning
    engine.infer('patterns test');
    engine.abduce('patterns test');

    // Check log entries
    const logs = db.prepare('SELECT * FROM reasoning_log ORDER BY id').all() as Array<{ reasoning_type: string }>;
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
