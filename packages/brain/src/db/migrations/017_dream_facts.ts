import type Database from 'better-sqlite3';

/**
 * Migration 017: DreamEngine v2 — Fact Extraction support.
 *
 * Adds facts_extracted column to dream_history table.
 * The actual extraction logic lives in DreamConsolidator.extractFacts().
 */
export function up(db: Database.Database): void {
  try {
    db.exec(`ALTER TABLE dream_history ADD COLUMN facts_extracted INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists (dream migration handles this too)
  }
}
