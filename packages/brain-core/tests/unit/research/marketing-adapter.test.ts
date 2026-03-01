import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MarketingDataMinerAdapter } from '../../../src/research/adapters/marketing-adapter.js';

function createMarketingSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      format TEXT,
      content TEXT,
      campaign_id INTEGER,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      likes INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      goal_type TEXT,
      goal_target REAL,
      goal_current REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      use_count INTEGER DEFAULT 0,
      avg_engagement REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS competitor_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_name TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe('MarketingDataMinerAdapter', () => {
  let db: Database.Database;
  const adapter = new MarketingDataMinerAdapter();

  beforeEach(() => {
    db = new Database(':memory:');
    createMarketingSchema(db);
  });

  it('has correct name', () => {
    expect(adapter.name).toBe('marketing-brain');
  });

  describe('mineObservations', () => {
    it('mines post platform stats', () => {
      db.exec(`INSERT INTO posts (platform, published_at) VALUES ('X', datetime('now')), ('X', datetime('now')), ('LinkedIn', datetime('now'))`);
      db.exec(`INSERT INTO engagement (post_id, likes, shares, comments) VALUES (1, 100, 10, 5), (2, 50, 5, 3), (3, 200, 20, 10)`);

      const obs = adapter.mineObservations(db, 0);
      const xStats = obs.find(o => o.event_type === 'post:platform_stats' && (o.metrics as Record<string, unknown>).platform === 'X');
      expect(xStats).toBeDefined();
      expect(xStats!.metrics.count).toBe(2);
      expect(xStats!.metrics.avg_likes).toBeCloseTo(75);
    });

    it('mines campaign goal progress', () => {
      db.exec(`INSERT INTO campaigns (name, status, goal_type, goal_target, goal_current) VALUES
        ('Q1 Launch', 'active', 'followers', 1000, 750)`);

      const obs = adapter.mineObservations(db, 0);
      const campaign = obs.find(o => o.event_type === 'campaign:goal_progress');
      expect(campaign).toBeDefined();
      expect(campaign!.metrics.achievement_rate).toBeCloseTo(0.75);
    });

    it('mines template effectiveness', () => {
      db.exec(`INSERT INTO content_templates (name, use_count, avg_engagement) VALUES ('Thread', 12, 85.5)`);

      const obs = adapter.mineObservations(db, 0);
      const tpl = obs.find(o => o.event_type === 'template:effectiveness');
      expect(tpl).toBeDefined();
      expect(tpl!.metrics.use_count).toBe(12);
      expect(tpl!.metrics.avg_engagement).toBeCloseTo(85.5);
    });

    it('mines competitor benchmarks', () => {
      db.exec(`INSERT INTO competitor_posts (competitor_name, likes) VALUES ('CompetitorA', 500), ('CompetitorA', 300)`);

      const obs = adapter.mineObservations(db, 0);
      const comp = obs.find(o => o.event_type === 'competitor:benchmark');
      expect(comp).toBeDefined();
      expect(comp!.metrics.post_count).toBe(2);
      expect(comp!.metrics.avg_likes).toBeCloseTo(400);
      expect(comp!.category).toBe('cross_brain');
    });

    it('mines post format stats', () => {
      db.exec(`INSERT INTO posts (platform, format) VALUES ('X', 'thread'), ('X', 'thread'), ('X', 'image')`);
      db.exec(`INSERT INTO engagement (post_id, likes) VALUES (1, 100), (2, 200), (3, 50)`);

      const obs = adapter.mineObservations(db, 0);
      const thread = obs.find(o => o.event_type === 'post:format_stats' && (o.metrics as Record<string, unknown>).format === 'thread');
      expect(thread).toBeDefined();
      expect(thread!.metrics.count).toBe(2);
    });
  });

  describe('mineCausalEvents', () => {
    it('mines published posts as causal events', () => {
      db.exec(`INSERT INTO posts (platform, format, published_at) VALUES ('X', 'thread', datetime('now'))`);

      const events = adapter.mineCausalEvents(db, 0);
      const post = events.find(e => e.type === 'post:published');
      expect(post).toBeDefined();
      expect(post!.source).toBe('marketing-brain');
    });

    it('mines campaign lifecycle events', () => {
      db.exec(`INSERT INTO campaigns (name, status) VALUES ('Launch', 'active')`);

      const events = adapter.mineCausalEvents(db, 0);
      const campaign = events.find(e => e.type === 'campaign:active');
      expect(campaign).toBeDefined();
    });

    it('skips unpublished posts', () => {
      db.exec(`INSERT INTO posts (platform, format) VALUES ('X', 'thread')`);

      const events = adapter.mineCausalEvents(db, 0);
      const posts = events.filter(e => e.type === 'post:published');
      expect(posts).toHaveLength(0);
    });
  });

  describe('mineMetrics', () => {
    it('mines post count', () => {
      db.exec(`INSERT INTO posts (platform) VALUES ('X'), ('LinkedIn')`);

      const metrics = adapter.mineMetrics(db, 0);
      const pc = metrics.find(m => m.name === 'post_count');
      expect(pc).toBeDefined();
      expect(pc!.value).toBe(2);
    });

    it('mines average engagement', () => {
      db.exec(`INSERT INTO engagement (post_id, likes, shares, comments) VALUES (1, 10, 5, 3), (2, 20, 10, 7)`);

      const metrics = adapter.mineMetrics(db, 0);
      const avg = metrics.find(m => m.name === 'avg_engagement');
      expect(avg).toBeDefined();
      // (10+5+3 + 20+10+7) / 2 = 55 / 2 = 27.5
      expect(avg!.value).toBeCloseTo(27.5);
    });

    it('mines active campaigns', () => {
      db.exec(`INSERT INTO campaigns (name, status) VALUES ('A', 'active'), ('B', 'draft'), ('C', 'active')`);

      const metrics = adapter.mineMetrics(db, 0);
      const ac = metrics.find(m => m.name === 'active_campaigns');
      expect(ac).toBeDefined();
      expect(ac!.value).toBe(2);
    });
  });

  describe('mineHypothesisObservations', () => {
    it('mines post publications by platform', () => {
      db.exec(`INSERT INTO posts (platform, published_at) VALUES ('X', datetime('now')), ('X', datetime('now')), ('LinkedIn', datetime('now'))`);

      const obs = adapter.mineHypothesisObservations(db, 0);
      const xObs = obs.find(o => o.type === 'post:published' && o.metadata?.platform === 'X');
      expect(xObs).toBeDefined();
      expect(xObs!.value).toBe(2);
    });
  });

  describe('mineCrossDomainEvents', () => {
    it('mines post batch summary', () => {
      db.exec(`INSERT INTO posts (platform, published_at) VALUES ('X', datetime('now')), ('X', NULL)`);

      const events = adapter.mineCrossDomainEvents(db, 0);
      const batch = events.find(e => e.eventType === 'post:batch');
      expect(batch).toBeDefined();
      expect(batch!.data!.count).toBe(2);
      expect(batch!.data!.published).toBe(1);
    });

    it('mines campaign batch summary', () => {
      db.exec(`INSERT INTO campaigns (name, status) VALUES ('A', 'active'), ('B', 'draft')`);

      const events = adapter.mineCrossDomainEvents(db, 0);
      const batch = events.find(e => e.eventType === 'campaign:batch');
      expect(batch).toBeDefined();
      expect(batch!.data!.count).toBe(2);
      expect(batch!.data!.active).toBe(1);
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
