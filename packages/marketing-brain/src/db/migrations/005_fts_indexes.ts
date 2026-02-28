import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- Full-text search for posts
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

    -- Full-text search for strategies
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

    -- Full-text search for content templates
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
