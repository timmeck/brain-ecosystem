import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PostRepository } from '../../../src/db/repositories/post.repository.js';

// Minimal migration SQL for posts + FTS
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

    CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
    CREATE INDEX IF NOT EXISTS idx_posts_fingerprint ON posts(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      content, hashtags, platform,
      content='posts',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, content, hashtags, platform)
      VALUES (new.id, new.content, new.hashtags, new.platform);
    END;

    CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, content, hashtags, platform)
      VALUES ('delete', old.id, old.content, old.hashtags, old.platform);
    END;

    CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, content, hashtags, platform)
      VALUES ('delete', old.id, old.content, old.hashtags, old.platform);
      INSERT INTO posts_fts(rowid, content, hashtags, platform)
      VALUES (new.id, new.content, new.hashtags, new.platform);
    END;
  `);
}

describe('PostRepository', () => {
  let db: Database.Database;
  let repo: PostRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new PostRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a post and return its id', () => {
    const id = repo.create({ platform: 'x', content: 'Hello world' });
    expect(id).toBe(1);
  });

  it('should retrieve a post by id', () => {
    const id = repo.create({ platform: 'x', content: 'Test content' });
    const post = repo.getById(id);
    expect(post).toBeDefined();
    expect(post!.platform).toBe('x');
    expect(post!.content).toBe('Test content');
    expect(post!.status).toBe('draft');
    expect(post!.format).toBe('text');
  });

  it('should return undefined for non-existent id', () => {
    const post = repo.getById(999);
    expect(post).toBeUndefined();
  });

  it('should find a post by fingerprint', () => {
    repo.create({ platform: 'x', content: 'Unique content' });
    const post = repo.getById(1);
    expect(post).toBeDefined();
    const found = repo.getByFingerprint(post!.fingerprint);
    expect(found).toBeDefined();
    expect(found!.id).toBe(1);
  });

  it('should list all posts with a limit', () => {
    repo.create({ platform: 'x', content: 'Post 1' });
    repo.create({ platform: 'reddit', content: 'Post 2' });
    repo.create({ platform: 'linkedin', content: 'Post 3' });

    const all = repo.listAll(2);
    expect(all).toHaveLength(2);
  });

  it('should list posts by platform', () => {
    repo.create({ platform: 'x', content: 'X post 1' });
    repo.create({ platform: 'reddit', content: 'Reddit post' });
    repo.create({ platform: 'x', content: 'X post 2' });

    const xPosts = repo.listByPlatform('x');
    expect(xPosts).toHaveLength(2);
    expect(xPosts.every((p) => p.platform === 'x')).toBe(true);
  });

  it('should list published posts only', () => {
    repo.create({ platform: 'x', content: 'Draft', status: 'draft' });
    repo.create({ platform: 'x', content: 'Published', status: 'published', published_at: '2026-01-01T00:00:00Z' });

    const published = repo.listPublished();
    expect(published).toHaveLength(1);
    expect(published[0]!.content).toBe('Published');
  });

  it('should list posts by campaign', () => {
    db.prepare("INSERT INTO campaigns (name) VALUES ('Test Campaign')").run();
    repo.create({ platform: 'x', content: 'Campaign post', campaign_id: 1 });
    repo.create({ platform: 'x', content: 'No campaign post' });

    const campaignPosts = repo.listByCampaign(1);
    expect(campaignPosts).toHaveLength(1);
    expect(campaignPosts[0]!.campaign_id).toBe(1);
  });

  it('should update a post', () => {
    const id = repo.create({ platform: 'x', content: 'Original' });
    const updated = repo.update(id, { content: 'Updated content', status: 'published' });
    expect(updated).toBe(true);

    const post = repo.getById(id);
    expect(post!.content).toBe('Updated content');
    expect(post!.status).toBe('published');
  });

  it('should return false when updating with no valid fields', () => {
    const id = repo.create({ platform: 'x', content: 'Test' });
    const updated = repo.update(id, {});
    expect(updated).toBe(false);
  });

  it('should delete a post', () => {
    const id = repo.create({ platform: 'x', content: 'To delete' });
    const deleted = repo.delete(id);
    expect(deleted).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent post', () => {
    const deleted = repo.delete(999);
    expect(deleted).toBe(false);
  });

  it('should search posts via FTS', () => {
    repo.create({ platform: 'x', content: 'Marketing strategy for social media' });
    repo.create({ platform: 'x', content: 'Cooking recipe for pasta' });

    const results = repo.search('marketing');
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toContain('Marketing');
  });

  it('should count all posts', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ platform: 'x', content: 'Post 1' });
    repo.create({ platform: 'reddit', content: 'Post 2' });
    expect(repo.countAll()).toBe(2);
  });

  it('should count posts by platform', () => {
    repo.create({ platform: 'x', content: 'X 1' });
    repo.create({ platform: 'x', content: 'X 2' });
    repo.create({ platform: 'reddit', content: 'Reddit 1' });

    const counts = repo.countByPlatform();
    expect(counts['x']).toBe(2);
    expect(counts['reddit']).toBe(1);
  });

  it('should count posts by status', () => {
    repo.create({ platform: 'x', content: 'Draft', status: 'draft' });
    repo.create({ platform: 'x', content: 'Published', status: 'published' });

    const counts = repo.countByStatus();
    expect(counts['draft']).toBe(1);
    expect(counts['published']).toBe(1);
  });

  it('should return recent published posts since a given date', () => {
    repo.create({ platform: 'x', content: 'Old post', status: 'published', published_at: '2020-01-01T00:00:00Z' });
    repo.create({ platform: 'x', content: 'New post', status: 'published', published_at: '2026-06-01T00:00:00Z' });

    const recent = repo.recentPublished('2025-01-01T00:00:00Z');
    expect(recent).toHaveLength(1);
    expect(recent[0]!.content).toBe('New post');
  });
});
