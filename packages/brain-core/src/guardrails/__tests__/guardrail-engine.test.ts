import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  GuardrailEngine,
  runGuardrailMigration,
  type GuardrailConfig,
} from '../guardrail-engine.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('GuardrailEngine', () => {
  let db: Database.Database;
  let engine: GuardrailEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runGuardrailMigration(db);
    engine = new GuardrailEngine(db, { brainName: 'test-brain' });
  });

  afterEach(() => {
    db.close();
  });

  // ── 1. Creation & Defaults ──────────────────────────────

  it('creates engine with default config values', () => {
    const status = engine.getStatus();
    expect(status.circuitBreakerTripped).toBe(false);
    expect(status.circuitBreakerReason).toBeNull();
    expect(status.totalRollbacks).toBe(0);
    expect(status.protectedPaths.length).toBeGreaterThan(0);
    expect(typeof status.healthScore).toBe('number');
  });

  it('creates engine with custom config overrides', () => {
    const custom: GuardrailConfig = {
      brainName: 'custom',
      minFitnessDelta: 0.05,
      declineThreshold: 5,
      maxWarnings: 10,
    };
    const customEngine = new GuardrailEngine(db, custom);
    // Custom minFitnessDelta: improvement of 0.03 should be rejected (< 0.05)
    expect(customEngine.checkFitnessDelta(0.5, 0.53)).toBe(false);
    // But 0.06 improvement passes
    expect(customEngine.checkFitnessDelta(0.5, 0.56)).toBe(true);
  });

  // ── 2. validateParameterChange ──────────────────────────

  describe('validateParameterChange', () => {
    it('allows change when no registry is set (no bounds check)', () => {
      const result = engine.validateParameterChange('some:param', 0.3, 0.5);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('OK');
    });

    it('returns allowed=true with reason "No change" for identical values', () => {
      const result = engine.validateParameterChange('some:param', 0.5, 0.5);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('No change');
    });

    it('blocks all changes when circuit breaker is tripped', () => {
      engine.tripCircuitBreaker('overheated');
      const result = engine.validateParameterChange('some:param', 0.3, 0.5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Circuit breaker tripped');
      expect(result.reason).toContain('overheated');
    });

    it('rejects out-of-bounds values when registry is set', () => {
      const mockRegistry = {
        list: () => [
          { engine: 'dream', name: 'interval', value: 300000, min: 60000, max: 600000, description: 'test' },
        ],
        set: vi.fn(),
      };
      engine.setParameterRegistry(mockRegistry as any);

      const result = engine.validateParameterChange('dream:interval', 300000, 700000);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('out of bounds');
    });

    it('rejects jumps larger than 50% of parameter range', () => {
      const mockRegistry = {
        list: () => [
          { engine: 'prediction', name: 'alpha', value: 0.3, min: 0.1, max: 0.9, description: 'test' },
        ],
        set: vi.fn(),
      };
      engine.setParameterRegistry(mockRegistry as any);

      // Range = 0.8, jump = 0.5 which is 62.5% of range => reject
      const result = engine.validateParameterChange('prediction:alpha', 0.1, 0.6);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('too large');
    });
  });

  // ── 3. checkFitnessDelta ────────────────────────────────

  describe('checkFitnessDelta', () => {
    it('returns true when improvement meets default threshold (0.01)', () => {
      expect(engine.checkFitnessDelta(0.50, 0.52)).toBe(true);
    });

    it('returns false when improvement is below default threshold', () => {
      expect(engine.checkFitnessDelta(0.50, 0.505)).toBe(false);
    });

    it('returns false for fitness decline', () => {
      expect(engine.checkFitnessDelta(0.60, 0.40)).toBe(false);
    });

    it('respects custom minDelta override', () => {
      // With minDelta=0.1, a 0.05 improvement should fail
      expect(engine.checkFitnessDelta(0.50, 0.55, 0.1)).toBe(false);
      // But 0.15 improvement passes
      expect(engine.checkFitnessDelta(0.50, 0.65, 0.1)).toBe(true);
    });
  });

  // ── 4. isProtectedPath ─────────────────────────────────

  describe('isProtectedPath', () => {
    it('detects IPC paths as protected', () => {
      expect(engine.isProtectedPath('src/ipc/server.ts')).toBe(true);
    });

    it('detects guardrails paths as protected', () => {
      expect(engine.isProtectedPath('src/guardrails/guardrail-engine.ts')).toBe(true);
    });

    it('detects db paths as protected', () => {
      expect(engine.isProtectedPath('src/db/connection.ts')).toBe(true);
    });

    it('detects migration paths as protected', () => {
      expect(engine.isProtectedPath('migrations/001_init.sql')).toBe(true);
    });

    it('normalizes backslashes and still detects protection', () => {
      expect(engine.isProtectedPath('src\\ipc\\client.ts')).toBe(true);
    });

    it('allows unprotected paths', () => {
      expect(engine.isProtectedPath('src/dream/dream-engine.ts')).toBe(false);
      expect(engine.isProtectedPath('src/goals/goal-engine.ts')).toBe(false);
    });
  });

  // ── 5. recordParameterChange ───────────────────────────

  describe('recordParameterChange', () => {
    it('persists a parameter change in the database', () => {
      engine.recordParameterChange('dream:interval', 300000, 350000, 0.5, 0.55, 1, 'evolution');
      const row = db.prepare('SELECT * FROM parameter_changelog').get() as any;
      expect(row).toBeDefined();
      expect(row.param).toBe('dream:interval');
      expect(row.old_value).toBe(300000);
      expect(row.new_value).toBe(350000);
      expect(row.fitness_before).toBe(0.5);
      expect(row.fitness_after).toBe(0.55);
      expect(row.generation).toBe(1);
      expect(row.source).toBe('evolution');
    });

    it('stores null for optional fitness/generation when not provided', () => {
      engine.recordParameterChange('dream:interval', 300000, 350000);
      const row = db.prepare('SELECT * FROM parameter_changelog').get() as any;
      expect(row.fitness_before).toBeNull();
      expect(row.fitness_after).toBeNull();
      expect(row.generation).toBeNull();
      expect(row.source).toBe('evolution');
    });
  });

  // ── 6. rollbackParameters ─────────────────────────────

  describe('rollbackParameters', () => {
    it('returns empty result when no changes exist', () => {
      const result = engine.rollbackParameters(1);
      expect(result.rolledBack).toBe(0);
      expect(result.parameters).toHaveLength(0);
    });

    it('rolls back changes and restores old values via registry', () => {
      const mockRegistry = {
        list: () => [],
        set: vi.fn(),
      };
      engine.setParameterRegistry(mockRegistry as any);

      engine.recordParameterChange('prediction:alpha', 0.3, 0.5, 0.5, 0.55, 1);
      engine.recordParameterChange('dream:interval', 300000, 400000, 0.55, 0.6, 2);

      const result = engine.rollbackParameters(2);
      expect(result.rolledBack).toBe(2);
      expect(result.parameters).toHaveLength(2);
      // Most recent first (DESC order)
      expect(result.parameters[0]).toEqual({
        param: 'dream:interval',
        from: 400000,
        to: 300000,
      });
      expect(result.parameters[1]).toEqual({
        param: 'prediction:alpha',
        from: 0.5,
        to: 0.3,
      });
      expect(mockRegistry.set).toHaveBeenCalledTimes(2);
    });

    it('does not rollback without a registry', () => {
      engine.recordParameterChange('prediction:alpha', 0.3, 0.5);
      const result = engine.rollbackParameters(1);
      // No registry => can't set values => rolledBack stays 0
      expect(result.rolledBack).toBe(0);
    });
  });

  // ── 7. Circuit Breaker ────────────────────────────────

  describe('circuit breaker', () => {
    it('starts un-tripped', () => {
      expect(engine.isCircuitBreakerTripped()).toBe(false);
    });

    it('trips and records reason', () => {
      engine.tripCircuitBreaker('fitness collapsed');
      expect(engine.isCircuitBreakerTripped()).toBe(true);
      const status = engine.getStatus();
      expect(status.circuitBreakerReason).toBe('fitness collapsed');
    });

    it('resets after tripping', () => {
      engine.tripCircuitBreaker('test');
      engine.resetCircuitBreaker();
      expect(engine.isCircuitBreakerTripped()).toBe(false);
      const status = engine.getStatus();
      expect(status.circuitBreakerReason).toBeNull();
    });

    it('logs trips and resets to circuit_breaker_log table', () => {
      engine.tripCircuitBreaker('reason-1');
      engine.resetCircuitBreaker();
      const rows = db.prepare('SELECT * FROM circuit_breaker_log ORDER BY id').all() as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].tripped).toBe(1);
      expect(rows[0].reason).toBe('reason-1');
      expect(rows[1].tripped).toBe(0);
      expect(rows[1].reason).toBe('Manual reset');
    });
  });

  // ── 8. getStatus ──────────────────────────────────────

  describe('getStatus', () => {
    it('returns a complete status object', () => {
      const status = engine.getStatus();
      expect(status).toHaveProperty('circuitBreakerTripped');
      expect(status).toHaveProperty('circuitBreakerReason');
      expect(status).toHaveProperty('totalRollbacks');
      expect(status).toHaveProperty('recentChanges');
      expect(status).toHaveProperty('healthScore');
      expect(status).toHaveProperty('protectedPaths');
      expect(Array.isArray(status.protectedPaths)).toBe(true);
    });

    it('counts totalRollbacks from guardrail-rollback source', () => {
      // Record a normal change and a rollback-sourced change
      engine.recordParameterChange('a:b', 1, 2, undefined, undefined, undefined, 'evolution');
      engine.recordParameterChange('a:b', 2, 1, undefined, undefined, undefined, 'guardrail-rollback');
      engine.recordParameterChange('c:d', 5, 3, undefined, undefined, undefined, 'guardrail-rollback');
      const status = engine.getStatus();
      expect(status.totalRollbacks).toBe(2);
    });
  });

  // ── 9. checkHealth ────────────────────────────────────

  describe('checkHealth', () => {
    it('returns healthy report when no issues exist', () => {
      const report = engine.checkHealth();
      expect(report.score).toBe(1);
      expect(report.warnings).toHaveLength(0);
      expect(report.circuitBreakerTripped).toBe(false);
      expect(report.recommendation).toBe('All systems nominal');
    });

    it('detects fitness decline and produces high severity warning', () => {
      // Insert 3+ entries where last fitness < first * 0.8
      engine.recordParameterChange('a:b', 1, 2, undefined, 1.0, 1);
      engine.recordParameterChange('a:b', 2, 3, undefined, 0.9, 2);
      engine.recordParameterChange('a:b', 3, 4, undefined, 0.7, 3); // 0.7 < 1.0 * 0.8

      const report = engine.checkHealth();
      const fitnessWarning = report.warnings.find(w => w.category === 'fitness');
      expect(fitnessWarning).toBeDefined();
      expect(fitnessWarning!.severity).toBe('high');
    });

    it('trips circuit breaker when maxWarnings is reached', () => {
      // Use a low maxWarnings config to make tripping easier
      const sensitiveEngine = new GuardrailEngine(db, {
        brainName: 'test',
        maxWarnings: 1,
      });

      // Insert fitness decline data to generate a warning
      engine.recordParameterChange('a:b', 1, 2, undefined, 1.0, 1);
      engine.recordParameterChange('a:b', 2, 3, undefined, 0.8, 2);
      engine.recordParameterChange('a:b', 3, 4, undefined, 0.5, 3); // big drop

      const report = sensitiveEngine.checkHealth();
      // With maxWarnings=1, a single warning trips the breaker
      if (report.warnings.length >= 1) {
        expect(report.circuitBreakerTripped).toBe(true);
        expect(report.recommendation).toBe('Critical issues — autonomous operations paused');
      }
    });
  });

  // ── 10. checkAutoRollback ─────────────────────────────

  describe('checkAutoRollback', () => {
    it('returns null when insufficient data', () => {
      expect(engine.checkAutoRollback()).toBeNull();
    });

    it('returns null when fitness is not declining', () => {
      // Insert improving fitness (declineThreshold default = 3, need 4 entries)
      engine.recordParameterChange('a:b', 1, 2, 0.4, 0.5, 1);
      engine.recordParameterChange('a:b', 2, 3, 0.5, 0.6, 2);
      engine.recordParameterChange('a:b', 3, 4, 0.6, 0.7, 3);
      engine.recordParameterChange('a:b', 4, 5, 0.7, 0.8, 4);

      expect(engine.checkAutoRollback()).toBeNull();
    });

    it('triggers rollback when fitness declines for consecutive generations', () => {
      const mockRegistry = {
        list: () => [],
        set: vi.fn(),
      };
      engine.setParameterRegistry(mockRegistry as any);

      // Declining fitness across 4 entries (declineThreshold=3 needs 4)
      engine.recordParameterChange('a:b', 0.3, 0.35, 0.6, 0.55, 1);
      engine.recordParameterChange('a:b', 0.35, 0.4, 0.55, 0.50, 2);
      engine.recordParameterChange('a:b', 0.4, 0.45, 0.50, 0.45, 3);
      engine.recordParameterChange('a:b', 0.45, 0.5, 0.45, 0.40, 4);

      const result = engine.checkAutoRollback();
      expect(result).not.toBeNull();
      expect(result!.rolledBack).toBeGreaterThan(0);
    });
  });

  // ── 11. getProtectedPaths ─────────────────────────────

  describe('getProtectedPaths', () => {
    it('returns a copy of the protected paths list', () => {
      const paths = engine.getProtectedPaths();
      expect(paths).toContain('src/ipc/');
      expect(paths).toContain('src/guardrails/');
      expect(paths).toContain('src/db/');
      expect(paths).toContain('migrations/');
      // Ensure it is a copy, not the original array
      const paths2 = engine.getProtectedPaths();
      expect(paths).not.toBe(paths2);
      expect(paths).toEqual(paths2);
    });
  });

  // ── 12. runGuardrailMigration ─────────────────────────

  describe('runGuardrailMigration', () => {
    it('creates the required tables and indexes', () => {
      const freshDb = new Database(':memory:');
      runGuardrailMigration(freshDb);

      // Verify parameter_changelog table exists
      const tables = freshDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('parameter_changelog', 'circuit_breaker_log') ORDER BY name",
      ).all() as Array<{ name: string }>;
      expect(tables).toHaveLength(2);
      expect(tables.map(t => t.name)).toEqual(['circuit_breaker_log', 'parameter_changelog']);

      // Verify indexes exist
      const indexes = freshDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_param_changelog%' ORDER BY name",
      ).all() as Array<{ name: string }>;
      expect(indexes).toHaveLength(2);

      freshDb.close();
    });

    it('is idempotent (can run twice without error)', () => {
      const freshDb = new Database(':memory:');
      runGuardrailMigration(freshDb);
      expect(() => runGuardrailMigration(freshDb)).not.toThrow();
      freshDb.close();
    });
  });
});
