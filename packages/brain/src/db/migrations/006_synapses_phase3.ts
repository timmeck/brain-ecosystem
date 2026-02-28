import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  // Add activation_count and last_activated_at columns
  const columns = db.pragma('table_info(synapses)') as Array<{ name: string }>;
  const colNames = columns.map(c => c.name);

  if (!colNames.includes('activation_count')) {
    db.exec(`ALTER TABLE synapses ADD COLUMN activation_count INTEGER NOT NULL DEFAULT 1`);
  }
  if (!colNames.includes('last_activated_at')) {
    db.exec(`ALTER TABLE synapses ADD COLUMN last_activated_at TEXT NOT NULL DEFAULT (datetime('now'))`);
  }

  // Add index for decay queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_synapses_last_activated ON synapses(last_activated_at)`);
}
