import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  SelfModificationEngine,
  runSelfModificationMigration,
} from '../self-modification-engine.js';
import type { SelfModification, ProposalMeta } from '../self-modification-engine.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('SelfModificationEngine', () => {
  let db: Database.Database;
  let engine: SelfModificationEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runSelfModificationMigration(db);
    engine = new SelfModificationEngine(db, {
      brainName: 'test-brain',
      maxPerHour: 10,
      maxChangedLines: 200,
    });
  });

  afterEach(() => {
    db.close();
  });

  // ── 1. Creation ──────────────────────────────────────────

  it('should create the self_modifications table on construction', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='self_modifications'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('self_modifications');
  });

  it('should include experiment ledger columns after migration', () => {
    const columns = db.pragma('table_info(self_modifications)') as { name: string }[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('hypothesis');
    expect(colNames).toContain('risk_level');
    expect(colNames).toContain('expected_impact');
    expect(colNames).toContain('acceptance_criteria');
    expect(colNames).toContain('reason_code');
    expect(colNames).toContain('metrics_before');
    expect(colNames).toContain('metrics_after');
  });

  // ── 2. getStatus (initial) ───────────────────────────────

  it('should return correct initial status with zero modifications', () => {
    const status = engine.getStatus();
    expect(status.brainName).toBe('test-brain');
    expect(status.totalModifications).toBe(0);
    expect(status.byStatus).toEqual({});
    expect(status.lastModification).toBeNull();
    expect(status.projectRoot).toBeNull();
  });

  // ── 3. propose (creates a modification) ──────────────────

  it('should create a proposed modification with correct fields', () => {
    const mod = engine.proposeModification(
      'Refactor utils',
      'Extract shared helpers into a utility module',
      ['packages/brain-core/src/utils/helpers.ts'],
      'orchestrator',
    );

    expect(mod.id).toBe(1);
    expect(mod.title).toBe('Refactor utils');
    expect(mod.problem_description).toBe('Extract shared helpers into a utility module');
    expect(mod.source_engine).toBe('orchestrator');
    expect(mod.target_files).toEqual(['packages/brain-core/src/utils/helpers.ts']);
    expect(mod.status).toBe('proposed');
    expect(mod.test_result).toBe('pending');
    expect(mod.generated_diff).toBeNull();
    expect(mod.applied_at).toBeNull();
    expect(mod.rollback_data).toBeNull();
    expect(mod.tokens_used).toBe(0);
    expect(mod.created_at).toBeTruthy();
  });

  it('should store proposal metadata when provided', () => {
    const meta: ProposalMeta = {
      hypothesis: 'Extracting helpers will reduce duplication by 20%',
      risk_level: 'low',
      expected_impact: [
        { metric: 'loc_duplicated', direction: 'decrease', target: '-20%' },
      ],
      acceptance_criteria: ['Build passes', 'All tests green'],
    };

    const mod = engine.proposeModification(
      'Deduplicate helpers',
      'Reduce duplicated code',
      ['packages/brain-core/src/utils/shared.ts'],
      'orchestrator',
      meta,
    );

    expect(mod.hypothesis).toBe('Extracting helpers will reduce duplication by 20%');
    expect(mod.risk_level).toBe('low');
    expect(mod.expected_impact).toEqual([
      { metric: 'loc_duplicated', direction: 'decrease', target: '-20%' },
    ]);
    expect(mod.acceptance_criteria).toEqual(['Build passes', 'All tests green']);
  });

  it('should reject paths outside whitelist (node_modules)', () => {
    expect(() =>
      engine.proposeModification('Bad', 'Problem', ['node_modules/foo/bar.ts']),
    ).toThrow('Path not allowed');
  });

  it('should reject test file paths', () => {
    expect(() =>
      engine.proposeModification('Bad', 'Problem', ['packages/brain-core/src/engine.test.ts']),
    ).toThrow('Path not allowed');
  });

  it('should reject protected core paths (guardrails)', () => {
    expect(() =>
      engine.proposeModification('Bad', 'Problem', ['packages/brain-core/src/guardrails/engine.ts']),
    ).toThrow('Path not allowed');
  });

  // ── 4. getModification (by id) ───────────────────────────

  it('should retrieve a modification by id', () => {
    engine.proposeModification('First', 'Problem 1', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('Second', 'Problem 2', ['packages/brain-core/src/b.ts']);

    const mod = engine.getModification(2);
    expect(mod).not.toBeNull();
    expect(mod!.title).toBe('Second');
    expect(mod!.id).toBe(2);
  });

  it('should return null for a non-existent id', () => {
    const mod = engine.getModification(999);
    expect(mod).toBeNull();
  });

  // ── 5. getPending ────────────────────────────────────────

  it('should return all proposed and ready modifications', () => {
    engine.proposeModification('A', 'P-A', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('B', 'P-B', ['packages/brain-core/src/b.ts']);
    engine.proposeModification('C', 'P-C', ['packages/brain-core/src/c.ts']);

    // Reject one so it should NOT appear in pending
    engine.rejectModification(2);

    const pending = engine.getPending();
    expect(pending).toHaveLength(2);
    const titles = pending.map(p => p.title);
    expect(titles).toContain('A');
    expect(titles).toContain('C');
    expect(titles).not.toContain('B');
  });

  it('should return pending in descending id order (newest first)', () => {
    engine.proposeModification('First', 'P1', ['packages/brain-core/src/x.ts']);
    engine.proposeModification('Second', 'P2', ['packages/brain-core/src/y.ts']);

    const pending = engine.getPending();
    expect(pending[0]!.title).toBe('Second');
    expect(pending[1]!.title).toBe('First');
  });

  // ── 6. approve / reject ─────────────────────────────────

  it('should reject a modification with notes and reason code', () => {
    engine.proposeModification('Reject me', 'Problem', ['packages/brain-core/src/foo.ts']);
    const rejected = engine.rejectModification(1, 'Breaks public API', 'API_BREAK');

    expect(rejected.status).toBe('rejected');
    expect(rejected.test_output).toContain('Breaks public API');
    expect(rejected.reason_code).toBe('API_BREAK');
  });

  it('should reject without notes (keeps existing test_output)', () => {
    engine.proposeModification('Reject silent', 'Problem', ['packages/brain-core/src/foo.ts']);
    const rejected = engine.rejectModification(1);

    expect(rejected.status).toBe('rejected');
    // test_output stays null since no notes were provided and no prior output existed
    expect(rejected.test_output).toBeNull();
  });

  it('should throw when approving a non-ready modification', () => {
    engine.proposeModification('Not ready', 'Problem', ['packages/brain-core/src/foo.ts']);
    expect(() => engine.approveModification(1)).toThrow('not ready');
  });

  it('should throw when approving a non-existent modification', () => {
    expect(() => engine.approveModification(999)).toThrow('not found');
  });

  // ── 7. getHistory ────────────────────────────────────────

  it('should return history limited to requested count', () => {
    engine.proposeModification('H1', 'P', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('H2', 'P', ['packages/brain-core/src/b.ts']);
    engine.proposeModification('H3', 'P', ['packages/brain-core/src/c.ts']);
    engine.proposeModification('H4', 'P', ['packages/brain-core/src/d.ts']);

    const history = engine.getHistory(2);
    expect(history).toHaveLength(2);
    // Most recent first
    expect(history[0]!.title).toBe('H4');
    expect(history[1]!.title).toBe('H3');
  });

  it('should return all modifications when limit exceeds count', () => {
    engine.proposeModification('Only', 'P', ['packages/brain-core/src/a.ts']);
    const history = engine.getHistory(50);
    expect(history).toHaveLength(1);
  });

  // ── 8. recordMetrics ─────────────────────────────────────

  it('should record before and after metrics for experiment tracking', () => {
    engine.proposeModification('Metrics', 'Measure impact', ['packages/brain-core/src/foo.ts']);

    engine.recordMetrics(1, 'before', { test_count: 200, coverage: 75 });
    engine.recordMetrics(1, 'after', { test_count: 210, coverage: 78 });

    const mod = engine.getModification(1)!;
    expect(mod.metrics_before).toEqual({ test_count: 200, coverage: 75 });
    expect(mod.metrics_after).toEqual({ test_count: 210, coverage: 78 });
  });

  // ── 9. Status counts after mixed operations ──────────────

  it('should track status counts correctly across operations', () => {
    engine.proposeModification('S1', 'P', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('S2', 'P', ['packages/brain-core/src/b.ts']);
    engine.proposeModification('S3', 'P', ['packages/brain-core/src/c.ts']);

    engine.rejectModification(1);
    engine.rejectModification(2, 'Not needed', 'NOT_NEEDED');

    const status = engine.getStatus();
    expect(status.totalModifications).toBe(3);
    expect(status.byStatus.proposed).toBe(1);
    expect(status.byStatus.rejected).toBe(2);
    expect(status.lastModification).toBeTruthy();
  });

  // ── 10. Crash recovery ──────────────────────────────────

  it('should recover modifications stuck in testing state on construction', () => {
    // Manually insert a row stuck in "testing" status (simulates a crash)
    db.prepare(`
      INSERT INTO self_modifications (title, problem_description, target_files, status, rollback_data)
      VALUES ('Crashed mod', 'was mid-test', '[]', 'testing', '[]')
    `).run();

    // Creating a new engine instance triggers crash recovery
    const engine2 = new SelfModificationEngine(db, { brainName: 'recovery-brain' });
    const recovered = engine2.getModification(1);

    expect(recovered).not.toBeNull();
    expect(recovered!.status).toBe('failed');
    expect(recovered!.test_output).toContain('crash');
  });

  // ── 11. generateCode guards ──────────────────────────────

  it('should throw when generating code for non-existent modification', async () => {
    await expect(engine.generateCode(999)).rejects.toThrow('not found');
  });

  it('should throw when generating code for a rejected modification', async () => {
    engine.proposeModification('Rejected', 'Problem', ['packages/brain-core/src/foo.ts']);
    engine.rejectModification(1);
    await expect(engine.generateCode(1)).rejects.toThrow("not in 'proposed' state");
  });

  // ── 12. rollback guards ──────────────────────────────────

  it('should throw when rolling back a non-applied modification', () => {
    engine.proposeModification('Not applied', 'Problem', ['packages/brain-core/src/foo.ts']);
    expect(() => engine.rollbackModification(1)).toThrow('not applied');
  });

  it('should throw when rolling back a non-existent modification', () => {
    expect(() => engine.rollbackModification(999)).toThrow('not found');
  });

  // ── 13. testModification guard ───────────────────────────

  it('should throw when testing without projectRoot configured', () => {
    engine.proposeModification('No root', 'Problem', ['packages/brain-core/src/foo.ts']);
    db.prepare(
      `UPDATE self_modifications SET generated_diff = ? WHERE id = 1`,
    ).run(
      JSON.stringify([
        {
          filePath: 'packages/brain-core/src/foo.ts',
          oldContent: 'const a = 1;',
          newContent: 'const a = 2;',
        },
      ]),
    );
    expect(() => engine.testModification(1)).toThrow('projectRoot');
  });

  it('should throw when testing a modification with no generated code', () => {
    engine.proposeModification('No code', 'Problem', ['packages/brain-core/src/foo.ts']);
    // generated_diff is null by default
    expect(() => engine.testModification(1)).toThrow('no generated code');
  });

  // ── 14. Multiple target files ────────────────────────────

  it('should handle multiple target files in a single proposal', () => {
    const mod = engine.proposeModification('Multi-file', 'Refactor across files', [
      'packages/brain-core/src/alpha.ts',
      'packages/brain-core/src/beta.ts',
      'packages/brain-core/src/gamma.ts',
    ]);

    expect(mod.target_files).toHaveLength(3);
    expect(mod.target_files).toEqual([
      'packages/brain-core/src/alpha.ts',
      'packages/brain-core/src/beta.ts',
      'packages/brain-core/src/gamma.ts',
    ]);
  });
});
