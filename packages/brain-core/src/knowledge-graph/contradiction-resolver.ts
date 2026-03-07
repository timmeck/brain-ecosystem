import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { KnowledgeGraphEngine, Contradiction } from './graph-engine.js';

// ── Types ────────────────────────────────────────────────

export type ContradictionType = 'confidence_gap' | 'temporal' | 'contextual' | 'trade_off';
export type ResolutionStrategy = 'demote' | 'contextualize' | 'archive' | 'accept_tradeoff';

export interface FactResolution {
  id?: number;
  subject: string;
  predicate: string;
  contradiction_type: ContradictionType;
  strategy: ResolutionStrategy;
  resolved_fact_id: number;
  demoted_fact_id: number | null;
  explanation: string;
  created_at?: string;
}

export interface ContradictionResolverStatus {
  totalResolved: number;
  byType: Record<ContradictionType, number>;
  byStrategy: Record<ResolutionStrategy, number>;
  lastResolveAt: string | null;
}

// ── Migration ────────────────────────────────────────────

export function runContradictionResolverMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fact_resolutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      contradiction_type TEXT NOT NULL,
      strategy TEXT NOT NULL,
      resolved_fact_id INTEGER NOT NULL,
      demoted_fact_id INTEGER,
      explanation TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fact_resolutions_subject ON fact_resolutions(subject, predicate);
  `);
}

// ── Resolver ──────────────────────────────────────────────

export class ContradictionResolver {
  private readonly db: Database.Database;
  private readonly log = getLogger();
  private knowledgeGraph: KnowledgeGraphEngine | null = null;
  private lastResolveAt: string | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    runContradictionResolverMigration(db);
  }

  setKnowledgeGraph(kg: KnowledgeGraphEngine): void {
    this.knowledgeGraph = kg;
  }

  /**
   * Main resolution cycle: fetch contradictions, classify, resolve.
   * Returns the number of contradictions resolved.
   */
  resolve(): number {
    if (!this.knowledgeGraph) return 0;

    const contradictions = this.knowledgeGraph.contradictions();
    if (contradictions.length === 0) return 0;

    let resolved = 0;

    for (const c of contradictions) {
      // Skip already-resolved contradictions
      const existing = this.db.prepare(
        `SELECT 1 FROM fact_resolutions WHERE subject = ? AND predicate = ? LIMIT 1`,
      ).get(c.subject, c.predicate);
      if (existing) continue;

      const type = this.classify(c);
      const strategy = this.pickStrategy(type, c);
      const result = this.applyStrategy(strategy, c);

      if (result) {
        this.db.prepare(`
          INSERT INTO fact_resolutions (subject, predicate, contradiction_type, strategy, resolved_fact_id, demoted_fact_id, explanation)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(c.subject, c.predicate, type, strategy, result.resolvedFactId, result.demotedFactId, result.explanation);
        resolved++;
      }
    }

    if (resolved > 0) {
      this.lastResolveAt = new Date().toISOString();
      this.log.info(`[ContradictionResolver] Resolved ${resolved} contradiction(s)`);
    }

    return resolved;
  }

  /**
   * Classify a contradiction into a type.
   */
  private classify(c: Contradiction): ContradictionType {
    if (c.facts.length < 2) return 'confidence_gap';

    const sorted = [...c.facts].sort((a, b) => b.confidence - a.confidence);
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;

    // Large confidence gap → one fact is clearly stronger
    if (best.confidence - worst.confidence > 0.3) {
      return 'confidence_gap';
    }

    // Check for temporal difference (newer fact may supersede older)
    const bestDate = new Date(best.created_at).getTime();
    const worstDate = new Date(worst.created_at).getTime();
    const daysDiff = Math.abs(bestDate - worstDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > 7) {
      return 'temporal';
    }

    // Check for contextual difference
    const hasContext = c.facts.some(f => f.context && f.context.length > 0);
    if (hasContext) {
      return 'contextual';
    }

    // Otherwise it's a genuine trade-off
    return 'trade_off';
  }

  /**
   * Pick a resolution strategy based on classification.
   */
  private pickStrategy(type: ContradictionType, c: Contradiction): ResolutionStrategy {
    switch (type) {
      case 'confidence_gap':
        return 'demote';
      case 'temporal': {
        // Newer fact wins → archive the older one
        const sorted = [...c.facts].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        // If the newer fact is also more confident, archive the old one
        if (sorted.length >= 2 && sorted[0]!.confidence >= sorted[1]!.confidence) {
          return 'archive';
        }
        return 'demote';
      }
      case 'contextual':
        return 'contextualize';
      case 'trade_off':
        return 'accept_tradeoff';
    }
  }

  /**
   * Apply a resolution strategy to a contradiction.
   */
  private applyStrategy(
    strategy: ResolutionStrategy,
    c: Contradiction,
  ): { resolvedFactId: number; demotedFactId: number | null; explanation: string } | null {
    if (c.facts.length < 2) return null;

    const sorted = [...c.facts].sort((a, b) => b.confidence - a.confidence);
    const winner = sorted[0]!;
    const loser = sorted[sorted.length - 1]!;

    switch (strategy) {
      case 'demote': {
        // Lower the confidence of the weaker fact
        if (loser.id) {
          try {
            this.db.prepare(
              `UPDATE knowledge_facts SET confidence = MAX(0.1, confidence * 0.5), updated_at = datetime('now') WHERE id = ?`,
            ).run(loser.id);
          } catch { /* fact may not exist anymore */ }
        }
        return {
          resolvedFactId: winner.id!,
          demotedFactId: loser.id ?? null,
          explanation: `Demoted weaker fact (confidence ${loser.confidence.toFixed(2)} → halved). Winner: "${winner.object}" (${winner.confidence.toFixed(2)})`,
        };
      }

      case 'archive': {
        // Mark the older fact as archived by setting very low confidence
        if (loser.id) {
          try {
            this.db.prepare(
              `UPDATE knowledge_facts SET confidence = 0.05, context = COALESCE(context, '') || ' [archived: superseded]', updated_at = datetime('now') WHERE id = ?`,
            ).run(loser.id);
          } catch { /* fact may not exist anymore */ }
        }
        return {
          resolvedFactId: winner.id!,
          demotedFactId: loser.id ?? null,
          explanation: `Archived outdated fact. Newer fact "${winner.object}" supersedes "${loser.object}"`,
        };
      }

      case 'contextualize': {
        // Add context to differentiate the facts
        const contexts = c.facts.map(f => f.context ?? 'general').join(', ');
        return {
          resolvedFactId: winner.id!,
          demotedFactId: null,
          explanation: `Both facts valid in different contexts: ${contexts}. No demotion needed.`,
        };
      }

      case 'accept_tradeoff': {
        return {
          resolvedFactId: winner.id!,
          demotedFactId: null,
          explanation: `Accepted as trade-off: "${winner.object}" vs "${loser.object}" — both valid perspectives on "${c.subject} ${c.predicate}"`,
        };
      }
    }
  }

  /**
   * Get resolution history.
   */
  getHistory(limit = 20): FactResolution[] {
    return this.db.prepare(
      `SELECT * FROM fact_resolutions ORDER BY created_at DESC LIMIT ?`,
    ).all(limit) as FactResolution[];
  }

  /**
   * Get resolver status.
   */
  getStatus(): ContradictionResolverStatus {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM fact_resolutions').get() as { c: number }).c;

    const typeRows = this.db.prepare(
      `SELECT contradiction_type, COUNT(*) as c FROM fact_resolutions GROUP BY contradiction_type`,
    ).all() as Array<{ contradiction_type: ContradictionType; c: number }>;

    const strategyRows = this.db.prepare(
      `SELECT strategy, COUNT(*) as c FROM fact_resolutions GROUP BY strategy`,
    ).all() as Array<{ strategy: ResolutionStrategy; c: number }>;

    const byType: Record<ContradictionType, number> = { confidence_gap: 0, temporal: 0, contextual: 0, trade_off: 0 };
    for (const r of typeRows) byType[r.contradiction_type] = r.c;

    const byStrategy: Record<ResolutionStrategy, number> = { demote: 0, contextualize: 0, archive: 0, accept_tradeoff: 0 };
    for (const r of strategyRows) byStrategy[r.strategy] = r.c;

    return {
      totalResolved: total,
      byType,
      byStrategy,
      lastResolveAt: this.lastResolveAt,
    };
  }
}
