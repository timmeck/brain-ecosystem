import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AudienceRepository } from '../../../src/db/repositories/audience.repository.js';

function applyMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      platform TEXT,
      demographics TEXT,
      interests TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe('AudienceRepository', () => {
  let db: Database.Database;
  let repo: AudienceRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new AudienceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create an audience and return its id', () => {
    const id = repo.create({ name: 'Tech Enthusiasts' });
    expect(id).toBe(1);
  });

  it('should retrieve an audience by id', () => {
    const id = repo.create({ name: 'Developers', platform: 'x', demographics: '25-35', interests: 'coding' });
    const audience = repo.getById(id);
    expect(audience).toBeDefined();
    expect(audience!.name).toBe('Developers');
    expect(audience!.platform).toBe('x');
    expect(audience!.demographics).toBe('25-35');
    expect(audience!.interests).toBe('coding');
  });

  it('should return undefined for non-existent audience id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should find an audience by name', () => {
    repo.create({ name: 'Marketing Pros' });
    const audience = repo.getByName('Marketing Pros');
    expect(audience).toBeDefined();
    expect(audience!.name).toBe('Marketing Pros');
  });

  it('should return undefined for non-existent audience name', () => {
    expect(repo.getByName('Nonexistent')).toBeUndefined();
  });

  it('should list all audiences', () => {
    repo.create({ name: 'Group A' });
    repo.create({ name: 'Group B' });
    repo.create({ name: 'Group C' });

    const all = repo.listAll();
    expect(all).toHaveLength(3);
  });

  it('should count all audiences', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ name: 'A' });
    repo.create({ name: 'B' });
    expect(repo.countAll()).toBe(2);
  });

  it('should delete an audience', () => {
    const id = repo.create({ name: 'To Delete' });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent audience', () => {
    expect(repo.delete(999)).toBe(false);
  });

  it('should enforce unique name constraint', () => {
    repo.create({ name: 'Unique Name' });
    expect(() => repo.create({ name: 'Unique Name' })).toThrow();
  });
});
