import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { LLMService } from '../llm/llm-service.js';

// ── Types ───────────────────────────────────────────────

export interface CreativeInsight {
  id?: number;
  type: 'cross_pollination' | 'analogy' | 'speculation' | 'imagination';
  sourceA: { domain: string; principle: string };
  sourceB: { domain: string; principle: string };
  insight: string;
  noveltyScore: number;
  plausibility: number;
  status: 'raw' | 'tested' | 'confirmed' | 'rejected';
  createdAt?: string;
}

export interface Analogy {
  concept: string;
  analogousConcept: string;
  sourceDomain: string;
  targetDomain: string;
  similarity: number;
  explanation: string;
}

export interface SpeculativeHypothesis {
  hypothesis: string;
  basedOn: string[];
  novelty: number;
  plausibility: number;
}

export interface CreativeEngineConfig {
  brainName: string;
  /** Max insights per cross-pollination cycle. Default: 5 */
  maxInsightsPerCycle?: number;
  /** Topic overlap threshold (< this = sufficiently different). Default: 0.3 */
  overlapThreshold?: number;
}

export interface CreativeEngineStatus {
  totalInsights: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  topInsights: CreativeInsight[];
}

// ── Migration ───────────────────────────────────────────

export function runCreativeMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creative_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      source_a_domain TEXT NOT NULL,
      source_a_principle TEXT NOT NULL,
      source_b_domain TEXT NOT NULL,
      source_b_principle TEXT NOT NULL,
      insight TEXT NOT NULL,
      novelty_score REAL NOT NULL DEFAULT 0.5,
      plausibility REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'raw',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_creative_type ON creative_insights(type);
    CREATE INDEX IF NOT EXISTS idx_creative_status ON creative_insights(status);
    CREATE INDEX IF NOT EXISTS idx_creative_novelty ON creative_insights(novelty_score);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class CreativeEngine {
  private readonly db: Database.Database;
  private readonly config: Required<CreativeEngineConfig>;
  private readonly log = getLogger();
  private distiller: KnowledgeDistiller | null = null;
  private hypothesisEngine: HypothesisEngine | null = null;
  private llmService: LLMService | null = null;
  private ts: ThoughtStream | null = null;

  constructor(db: Database.Database, config: CreativeEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxInsightsPerCycle: config.maxInsightsPerCycle ?? 5,
      overlapThreshold: config.overlapThreshold ?? 0.3,
    };
    runCreativeMigration(db);
  }

  setKnowledgeDistiller(distiller: KnowledgeDistiller): void { this.distiller = distiller; }
  setHypothesisEngine(engine: HypothesisEngine): void { this.hypothesisEngine = engine; }
  setLLMService(service: LLMService): void { this.llmService = service; }
  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }

  // ── Cross-Pollination ──────────────────────────────────

  /** Cross-pollinate principles from different domains. */
  crossPollinate(): CreativeInsight[] {
    if (!this.distiller) return [];

    const insights: CreativeInsight[] = [];
    const principles = this.loadPrinciples();

    this.log.debug(`[creative] loadPrinciples: ${principles.length} principles`);

    if (principles.length < 2) {
      this.log.debug('[creative] Not enough principles for cross-pollination (< 2)');
      return insights;
    }

    // Group by domain
    const byDomain = new Map<string, Array<{ text: string; domain: string }>>();
    for (const p of principles) {
      const list = byDomain.get(p.domain) ?? [];
      list.push(p);
      byDomain.set(p.domain, list);
    }

    let domains = [...byDomain.keys()];
    this.log.debug(`[creative] Domain distribution: ${domains.map(d => `${d}(${byDomain.get(d)!.length})`).join(', ')}`);

    // Fallback: if only 1 domain, split principles into sub-groups (threshold lowered to 2)
    if (domains.length < 2 && principles.length >= 2) {
      const singleDomain = domains[0];
      const all = byDomain.get(singleDomain)!;
      byDomain.clear();

      // With 2-3 principles: direct pair-building (skip keyword grouping)
      if (all.length <= 3) {
        for (let idx = 0; idx < all.length; idx++) {
          const subDomain = `${singleDomain}/${String.fromCharCode(65 + idx)}`;
          byDomain.set(subDomain, [{ text: all[idx].text, domain: subDomain }]);
        }
        domains = [...byDomain.keys()];
        this.log.debug(`[creative] Fallback: direct pair-building → ${domains.length} sub-domains`);
      } else {
        // Split by first significant keyword (5+ chars) for diversity
        for (const p of all) {
          const keywords = this.tokenize(p.text).filter(w => w.length >= 5);
          const groupKey = keywords[0] ?? 'general';
          const subDomain = `${singleDomain}/${groupKey}`;
          const list = byDomain.get(subDomain) ?? [];
          list.push({ text: p.text, domain: subDomain });
          byDomain.set(subDomain, list);
        }

        domains = [...byDomain.keys()];
        // If we still can't get 2 groups, split in half
        if (domains.length < 2 && all.length >= 2) {
          byDomain.clear();
          const half = Math.ceil(all.length / 2);
          byDomain.set(`${singleDomain}/A`, all.slice(0, half).map(p => ({ text: p.text, domain: `${singleDomain}/A` })));
          byDomain.set(`${singleDomain}/B`, all.slice(half).map(p => ({ text: p.text, domain: `${singleDomain}/B` })));
          domains = [...byDomain.keys()];
        }
        this.log.debug(`[creative] Fallback: keyword grouping → ${domains.length} sub-domains`);
      }
    }

    if (domains.length < 2) return insights;

    // Cross-pollinate between domains
    for (let i = 0; i < domains.length && insights.length < this.config.maxInsightsPerCycle; i++) {
      for (let j = i + 1; j < domains.length && insights.length < this.config.maxInsightsPerCycle; j++) {
        const domainA = domains[i];
        const domainB = domains[j];
        const principlesA = byDomain.get(domainA)!;
        const principlesB = byDomain.get(domainB)!;

        // Pick random pair with low overlap
        const pA = principlesA[Math.floor(Math.random() * principlesA.length)];
        const pB = principlesB[Math.floor(Math.random() * principlesB.length)];

        const overlap = this.computeOverlap(pA.text, pB.text);
        if (overlap < this.config.overlapThreshold) {
          const insight = this.generateCrossPollination(pA, pB, domainA, domainB);
          if (insight) {
            insights.push(insight);
          }
        }
      }
    }

    // Store insights
    for (const insight of insights) {
      this.storeInsight(insight);
    }

    if (insights.length > 0) {
      this.log.info(`[creative] Generated ${insights.length} cross-pollination insights`);
      this.ts?.emit('creative', 'discovering', `Cross-pollination: ${insights.length} new insights`, 'notable');
    }

    return insights;
  }

  // ── Analogy Search ─────────────────────────────────────

  /** Find analogies for a concept across different domains. */
  findAnalogies(concept: string): Analogy[] {
    const principles = this.loadPrinciples();
    const analogies: Analogy[] = [];

    const conceptWords = this.tokenize(concept);

    for (const p of principles) {
      const pWords = this.tokenize(p.text);
      // Look for structural similarity (shared abstract words) but different domains
      const sharedAbstract = conceptWords.filter(w =>
        pWords.includes(w) && w.length > 4, // only meaningful words
      );
      const similarity = conceptWords.length > 0
        ? sharedAbstract.length / Math.max(conceptWords.length, pWords.length)
        : 0;

      if (similarity > 0.1 && similarity < 0.6) {
        analogies.push({
          concept,
          analogousConcept: p.text,
          sourceDomain: 'query',
          targetDomain: p.domain,
          similarity,
          explanation: `Shared concepts: ${sharedAbstract.join(', ')}`,
        });
      }
    }

    return analogies
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);
  }

  // ── Speculation ────────────────────────────────────────

  /** Generate speculative hypotheses by combining principles. */
  speculate(): SpeculativeHypothesis[] {
    const principles = this.loadPrinciples();
    if (principles.length < 2) return [];

    const hypotheses: SpeculativeHypothesis[] = [];

    // Random principle pairs
    const maxAttempts = Math.min(10, principles.length * (principles.length - 1) / 2);
    const tried = new Set<string>();

    for (let attempt = 0; attempt < maxAttempts && hypotheses.length < 3; attempt++) {
      const a = principles[Math.floor(Math.random() * principles.length)];
      const b = principles[Math.floor(Math.random() * principles.length)];
      if (a.text === b.text) continue;

      const key = [a.text, b.text].sort().join('|||');
      if (tried.has(key)) continue;
      tried.add(key);

      if (a.domain !== b.domain) {
        const hypothesis = `If "${a.text}" (${a.domain}) and "${b.text}" (${b.domain}) both hold, then their combination might reveal a pattern spanning ${a.domain} and ${b.domain}`;
        const novelty = 1 - this.computeOverlap(a.text, b.text);
        const plausibility = 0.3 + Math.random() * 0.4; // moderate plausibility

        hypotheses.push({
          hypothesis,
          basedOn: [a.text, b.text],
          novelty,
          plausibility,
        });
      }
    }

    return hypotheses;
  }

  // ── Imagine ────────────────────────────────────────────

  /** Generate imaginative scenarios from a premise. */
  imagine(premise: string): CreativeInsight[] {
    const principles = this.loadPrinciples();
    const insights: CreativeInsight[] = [];

    // Find principles that relate to the premise
    const relevant = principles.filter(p => this.computeOverlap(premise, p.text) > 0.1);

    for (const p of relevant.slice(0, 3)) {
      const insight: CreativeInsight = {
        type: 'imagination',
        sourceA: { domain: 'premise', principle: premise },
        sourceB: { domain: p.domain, principle: p.text },
        insight: `Scenario: Given "${premise}", and knowing "${p.text}" from ${p.domain} — what new behaviors could emerge?`,
        noveltyScore: 0.6 + Math.random() * 0.3,
        plausibility: 0.3 + Math.random() * 0.3,
        status: 'raw',
      };
      this.storeInsight(insight);
      insights.push(insight);
    }

    return insights;
  }

  // ── Auto-Convert to Hypotheses ─────────────────────────

  /** Convert top insights into testable hypotheses. */
  convertTopInsights(minNovelty = 0.5): number {
    if (!this.hypothesisEngine) return 0;

    const top = this.db.prepare(
      "SELECT * FROM creative_insights WHERE status = 'raw' AND novelty_score >= ? ORDER BY novelty_score DESC LIMIT 5",
    ).all(minNovelty) as RawInsight[];

    let converted = 0;
    for (const row of top) {
      try {
        this.hypothesisEngine.propose({
          statement: row.insight,
          type: 'correlation',
          source: 'creative_engine',
          variables: [row.source_a_domain, row.source_b_domain],
          condition: { type: 'correlation', params: { domains: [row.source_a_domain, row.source_b_domain] } },
        });
        this.db.prepare("UPDATE creative_insights SET status = 'tested' WHERE id = ?").run(row.id);
        converted++;
      } catch { /* hypothesis already exists or limit */ }
    }

    if (converted > 0) {
      this.ts?.emit('creative', 'discovering', `Converted ${converted} insights to hypotheses`, 'notable');
    }

    return converted;
  }

  // ── Queries ────────────────────────────────────────────

  getInsights(limit = 20, status?: string): CreativeInsight[] {
    const query = status
      ? 'SELECT * FROM creative_insights WHERE status = ? ORDER BY novelty_score DESC LIMIT ?'
      : 'SELECT * FROM creative_insights ORDER BY novelty_score DESC LIMIT ?';
    const rows = (status
      ? this.db.prepare(query).all(status, limit)
      : this.db.prepare(query).all(limit)
    ) as RawInsight[];
    return rows.map(deserializeInsight);
  }

  getStatus(): CreativeEngineStatus {
    const total = (this.db.prepare('SELECT COUNT(*) as cnt FROM creative_insights').get() as { cnt: number }).cnt;

    const byType: Record<string, number> = {};
    for (const row of this.db.prepare('SELECT type, COUNT(*) as cnt FROM creative_insights GROUP BY type').all() as Array<{ type: string; cnt: number }>) {
      byType[row.type] = row.cnt;
    }

    const byStatus: Record<string, number> = {};
    for (const row of this.db.prepare('SELECT status, COUNT(*) as cnt FROM creative_insights GROUP BY status').all() as Array<{ status: string; cnt: number }>) {
      byStatus[row.status] = row.cnt;
    }

    const topInsights = this.getInsights(5);

    return { totalInsights: total, byType, byStatus, topInsights };
  }

  // ── Private Helpers ────────────────────────────────────

  /** Debug info: principles count, domain distribution, fallback status. */
  getDebugInfo(): { principlesCount: number; domains: Record<string, number>; distillerAvailable: boolean } {
    const principles = this.loadPrinciples();
    const domains: Record<string, number> = {};
    for (const p of principles) {
      domains[p.domain] = (domains[p.domain] ?? 0) + 1;
    }
    return {
      principlesCount: principles.length,
      domains,
      distillerAvailable: this.distiller !== null,
    };
  }

  private loadPrinciples(): Array<{ text: string; domain: string }> {
    if (!this.distiller) return [];
    try {
      // Use getPrinciples() instead of distill() to avoid redundant DB writes
      // and to return ALL stored principles (not just freshly extracted ones)
      const stored = this.distiller.getPrinciples(undefined, 100);
      const principles: Array<{ text: string; domain: string }> = [];
      for (const p of stored) {
        principles.push({ text: p.statement, domain: p.domain ?? this.config.brainName });
      }
      this.log.debug(`[creative] Distiller returned ${stored.length} principles`);
      return principles;
    } catch (e) {
      this.log.warn(`[creative] loadPrinciples failed: ${e}`);
      return [];
    }
  }

  private computeOverlap(textA: string, textB: string): number {
    const wordsA = new Set(this.tokenize(textA));
    const wordsB = new Set(this.tokenize(textB));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let shared = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) shared++;
    }
    return shared / Math.max(wordsA.size, wordsB.size);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  }

  private generateCrossPollination(
    pA: { text: string; domain: string },
    pB: { text: string; domain: string },
    domainA: string,
    domainB: string,
  ): CreativeInsight | null {
    const novelty = 1 - this.computeOverlap(pA.text, pB.text);
    const plausibility = 0.3 + Math.random() * 0.4;

    const insight = `Cross-domain insight: "${pA.text}" from ${domainA} could apply to ${domainB} where "${pB.text}" already holds. Combining these might yield a new pattern.`;

    return {
      type: 'cross_pollination',
      sourceA: { domain: domainA, principle: pA.text },
      sourceB: { domain: domainB, principle: pB.text },
      insight,
      noveltyScore: novelty,
      plausibility,
      status: 'raw',
    };
  }

  private storeInsight(insight: CreativeInsight): void {
    const result = this.db.prepare(`
      INSERT INTO creative_insights (type, source_a_domain, source_a_principle, source_b_domain, source_b_principle, insight, novelty_score, plausibility, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      insight.type,
      insight.sourceA.domain,
      insight.sourceA.principle,
      insight.sourceB.domain,
      insight.sourceB.principle,
      insight.insight,
      insight.noveltyScore,
      insight.plausibility,
      insight.status,
    );
    insight.id = Number(result.lastInsertRowid);
  }
}

// ── Raw DB type ─────────────────────────────────────────

interface RawInsight {
  id: number;
  type: string;
  source_a_domain: string;
  source_a_principle: string;
  source_b_domain: string;
  source_b_principle: string;
  insight: string;
  novelty_score: number;
  plausibility: number;
  status: string;
  created_at: string;
}

function deserializeInsight(row: RawInsight): CreativeInsight {
  return {
    id: row.id,
    type: row.type as CreativeInsight['type'],
    sourceA: { domain: row.source_a_domain, principle: row.source_a_principle },
    sourceB: { domain: row.source_b_domain, principle: row.source_b_principle },
    insight: row.insight,
    noveltyScore: row.novelty_score,
    plausibility: row.plausibility,
    status: row.status as CreativeInsight['status'],
    createdAt: row.created_at,
  };
}
