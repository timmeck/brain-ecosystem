import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SelfModificationEngine } from '../../../src/self-modification/self-modification-engine.js';

describe('SelfModificationEngine', () => {
  let db: Database.Database;
  let engine: SelfModificationEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new SelfModificationEngine(db, {
      brainName: 'test-brain',
      maxPerHour: 10,
      maxChangedLines: 200,
    });
  });

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'self_modifications'").all() as { name: string }[];
    expect(tables.length).toBe(1);
  });

  it('should return empty status initially', () => {
    const status = engine.getStatus();
    expect(status.brainName).toBe('test-brain');
    expect(status.totalModifications).toBe(0);
    expect(status.lastModification).toBeNull();
  });

  it('should propose a valid modification', () => {
    const mod = engine.proposeModification(
      'Test improvement',
      'Improve test coverage',
      ['packages/brain-core/src/test/test.ts'],
    );
    expect(mod.id).toBe(1);
    expect(mod.title).toBe('Test improvement');
    expect(mod.status).toBe('proposed');
    expect(mod.target_files).toEqual(['packages/brain-core/src/test/test.ts']);
  });

  it('should reject paths outside whitelist', () => {
    expect(() => engine.proposeModification(
      'Bad path',
      'Problem',
      ['node_modules/foo/bar.ts'],
    )).toThrow('Path not allowed');
  });

  it('should reject test file paths', () => {
    expect(() => engine.proposeModification(
      'Bad path',
      'Problem',
      ['packages/brain-core/src/test.test.ts'],
    )).toThrow('Path not allowed');
  });

  it('should reject package.json paths', () => {
    expect(() => engine.proposeModification(
      'Bad path',
      'Problem',
      ['packages/brain-core/package.json'],
    )).toThrow('Path not allowed');
  });

  it('should reject dist paths', () => {
    expect(() => engine.proposeModification(
      'Bad path',
      'Problem',
      ['packages/brain-core/dist/index.ts'],
    )).toThrow('Path not allowed');
  });

  it('should reject .d.ts paths', () => {
    expect(() => engine.proposeModification(
      'Bad path',
      'Problem',
      ['packages/brain-core/src/types.d.ts'],
    )).toThrow('Path not allowed');
  });

  it('should get a modification by id', () => {
    engine.proposeModification('Test', 'Problem', ['packages/brain-core/src/foo.ts']);
    const mod = engine.getModification(1);
    expect(mod).not.toBeNull();
    expect(mod!.title).toBe('Test');
  });

  it('should return null for unknown id', () => {
    const mod = engine.getModification(999);
    expect(mod).toBeNull();
  });

  it('should list pending modifications', () => {
    engine.proposeModification('A', 'Problem A', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('B', 'Problem B', ['packages/brain-core/src/b.ts']);

    const pending = engine.getPending();
    expect(pending.length).toBe(2);
  });

  it('should list modification history', () => {
    engine.proposeModification('A', 'Problem A', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('B', 'Problem B', ['packages/brain-core/src/b.ts']);
    engine.proposeModification('C', 'Problem C', ['packages/brain-core/src/c.ts']);

    const history = engine.getHistory(2);
    expect(history.length).toBe(2);
    expect(history[0]!.title).toBe('C'); // most recent first
  });

  it('should reject a modification', () => {
    engine.proposeModification('Reject me', 'Problem', ['packages/brain-core/src/foo.ts']);
    const rejected = engine.rejectModification(1, 'Not needed');
    expect(rejected.status).toBe('rejected');
    expect(rejected.test_output).toContain('Not needed');
  });

  it('should track status counts', () => {
    engine.proposeModification('A', 'P', ['packages/brain-core/src/a.ts']);
    engine.proposeModification('B', 'P', ['packages/brain-core/src/b.ts']);
    engine.rejectModification(2);

    const status = engine.getStatus();
    expect(status.totalModifications).toBe(2);
    expect(status.byStatus.proposed).toBe(1);
    expect(status.byStatus.rejected).toBe(1);
  });

  it('should not generate code without proposed status', async () => {
    engine.proposeModification('Test', 'Problem', ['packages/brain-core/src/foo.ts']);
    engine.rejectModification(1);

    await expect(engine.generateCode(1)).rejects.toThrow('not in \'proposed\' state');
  });

  it('should not generate code for unknown modification', async () => {
    await expect(engine.generateCode(999)).rejects.toThrow('not found');
  });

  it('should recover from crash (testing state)', () => {
    // Simulate a modification stuck in 'testing' state
    db.prepare(`
      INSERT INTO self_modifications (title, problem_description, target_files, status, rollback_data)
      VALUES ('Crashed', 'was testing', '[]', 'testing', '[]')
    `).run();

    // New engine instance should recover it
    const engine2 = new SelfModificationEngine(db, { brainName: 'test-brain' });
    const mod = engine2.getModification(1);
    expect(mod!.status).toBe('failed');
    expect(mod!.test_output).toContain('crash');
  });

  it('should test modification with real files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfmod-test-'));
    const pkgDir = path.join(tmpDir, 'packages', 'brain-core', 'src');
    fs.mkdirSync(pkgDir, { recursive: true });
    const filePath = path.join(pkgDir, 'target.ts');
    fs.writeFileSync(filePath, 'export const X = 1;\n', 'utf-8');

    // Create package.json for npm commands
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-root',
      scripts: { build: 'echo build-ok', test: 'echo test-ok' },
    }), 'utf-8');

    const engine2 = new SelfModificationEngine(db, {
      brainName: 'test-brain',
      projectRoot: tmpDir,
    });

    engine2.proposeModification('Test mod', 'Change X', ['packages/brain-core/src/target.ts']);

    // Manually set generated_diff
    db.prepare("UPDATE self_modifications SET generated_diff = ? WHERE id = 1").run(
      JSON.stringify([{
        filePath: 'packages/brain-core/src/target.ts',
        oldContent: 'export const X = 1;\n',
        newContent: 'export const X = 2;\n',
      }]),
    );

    const result = await engine2.testModification(1);
    expect(result.test_result).toBe('passed');
    expect(result.status).toBe('ready');

    // Original file should be restored
    const restored = fs.readFileSync(filePath, 'utf-8');
    expect(restored).toBe('export const X = 1;\n');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should apply modification', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfmod-test-'));
    const pkgDir = path.join(tmpDir, 'packages', 'brain-core', 'src');
    fs.mkdirSync(pkgDir, { recursive: true });
    const filePath = path.join(pkgDir, 'apply.ts');
    fs.writeFileSync(filePath, 'export const Y = 1;\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-root',
      scripts: { build: 'echo build-ok', test: 'echo test-ok' },
    }), 'utf-8');

    const engine2 = new SelfModificationEngine(db, {
      brainName: 'test-brain',
      projectRoot: tmpDir,
    });

    engine2.proposeModification('Apply test', 'Change Y', ['packages/brain-core/src/apply.ts']);

    // Set diff + status to ready
    db.prepare("UPDATE self_modifications SET generated_diff = ?, status = 'ready' WHERE id = 1").run(
      JSON.stringify([{
        filePath: 'packages/brain-core/src/apply.ts',
        oldContent: 'export const Y = 1;\n',
        newContent: 'export const Y = 99;\n',
      }]),
    );

    const result = engine2.approveModification(1);
    expect(result.status).toBe('applied');

    // File should be changed
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('export const Y = 99;\n');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should rollback applied modification', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfmod-test-'));
    const pkgDir = path.join(tmpDir, 'packages', 'brain-core', 'src');
    fs.mkdirSync(pkgDir, { recursive: true });
    const filePath = path.join(pkgDir, 'rollback.ts');
    fs.writeFileSync(filePath, 'export const Z = 1;\n', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-root',
      scripts: { build: 'echo build-ok', test: 'echo test-ok' },
    }), 'utf-8');

    const engine2 = new SelfModificationEngine(db, {
      brainName: 'test-brain',
      projectRoot: tmpDir,
    });

    engine2.proposeModification('Rollback test', 'Change Z', ['packages/brain-core/src/rollback.ts']);

    db.prepare("UPDATE self_modifications SET generated_diff = ?, status = 'ready' WHERE id = 1").run(
      JSON.stringify([{
        filePath: 'packages/brain-core/src/rollback.ts',
        oldContent: 'export const Z = 1;\n',
        newContent: 'export const Z = 999;\n',
      }]),
    );

    engine2.approveModification(1);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('export const Z = 999;\n');

    const rolled = engine2.rollbackModification(1);
    expect(rolled.status).toBe('rolled_back');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('export const Z = 1;\n');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should not approve non-ready modification', () => {
    engine.proposeModification('Not ready', 'Problem', ['packages/brain-core/src/foo.ts']);
    expect(() => engine.approveModification(1)).toThrow('not ready');
  });

  it('should not rollback non-applied modification', () => {
    engine.proposeModification('Not applied', 'Problem', ['packages/brain-core/src/foo.ts']);
    expect(() => engine.rollbackModification(1)).toThrow('not applied');
  });

  it('should require projectRoot for testing', async () => {
    engine.proposeModification('No root', 'Problem', ['packages/brain-core/src/foo.ts']);
    db.prepare(`UPDATE self_modifications SET generated_diff = '[{"filePath":"packages/brain-core/src/foo.ts","oldContent":"a","newContent":"b"}]' WHERE id = 1`).run();
    await expect(engine.testModification(1)).rejects.toThrow('projectRoot');
  });

  it('should handle multiple target files', () => {
    const mod = engine.proposeModification('Multi', 'Problem', [
      'packages/brain-core/src/a.ts',
      'packages/brain-core/src/b.ts',
    ]);
    expect(mod.target_files.length).toBe(2);
  });

  it('should store proposal metadata', () => {
    const mod = engine.proposeModification(
      'Metadata test',
      'Test problem',
      ['packages/brain-core/src/foo.ts'],
      'orchestrator',
      {
        hypothesis: 'Improving X will increase Y by 10%',
        risk_level: 'low',
        expected_impact: [{ metric: 'test_coverage', direction: 'increase', target: '+10%' }],
        acceptance_criteria: ['Build passes', 'Tests pass'],
      },
    );
    expect(mod.hypothesis).toBe('Improving X will increase Y by 10%');
    expect(mod.risk_level).toBe('low');
    expect(mod.expected_impact).toEqual([{ metric: 'test_coverage', direction: 'increase', target: '+10%' }]);
    expect(mod.acceptance_criteria).toEqual(['Build passes', 'Tests pass']);
  });

  it('should store reason_code on rejection', () => {
    engine.proposeModification('Reject coded', 'Problem', ['packages/brain-core/src/foo.ts']);
    const rejected = engine.rejectModification(1, 'Breaks API', 'REGRESSION');
    expect(rejected.reason_code).toBe('REGRESSION');
  });

  it('should record before/after metrics', () => {
    engine.proposeModification('Metrics test', 'Problem', ['packages/brain-core/src/foo.ts']);
    engine.recordMetrics(1, 'before', { test_count: 100, build_time_ms: 5000 });
    engine.recordMetrics(1, 'after', { test_count: 105, build_time_ms: 4800 });

    const mod = engine.getModification(1)!;
    expect(mod.metrics_before).toEqual({ test_count: 100, build_time_ms: 5000 });
    expect(mod.metrics_after).toEqual({ test_count: 105, build_time_ms: 4800 });
  });

  describe('parseGeneratedFiles (via generateCode)', () => {
    // We test the parser indirectly by checking what gets stored when we
    // manually trigger the parsing logic. Since parseGeneratedFiles is private,
    // we test via the public testModification path with pre-set diffs.

    it('should handle CRLF line endings in generated diffs', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfmod-crlf-'));
      const pkgDir = path.join(tmpDir, 'packages', 'brain-core', 'src');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'crlf.ts'), 'export const A = 1;\r\n', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        name: 'test-root',
        scripts: { build: 'echo ok', test: 'echo ok' },
      }), 'utf-8');

      const engine2 = new SelfModificationEngine(db, {
        brainName: 'test-brain',
        projectRoot: tmpDir,
      });

      engine2.proposeModification('CRLF test', 'Test CRLF', ['packages/brain-core/src/crlf.ts']);

      // Simulate a diff with CRLF content (as Windows would produce)
      db.prepare("UPDATE self_modifications SET generated_diff = ? WHERE id = 1").run(
        JSON.stringify([{
          filePath: 'packages/brain-core/src/crlf.ts',
          oldContent: 'export const A = 1;\r\n',
          newContent: 'export const A = 2;\r\n',
        }]),
      );

      const result = await engine2.testModification(1);
      expect(result.test_result).toBe('passed');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
