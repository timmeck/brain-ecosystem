import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CampaignRepository } from '../../../src/db/repositories/campaign.repository.js';

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
  `);
}

describe('CampaignRepository', () => {
  let db: Database.Database;
  let repo: CampaignRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new CampaignRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a campaign and return its id', () => {
    const id = repo.create({ name: 'Summer Launch' });
    expect(id).toBe(1);
  });

  it('should retrieve a campaign by id', () => {
    const id = repo.create({ name: 'Winter Sale', brand: 'Acme', goal: 'awareness' });
    const campaign = repo.getById(id);
    expect(campaign).toBeDefined();
    expect(campaign!.name).toBe('Winter Sale');
    expect(campaign!.brand).toBe('Acme');
    expect(campaign!.goal).toBe('awareness');
    expect(campaign!.status).toBe('active');
  });

  it('should return undefined for non-existent campaign id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should find a campaign by name', () => {
    repo.create({ name: 'Product Launch' });
    const campaign = repo.getByName('Product Launch');
    expect(campaign).toBeDefined();
    expect(campaign!.name).toBe('Product Launch');
  });

  it('should return undefined for non-existent campaign name', () => {
    expect(repo.getByName('Does not exist')).toBeUndefined();
  });

  it('should list all campaigns', () => {
    repo.create({ name: 'Campaign A' });
    repo.create({ name: 'Campaign B' });
    repo.create({ name: 'Campaign C' });

    const list = repo.listAll();
    expect(list).toHaveLength(3);
  });

  it('should list only active campaigns', () => {
    const id1 = repo.create({ name: 'Active Campaign' });
    const id2 = repo.create({ name: 'Inactive Campaign' });
    repo.update(id2, { status: 'completed' });

    const active = repo.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe('Active Campaign');
  });

  it('should update a campaign', () => {
    const id = repo.create({ name: 'Original Name' });
    const updated = repo.update(id, { name: 'New Name', goal: 'engagement' });
    expect(updated).toBe(true);

    const campaign = repo.getById(id);
    expect(campaign!.name).toBe('New Name');
    expect(campaign!.goal).toBe('engagement');
  });

  it('should return false when updating with no valid fields', () => {
    const id = repo.create({ name: 'Test' });
    expect(repo.update(id, {})).toBe(false);
  });

  it('should count all campaigns', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ name: 'A' });
    repo.create({ name: 'B' });
    expect(repo.countAll()).toBe(2);
  });

  it('should delete a campaign', () => {
    const id = repo.create({ name: 'To Delete' });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent campaign', () => {
    expect(repo.delete(999)).toBe(false);
  });
});
