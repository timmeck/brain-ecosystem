import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  ParameterRegistry,
  runParameterRegistryMigration,
  type ParameterDefinition,
} from '../parameter-registry.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeDef(overrides: Partial<ParameterDefinition> = {}): ParameterDefinition {
  return {
    engine: 'testEngine',
    name: 'threshold',
    value: 0.5,
    min: 0,
    max: 1,
    description: 'A test threshold',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('ParameterRegistry', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new ParameterRegistry(db);
  });

  /* ---------- creation ---------- */

  it('creates tables on construction', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('parameter_registry');
    expect(names).toContain('parameter_changes');
    expect(names).toContain('parameter_snapshots');
  });

  /* ---------- register ---------- */

  it('register() inserts a new parameter', () => {
    registry.register(makeDef());

    const val = registry.get('testEngine', 'threshold');
    expect(val).toBe(0.5);
  });

  it('register() does not overwrite an existing parameter', () => {
    registry.register(makeDef({ value: 0.5 }));
    registry.register(makeDef({ value: 0.9 }));

    const val = registry.get('testEngine', 'threshold');
    expect(val).toBe(0.5);
  });

  /* ---------- registerAll ---------- */

  it('registerAll() inserts multiple parameters', () => {
    registry.registerAll([
      makeDef({ name: 'alpha', value: 0.1 }),
      makeDef({ name: 'beta', value: 0.2 }),
      makeDef({ name: 'gamma', value: 0.3 }),
    ]);

    expect(registry.get('testEngine', 'alpha')).toBe(0.1);
    expect(registry.get('testEngine', 'beta')).toBe(0.2);
    expect(registry.get('testEngine', 'gamma')).toBe(0.3);
  });

  /* ---------- get / set ---------- */

  it('get() returns undefined for an unregistered parameter', () => {
    expect(registry.get('noEngine', 'noParam')).toBeUndefined();
  });

  it('set() updates the value and records a change', () => {
    registry.register(makeDef({ value: 0.5 }));

    const changed = registry.set('testEngine', 'threshold', 0.8, 'tuner', 'improve recall');
    expect(changed).toBe(true);
    expect(registry.get('testEngine', 'threshold')).toBe(0.8);

    const history = registry.getHistory('testEngine', 'threshold');
    expect(history.length).toBe(1);
    expect(history[0].old_value).toBe(0.5);
    expect(history[0].new_value).toBe(0.8);
    expect(history[0].changed_by).toBe('tuner');
    expect(history[0].reason).toBe('improve recall');
  });

  it('set() clamps value to min/max bounds', () => {
    registry.register(makeDef({ value: 0.5, min: 0.2, max: 0.9 }));

    // Exceed max
    registry.set('testEngine', 'threshold', 5.0, 'tuner', 'over max');
    expect(registry.get('testEngine', 'threshold')).toBe(0.9);

    // Below min
    registry.set('testEngine', 'threshold', -1.0, 'tuner', 'under min');
    expect(registry.get('testEngine', 'threshold')).toBe(0.2);
  });

  it('set() returns false for non-existent parameter', () => {
    const result = registry.set('noEngine', 'noParam', 1, 'x', 'y');
    expect(result).toBe(false);
  });

  it('set() returns false when clamped value equals current value (no change)', () => {
    registry.register(makeDef({ value: 0.5 }));

    const result = registry.set('testEngine', 'threshold', 0.5, 'tuner', 'same');
    expect(result).toBe(false);
  });

  /* ---------- getDefinition ---------- */

  it('getDefinition() returns full parameter info', () => {
    registry.register(makeDef({ category: 'scoring' }));

    const def = registry.getDefinition('testEngine', 'threshold');
    expect(def).toBeDefined();
    expect(def!.engine).toBe('testEngine');
    expect(def!.name).toBe('threshold');
    expect(def!.value).toBe(0.5);
    expect(def!.min).toBe(0);
    expect(def!.max).toBe(1);
    expect(def!.description).toBe('A test threshold');
    expect(def!.category).toBe('scoring');
  });

  it('getDefinition() returns undefined for unknown parameter', () => {
    expect(registry.getDefinition('x', 'y')).toBeUndefined();
  });

  /* ---------- list ---------- */

  it('list() returns all parameters and filters by engine', () => {
    registry.registerAll([
      makeDef({ engine: 'A', name: 'p1', value: 1 }),
      makeDef({ engine: 'A', name: 'p2', value: 2 }),
      makeDef({ engine: 'B', name: 'p3', value: 3 }),
    ]);

    const all = registry.list();
    expect(all.length).toBe(3);

    const onlyA = registry.list('A');
    expect(onlyA.length).toBe(2);
    expect(onlyA.every((p) => p.engine === 'A')).toBe(true);

    const onlyB = registry.list('B');
    expect(onlyB.length).toBe(1);
    expect(onlyB[0].name).toBe('p3');
  });

  /* ---------- getHistory / getRecentChanges ---------- */

  it('getHistory() returns changes for a specific parameter in descending order', () => {
    registry.register(makeDef({ value: 0.1 }));
    registry.set('testEngine', 'threshold', 0.2, 'a', 'step1');
    registry.set('testEngine', 'threshold', 0.3, 'b', 'step2');
    registry.set('testEngine', 'threshold', 0.4, 'c', 'step3');

    const history = registry.getHistory('testEngine', 'threshold');
    expect(history.length).toBe(3);
    // Most recent first
    expect(history[0].new_value).toBe(0.4);
    expect(history[2].new_value).toBe(0.2);
  });

  it('getRecentChanges() returns changes across all parameters', () => {
    registry.registerAll([
      makeDef({ engine: 'A', name: 'x', value: 1 }),
      makeDef({ engine: 'B', name: 'y', value: 2, min: 0, max: 10 }),
    ]);
    registry.set('A', 'x', 0.9, 'u', 'r1');
    registry.set('B', 'y', 5, 'u', 'r2');

    const recent = registry.getRecentChanges();
    expect(recent.length).toBe(2);
    // Most recent first
    expect(recent[0].engine).toBe('B');
    expect(recent[1].engine).toBe('A');
  });

  /* ---------- snapshot / restore / listSnapshots ---------- */

  it('snapshot() captures current values and listSnapshots() returns them', () => {
    registry.registerAll([
      makeDef({ engine: 'E', name: 'a', value: 1 }),
      makeDef({ engine: 'E', name: 'b', value: 2, min: 0, max: 10 }),
    ]);

    const id = registry.snapshot('baseline');
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const snapshots = registry.listSnapshots();
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].label).toBe('baseline');
    expect(snapshots[0].id).toBe(id);

    const data = JSON.parse(snapshots[0].data_json);
    expect(data.E.a).toBe(1);
    expect(data.E.b).toBe(2);
  });

  it('restore() reverts parameters to snapshot values', () => {
    registry.registerAll([
      makeDef({ engine: 'E', name: 'a', value: 10, min: 0, max: 100 }),
      makeDef({ engine: 'E', name: 'b', value: 20, min: 0, max: 100 }),
    ]);

    const snapId = registry.snapshot('before-change');

    // Change both values
    registry.set('E', 'a', 50, 'tuner', 'experiment');
    registry.set('E', 'b', 80, 'tuner', 'experiment');
    expect(registry.get('E', 'a')).toBe(50);
    expect(registry.get('E', 'b')).toBe(80);

    // Restore
    const restored = registry.restore(snapId);
    expect(restored).toBe(2);
    expect(registry.get('E', 'a')).toBe(10);
    expect(registry.get('E', 'b')).toBe(20);
  });

  it('restore() returns 0 for non-existent snapshot', () => {
    expect(registry.restore(9999)).toBe(0);
  });

  /* ---------- getStatus ---------- */

  it('getStatus() returns summary statistics', () => {
    registry.registerAll([
      makeDef({ engine: 'alpha', name: 'p1', value: 1 }),
      makeDef({ engine: 'beta', name: 'p2', value: 2, min: 0, max: 10 }),
    ]);
    registry.set('beta', 'p2', 5, 'user', 'test');
    registry.snapshot('s1');

    const status = registry.getStatus();
    expect(status.totalParameters).toBe(2);
    expect(status.totalChanges).toBe(1);
    expect(status.totalSnapshots).toBe(1);
    expect(status.engines).toEqual(['alpha', 'beta']);
    expect(status.recentChanges.length).toBe(1);
    expect(status.recentChanges[0].engine).toBe('beta');
  });

  /* ---------- migration idempotence ---------- */

  it('runParameterRegistryMigration() is safe to call multiple times', () => {
    // Constructor already ran once; calling again should not throw
    expect(() => runParameterRegistryMigration(db)).not.toThrow();

    // Data should still be intact after re-migration
    registry.register(makeDef());
    runParameterRegistryMigration(db);
    expect(registry.get('testEngine', 'threshold')).toBe(0.5);
  });
});
