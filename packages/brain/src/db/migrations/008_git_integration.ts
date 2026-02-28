import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS git_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      commit_hash TEXT NOT NULL,
      message TEXT NOT NULL,
      author TEXT,
      timestamp TEXT NOT NULL,
      files_changed INTEGER NOT NULL DEFAULT 0,
      insertions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, commit_hash)
    );

    CREATE TABLE IF NOT EXISTS error_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL,
      commit_hash TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'introduced_by',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE,
      UNIQUE(error_id, commit_hash, relationship)
    );

    ALTER TABLE errors ADD COLUMN git_diff TEXT DEFAULT NULL;
    ALTER TABLE errors ADD COLUMN git_branch TEXT DEFAULT NULL;

    CREATE INDEX IF NOT EXISTS idx_git_commits_project ON git_commits(project_id);
    CREATE INDEX IF NOT EXISTS idx_git_commits_hash ON git_commits(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_error_commits_error ON error_commits(error_id);
    CREATE INDEX IF NOT EXISTS idx_error_commits_hash ON error_commits(commit_hash);
  `);
}
