import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TemplateRepository } from '../../../src/db/repositories/template.repository.js';

function applyMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      structure TEXT NOT NULL,
      example TEXT,
      platform TEXT,
      avg_engagement REAL NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_templates_platform ON content_templates(platform);
    CREATE INDEX IF NOT EXISTS idx_templates_engagement ON content_templates(avg_engagement);

    CREATE VIRTUAL TABLE IF NOT EXISTS content_templates_fts USING fts5(
      name, structure, example,
      content='content_templates',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS templates_ai AFTER INSERT ON content_templates BEGIN
      INSERT INTO content_templates_fts(rowid, name, structure, example)
      VALUES (new.id, new.name, new.structure, new.example);
    END;

    CREATE TRIGGER IF NOT EXISTS templates_ad AFTER DELETE ON content_templates BEGIN
      INSERT INTO content_templates_fts(content_templates_fts, rowid, name, structure, example)
      VALUES ('delete', old.id, old.name, old.structure, old.example);
    END;

    CREATE TRIGGER IF NOT EXISTS templates_au AFTER UPDATE ON content_templates BEGIN
      INSERT INTO content_templates_fts(content_templates_fts, rowid, name, structure, example)
      VALUES ('delete', old.id, old.name, old.structure, old.example);
      INSERT INTO content_templates_fts(rowid, name, structure, example)
      VALUES (new.id, new.name, new.structure, new.example);
    END;
  `);
}

describe('TemplateRepository', () => {
  let db: Database.Database;
  let repo: TemplateRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new TemplateRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a template and return its id', () => {
    const id = repo.create({ name: 'Thread Template', structure: 'Hook -> Body -> CTA' });
    expect(id).toBe(1);
  });

  it('should retrieve a template by id', () => {
    const id = repo.create({ name: 'Carousel', structure: '5 slides', example: 'Product showcase', platform: 'linkedin' });
    const t = repo.getById(id);
    expect(t).toBeDefined();
    expect(t!.name).toBe('Carousel');
    expect(t!.structure).toBe('5 slides');
    expect(t!.example).toBe('Product showcase');
    expect(t!.platform).toBe('linkedin');
    expect(t!.use_count).toBe(0);
    expect(t!.avg_engagement).toBe(0);
  });

  it('should return undefined for non-existent template', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should list all templates ordered by avg engagement', () => {
    const id1 = repo.create({ name: 'Low Engagement', structure: 'basic' });
    const id2 = repo.create({ name: 'High Engagement', structure: 'advanced' });
    repo.updateAvgEngagement(id2, 50.0);

    const all = repo.listAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.name).toBe('High Engagement');
  });

  it('should list templates by platform', () => {
    repo.create({ name: 'X Template', structure: 'tweet thread', platform: 'x' });
    repo.create({ name: 'LinkedIn Template', structure: 'article', platform: 'linkedin' });
    repo.create({ name: 'Another X', structure: 'single tweet', platform: 'x' });

    const xTemplates = repo.listByPlatform('x');
    expect(xTemplates).toHaveLength(2);
    expect(xTemplates.every((t) => t.platform === 'x')).toBe(true);
  });

  it('should search templates via FTS', () => {
    repo.create({ name: 'Video Script Template', structure: 'Hook, value, CTA' });
    repo.create({ name: 'Blog Post Template', structure: 'Title, body, conclusion' });

    const results = repo.search('video');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toContain('Video');
  });

  it('should increment use count', () => {
    const id = repo.create({ name: 'Template', structure: 'basic' });
    repo.incrementUseCount(id);
    repo.incrementUseCount(id);
    repo.incrementUseCount(id);

    const t = repo.getById(id);
    expect(t!.use_count).toBe(3);
  });

  it('should update average engagement', () => {
    const id = repo.create({ name: 'Template', structure: 'basic' });
    repo.updateAvgEngagement(id, 75.5);

    const t = repo.getById(id);
    expect(t!.avg_engagement).toBe(75.5);
  });

  it('should count all templates', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ name: 'A', structure: 's' });
    repo.create({ name: 'B', structure: 's' });
    expect(repo.countAll()).toBe(2);
  });

  it('should delete a template', () => {
    const id = repo.create({ name: 'To Delete', structure: 'basic' });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent template', () => {
    expect(repo.delete(999)).toBe(false);
  });
});
