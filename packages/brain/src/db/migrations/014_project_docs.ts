import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      parsed_metadata TEXT,
      last_indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      embedding BLOB DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_project_docs_project ON project_docs(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_docs_type ON project_docs(doc_type);

    CREATE VIRTUAL TABLE IF NOT EXISTS project_docs_fts USING fts5(
      file_path, content, parsed_metadata,
      content='project_docs', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS project_docs_ai AFTER INSERT ON project_docs BEGIN
      INSERT INTO project_docs_fts(rowid, file_path, content, parsed_metadata)
      VALUES (new.id, new.file_path, new.content, new.parsed_metadata);
    END;

    CREATE TRIGGER IF NOT EXISTS project_docs_ad AFTER DELETE ON project_docs BEGIN
      INSERT INTO project_docs_fts(project_docs_fts, rowid, file_path, content, parsed_metadata)
      VALUES ('delete', old.id, old.file_path, old.content, old.parsed_metadata);
    END;

    CREATE TRIGGER IF NOT EXISTS project_docs_au AFTER UPDATE ON project_docs BEGIN
      INSERT INTO project_docs_fts(project_docs_fts, rowid, file_path, content, parsed_metadata)
      VALUES ('delete', old.id, old.file_path, old.content, old.parsed_metadata);
      INSERT INTO project_docs_fts(rowid, file_path, content, parsed_metadata)
      VALUES (new.id, new.file_path, new.content, new.parsed_metadata);
    END;
  `);
}
