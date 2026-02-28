import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- Sessions: Conversation lifecycle tracking
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT,
      goals TEXT,
      outcome TEXT,
      metadata TEXT
    );

    -- Memories: Universal remember-anything store
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      category TEXT NOT NULL,
      key TEXT,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 5,
      source TEXT NOT NULL DEFAULT 'explicit',
      tags TEXT,
      expires_at TEXT,
      superseded_by INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (superseded_by) REFERENCES memories(id) ON DELETE SET NULL
    );

    -- Indexes
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_key
      ON memories(key) WHERE key IS NOT NULL AND active = 1;
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
    CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(active);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
  `);
}
