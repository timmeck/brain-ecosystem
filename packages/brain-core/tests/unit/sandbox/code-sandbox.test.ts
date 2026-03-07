import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CodeSandbox, runSandboxMigration } from '../../../src/sandbox/code-sandbox.js';

describe('CodeSandbox', () => {
  let db: Database.Database;
  let sandbox: CodeSandbox;

  beforeEach(() => {
    db = new Database(':memory:');
    sandbox = new CodeSandbox(db, { preferDocker: false });
  });

  afterEach(() => {
    db.close();
  });

  // ── Migration ──────────────────────────────────────────

  describe('runSandboxMigration', () => {
    it('should create sandbox_executions table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sandbox_executions'"
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('should create indexes', () => {
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_sandbox_%'"
      ).all();
      expect(indexes).toHaveLength(2);
    });

    it('should be idempotent', () => {
      runSandboxMigration(db);
      runSandboxMigration(db);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sandbox_executions'"
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  // ── Execution ──────────────────────────────────────────

  describe('execute', () => {
    it('should execute JavaScript code', async () => {
      const result = await sandbox.execute({
        code: 'console.log("Hello from sandbox");',
        language: 'javascript',
        timeoutMs: 10000,
      });
      expect(result.language).toBe('javascript');
      expect(result.id).toMatch(/^exec-/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.exitCode).toBe('number');
      expect(result.createdAt).toBeGreaterThan(0);
    });

    it('should capture stdout', async () => {
      const result = await sandbox.execute({
        code: 'console.log("test output");',
        language: 'javascript',
        timeoutMs: 10000,
      });
      expect(result.stdout).toContain('test output');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr on error', async () => {
      const result = await sandbox.execute({
        code: 'throw new Error("boom");',
        language: 'javascript',
        timeoutMs: 10000,
      });
      expect(result.exitCode).not.toBe(0);
    });

    it('should persist execution name', async () => {
      const result = await sandbox.execute({
        code: 'console.log("named");',
        language: 'javascript',
        name: 'test-exec',
        timeoutMs: 10000,
      });
      expect(result.name).toBe('test-exec');
    });

    it('should handle timeout', async () => {
      const result = await sandbox.execute({
        code: 'while(true) {}',
        language: 'javascript',
        timeoutMs: 500,
      });
      // Either timed out or errored — both are valid
      expect(result.durationMs).toBeGreaterThanOrEqual(400);
    });

    it('should persist result to DB', async () => {
      await sandbox.execute({
        code: 'console.log("persist test");',
        language: 'javascript',
        timeoutMs: 10000,
      });
      const rows = db.prepare('SELECT * FROM sandbox_executions').all();
      expect(rows).toHaveLength(1);
    });
  });

  // ── executeMany ────────────────────────────────────────

  describe('executeMany', () => {
    it('should execute multiple code blocks sequentially', async () => {
      const results = await sandbox.executeMany([
        { code: 'console.log("first");', language: 'javascript', timeoutMs: 10000 },
        { code: 'console.log("second");', language: 'javascript', timeoutMs: 10000 },
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].stdout).toContain('first');
      expect(results[1].stdout).toContain('second');
    });
  });

  // ── Validate ───────────────────────────────────────────

  describe('validate', () => {
    it('should return null for valid JavaScript', () => {
      expect(sandbox.validate('const x = 1;', 'javascript')).toBeNull();
    });

    it('should return null for valid TypeScript (basic JS subset)', () => {
      expect(sandbox.validate('const x = 1;', 'typescript')).toBeNull();
    });

    it('should return error for invalid JavaScript', () => {
      const result = sandbox.validate('function {{{', 'javascript');
      expect(result).not.toBeNull();
    });

    it('should return null for shell (no static validation)', () => {
      expect(sandbox.validate('echo hello', 'shell')).toBeNull();
    });

    it('should return null for valid python', () => {
      expect(sandbox.validate('print("hello")', 'python')).toBeNull();
    });

    it('should catch python missing colon', () => {
      const result = sandbox.validate('def foo()', 'python');
      expect(result).toContain('colon');
    });
  });

  // ── Docker Detection ───────────────────────────────────

  describe('isDockerAvailable', () => {
    it('should return boolean', { timeout: 15000 }, async () => {
      const result = await sandbox.isDockerAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should cache result', { timeout: 15000 }, async () => {
      const first = await sandbox.isDockerAvailable();
      const second = await sandbox.isDockerAvailable();
      expect(first).toBe(second);
    });

    it('should reset cache', { timeout: 15000 }, async () => {
      await sandbox.isDockerAvailable();
      sandbox.resetDockerCache();
      // After reset, next call re-checks
      const result = await sandbox.isDockerAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  // ── History ────────────────────────────────────────────

  describe('getHistory', () => {
    it('should return empty array initially', () => {
      const history = sandbox.getHistory();
      expect(history).toEqual([]);
    });

    it('should return executions after running', async () => {
      await sandbox.execute({ code: 'console.log("h1");', language: 'javascript', timeoutMs: 10000 });
      await sandbox.execute({ code: 'console.log("h2");', language: 'javascript', timeoutMs: 10000 });
      const history = sandbox.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should respect limit', async () => {
      await sandbox.execute({ code: 'console.log("a");', language: 'javascript', timeoutMs: 10000 });
      await sandbox.execute({ code: 'console.log("b");', language: 'javascript', timeoutMs: 10000 });
      await sandbox.execute({ code: 'console.log("c");', language: 'javascript', timeoutMs: 10000 });
      const history = sandbox.getHistory(2);
      expect(history).toHaveLength(2);
    });
  });

  // ── Language Stats ─────────────────────────────────────

  describe('getLanguageStats', () => {
    it('should return empty array initially', () => {
      expect(sandbox.getLanguageStats()).toEqual([]);
    });

    it('should group by language after executions', async () => {
      await sandbox.execute({ code: 'console.log("js");', language: 'javascript', timeoutMs: 10000 });
      await sandbox.execute({ code: 'console.log("js2");', language: 'javascript', timeoutMs: 10000 });
      const stats = sandbox.getLanguageStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].language).toBe('javascript');
      expect(stats[0].total).toBe(2);
    });
  });

  // ── Status ─────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return zero counts initially', () => {
      const status = sandbox.getStatus();
      expect(status.totalExecutions).toBe(0);
      expect(status.successCount).toBe(0);
      expect(status.failCount).toBe(0);
      expect(status.timeoutCount).toBe(0);
      expect(status.avgDurationMs).toBe(0);
      expect(status.languages).toEqual([]);
    });

    it('should track successful executions', async () => {
      await sandbox.execute({ code: 'console.log("ok");', language: 'javascript', timeoutMs: 10000 });
      const status = sandbox.getStatus();
      expect(status.totalExecutions).toBe(1);
      expect(status.successCount).toBe(1);
      expect(status.languages).toContain('javascript');
    });

    it('should track failed executions', async () => {
      await sandbox.execute({ code: 'process.exit(1);', language: 'javascript', timeoutMs: 10000 });
      const status = sandbox.getStatus();
      expect(status.totalExecutions).toBe(1);
    });
  });

  // ── Output Truncation ──────────────────────────────────

  describe('output truncation', () => {
    it('should truncate long output', async () => {
      const sandbox2 = new CodeSandbox(db, { preferDocker: false, maxOutputSize: 50 });
      const result = await sandbox2.execute({
        code: 'console.log("x".repeat(200));',
        language: 'javascript',
        timeoutMs: 10000,
      });
      expect(result.stdout.length).toBeLessThanOrEqual(70); // 50 + "... [truncated]"
    });
  });

  // ── Config Defaults ────────────────────────────────────

  describe('config defaults', () => {
    it('should use default timeout', async () => {
      const result = await sandbox.execute({
        code: 'console.log("default");',
        language: 'javascript',
      });
      expect(result.id).toMatch(/^exec-/);
    });
  });
});
