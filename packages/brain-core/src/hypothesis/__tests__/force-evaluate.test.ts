import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { HypothesisEngine } from '../engine.js';

describe('HypothesisEngine — forceEvaluateStuck', () => {
  let db: Database.Database;
  let engine: HypothesisEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new HypothesisEngine(db, { minEvidence: 5 });
  });

  it('should auto-reject hypotheses in testing > 72h with weak evidence', () => {
    // Insert a hypothesis stuck in testing for 4 days with weak evidence
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
      VALUES (?, ?, ?, ?, ?, 'testing', 1, 1, 0.5, 0.5, datetime('now', '-5 days'), datetime('now', '-4 days'))
    `).run('Old weak hypothesis', 'correlation', 'test', '[]', '{"type":"correlation","params":{}}');

    const result = engine.forceEvaluateStuck(48, 72);
    expect(result.rejected).toBeGreaterThanOrEqual(1);

    const hyp = db.prepare("SELECT status FROM hypotheses WHERE statement = 'Old weak hypothesis'").get() as { status: string };
    expect(hyp.status).toBe('rejected');
  });

  it('should auto-reject hypotheses > 72h with evidence but low support ratio', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
      VALUES (?, ?, ?, ?, ?, 'testing', 2, 8, 0.2, 0.7, datetime('now', '-5 days'), datetime('now', '-4 days'))
    `).run('Low support hypothesis', 'correlation', 'test', '[]', '{"type":"correlation","params":{}}');

    const result = engine.forceEvaluateStuck(48, 72);
    expect(result.rejected).toBeGreaterThanOrEqual(1);

    const hyp = db.prepare("SELECT status FROM hypotheses WHERE statement = 'Low support hypothesis'").get() as { status: string };
    expect(hyp.status).toBe('rejected');
  });

  it('should mark hypotheses > 48h as inconclusive', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
      VALUES (?, ?, ?, ?, ?, 'testing', 4, 3, 0.57, 0.3, datetime('now', '-3 days'), datetime('now', '-3 days'))
    `).run('Medium hypothesis', 'temporal', 'test', '[]', '{"type":"temporal","params":{}}');

    const result = engine.forceEvaluateStuck(48, 72);
    // Could be rejected (>72h, evidence<5) or inconclusive
    const hyp = db.prepare("SELECT status FROM hypotheses WHERE statement = 'Medium hypothesis'").get() as { status: string };
    expect(['rejected', 'inconclusive']).toContain(hyp.status);
    expect(hyp.status).not.toBe('testing');
  });

  it('should NOT affect recent hypotheses', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
      VALUES (?, ?, ?, ?, ?, 'testing', 2, 1, 0.67, 0.3, datetime('now', '-1 hours'), datetime('now', '-1 hours'))
    `).run('Fresh hypothesis', 'correlation', 'test', '[]', '{"type":"correlation","params":{}}');

    engine.forceEvaluateStuck(48, 72);

    const hyp = db.prepare("SELECT status FROM hypotheses WHERE statement = 'Fresh hypothesis'").get() as { status: string };
    expect(hyp.status).toBe('testing');
  });

  it('should be called automatically by testAll()', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
      VALUES (?, ?, ?, ?, ?, 'testing', 0, 0, 0, 1, datetime('now', '-10 days'), datetime('now', '-10 days'))
    `).run('Ancient zombie hypothesis', 'threshold', 'test', '[]', '{"type":"threshold","params":{}}');

    engine.testAll();

    const hyp = db.prepare("SELECT status FROM hypotheses WHERE statement = 'Ancient zombie hypothesis'").get() as { status: string };
    expect(hyp.status).not.toBe('testing');
  });
});

describe('HypothesisEngine — getConfirmedByType', () => {
  let db: Database.Database;
  let engine: HypothesisEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new HypothesisEngine(db);
  });

  it('should return types with >= 3 confirmed hypotheses', () => {
    for (let i = 0; i < 4; i++) {
      db.prepare(`
        INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value)
        VALUES (?, 'correlation', 'test', '[]', '{"type":"correlation","params":{}}', 'confirmed', 10, 1, 0.9, 0.01)
      `).run(`Confirmed correlation ${i}`);
    }
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value)
      VALUES (?, 'temporal', 'test', '[]', '{"type":"temporal","params":{}}', 'confirmed', 10, 1, 0.9, 0.01)
    `).run('Single temporal');

    const clusters = engine.getConfirmedByType(3);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.type).toBe('correlation');
    expect(clusters[0]!.count).toBe(4);
  });

  it('should return empty if no type has enough confirmed', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value)
      VALUES (?, 'correlation', 'test', '[]', '{"type":"correlation","params":{}}', 'confirmed', 10, 1, 0.9, 0.01)
    `).run('Only one');

    const clusters = engine.getConfirmedByType(3);
    expect(clusters.length).toBe(0);
  });
});
