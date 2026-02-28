import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      description TEXT,
      source_hash TEXT NOT NULL,
      lines_of_code INTEGER NOT NULL DEFAULT 0,
      complexity INTEGER,
      reusability_score REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS module_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      used_in_project_id INTEGER NOT NULL,
      used_in_file TEXT NOT NULL,
      usage_type TEXT NOT NULL DEFAULT 'import',
      first_used TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (module_id) REFERENCES code_modules(id) ON DELETE CASCADE,
      FOREIGN KEY (used_in_project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS module_similarities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_a_id INTEGER NOT NULL,
      module_b_id INTEGER NOT NULL,
      similarity_score REAL NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (module_a_id) REFERENCES code_modules(id) ON DELETE CASCADE,
      FOREIGN KEY (module_b_id) REFERENCES code_modules(id) ON DELETE CASCADE,
      UNIQUE(module_a_id, module_b_id)
    );

    CREATE INDEX IF NOT EXISTS idx_code_modules_project ON code_modules(project_id);
    CREATE INDEX IF NOT EXISTS idx_code_modules_fingerprint ON code_modules(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_code_modules_language ON code_modules(language);
    CREATE INDEX IF NOT EXISTS idx_module_usages_module ON module_usages(module_id);
    CREATE INDEX IF NOT EXISTS idx_module_usages_project ON module_usages(used_in_project_id);
    CREATE INDEX IF NOT EXISTS idx_module_similarities_a ON module_similarities(module_a_id);
    CREATE INDEX IF NOT EXISTS idx_module_similarities_b ON module_similarities(module_b_id);
  `);
}
