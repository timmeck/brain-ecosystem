import type Database from 'better-sqlite3';

/**
 * Migration 016: Retrieval metadata for conversation memories.
 *
 * Adds:
 * - use_count: higher-value usage tracking (buildContext/retrieveByIntent)
 * - last_used_at: when memory was last used in context building
 * - last_retrieval_score: relevance score from last retrieval
 * - archive_candidate: flag for maintenance-marked cold memories
 */
export function up(db: Database.Database): void {
  // Add retrieval metadata columns
  try { db.exec(`ALTER TABLE conversation_memories ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0`); } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE conversation_memories ADD COLUMN last_used_at TEXT`); } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE conversation_memories ADD COLUMN last_retrieval_score REAL`); } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE conversation_memories ADD COLUMN archive_candidate INTEGER NOT NULL DEFAULT 0`); } catch { /* column exists */ }

  // Indexes for efficient retrieval maintenance (table may not exist yet in test/CI — created by brain-core)
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_conv_mem_archive ON conversation_memories(archive_candidate)`); } catch { /* table not yet created */ }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_conv_mem_use ON conversation_memories(use_count DESC)`); } catch { /* table not yet created */ }
}
