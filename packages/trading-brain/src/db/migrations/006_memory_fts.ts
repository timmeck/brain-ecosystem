import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- Full-text search for memories
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      category, key, content, tags,
      content='memories',
      content_rowid='id'
    );

    -- Sync triggers for memories_fts
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, category, key, content, tags)
      VALUES (new.id, new.category, new.key, new.content, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, category, key, content, tags)
      VALUES ('delete', old.id, old.category, old.key, old.content, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, category, key, content, tags)
      VALUES ('delete', old.id, old.category, old.key, old.content, old.tags);
      INSERT INTO memories_fts(rowid, category, key, content, tags)
      VALUES (new.id, new.category, new.key, new.content, new.tags);
    END;

    -- Full-text search for sessions
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      summary, goals,
      content='sessions',
      content_rowid='id'
    );

    -- Sync triggers for sessions_fts
    CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
      INSERT INTO sessions_fts(rowid, summary, goals)
      VALUES (new.id, new.summary, new.goals);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, summary, goals)
      VALUES ('delete', old.id, old.summary, old.goals);
    END;

    CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, summary, goals)
      VALUES ('delete', old.id, old.summary, old.goals);
      INSERT INTO sessions_fts(rowid, summary, goals)
      VALUES (new.id, new.summary, new.goals);
    END;
  `);
}
