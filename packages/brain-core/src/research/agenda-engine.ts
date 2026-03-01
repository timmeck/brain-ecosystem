import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type AgendaItemType = 'hypothesis_test' | 'correlation_search' | 'parameter_sweep' | 'knowledge_gap' | 'anomaly_investigation';

export interface ResearchAgendaItem {
  id?: number;
  priority: number;            // 0-1
  question: string;
  type: AgendaItemType;
  estimated_cycles: number;
  expected_impact: string;
  prerequisites: string[];
  auto_executable: boolean;
  status: 'open' | 'in_progress' | 'completed' | 'dismissed';
  created_at?: string;
}

export interface AgendaConfig {
  brainName: string;
  /** Maximum agenda items. Default: 50 */
  maxItems?: number;
}

// ── Migration ───────────────────────────────────────────

export function runAgendaMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priority REAL NOT NULL,
      question TEXT NOT NULL,
      type TEXT NOT NULL,
      estimated_cycles INTEGER NOT NULL,
      expected_impact TEXT NOT NULL,
      prerequisites TEXT NOT NULL DEFAULT '[]',
      auto_executable INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agenda_status ON research_agenda(status);
    CREATE INDEX IF NOT EXISTS idx_agenda_priority ON research_agenda(priority DESC);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class ResearchAgendaEngine {
  private db: Database.Database;
  private config: Required<AgendaConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config: AgendaConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxItems: config.maxItems ?? 50,
    };
    runAgendaMigration(db);
  }

  /** Generate research agenda from current state of knowledge. */
  generate(): ResearchAgendaItem[] {
    const items: ResearchAgendaItem[] = [];

    // 1. Unconfirmed hypotheses → need testing
    items.push(...this.findOpenHypotheses());

    // 2. Knowledge gaps → areas with little data
    items.push(...this.findKnowledgeGaps());

    // 3. Unexplored correlations
    items.push(...this.findUnexploredCorrelations());

    // 4. Anomalies needing investigation
    items.push(...this.findOpenAnomalies());

    // 5. Parameter optimization opportunities
    items.push(...this.findParameterSweeps());

    // Deduplicate and persist
    for (const item of items) {
      this.upsertItem(item);
    }

    // Cleanup old completed/dismissed items
    this.db.prepare(`
      DELETE FROM research_agenda WHERE status IN ('completed', 'dismissed')
      AND id NOT IN (SELECT id FROM research_agenda ORDER BY completed_at DESC LIMIT 20)
    `).run();

    return this.getAgenda();
  }

  /** Get the prioritized research agenda. */
  getAgenda(limit = 20): ResearchAgendaItem[] {
    return (this.db.prepare(`
      SELECT * FROM research_agenda WHERE status IN ('open', 'in_progress')
      ORDER BY priority DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(r => this.rowToItem(r));
  }

  /** Get the single most important next research question. */
  getNext(): ResearchAgendaItem | null {
    const row = this.db.prepare(`
      SELECT * FROM research_agenda WHERE status = 'open'
      ORDER BY priority DESC LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    return row ? this.rowToItem(row) : null;
  }

  /** Reprioritize an agenda item. */
  setPriority(id: number, priority: number): boolean {
    const result = this.db.prepare(`
      UPDATE research_agenda SET priority = ? WHERE id = ?
    `).run(Math.max(0, Math.min(1, priority)), id);
    return result.changes > 0;
  }

  /** Add a user-defined research question. */
  ask(question: string, type: AgendaItemType = 'hypothesis_test'): ResearchAgendaItem {
    const result = this.db.prepare(`
      INSERT INTO research_agenda (priority, question, type, estimated_cycles, expected_impact, auto_executable, status)
      VALUES (?, ?, ?, ?, ?, ?, 'open')
    `).run(0.9, question, type, 5, 'User-requested investigation', 0);

    return this.getById(Number(result.lastInsertRowid))!;
  }

  /** Mark an item as completed or dismissed. */
  resolve(id: number, status: 'completed' | 'dismissed'): boolean {
    const result = this.db.prepare(`
      UPDATE research_agenda SET status = ?, completed_at = datetime('now') WHERE id = ?
    `).run(status, id);
    return result.changes > 0;
  }

  private getById(id: number): ResearchAgendaItem | null {
    const row = this.db.prepare(`SELECT * FROM research_agenda WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToItem(row) : null;
  }

  private findOpenHypotheses(): ResearchAgendaItem[] {
    const items: ResearchAgendaItem[] = [];
    try {
      const pending = this.db.prepare(`
        SELECT COUNT(*) as c FROM hypotheses WHERE status IN ('proposed', 'testing')
      `).get() as { c: number };

      if (pending.c > 0) {
        items.push({
          priority: 0.7,
          question: `${pending.c} hypotheses pending testing. Run hypothesis tests to confirm or reject.`,
          type: 'hypothesis_test',
          estimated_cycles: Math.ceil(pending.c / 3),
          expected_impact: 'Validate or reject pending theories about system behavior.',
          prerequisites: [],
          auto_executable: true,
          status: 'open',
        });
      }
    } catch { /* table might not exist */ }
    return items;
  }

  private findKnowledgeGaps(): ResearchAgendaItem[] {
    const items: ResearchAgendaItem[] = [];
    try {
      // Find event types with few observations
      const sparse = this.db.prepare(`
        SELECT type, COUNT(*) as c FROM causal_events
        GROUP BY type HAVING c < 10
        ORDER BY c ASC LIMIT 5
      `).all() as Array<{ type: string; c: number }>;

      for (const s of sparse) {
        items.push({
          priority: 0.5 + (1 - s.c / 10) * 0.3,
          question: `Only ${s.c} observations of "${s.type}". Need more data for reliable causal analysis.`,
          type: 'knowledge_gap',
          estimated_cycles: 10,
          expected_impact: `More data about "${s.type}" enables better causal inference.`,
          prerequisites: [],
          auto_executable: false,
          status: 'open',
        });
      }
    } catch { /* table might not exist */ }
    return items;
  }

  private findUnexploredCorrelations(): ResearchAgendaItem[] {
    const items: ResearchAgendaItem[] = [];
    try {
      const eventTypes = this.db.prepare(`
        SELECT DISTINCT type FROM causal_events ORDER BY type
      `).all() as Array<{ type: string }>;

      const existingEdges = new Set<string>();
      try {
        const edges = this.db.prepare(`SELECT cause, effect FROM causal_edges`).all() as Array<{ cause: string; effect: string }>;
        for (const e of edges) existingEdges.add(`${e.cause}→${e.effect}`);
      } catch { /* ignore */ }

      // Find pairs not yet analyzed
      let unexplored = 0;
      for (let i = 0; i < eventTypes.length && unexplored < 3; i++) {
        for (let j = i + 1; j < eventTypes.length; j++) {
          const key = `${eventTypes[i].type}→${eventTypes[j].type}`;
          const keyRev = `${eventTypes[j].type}→${eventTypes[i].type}`;
          if (!existingEdges.has(key) && !existingEdges.has(keyRev)) {
            unexplored++;
            if (unexplored <= 3) {
              items.push({
                priority: 0.4,
                question: `Is there a causal relationship between "${eventTypes[i].type}" and "${eventTypes[j].type}"?`,
                type: 'correlation_search',
                estimated_cycles: 1,
                expected_impact: 'Discover hidden relationships between event types.',
                prerequisites: [],
                auto_executable: true,
                status: 'open',
              });
            }
          }
        }
      }
    } catch { /* table might not exist */ }
    return items;
  }

  private findOpenAnomalies(): ResearchAgendaItem[] {
    const items: ResearchAgendaItem[] = [];
    try {
      const anomalies = this.db.prepare(`
        SELECT type, title FROM self_insights
        WHERE type = 'anomaly' AND timestamp > ?
        ORDER BY timestamp DESC LIMIT 3
      `).all(Date.now() - 86_400_000 * 7) as Array<{ type: string; title: string }>;

      for (const a of anomalies) {
        items.push({
          priority: 0.8,
          question: `Investigate anomaly: ${a.title}`,
          type: 'anomaly_investigation',
          estimated_cycles: 3,
          expected_impact: 'Understanding anomalies prevents degradation.',
          prerequisites: [],
          auto_executable: false,
          status: 'open',
        });
      }
    } catch { /* table might not exist */ }
    return items;
  }

  private findParameterSweeps(): ResearchAgendaItem[] {
    const items: ResearchAgendaItem[] = [];
    try {
      const underOptimized = this.db.prepare(`
        SELECT strategy, parameter, value, min_value, max_value
        FROM strategy_parameters
        WHERE parameter NOT IN (
          SELECT DISTINCT parameter FROM strategy_adaptations WHERE timestamp > ?
        )
      `).all(Date.now() - 86_400_000 * 14) as Array<Record<string, unknown>>;

      if (underOptimized.length > 0) {
        items.push({
          priority: 0.5,
          question: `${underOptimized.length} parameters haven't been optimized in 2+ weeks. Run parameter sweep.`,
          type: 'parameter_sweep',
          estimated_cycles: underOptimized.length * 2,
          expected_impact: 'Stale parameters may be suboptimal. Re-optimization could improve performance.',
          prerequisites: [],
          auto_executable: true,
          status: 'open',
        });
      }
    } catch { /* table might not exist */ }
    return items;
  }

  private upsertItem(item: ResearchAgendaItem): void {
    // Check for similar existing items
    const existing = this.db.prepare(`
      SELECT id FROM research_agenda WHERE question = ? AND status = 'open' LIMIT 1
    `).get(item.question);

    if (existing) return;

    this.db.prepare(`
      INSERT INTO research_agenda (priority, question, type, estimated_cycles, expected_impact, prerequisites, auto_executable, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(item.priority, item.question, item.type, item.estimated_cycles, item.expected_impact,
      JSON.stringify(item.prerequisites), item.auto_executable ? 1 : 0, item.status);
  }

  private rowToItem(row: Record<string, unknown>): ResearchAgendaItem {
    return {
      id: row.id as number,
      priority: row.priority as number,
      question: row.question as string,
      type: row.type as AgendaItemType,
      estimated_cycles: row.estimated_cycles as number,
      expected_impact: row.expected_impact as string,
      prerequisites: JSON.parse((row.prerequisites as string) || '[]'),
      auto_executable: (row.auto_executable as number) === 1,
      status: row.status as ResearchAgendaItem['status'],
      created_at: row.created_at as string,
    };
  }
}
