import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StrategyRepository } from '../../../src/db/repositories/strategy.repository.js';

function applyMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'text',
      hashtags TEXT,
      url TEXT,
      published_at TEXT,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      description TEXT NOT NULL,
      approach TEXT,
      outcome TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_strategies_post ON strategies(post_id);
    CREATE INDEX IF NOT EXISTS idx_strategies_confidence ON strategies(confidence);

    CREATE VIRTUAL TABLE IF NOT EXISTS strategies_fts USING fts5(
      description, approach, outcome,
      content='strategies',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS strategies_ai AFTER INSERT ON strategies BEGIN
      INSERT INTO strategies_fts(rowid, description, approach, outcome)
      VALUES (new.id, new.description, new.approach, new.outcome);
    END;

    CREATE TRIGGER IF NOT EXISTS strategies_ad AFTER DELETE ON strategies BEGIN
      INSERT INTO strategies_fts(strategies_fts, rowid, description, approach, outcome)
      VALUES ('delete', old.id, old.description, old.approach, old.outcome);
    END;

    CREATE TRIGGER IF NOT EXISTS strategies_au AFTER UPDATE ON strategies BEGIN
      INSERT INTO strategies_fts(strategies_fts, rowid, description, approach, outcome)
      VALUES ('delete', old.id, old.description, old.approach, old.outcome);
      INSERT INTO strategies_fts(rowid, description, approach, outcome)
      VALUES (new.id, new.description, new.approach, new.outcome);
    END;
  `);
}

describe('StrategyRepository', () => {
  let db: Database.Database;
  let repo: StrategyRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new StrategyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a strategy and return its id', () => {
    const id = repo.create({ description: 'Use short-form video content' });
    expect(id).toBe(1);
  });

  it('should retrieve a strategy by id', () => {
    const id = repo.create({ description: 'Focus on engagement', approach: 'Q&A format', outcome: 'Higher comments' });
    const strategy = repo.getById(id);
    expect(strategy).toBeDefined();
    expect(strategy!.description).toBe('Focus on engagement');
    expect(strategy!.approach).toBe('Q&A format');
    expect(strategy!.outcome).toBe('Higher comments');
    expect(strategy!.confidence).toBe(0.5);
  });

  it('should return undefined for non-existent strategy id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should list all strategies ordered by confidence', () => {
    repo.create({ description: 'Low conf strategy' });
    const id2 = repo.create({ description: 'High conf strategy' });
    repo.update(id2, { confidence: 0.9 });

    const strategies = repo.listAll();
    expect(strategies).toHaveLength(2);
    expect(strategies[0]!.confidence).toBeGreaterThanOrEqual(strategies[1]!.confidence);
  });

  it('should list strategies by post id', () => {
    db.prepare("INSERT INTO posts (platform, content, fingerprint) VALUES ('x', 'test', 'fp1')").run();
    repo.create({ description: 'Post strategy', post_id: 1 });
    repo.create({ description: 'Other strategy' });

    const byPost = repo.listByPost(1);
    expect(byPost).toHaveLength(1);
    expect(byPost[0]!.description).toBe('Post strategy');
  });

  it('should search strategies via FTS', () => {
    repo.create({ description: 'Use hashtag strategy for Twitter growth' });
    repo.create({ description: 'Video content for Instagram engagement' });

    const results = repo.search('hashtag');
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toContain('hashtag');
  });

  it('should get top strategies by confidence', () => {
    repo.create({ description: 'Low strategy' });
    const id2 = repo.create({ description: 'High strategy' });
    repo.update(id2, { confidence: 0.9 });

    const top = repo.topByConfidence(0.7);
    expect(top).toHaveLength(1);
    expect(top[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should update a strategy', () => {
    const id = repo.create({ description: 'Original' });
    const updated = repo.update(id, { description: 'Updated', confidence: 0.8 });
    expect(updated).toBe(true);

    const strategy = repo.getById(id);
    expect(strategy!.description).toBe('Updated');
    expect(strategy!.confidence).toBe(0.8);
  });

  it('should return false when updating with empty data', () => {
    const id = repo.create({ description: 'Test' });
    expect(repo.update(id, {})).toBe(false);
  });

  it('should count all strategies', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ description: 'A' });
    repo.create({ description: 'B' });
    expect(repo.countAll()).toBe(2);
  });

  it('should delete a strategy', () => {
    const id = repo.create({ description: 'To delete' });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });
});
