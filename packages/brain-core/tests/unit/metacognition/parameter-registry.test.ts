import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ParameterRegistry } from '../../../src/metacognition/parameter-registry.js';

describe('ParameterRegistry', () => {
  let db: Database.Database;
  let registry: ParameterRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    registry = new ParameterRegistry(db);
  });

  it('should create tables on construction', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'parameter%'",
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('parameter_registry');
    expect(names).toContain('parameter_changes');
    expect(names).toContain('parameter_snapshots');
  });

  it('should register a parameter', () => {
    registry.register({ engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 1.0, description: 'Synapse prune cutoff' });
    const val = registry.get('dream', 'prune_threshold');
    expect(val).toBe(0.15);
  });

  it('should not overwrite existing values on re-register', () => {
    registry.register({ engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 1.0, description: 'Test' });
    registry.set('dream', 'prune_threshold', 0.25, 'test', 'Testing');
    registry.register({ engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 1.0, description: 'Test' });
    expect(registry.get('dream', 'prune_threshold')).toBe(0.25);
  });

  it('should return undefined for unknown parameters', () => {
    expect(registry.get('nope', 'nope')).toBeUndefined();
  });

  it('should set a parameter with bounds validation', () => {
    registry.register({ engine: 'attn', name: 'decay', value: 0.85, min: 0.5, max: 1.0, description: 'Decay rate' });
    // Within bounds
    registry.set('attn', 'decay', 0.9, 'test', 'Tuning');
    expect(registry.get('attn', 'decay')).toBe(0.9);
    // Over max — clamped
    registry.set('attn', 'decay', 1.5, 'test', 'Over max');
    expect(registry.get('attn', 'decay')).toBe(1.0);
    // Under min — clamped
    registry.set('attn', 'decay', 0.1, 'test', 'Under min');
    expect(registry.get('attn', 'decay')).toBe(0.5);
  });

  it('should return false when setting to same value', () => {
    registry.register({ engine: 'a', name: 'b', value: 5, min: 0, max: 10, description: '' });
    const changed = registry.set('a', 'b', 5, 'test', 'no change');
    expect(changed).toBe(false);
  });

  it('should return false for unknown parameters', () => {
    const changed = registry.set('x', 'y', 1, 'test', 'unknown');
    expect(changed).toBe(false);
  });

  it('should track change history', () => {
    registry.register({ engine: 'e', name: 'p', value: 1, min: 0, max: 10, description: '' });
    registry.set('e', 'p', 2, 'user', 'First change');
    registry.set('e', 'p', 3, 'auto', 'Second change');
    const history = registry.getHistory('e', 'p');
    expect(history).toHaveLength(2);
    expect(history[0].new_value).toBe(3);
    expect(history[1].new_value).toBe(2);
  });

  it('should list parameters by engine', () => {
    registry.register({ engine: 'dream', name: 'a', value: 1, min: 0, max: 10, description: '' });
    registry.register({ engine: 'dream', name: 'b', value: 2, min: 0, max: 10, description: '' });
    registry.register({ engine: 'attn', name: 'c', value: 3, min: 0, max: 10, description: '' });

    const all = registry.list();
    expect(all).toHaveLength(3);

    const dreamOnly = registry.list('dream');
    expect(dreamOnly).toHaveLength(2);
  });

  it('should snapshot and restore', () => {
    registry.register({ engine: 'e1', name: 'p1', value: 10, min: 0, max: 100, description: '' });
    registry.register({ engine: 'e2', name: 'p2', value: 20, min: 0, max: 100, description: '' });

    const snapId = registry.snapshot('before_experiment');

    // Change values
    registry.set('e1', 'p1', 50, 'test', 'experiment');
    registry.set('e2', 'p2', 80, 'test', 'experiment');
    expect(registry.get('e1', 'p1')).toBe(50);
    expect(registry.get('e2', 'p2')).toBe(80);

    // Restore
    const restored = registry.restore(snapId);
    expect(restored).toBe(2);
    expect(registry.get('e1', 'p1')).toBe(10);
    expect(registry.get('e2', 'p2')).toBe(20);
  });

  it('should list snapshots', () => {
    registry.register({ engine: 'e', name: 'p', value: 1, min: 0, max: 10, description: '' });
    registry.snapshot('snap1');
    registry.snapshot('snap2');
    const snaps = registry.listSnapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps[0].label).toBe('snap2');
  });

  it('should get full definition', () => {
    registry.register({ engine: 'dream', name: 'rate', value: 0.15, min: 0.01, max: 0.5, description: 'Learning rate', category: 'consolidation' });
    const def = registry.getDefinition('dream', 'rate');
    expect(def).toBeDefined();
    expect(def!.value).toBe(0.15);
    expect(def!.min).toBe(0.01);
    expect(def!.max).toBe(0.5);
    expect(def!.description).toBe('Learning rate');
    expect(def!.category).toBe('consolidation');
  });

  it('should get status summary', () => {
    registry.register({ engine: 'e1', name: 'p1', value: 1, min: 0, max: 10, description: '' });
    registry.register({ engine: 'e2', name: 'p2', value: 2, min: 0, max: 10, description: '' });
    registry.set('e1', 'p1', 5, 'test', 'change');
    registry.snapshot('snap');

    const status = registry.getStatus();
    expect(status.totalParameters).toBe(2);
    expect(status.totalChanges).toBe(1);
    expect(status.totalSnapshots).toBe(1);
    expect(status.engines).toContain('e1');
    expect(status.engines).toContain('e2');
  });
});
