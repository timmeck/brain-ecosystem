import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      session_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      alternatives TEXT,
      category TEXT NOT NULL DEFAULT 'architecture',
      status TEXT NOT NULL DEFAULT 'active',
      superseded_by INTEGER,
      tags TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      embedding BLOB DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (superseded_by) REFERENCES decisions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS changelog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      session_id INTEGER,
      file_path TEXT NOT NULL,
      change_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      reason TEXT,
      diff_snippet TEXT,
      related_error_id INTEGER,
      related_decision_id INTEGER,
      commit_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      embedding BLOB DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (related_error_id) REFERENCES errors(id) ON DELETE SET NULL,
      FOREIGN KEY (related_decision_id) REFERENCES decisions(id) ON DELETE SET NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_category ON decisions(category);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
    CREATE INDEX IF NOT EXISTS idx_changelog_project ON changelog_entries(project_id);
    CREATE INDEX IF NOT EXISTS idx_changelog_file ON changelog_entries(file_path);
    CREATE INDEX IF NOT EXISTS idx_changelog_session ON changelog_entries(session_id);

    -- FTS for decisions
    CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
      title, description, alternatives,
      content='decisions', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
      INSERT INTO decisions_fts(rowid, title, description, alternatives)
      VALUES (new.id, new.title, new.description, new.alternatives);
    END;

    CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
      INSERT INTO decisions_fts(decisions_fts, rowid, title, description, alternatives)
      VALUES ('delete', old.id, old.title, old.description, old.alternatives);
    END;

    CREATE TRIGGER IF NOT EXISTS decisions_au AFTER UPDATE ON decisions BEGIN
      INSERT INTO decisions_fts(decisions_fts, rowid, title, description, alternatives)
      VALUES ('delete', old.id, old.title, old.description, old.alternatives);
      INSERT INTO decisions_fts(rowid, title, description, alternatives)
      VALUES (new.id, new.title, new.description, new.alternatives);
    END;

    -- FTS for changelog
    CREATE VIRTUAL TABLE IF NOT EXISTS changelog_fts USING fts5(
      file_path, summary, reason,
      content='changelog_entries', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS changelog_ai AFTER INSERT ON changelog_entries BEGIN
      INSERT INTO changelog_fts(rowid, file_path, summary, reason)
      VALUES (new.id, new.file_path, new.summary, new.reason);
    END;

    CREATE TRIGGER IF NOT EXISTS changelog_ad AFTER DELETE ON changelog_entries BEGIN
      INSERT INTO changelog_fts(changelog_fts, rowid, file_path, summary, reason)
      VALUES ('delete', old.id, old.file_path, old.summary, old.reason);
    END;

    CREATE TRIGGER IF NOT EXISTS changelog_au AFTER UPDATE ON changelog_entries BEGIN
      INSERT INTO changelog_fts(changelog_fts, rowid, file_path, summary, reason)
      VALUES ('delete', old.id, old.file_path, old.summary, old.reason);
      INSERT INTO changelog_fts(rowid, file_path, summary, reason)
      VALUES (new.id, new.file_path, new.summary, new.reason);
    END;
  `);
}
