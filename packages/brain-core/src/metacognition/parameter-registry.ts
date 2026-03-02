import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface ParameterDefinition {
  engine: string;
  name: string;
  value: number;
  min: number;
  max: number;
  description: string;
  category?: string;
}

export interface ParameterChange {
  id?: number;
  engine: string;
  name: string;
  old_value: number;
  new_value: number;
  changed_by: string;
  reason: string;
  created_at?: string;
}

export interface ParameterSnapshot {
  id?: number;
  label: string;
  data_json: string;
  created_at?: string;
}

export interface RegisteredParameter {
  engine: string;
  name: string;
  value: number;
  min: number;
  max: number;
  description: string;
  category: string;
}

// ── Migration ───────────────────────────────────────────

export function runParameterRegistryMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS parameter_registry (
      engine TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      min_value REAL NOT NULL,
      max_value REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (engine, name)
    );

    CREATE TABLE IF NOT EXISTS parameter_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine TEXT NOT NULL,
      name TEXT NOT NULL,
      old_value REAL NOT NULL,
      new_value REAL NOT NULL,
      changed_by TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_param_changes_engine ON parameter_changes(engine, name);

    CREATE TABLE IF NOT EXISTS parameter_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Registry ───────────────────────────────────────────

export class ParameterRegistry {
  private db: Database.Database;
  private log = getLogger();

  constructor(db: Database.Database) {
    this.db = db;
    runParameterRegistryMigration(db);
  }

  /** Register a tunable parameter. Inserts if new, does NOT overwrite existing values. */
  register(def: ParameterDefinition): void {
    const existing = this.db.prepare(
      'SELECT value FROM parameter_registry WHERE engine = ? AND name = ?',
    ).get(def.engine, def.name) as { value: number } | undefined;

    if (existing) return; // Already registered — keep current value

    this.db.prepare(`
      INSERT INTO parameter_registry (engine, name, value, min_value, max_value, description, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(def.engine, def.name, def.value, def.min, def.max, def.description, def.category ?? 'general');
  }

  /** Register multiple parameters at once. */
  registerAll(defs: ParameterDefinition[]): void {
    for (const def of defs) this.register(def);
  }

  /** Get current value. Returns undefined if not registered. */
  get(engine: string, name: string): number | undefined {
    const row = this.db.prepare(
      'SELECT value FROM parameter_registry WHERE engine = ? AND name = ?',
    ).get(engine, name) as { value: number } | undefined;
    return row?.value;
  }

  /** Get full parameter definition. */
  getDefinition(engine: string, name: string): RegisteredParameter | undefined {
    const row = this.db.prepare(
      'SELECT engine, name, value, min_value, max_value, description, category FROM parameter_registry WHERE engine = ? AND name = ?',
    ).get(engine, name) as { engine: string; name: string; value: number; min_value: number; max_value: number; description: string; category: string } | undefined;
    if (!row) return undefined;
    return { engine: row.engine, name: row.name, value: row.value, min: row.min_value, max: row.max_value, description: row.description, category: row.category };
  }

  /** Set a parameter value with bounds validation and change tracking. */
  set(engine: string, name: string, value: number, changedBy: string, reason: string): boolean {
    const current = this.db.prepare(
      'SELECT value, min_value, max_value FROM parameter_registry WHERE engine = ? AND name = ?',
    ).get(engine, name) as { value: number; min_value: number; max_value: number } | undefined;

    if (!current) {
      this.log.warn(`[parameter-registry] Parameter not found: ${engine}.${name}`);
      return false;
    }

    // Clamp to bounds
    const clamped = Math.max(current.min_value, Math.min(current.max_value, value));

    if (clamped === current.value) return false; // No change

    // Record change
    this.db.prepare(`
      INSERT INTO parameter_changes (engine, name, old_value, new_value, changed_by, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(engine, name, current.value, clamped, changedBy, reason);

    // Update value
    this.db.prepare(`
      UPDATE parameter_registry SET value = ?, updated_at = datetime('now') WHERE engine = ? AND name = ?
    `).run(clamped, engine, name);

    this.log.info(`[parameter-registry] ${engine}.${name}: ${current.value} → ${clamped} (by ${changedBy}: ${reason})`);
    return true;
  }

  /** List all parameters, optionally filtered by engine. */
  list(engine?: string): RegisteredParameter[] {
    const query = engine
      ? 'SELECT engine, name, value, min_value, max_value, description, category FROM parameter_registry WHERE engine = ? ORDER BY engine, name'
      : 'SELECT engine, name, value, min_value, max_value, description, category FROM parameter_registry ORDER BY engine, name';
    const rows = (engine ? this.db.prepare(query).all(engine) : this.db.prepare(query).all()) as Array<{
      engine: string; name: string; value: number; min_value: number; max_value: number; description: string; category: string;
    }>;
    return rows.map(r => ({ engine: r.engine, name: r.name, value: r.value, min: r.min_value, max: r.max_value, description: r.description, category: r.category }));
  }

  /** Get change history for a parameter. */
  getHistory(engine: string, name: string, limit = 20): ParameterChange[] {
    return this.db.prepare(`
      SELECT id, engine, name, old_value, new_value, changed_by, reason, created_at
      FROM parameter_changes WHERE engine = ? AND name = ?
      ORDER BY id DESC LIMIT ?
    `).all(engine, name, limit) as ParameterChange[];
  }

  /** Get all recent changes across all parameters. */
  getRecentChanges(limit = 50): ParameterChange[] {
    return this.db.prepare(`
      SELECT id, engine, name, old_value, new_value, changed_by, reason, created_at
      FROM parameter_changes ORDER BY id DESC LIMIT ?
    `).all(limit) as ParameterChange[];
  }

  /** Create a snapshot of all current parameter values. */
  snapshot(label: string): number {
    const params = this.list();
    const data: Record<string, Record<string, number>> = {};
    for (const p of params) {
      if (!data[p.engine]) data[p.engine] = {};
      data[p.engine][p.name] = p.value;
    }
    const result = this.db.prepare(`
      INSERT INTO parameter_snapshots (label, data_json) VALUES (?, ?)
    `).run(label, JSON.stringify(data));
    return result.lastInsertRowid as number;
  }

  /** Restore parameters from a snapshot. */
  restore(snapshotId: number, changedBy = 'snapshot_restore'): number {
    const row = this.db.prepare(
      'SELECT data_json FROM parameter_snapshots WHERE id = ?',
    ).get(snapshotId) as { data_json: string } | undefined;
    if (!row) return 0;

    const data = JSON.parse(row.data_json) as Record<string, Record<string, number>>;
    let count = 0;
    for (const [engine, params] of Object.entries(data)) {
      for (const [name, value] of Object.entries(params)) {
        if (this.set(engine, name, value, changedBy, `Restored from snapshot #${snapshotId}`)) {
          count++;
        }
      }
    }
    return count;
  }

  /** List all snapshots. */
  listSnapshots(limit = 20): ParameterSnapshot[] {
    return this.db.prepare(
      'SELECT id, label, data_json, created_at FROM parameter_snapshots ORDER BY id DESC LIMIT ?',
    ).all(limit) as ParameterSnapshot[];
  }

  /** Get summary stats. */
  getStatus(): { totalParameters: number; totalChanges: number; totalSnapshots: number; engines: string[]; recentChanges: ParameterChange[] } {
    const totalParams = (this.db.prepare('SELECT COUNT(*) as c FROM parameter_registry').get() as { c: number }).c;
    const totalChanges = (this.db.prepare('SELECT COUNT(*) as c FROM parameter_changes').get() as { c: number }).c;
    const totalSnapshots = (this.db.prepare('SELECT COUNT(*) as c FROM parameter_snapshots').get() as { c: number }).c;
    const engines = (this.db.prepare('SELECT DISTINCT engine FROM parameter_registry ORDER BY engine').all() as { engine: string }[]).map(r => r.engine);
    const recentChanges = this.getRecentChanges(10);
    return { totalParameters: totalParams, totalChanges, totalSnapshots, engines, recentChanges };
  }
}
