import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      path TEXT,
      language TEXT,
      framework TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS terminals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      project_id INTEGER,
      pid INTEGER,
      shell TEXT,
      cwd TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      disconnected_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      terminal_id INTEGER,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      context TEXT,
      file_path TEXT,
      line_number INTEGER,
      column_number INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stack_frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL,
      frame_index INTEGER NOT NULL,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      "column" INTEGER,
      function_name TEXT,
      source TEXT,
      FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      commands TEXT,
      code_change TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL,
      solution_id INTEGER NOT NULL,
      applied_at TEXT,
      success INTEGER,
      FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE,
      FOREIGN KEY (solution_id) REFERENCES solutions(id) ON DELETE CASCADE,
      UNIQUE(error_id, solution_id)
    );

    CREATE TABLE IF NOT EXISTS solution_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_solution_id INTEGER NOT NULL,
      terminal_id INTEGER,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 0,
      output TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (error_solution_id) REFERENCES error_solutions(id) ON DELETE CASCADE,
      FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS error_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_error_id INTEGER NOT NULL,
      child_error_id INTEGER NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'causes',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_error_id) REFERENCES errors(id) ON DELETE CASCADE,
      FOREIGN KEY (child_error_id) REFERENCES errors(id) ON DELETE CASCADE,
      UNIQUE(parent_error_id, child_error_id)
    );

    CREATE INDEX IF NOT EXISTS idx_errors_fingerprint ON errors(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_errors_project ON errors(project_id);
    CREATE INDEX IF NOT EXISTS idx_errors_type ON errors(type);
    CREATE INDEX IF NOT EXISTS idx_errors_resolved ON errors(resolved);
    CREATE INDEX IF NOT EXISTS idx_errors_last_seen ON errors(last_seen);
    CREATE INDEX IF NOT EXISTS idx_stack_frames_error ON stack_frames(error_id);
    CREATE INDEX IF NOT EXISTS idx_error_solutions_error ON error_solutions(error_id);
    CREATE INDEX IF NOT EXISTS idx_error_solutions_solution ON error_solutions(solution_id);
    CREATE INDEX IF NOT EXISTS idx_solution_attempts_es ON solution_attempts(error_solution_id);
    CREATE INDEX IF NOT EXISTS idx_terminals_uuid ON terminals(uuid);
    CREATE INDEX IF NOT EXISTS idx_terminals_project ON terminals(project_id);
  `);
}
