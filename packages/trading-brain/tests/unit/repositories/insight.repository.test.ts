import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { InsightRepository } from '../../../src/db/repositories/insight.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
    CREATE INDEX IF NOT EXISTS idx_insights_severity ON insights(severity);

    CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(
      title, description, content=insights, content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS insights_ai AFTER INSERT ON insights BEGIN
      INSERT INTO insights_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
    END;

    CREATE TRIGGER IF NOT EXISTS insights_ad AFTER DELETE ON insights BEGIN
      INSERT INTO insights_fts(insights_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
    END;
  `);
}

describe('InsightRepository', () => {
  let db: Database.Database;
  let repo: InsightRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new InsightRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should insert an insight and return the row id', () => {
      const id = repo.create({
        type: 'trend',
        severity: 'high',
        title: 'Win-Rate steigt',
        description: 'Win-Rate gestiegen: 50% -> 70%',
      });

      expect(id).toBe(1);
    });

    it('should store data_json when data is provided', () => {
      const id = repo.create({
        type: 'performance',
        severity: 'high',
        title: 'Best pattern',
        description: 'Pattern X has 80% win rate',
        data: { fingerprint: 'fp', winRate: 0.8 },
      });

      const rows = db.prepare('SELECT * FROM insights WHERE id = ?').all(id) as any[];
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].data_json)).toEqual({ fingerprint: 'fp', winRate: 0.8 });
    });

    it('should store null data_json when data is not provided', () => {
      const id = repo.create({
        type: 'gap',
        severity: 'low',
        title: 'Data gap',
        description: 'Not enough trades',
      });

      const rows = db.prepare('SELECT * FROM insights WHERE id = ?').all(id) as any[];
      expect(rows[0].data_json).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all insights in reverse chronological order', () => {
      db.exec(`INSERT INTO insights (type, severity, title, description, created_at) VALUES ('trend', 'high', 'First', 'desc1', '2026-01-01 00:00:00')`);
      db.exec(`INSERT INTO insights (type, severity, title, description, created_at) VALUES ('gap', 'low', 'Second', 'desc2', '2026-01-02 00:00:00')`);

      const all = repo.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].title).toBe('Second');
      expect(all[1].title).toBe('First');
    });
  });

  describe('getRecent', () => {
    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) {
        repo.create({ type: 'trend', severity: 'medium', title: `Insight ${i}`, description: `Desc ${i}` });
      }

      const recent = repo.getRecent(3);
      expect(recent).toHaveLength(3);
    });

    it('should default to 10', () => {
      for (let i = 0; i < 15; i++) {
        repo.create({ type: 'trend', severity: 'medium', title: `Insight ${i}`, description: `Desc ${i}` });
      }

      const recent = repo.getRecent();
      expect(recent).toHaveLength(10);
    });
  });

  describe('getByType', () => {
    it('should filter insights by type', () => {
      repo.create({ type: 'trend', severity: 'high', title: 'T1', description: 'D1' });
      repo.create({ type: 'gap', severity: 'low', title: 'T2', description: 'D2' });
      repo.create({ type: 'trend', severity: 'medium', title: 'T3', description: 'D3' });

      const trends = repo.getByType('trend');
      expect(trends).toHaveLength(2);
      expect(trends.every(i => i.type === 'trend')).toBe(true);
    });
  });

  describe('getBySeverity', () => {
    it('should filter insights by severity', () => {
      repo.create({ type: 'trend', severity: 'high', title: 'T1', description: 'D1' });
      repo.create({ type: 'gap', severity: 'low', title: 'T2', description: 'D2' });
      repo.create({ type: 'performance', severity: 'high', title: 'T3', description: 'D3' });

      const highSeverity = repo.getBySeverity('high');
      expect(highSeverity).toHaveLength(2);
      expect(highSeverity.every(i => i.severity === 'high')).toBe(true);
    });
  });

  describe('count', () => {
    it('should return 0 when empty', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return correct count', () => {
      repo.create({ type: 'a', severity: 'low', title: 'A', description: 'A' });
      repo.create({ type: 'b', severity: 'high', title: 'B', description: 'B' });
      expect(repo.count()).toBe(2);
    });
  });

  describe('search', () => {
    it('should find insights matching title via full-text search', () => {
      repo.create({ type: 'trend', severity: 'high', title: 'Win-Rate steigt dramatically', description: 'More wins' });
      repo.create({ type: 'gap', severity: 'low', title: 'Data gap detected', description: 'Need more data' });

      const results = repo.search('steigt');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Win-Rate steigt dramatically');
    });

    it('should find insights matching description via full-text search', () => {
      repo.create({ type: 'trend', severity: 'high', title: 'Trend', description: 'Performance improved significantly' });
      repo.create({ type: 'gap', severity: 'low', title: 'Gap', description: 'Missing data for regime' });

      const results = repo.search('significantly');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Trend');
    });
  });

  describe('pruneOldest', () => {
    it('should remove excess insights keeping only keepCount', () => {
      for (let i = 0; i < 5; i++) {
        db.exec(`INSERT INTO insights (type, severity, title, description, created_at) VALUES ('t', 'low', 'I${i}', 'D${i}', '2026-01-0${i + 1} 00:00:00')`);
      }

      expect(repo.count()).toBe(5);
      repo.pruneOldest(3);
      expect(repo.count()).toBe(3);
    });

    it('should do nothing when count <= keepCount', () => {
      repo.create({ type: 'a', severity: 'low', title: 'A', description: 'A' });
      repo.pruneOldest(10);
      expect(repo.count()).toBe(1);
    });
  });

  describe('deleteAll', () => {
    it('should remove all insights', () => {
      repo.create({ type: 'a', severity: 'low', title: 'A', description: 'A' });
      repo.create({ type: 'b', severity: 'high', title: 'B', description: 'B' });
      expect(repo.count()).toBe(2);

      repo.deleteAll();
      expect(repo.count()).toBe(0);
    });
  });
});
