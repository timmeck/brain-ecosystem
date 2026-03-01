import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EngagementRepository } from '../../../src/db/repositories/engagement.repository.js';

function applyMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      brand TEXT,
      goal TEXT,
      platform TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      saves INTEGER NOT NULL DEFAULT 0,
      reach INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_engagement_post ON engagement(post_id);
    CREATE INDEX IF NOT EXISTS idx_engagement_timestamp ON engagement(timestamp);
  `);
}

function insertPost(db: Database.Database, platform: string = 'x', status: string = 'published') {
  return db.prepare(
    "INSERT INTO posts (platform, content, fingerprint, status, published_at) VALUES (?, 'test', 'fp_' || ?, ?, datetime('now'))"
  ).run(platform, Math.random().toString(), status).lastInsertRowid as number;
}

describe('EngagementRepository', () => {
  let db: Database.Database;
  let repo: EngagementRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new EngagementRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create an engagement record and return its id', () => {
    const postId = insertPost(db);
    const id = repo.create({ post_id: postId, likes: 10, comments: 5 });
    expect(id).toBeGreaterThan(0);
  });

  it('should retrieve engagement by id', () => {
    const postId = insertPost(db);
    const id = repo.create({ post_id: postId, likes: 42, shares: 3 });
    const eng = repo.getById(id);
    expect(eng).toBeDefined();
    expect(eng!.likes).toBe(42);
    expect(eng!.shares).toBe(3);
    expect(eng!.comments).toBe(0);
  });

  it('should return undefined for non-existent engagement id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should get the latest engagement for a post', () => {
    const postId = insertPost(db);
    // Insert with explicit timestamps to ensure ordering
    db.prepare(
      "INSERT INTO engagement (post_id, likes, comments, shares, impressions, clicks, saves, reach, timestamp) VALUES (?, 10, 0, 0, 0, 0, 0, 0, '2026-01-01T00:00:00Z')"
    ).run(postId);
    db.prepare(
      "INSERT INTO engagement (post_id, likes, comments, shares, impressions, clicks, saves, reach, timestamp) VALUES (?, 20, 0, 0, 0, 0, 0, 0, '2026-01-02T00:00:00Z')"
    ).run(postId);

    const latest = repo.getLatestByPost(postId);
    expect(latest).toBeDefined();
    expect(latest!.likes).toBe(20);
  });

  it('should list all engagement records for a post', () => {
    const postId = insertPost(db);
    repo.create({ post_id: postId, likes: 10 });
    repo.create({ post_id: postId, likes: 20 });
    repo.create({ post_id: postId, likes: 30 });

    const list = repo.listByPost(postId);
    expect(list).toHaveLength(3);
  });

  it('should return top posts by weighted engagement score', () => {
    const postId1 = insertPost(db, 'x');
    const postId2 = insertPost(db, 'reddit');
    repo.create({ post_id: postId1, likes: 100, comments: 50, shares: 20 });
    repo.create({ post_id: postId2, likes: 5, comments: 1, shares: 0 });

    const top = repo.topPosts(10);
    expect(top.length).toBeGreaterThanOrEqual(2);
    // First should be the higher scoring one
    expect(top[0]!.post_id).toBe(postId1);
  });

  it('should compute average engagement by platform', () => {
    const p1 = insertPost(db, 'x');
    const p2 = insertPost(db, 'x');
    const p3 = insertPost(db, 'reddit');
    repo.create({ post_id: p1, likes: 10, comments: 2 });
    repo.create({ post_id: p2, likes: 20, comments: 4 });
    repo.create({ post_id: p3, likes: 5, comments: 1 });

    const stats = repo.avgByPlatform();
    expect(stats.length).toBeGreaterThanOrEqual(2);

    const xStats = stats.find((s) => s.platform === 'x');
    expect(xStats).toBeDefined();
    expect(xStats!.avg_likes).toBe(15); // (10+20)/2
    expect(xStats!.post_count).toBe(2);
  });

  it('should default missing engagement fields to zero', () => {
    const postId = insertPost(db);
    const id = repo.create({ post_id: postId });
    const eng = repo.getById(id);
    expect(eng!.likes).toBe(0);
    expect(eng!.comments).toBe(0);
    expect(eng!.shares).toBe(0);
    expect(eng!.impressions).toBe(0);
    expect(eng!.clicks).toBe(0);
    expect(eng!.saves).toBe(0);
    expect(eng!.reach).toBe(0);
  });

  it('should delete an engagement record', () => {
    const postId = insertPost(db);
    const id = repo.create({ post_id: postId, likes: 10 });
    const deleted = repo.delete(id);
    expect(deleted).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent engagement', () => {
    expect(repo.delete(999)).toBe(false);
  });
});
