import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { CodeSandbox, runSandboxMigration } from '../code-sandbox.js';

describe('CodeSandbox', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  // ── Creation ──────────────────────────────────────────

  it('creates an instance with default config', () => {
    const sandbox = new CodeSandbox(db);
    expect(sandbox).toBeDefined();
  });

  it('creates an instance with custom config', () => {
    const sandbox = new CodeSandbox(db, {
      preferDocker: false,
      defaultTimeoutMs: 5000,
      defaultMemoryMb: 64,
      maxOutputSize: 50000,
    });
    expect(sandbox).toBeDefined();
  });

  // ── getStatus (initial) ───────────────────────────────

  it('returns empty status on fresh instance', () => {
    const sandbox = new CodeSandbox(db);
    const status = sandbox.getStatus();

    expect(status.totalExecutions).toBe(0);
    expect(status.successCount).toBe(0);
    expect(status.failCount).toBe(0);
    expect(status.timeoutCount).toBe(0);
    expect(status.avgDurationMs).toBe(0);
    expect(status.dockerAvailable).toBe(false);
    expect(status.languages).toEqual([]);
  });

  // ── validate ──────────────────────────────────────────

  it('validates valid JavaScript code', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('console.log("hello")', 'javascript');
    expect(result).toBeNull();
  });

  it('validates valid TypeScript code (parsed as JS by Function constructor)', () => {
    const sandbox = new CodeSandbox(db);
    // The validate method uses `new Function(code)` for TS too,
    // so basic JS-compatible TS code passes.
    const result = sandbox.validate('const x = 42; console.log(x);', 'typescript');
    expect(result).toBeNull();
  });

  it('returns error for invalid JavaScript code', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('function {{{', 'javascript');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns error for invalid TypeScript code', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('if (', 'typescript');
    expect(result).toBeTruthy();
  });

  it('validates valid Python code', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('print("hello")', 'python');
    expect(result).toBeNull();
  });

  it('returns error for Python def without colon', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('def foo()', 'python');
    expect(result).toBe('Missing colon after def');
  });

  it('validates shell code (always passes)', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('echo hello', 'shell');
    expect(result).toBeNull();
  });

  it('returns error for unsupported language', () => {
    const sandbox = new CodeSandbox(db);
    const result = sandbox.validate('code', 'rust' as any);
    expect(result).toBe('Unsupported language: rust');
  });

  // ── execute ───────────────────────────────────────────

  it('executes simple JavaScript code locally', async () => {
    const sandbox = new CodeSandbox(db, { preferDocker: false });
    const result = await sandbox.execute({
      code: 'console.log("hello")',
      language: 'javascript',
      timeoutMs: 10000,
      name: 'test-exec',
    });

    expect(result.id).toMatch(/^exec-/);
    expect(result.language).toBe('javascript');
    expect(result.stdout.trim()).toBe('hello');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.name).toBe('test-exec');
    expect(result.createdAt).toBeGreaterThan(0);
  }, 15000);

  it('captures non-zero exit code on failing code', async () => {
    const sandbox = new CodeSandbox(db, { preferDocker: false });
    const result = await sandbox.execute({
      code: 'process.exit(42)',
      language: 'javascript',
      timeoutMs: 10000,
    });

    expect(result.exitCode).not.toBe(0);
  }, 15000);

  // ── getHistory ────────────────────────────────────────

  it('returns execution history after running code', async () => {
    const sandbox = new CodeSandbox(db, { preferDocker: false });
    await sandbox.execute({
      code: 'console.log("history-test")',
      language: 'javascript',
      timeoutMs: 10000,
      name: 'hist-entry',
    });

    const history = sandbox.getHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0].language).toBe('javascript');
    expect(history[0].exitCode).toBe(0);
    expect(history[0].name).toBe('hist-entry');
    expect(history[0].timedOut).toBe(false);
  }, 15000);

  // ── getLanguageStats ──────────────────────────────────

  it('returns language stats after executions', async () => {
    const sandbox = new CodeSandbox(db, { preferDocker: false });
    await sandbox.execute({ code: 'console.log(1)', language: 'javascript', timeoutMs: 10000 });
    await sandbox.execute({ code: 'console.log(2)', language: 'javascript', timeoutMs: 10000 });

    const stats = sandbox.getLanguageStats();
    expect(stats).toHaveLength(1);
    expect(stats[0].language).toBe('javascript');
    expect(stats[0].total).toBe(2);
    expect(stats[0].successRate).toBe(1);
    expect(stats[0].avgDuration).toBeGreaterThanOrEqual(0);
  }, 20000);

  it('returns empty language stats on fresh instance', () => {
    const sandbox = new CodeSandbox(db);
    const stats = sandbox.getLanguageStats();
    expect(stats).toEqual([]);
  });

  // ── isDockerAvailable ─────────────────────────────────

  it('returns boolean from isDockerAvailable (likely false in test env)', async () => {
    const sandbox = new CodeSandbox(db);
    const available = await sandbox.isDockerAvailable();
    expect(typeof available).toBe('boolean');
  }, 10000);

  it('caches Docker availability on subsequent calls', async () => {
    const sandbox = new CodeSandbox(db);
    const first = await sandbox.isDockerAvailable();
    const second = await sandbox.isDockerAvailable();
    expect(first).toBe(second);
  }, 10000);

  it('resets Docker cache', async () => {
    const sandbox = new CodeSandbox(db);
    await sandbox.isDockerAvailable();
    sandbox.resetDockerCache();
    // After reset, the next call re-checks (we just verify it does not throw)
    const result = await sandbox.isDockerAvailable();
    expect(typeof result).toBe('boolean');
  }, 10000);

  // ── Status after executions ───────────────────────────

  it('reflects executions in status', async () => {
    const sandbox = new CodeSandbox(db, { preferDocker: false });
    await sandbox.execute({ code: 'console.log("ok")', language: 'javascript', timeoutMs: 10000 });

    const status = sandbox.getStatus();
    expect(status.totalExecutions).toBe(1);
    expect(status.successCount).toBe(1);
    expect(status.failCount).toBe(0);
    expect(status.timeoutCount).toBe(0);
    expect(status.languages).toContain('javascript');
    expect(status.avgDurationMs).toBeGreaterThanOrEqual(0);
  }, 15000);

  // ── Migration idempotency ─────────────────────────────

  it('runs migration multiple times without error', () => {
    runSandboxMigration(db);
    runSandboxMigration(db);
    // Table already exists from constructor, third call is fine too
    const sandbox = new CodeSandbox(db);
    expect(sandbox.getStatus().totalExecutions).toBe(0);
  });
});
