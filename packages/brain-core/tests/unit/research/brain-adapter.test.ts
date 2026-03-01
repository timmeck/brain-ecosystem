import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { BrainDataMinerAdapter } from '../../../src/research/adapters/brain-adapter.js';

function createBrainSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      path TEXT,
      language TEXT,
      framework TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      terminal_id INTEGER,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      context TEXT,
      file_path TEXT,
      line_number INTEGER,
      column_number INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      commands TEXT,
      code_change TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL,
      solution_id INTEGER NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')),
      success INTEGER
    );

    CREATE TABLE IF NOT EXISTS code_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      complexity INTEGER,
      lines INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS synapses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      relationship TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      confidence REAL,
      title TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      outcome TEXT,
      project_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS git_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      project_id INTEGER,
      files_changed INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe('BrainDataMinerAdapter', () => {
  let db: Database.Database;
  const adapter = new BrainDataMinerAdapter();

  beforeEach(() => {
    db = new Database(':memory:');
    createBrainSchema(db);
  });

  it('has correct name', () => {
    expect(adapter.name).toBe('brain');
  });

  describe('mineObservations', () => {
    it('mines error type stats', () => {
      db.exec(`INSERT INTO errors (project_id, fingerprint, type, message, raw_output, resolved) VALUES
        (1, 'fp1', 'TypeError', 'msg', 'raw', 1),
        (1, 'fp2', 'TypeError', 'msg2', 'raw2', 0),
        (1, 'fp3', 'SyntaxError', 'msg3', 'raw3', 0)`);

      const obs = adapter.mineObservations(db, 0);
      const typeErrors = obs.find(o => o.event_type === 'error:type_stats' && (o.metrics as Record<string, unknown>).type === 'TypeError');
      expect(typeErrors).toBeDefined();
      expect(typeErrors!.metrics.count).toBe(2);
      expect(typeErrors!.metrics.resolved).toBe(1);
    });

    it('mines solution effectiveness', () => {
      db.exec(`INSERT INTO solutions (description, success_count, fail_count) VALUES ('fix it', 8, 2)`);

      const obs = adapter.mineObservations(db, 0);
      const solution = obs.find(o => o.event_type === 'solution:effectiveness');
      expect(solution).toBeDefined();
      expect(solution!.metrics.success_rate).toBeCloseTo(0.8);
    });

    it('mines module complexity', () => {
      db.exec(`INSERT INTO code_modules (file_path, complexity, lines) VALUES ('src/main.ts', 15, 200)`);

      const obs = adapter.mineObservations(db, 0);
      const mod = obs.find(o => o.event_type === 'module:complexity');
      expect(mod).toBeDefined();
      expect(mod!.metrics.complexity).toBe(15);
      expect(mod!.metrics.lines).toBe(200);
    });

    it('mines synapse network stats', () => {
      db.exec(`INSERT INTO synapses (source_type, source_id, target_type, target_id, relationship, weight) VALUES
        ('error', 1, 'project', 1, 'co_occurs', 0.8),
        ('error', 2, 'project', 1, 'co_occurs', 0.6)`);

      const obs = adapter.mineObservations(db, 0);
      const syn = obs.find(o => o.event_type === 'synapse:network_stats');
      expect(syn).toBeDefined();
      expect(syn!.metrics.count).toBe(2);
      expect(syn!.metrics.avg_weight).toBeCloseTo(0.7);
    });

    it('mines insight quality', () => {
      db.exec(`INSERT INTO insights (type, confidence) VALUES ('pattern', 0.9), ('anomaly', 0.5)`);

      const obs = adapter.mineObservations(db, 0);
      const insights = obs.filter(o => o.event_type === 'insight:quality');
      expect(insights).toHaveLength(2);
    });

    it('returns empty array for empty tables', () => {
      const obs = adapter.mineObservations(db, 0);
      expect(obs).toEqual([]);
    });
  });

  describe('mineCausalEvents', () => {
    it('mines errors as causal events', () => {
      db.exec(`INSERT INTO errors (project_id, fingerprint, type, message, raw_output, resolved) VALUES
        (1, 'fp1', 'TypeError', 'msg', 'raw', 0)`);

      const events = adapter.mineCausalEvents(db, 0);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error:occurred');
      expect(events[0].source).toBe('brain');
    });

    it('mines decisions as causal events', () => {
      db.exec(`INSERT INTO decisions (title, outcome, project_id) VALUES ('Use React', 'positive', 1)`);

      const events = adapter.mineCausalEvents(db, 0);
      const decision = events.find(e => e.type === 'decision:made');
      expect(decision).toBeDefined();
    });

    it('mines git commits as causal events', () => {
      db.exec(`INSERT INTO git_commits (hash, project_id, files_changed) VALUES ('abc123', 1, 5)`);

      const events = adapter.mineCausalEvents(db, 0);
      const commit = events.find(e => e.type === 'commit:pushed');
      expect(commit).toBeDefined();
      expect((commit!.data as Record<string, unknown>).filesChanged).toBe(5);
    });
  });

  describe('mineMetrics', () => {
    it('mines error counts by type', () => {
      db.exec(`INSERT INTO errors (project_id, fingerprint, type, message, raw_output) VALUES
        (1, 'fp1', 'TypeError', 'msg', 'raw'),
        (1, 'fp2', 'TypeError', 'msg', 'raw')`);

      const metrics = adapter.mineMetrics(db, 0);
      const typeErr = metrics.find(m => m.name === 'error_count:TypeError');
      expect(typeErr).toBeDefined();
      expect(typeErr!.value).toBe(2);
    });

    it('mines resolution rate', () => {
      db.exec(`INSERT INTO errors (project_id, fingerprint, type, message, raw_output, resolved) VALUES
        (1, 'fp1', 'E', 'msg', 'raw', 1),
        (1, 'fp2', 'E', 'msg', 'raw', 0)`);

      const metrics = adapter.mineMetrics(db, 0);
      const rate = metrics.find(m => m.name === 'resolution_rate');
      expect(rate).toBeDefined();
      expect(rate!.value).toBeCloseTo(0.5);
    });
  });

  describe('mineHypothesisObservations', () => {
    it('mines error counts per type', () => {
      db.exec(`INSERT INTO errors (project_id, fingerprint, type, message, raw_output) VALUES
        (1, 'fp1', 'TypeError', 'msg', 'raw')`);

      const obs = adapter.mineHypothesisObservations(db, 0);
      expect(obs.length).toBeGreaterThanOrEqual(1);
      expect(obs[0].source).toBe('brain');
      expect(obs[0].type).toBe('error:reported');
    });
  });

  describe('mineCrossDomainEvents', () => {
    it('mines error batch events', () => {
      db.exec(`INSERT INTO errors (project_id, fingerprint, type, message, raw_output) VALUES
        (1, 'fp1', 'E', 'msg', 'raw'),
        (1, 'fp2', 'E', 'msg2', 'raw2')`);

      const events = adapter.mineCrossDomainEvents(db, 0);
      const batch = events.find(e => e.eventType === 'error:batch');
      expect(batch).toBeDefined();
      expect(batch!.data!.count).toBe(2);
    });

    it('returns empty for no data', () => {
      const events = adapter.mineCrossDomainEvents(db, 0);
      expect(events).toEqual([]);
    });
  });

  describe('graceful handling of missing tables', () => {
    it('returns empty arrays when tables do not exist', () => {
      const emptyDb = new Database(':memory:');
      expect(adapter.mineObservations(emptyDb, 0)).toEqual([]);
      expect(adapter.mineCausalEvents(emptyDb, 0)).toEqual([]);
      expect(adapter.mineMetrics(emptyDb, 0)).toEqual([]);
      expect(adapter.mineHypothesisObservations(emptyDb, 0)).toEqual([]);
      expect(adapter.mineCrossDomainEvents(emptyDb, 0)).toEqual([]);
    });
  });
});
