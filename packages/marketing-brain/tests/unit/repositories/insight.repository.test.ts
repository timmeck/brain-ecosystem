import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { InsightRepository } from '../../../src/db/repositories/insight.repository.js';

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

    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      priority INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
    CREATE INDEX IF NOT EXISTS idx_insights_campaign ON insights(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_insights_active ON insights(active);
    CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights(priority);
  `);
}

describe('InsightRepository', () => {
  let db: Database.Database;
  let repo: InsightRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new InsightRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create an insight and return its id', () => {
    const id = repo.create({ type: 'trend', title: 'Growing engagement', description: 'Engagement is up 20%' });
    expect(id).toBe(1);
  });

  it('should retrieve an insight by id', () => {
    const id = repo.create({
      type: 'gap', title: 'No LinkedIn posts',
      description: 'Consider posting on LinkedIn',
      confidence: 0.8, priority: 5,
    });
    const insight = repo.getById(id);
    expect(insight).toBeDefined();
    expect(insight!.type).toBe('gap');
    expect(insight!.title).toBe('No LinkedIn posts');
    expect(insight!.confidence).toBe(0.8);
    expect(insight!.priority).toBe(5);
    expect(insight!.active).toBe(1);
  });

  it('should return undefined for non-existent insight', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should list active insights ordered by priority then confidence', () => {
    repo.create({ type: 'trend', title: 'Low priority', description: 'desc', priority: 2 });
    repo.create({ type: 'gap', title: 'High priority', description: 'desc', priority: 8 });

    const active = repo.listActive();
    expect(active).toHaveLength(2);
    expect(active[0]!.title).toBe('High priority');
  });

  it('should not include deactivated insights in active list', () => {
    const id = repo.create({ type: 'trend', title: 'Active', description: 'desc' });
    repo.create({ type: 'trend', title: 'Will deactivate', description: 'desc' });
    repo.deactivate(2);

    const active = repo.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]!.title).toBe('Active');
  });

  it('should not include expired insights in active list', () => {
    repo.create({ type: 'trend', title: 'Not expired', description: 'desc', expires_at: '2099-01-01T00:00:00Z' });
    repo.create({ type: 'trend', title: 'Expired', description: 'desc', expires_at: '2000-01-01T00:00:00Z' });

    const active = repo.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]!.title).toBe('Not expired');
  });

  it('should list all insights', () => {
    repo.create({ type: 'trend', title: 'A', description: 'desc' });
    repo.create({ type: 'gap', title: 'B', description: 'desc' });

    const all = repo.listAll();
    expect(all).toHaveLength(2);
  });

  it('should list insights by type', () => {
    repo.create({ type: 'trend', title: 'Trend 1', description: 'desc' });
    repo.create({ type: 'gap', title: 'Gap 1', description: 'desc' });
    repo.create({ type: 'trend', title: 'Trend 2', description: 'desc' });

    const trends = repo.listByType('trend');
    expect(trends).toHaveLength(2);
    expect(trends.every((i) => i.type === 'trend')).toBe(true);
  });

  it('should list insights by campaign', () => {
    db.prepare("INSERT INTO campaigns (name) VALUES ('Test')").run();
    repo.create({ type: 'trend', title: 'Campaign insight', description: 'desc', campaign_id: 1 });
    repo.create({ type: 'trend', title: 'No campaign', description: 'desc' });

    const byCampaign = repo.listByCampaign(1);
    expect(byCampaign).toHaveLength(1);
    expect(byCampaign[0]!.campaign_id).toBe(1);
  });

  it('should deactivate an insight', () => {
    const id = repo.create({ type: 'trend', title: 'To deactivate', description: 'desc' });
    repo.deactivate(id);

    const insight = repo.getById(id);
    expect(insight!.active).toBe(0);
  });

  it('should expire old insights', () => {
    repo.create({ type: 'trend', title: 'Expired', description: 'desc', expires_at: '2000-01-01T00:00:00Z' });
    repo.create({ type: 'trend', title: 'Not expired', description: 'desc', expires_at: '2099-01-01T00:00:00Z' });

    const count = repo.expireOld();
    expect(count).toBe(1);

    const expired = repo.getById(1);
    expect(expired!.active).toBe(0);
  });

  it('should count active insights', () => {
    repo.create({ type: 'trend', title: 'A', description: 'desc' });
    repo.create({ type: 'trend', title: 'B', description: 'desc' });
    repo.deactivate(2);

    expect(repo.countActive()).toBe(1);
  });

  it('should count all insights', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ type: 'trend', title: 'A', description: 'desc' });
    expect(repo.countAll()).toBe(1);
  });

  it('should delete an insight', () => {
    const id = repo.create({ type: 'trend', title: 'To delete', description: 'desc' });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent insight', () => {
    expect(repo.delete(999)).toBe(false);
  });
});
