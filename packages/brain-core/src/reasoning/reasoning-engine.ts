import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export interface ReasoningEngineConfig {
  brainName: string;
  /** Max inference chain depth. Default: 5 */
  maxDepth?: number;
  /** Min confidence to continue chain. Default: 0.1 */
  minConfidence?: number;
  /** Confidence dampening per step. Default: 0.95 */
  dampening?: number;
  /** Min Jaccard similarity for keyword matching. Default: 0.15 */
  minSimilarity?: number;
}

export interface ReasoningDataSources {
  /** Get confirmed hypotheses. */
  getConfirmedHypotheses?: () => Array<{ id?: number; statement: string; variables: string[]; condition: { type: string; params: Record<string, unknown> }; confidence: number }>;
  /** Get high-confidence principles. */
  getPrinciples?: (domain?: string, limit?: number) => Array<{ id: string; statement: string; confidence: number; domain: string }>;
  /** Get causal edges. */
  getCausalEdges?: (minStrength?: number) => Array<{ id?: number; cause: string; effect: string; strength: number; confidence: number; lag_ms: number }>;
  /** Get causal effects of a given event type. */
  getCausalEffects?: (eventType: string) => Array<{ cause: string; effect: string; strength: number; confidence: number; lag_ms: number }>;
  /** Get attention topics. */
  getAttentionTopics?: () => Array<{ topic: string; score: number }>;
  /** Get recent anomalies. */
  getAnomalies?: () => Array<{ title: string; description: string }>;
}

export interface InferenceRule {
  id?: number;
  antecedent: string;
  consequent: string;
  confidence: number;
  source_type: string;
  source_id: string;
  domain: string;
  keywords: string[];
  created_at?: string;
  updated_at?: string;
}

export interface InferenceStep {
  ruleId: number;
  antecedent: string;
  consequent: string;
  confidence: number;
  cumulativeConfidence: number;
  source: string;
}

export interface InferenceChain {
  id?: number;
  query: string;
  chain_type: 'forward' | 'abductive' | 'temporal' | 'counterfactual';
  steps: InferenceStep[];
  rule_ids: number[];
  final_confidence: number;
  conclusion: string;
  temporal_estimate_ms?: number;
  created_at?: string;
}

export interface AbductiveExplanation {
  ruleId: number;
  antecedent: string;
  consequent: string;
  confidence: number;
  coverage: number;
  score: number;
  source: string;
}

export interface TemporalStep {
  cause: string;
  effect: string;
  lag_ms: number;
  cumulative_lag_ms: number;
  confidence: number;
  cumulative_confidence: number;
}

export interface TemporalChain {
  eventType: string;
  steps: TemporalStep[];
  total_lag_ms: number;
  final_confidence: number;
  narrative: string;
}

export interface CounterfactualResult {
  event: string;
  affected_effects: string[];
  depth: number;
  narrative: string;
}

export interface ReasoningStatus {
  ruleCount: number;
  chainCount: number;
  avgConfidence: number;
  domains: string[];
  recentChains: number;
  uptime: number;
}

// ── Migration ───────────────────────────────────────────

export function runReasoningMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inference_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      antecedent TEXT NOT NULL,
      consequent TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'general',
      keywords TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id)
    );

    CREATE TABLE IF NOT EXISTS inference_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      chain_type TEXT NOT NULL DEFAULT 'forward',
      rule_ids TEXT NOT NULL DEFAULT '[]',
      steps TEXT NOT NULL DEFAULT '[]',
      final_confidence REAL NOT NULL DEFAULT 0,
      conclusion TEXT NOT NULL DEFAULT '',
      temporal_estimate_ms REAL DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reasoning_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      reasoning_type TEXT NOT NULL,
      result_summary TEXT NOT NULL DEFAULT '',
      chain_id INTEGER DEFAULT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inference_rules_source ON inference_rules(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_inference_rules_confidence ON inference_rules(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_inference_chains_type ON inference_chains(chain_type);
    CREATE INDEX IF NOT EXISTS idx_reasoning_log_type ON reasoning_log(reasoning_type);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class ReasoningEngine {
  private readonly db: Database.Database;
  private readonly config: Required<ReasoningEngineConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: ReasoningDataSources = {};
  private readonly startTime = Date.now();

  // Prepared statements
  private readonly stmtUpsertRule: Database.Statement;
  private readonly stmtGetRules: Database.Statement;
  private readonly stmtGetRulesByKeywords: Database.Statement;
  private readonly stmtInsertChain: Database.Statement;
  private readonly stmtGetChain: Database.Statement;
  private readonly stmtListChains: Database.Statement;
  private readonly stmtInsertLog: Database.Statement;
  private readonly stmtCountRules: Database.Statement;
  private readonly stmtCountChains: Database.Statement;
  private readonly stmtAvgConfidence: Database.Statement;
  private readonly stmtDomains: Database.Statement;
  private readonly stmtRecentChains: Database.Statement;

  constructor(db: Database.Database, config: ReasoningEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxDepth: config.maxDepth ?? 5,
      minConfidence: config.minConfidence ?? 0.1,
      dampening: config.dampening ?? 0.95,
      minSimilarity: config.minSimilarity ?? 0.15,
    };

    runReasoningMigration(db);

    this.stmtUpsertRule = db.prepare(`
      INSERT INTO inference_rules (antecedent, consequent, confidence, source_type, source_id, domain, keywords, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_type, source_id) DO UPDATE SET
        antecedent = excluded.antecedent,
        consequent = excluded.consequent,
        confidence = excluded.confidence,
        domain = excluded.domain,
        keywords = excluded.keywords,
        updated_at = datetime('now')
    `);

    this.stmtGetRules = db.prepare(
      'SELECT * FROM inference_rules WHERE confidence >= ? ORDER BY confidence DESC LIMIT ?',
    );

    this.stmtGetRulesByKeywords = db.prepare(
      'SELECT * FROM inference_rules WHERE confidence >= ? ORDER BY confidence DESC',
    );

    this.stmtInsertChain = db.prepare(`
      INSERT INTO inference_chains (query, chain_type, rule_ids, steps, final_confidence, conclusion, temporal_estimate_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetChain = db.prepare('SELECT * FROM inference_chains WHERE id = ?');

    this.stmtListChains = db.prepare(
      'SELECT * FROM inference_chains ORDER BY created_at DESC LIMIT ?',
    );

    this.stmtInsertLog = db.prepare(`
      INSERT INTO reasoning_log (query, reasoning_type, result_summary, chain_id, confidence, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.stmtCountRules = db.prepare('SELECT COUNT(*) as cnt FROM inference_rules');
    this.stmtCountChains = db.prepare('SELECT COUNT(*) as cnt FROM inference_chains');
    this.stmtAvgConfidence = db.prepare('SELECT AVG(confidence) as avg FROM inference_rules');
    this.stmtDomains = db.prepare('SELECT DISTINCT domain FROM inference_rules ORDER BY domain');
    this.stmtRecentChains = db.prepare(
      "SELECT COUNT(*) as cnt FROM inference_chains WHERE created_at >= datetime('now', '-1 day')",
    );
  }

  // ── Setters ─────────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }
  setDataSources(sources: ReasoningDataSources): void { this.sources = sources; }

  // ── 1. buildRules() ─────────────────────────────────────

  /** Extract inference rules from hypotheses, principles, and causal edges. */
  buildRules(): { added: number; updated: number; total: number } {
    let added = 0;
    let updated = 0;

    // 1a. Confirmed hypotheses → IF variables/condition THEN statement
    try {
      const hypotheses = this.sources.getConfirmedHypotheses?.() ?? [];
      for (const h of hypotheses) {
        const antecedent = h.variables.length > 0
          ? `IF ${h.variables.join(' AND ')}`
          : `IF ${h.condition.type}`;
        const consequent = h.statement;
        const keywords = this.tokenize(antecedent + ' ' + consequent);
        const result = this.stmtUpsertRule.run(
          antecedent, consequent, h.confidence, 'hypothesis', String(h.id ?? 0),
          'hypothesis', JSON.stringify(keywords),
        );
        if (result.changes > 0) {
          if (result.lastInsertRowid) added++; else updated++;
        }
      }
    } catch (err) {
      this.log.warn(`[reasoning] buildRules hypotheses error: ${(err as Error).message}`);
    }

    // 1b. High-confidence principles → statement as rule
    try {
      const principles = this.sources.getPrinciples?.('', 200) ?? [];
      for (const p of principles) {
        if (p.confidence < 0.5) continue;
        const parts = p.statement.split(/→|->|leads to|causes|implies/i);
        let antecedent: string;
        let consequent: string;
        if (parts.length >= 2) {
          antecedent = parts[0]!.trim();
          consequent = parts.slice(1).join('→').trim();
        } else {
          antecedent = 'OBSERVE';
          consequent = p.statement;
        }
        const keywords = this.tokenize(antecedent + ' ' + consequent);
        const result = this.stmtUpsertRule.run(
          antecedent, consequent, p.confidence, 'principle', p.id,
          p.domain || 'general', JSON.stringify(keywords),
        );
        if (result.changes > 0) {
          if (result.lastInsertRowid) added++; else updated++;
        }
      }
    } catch (err) {
      this.log.warn(`[reasoning] buildRules principles error: ${(err as Error).message}`);
    }

    // 1c. Causal edges → cause→effect with strength×confidence
    try {
      const edges = this.sources.getCausalEdges?.(0.2) ?? [];
      for (const e of edges) {
        const antecedent = e.cause;
        const consequent = e.effect;
        const confidence = e.strength * e.confidence;
        const keywords = this.tokenize(antecedent + ' ' + consequent);
        const result = this.stmtUpsertRule.run(
          antecedent, consequent, confidence, 'causal', `${e.cause}→${e.effect}`,
          'causal', JSON.stringify(keywords),
        );
        if (result.changes > 0) {
          if (result.lastInsertRowid) added++; else updated++;
        }
      }
    } catch (err) {
      this.log.warn(`[reasoning] buildRules causal error: ${(err as Error).message}`);
    }

    const total = (this.stmtCountRules.get() as { cnt: number }).cnt;
    this.ts?.emit('reasoning', 'analyzing', `Built ${added} new + ${updated} updated rules (${total} total)`, 'routine');
    this.log.info(`[reasoning] buildRules: +${added} new, ~${updated} updated, ${total} total`);

    return { added, updated, total };
  }

  // ── 2. infer(query) — Forward Chaining ──────────────────

  /** Forward chaining inference: find logical chains starting from query keywords. */
  infer(query: string): InferenceChain | null {
    const start = Date.now();
    const queryKeywords = this.tokenize(query);
    if (queryKeywords.length === 0) return null;

    const allRules = this.stmtGetRulesByKeywords.all(this.config.minConfidence) as Array<InferenceRule & { keywords: string }>;
    const rules = allRules.map(r => ({ ...r, keywords: JSON.parse(r.keywords) as string[] }));

    // Find best starting rule by matching antecedent keywords
    const steps: InferenceStep[] = [];
    const visited = new Set<number>();
    let currentKeywords = queryKeywords;
    let cumulativeConfidence = 1.0;

    for (let depth = 0; depth < this.config.maxDepth; depth++) {
      const bestRule = this.findBestMatch(currentKeywords, rules, visited, 'antecedent');
      if (!bestRule) break;

      cumulativeConfidence *= bestRule.confidence * this.config.dampening;
      if (cumulativeConfidence < this.config.minConfidence) break;

      visited.add(bestRule.id!);
      steps.push({
        ruleId: bestRule.id!,
        antecedent: bestRule.antecedent,
        consequent: bestRule.consequent,
        confidence: bestRule.confidence,
        cumulativeConfidence,
        source: `${bestRule.source_type}:${bestRule.source_id}`,
      });

      // Next iteration: match consequent keywords against new antecedents
      currentKeywords = this.tokenize(bestRule.consequent);
    }

    if (steps.length === 0) {
      this.stmtInsertLog.run(query, 'forward', 'no chain found', null, 0, Date.now() - start);
      return null;
    }

    const conclusion = steps.length > 1
      ? `${steps[0]!.antecedent} → ${steps.map(s => s.consequent).join(' → ')}`
      : `${steps[0]!.antecedent} → ${steps[0]!.consequent}`;

    const chain: InferenceChain = {
      query,
      chain_type: 'forward',
      steps,
      rule_ids: steps.map(s => s.ruleId),
      final_confidence: cumulativeConfidence,
      conclusion,
    };

    // Persist
    const result = this.stmtInsertChain.run(
      query, 'forward', JSON.stringify(chain.rule_ids), JSON.stringify(chain.steps),
      chain.final_confidence, chain.conclusion, null,
    );
    chain.id = Number(result.lastInsertRowid);

    this.stmtInsertLog.run(query, 'forward', conclusion, chain.id, chain.final_confidence, Date.now() - start);
    this.ts?.emit('reasoning', 'discovering', `Inferred: ${conclusion} (conf=${chain.final_confidence.toFixed(3)})`, chain.final_confidence > 0.5 ? 'notable' : 'routine');

    return chain;
  }

  // ── 3. abduce(observation) — Abductive Reasoning ────────

  /** Abductive reasoning: find possible explanations for an observation. */
  abduce(observation: string): AbductiveExplanation[] {
    const start = Date.now();
    const obsKeywords = this.tokenize(observation);
    if (obsKeywords.length === 0) return [];

    const allRules = this.stmtGetRulesByKeywords.all(this.config.minConfidence) as Array<InferenceRule & { keywords: string }>;
    const rules = allRules.map(r => ({ ...r, keywords: JSON.parse(r.keywords) as string[] }));

    const explanations: AbductiveExplanation[] = [];

    for (const rule of rules) {
      // Match observation keywords against CONSEQUENTS (backwards!)
      const consequentKeywords = this.tokenize(rule.consequent);
      const overlap = this.keywordOverlap(obsKeywords, consequentKeywords);
      if (overlap === 0) continue;

      const coverage = obsKeywords.length > 0 ? overlap / obsKeywords.length : 0;
      const score = rule.confidence * coverage;

      if (score >= this.config.minConfidence) {
        explanations.push({
          ruleId: rule.id!,
          antecedent: rule.antecedent,
          consequent: rule.consequent,
          confidence: rule.confidence,
          coverage,
          score,
          source: `${rule.source_type}:${rule.source_id}`,
        });
      }
    }

    // Sort by score, top 5
    explanations.sort((a, b) => b.score - a.score);
    const top = explanations.slice(0, 5);

    const summary = top.length > 0
      ? `${top.length} explanations: ${top.map(e => e.antecedent).join(', ')}`
      : 'no explanations found';
    this.stmtInsertLog.run(observation, 'abductive', summary, null, top[0]?.score ?? 0, Date.now() - start);

    if (top.length > 0) {
      this.ts?.emit('reasoning', 'exploring', `Abduce "${observation}": ${top.length} explanations found`, 'routine');
    }

    return top;
  }

  // ── 4. temporalInfer(eventType) — Temporal Chains ───────

  /** Temporal inference: trace causal chains with time delays. */
  temporalInfer(eventType: string): TemporalChain | null {
    const start = Date.now();
    if (!this.sources.getCausalEffects) return null;

    const steps: TemporalStep[] = [];
    const visited = new Set<string>();
    let current = eventType;
    let cumulativeLag = 0;
    let cumulativeConf = 1.0;

    visited.add(current);

    for (let depth = 0; depth < this.config.maxDepth; depth++) {
      const effects = this.sources.getCausalEffects(current);
      if (!effects || effects.length === 0) break;

      // Pick strongest effect not yet visited
      const best = effects.find(e => !visited.has(e.effect));
      if (!best) break;

      visited.add(best.effect);
      cumulativeLag += best.lag_ms;
      cumulativeConf *= best.confidence * this.config.dampening;
      if (cumulativeConf < this.config.minConfidence) break;

      steps.push({
        cause: best.cause,
        effect: best.effect,
        lag_ms: best.lag_ms,
        cumulative_lag_ms: cumulativeLag,
        confidence: best.confidence,
        cumulative_confidence: cumulativeConf,
      });

      current = best.effect;
    }

    if (steps.length === 0) {
      this.stmtInsertLog.run(eventType, 'temporal', 'no temporal chain', null, 0, Date.now() - start);
      return null;
    }

    // Build narrative
    const parts = [eventType];
    for (const s of steps) {
      parts.push(`→(${s.lag_ms}ms)→ ${s.effect}`);
    }
    const narrative = parts.join(' ');

    const chain: TemporalChain = {
      eventType,
      steps,
      total_lag_ms: cumulativeLag,
      final_confidence: cumulativeConf,
      narrative,
    };

    // Persist as inference chain
    const result = this.stmtInsertChain.run(
      eventType, 'temporal', JSON.stringify(steps.map((_, i) => i)),
      JSON.stringify(steps), cumulativeConf, narrative, cumulativeLag,
    );

    this.stmtInsertLog.run(eventType, 'temporal', narrative, Number(result.lastInsertRowid), cumulativeConf, Date.now() - start);
    this.ts?.emit('reasoning', 'analyzing', `Temporal: ${narrative}`, 'routine');

    return chain;
  }

  // ── 5. counterfactual(event) — "What if X never happened?" ─

  /** Counterfactual reasoning: what downstream effects would be lost if event never happened. */
  counterfactual(event: string): CounterfactualResult {
    const start = Date.now();
    const affected: string[] = [];
    const queue = [event];
    const visited = new Set<string>();
    visited.add(event);

    // BFS over causal graph
    while (queue.length > 0) {
      const current = queue.shift()!;
      const effects = this.sources.getCausalEffects?.(current) ?? [];

      for (const e of effects) {
        if (!visited.has(e.effect)) {
          visited.add(e.effect);
          affected.push(e.effect);
          queue.push(e.effect);
        }
      }
    }

    const narrative = affected.length > 0
      ? `Without "${event}", ${affected.length} downstream effects would not have occurred: ${affected.join(', ')}`
      : `"${event}" has no known downstream effects.`;

    const result: CounterfactualResult = {
      event,
      affected_effects: affected,
      depth: visited.size - 1,
      narrative,
    };

    // Persist
    const chainResult = this.stmtInsertChain.run(
      event, 'counterfactual', JSON.stringify([]), JSON.stringify(affected),
      affected.length > 0 ? 1.0 : 0.0, narrative, null,
    );

    this.stmtInsertLog.run(event, 'counterfactual', narrative, Number(chainResult.lastInsertRowid), affected.length > 0 ? 1.0 : 0.0, Date.now() - start);

    if (affected.length > 0) {
      this.ts?.emit('reasoning', 'exploring', `Counterfactual: without "${event}" → ${affected.length} effects lost`, 'notable');
    }

    return result;
  }

  // ── 6. getProofTree(chainId) ────────────────────────────

  /** Retrieve a stored proof tree / inference chain by ID. */
  getProofTree(chainId: number): InferenceChain | null {
    const row = this.stmtGetChain.get(chainId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.toChain(row);
  }

  // ── 7. getRules(limit?, minConfidence?) ─────────────────

  /** Get inference rules, optionally filtered. */
  getRules(limit = 50, minConfidence = 0): InferenceRule[] {
    const rows = this.stmtGetRules.all(minConfidence, limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.toRule(r));
  }

  // ── 8. getStatus() ──────────────────────────────────────

  /** Engine status and stats. */
  getStatus(): ReasoningStatus {
    const ruleCount = (this.stmtCountRules.get() as { cnt: number }).cnt;
    const chainCount = (this.stmtCountChains.get() as { cnt: number }).cnt;
    const avgConf = (this.stmtAvgConfidence.get() as { avg: number | null }).avg ?? 0;
    const domains = (this.stmtDomains.all() as Array<{ domain: string }>).map(d => d.domain);
    const recentChains = (this.stmtRecentChains.get() as { cnt: number }).cnt;

    return {
      ruleCount,
      chainCount,
      avgConfidence: avgConf,
      domains,
      recentChains,
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Private helpers ─────────────────────────────────────

  /** Tokenize text into bigram-aware keywords. */
  private tokenize(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9äöüß_\-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    // Deduplicate
    return [...new Set(words)];
  }

  /** Jaccard similarity between two keyword sets. */
  private jaccard(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const w of setA) {
      if (setB.has(w)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /** Count keyword overlap. */
  private keywordOverlap(a: string[], b: string[]): number {
    const setB = new Set(b);
    let count = 0;
    for (const w of a) {
      if (setB.has(w)) count++;
    }
    return count;
  }

  /** Find best matching rule for given keywords. */
  private findBestMatch(
    queryKeywords: string[],
    rules: Array<InferenceRule & { keywords: string[] }>,
    visited: Set<number>,
    matchField: 'antecedent' | 'consequent',
  ): (InferenceRule & { keywords: string[] }) | null {
    let bestRule: (InferenceRule & { keywords: string[] }) | null = null;
    let bestScore = 0;

    for (const rule of rules) {
      if (visited.has(rule.id!)) continue;

      const fieldKeywords = matchField === 'antecedent'
        ? this.tokenize(rule.antecedent)
        : this.tokenize(rule.consequent);

      const sim = this.jaccard(queryKeywords, fieldKeywords);
      if (sim < this.config.minSimilarity) continue;

      const score = sim * rule.confidence;
      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }

    return bestRule;
  }

  /** Convert DB row to InferenceChain. */
  private toChain(row: Record<string, unknown>): InferenceChain {
    return {
      id: row.id as number,
      query: row.query as string,
      chain_type: row.chain_type as InferenceChain['chain_type'],
      steps: JSON.parse((row.steps as string) || '[]'),
      rule_ids: JSON.parse((row.rule_ids as string) || '[]'),
      final_confidence: row.final_confidence as number,
      conclusion: row.conclusion as string,
      temporal_estimate_ms: row.temporal_estimate_ms as number | undefined,
      created_at: row.created_at as string,
    };
  }

  /** Convert DB row to InferenceRule. */
  private toRule(row: Record<string, unknown>): InferenceRule {
    return {
      id: row.id as number,
      antecedent: row.antecedent as string,
      consequent: row.consequent as string,
      confidence: row.confidence as number,
      source_type: row.source_type as string,
      source_id: row.source_id as string,
      domain: row.domain as string,
      keywords: JSON.parse((row.keywords as string) || '[]'),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}

// ── Stop Words ──────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'will', 'with',
  'this', 'that', 'from', 'they', 'were', 'each', 'which', 'their', 'then',
  'them', 'these', 'other', 'than', 'when', 'some', 'what', 'there', 'also',
  'into', 'more', 'its', 'only', 'could', 'would', 'should', 'about',
  'does', 'did', 'just', 'how', 'where', 'who', 'may', 'most', 'over',
  'such', 'after', 'because', 'through', 'between', 'very', 'being',
  'those', 'still', 'while', 'both', 'same', 'way', 'any', 'many',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer',
  'und', 'ist', 'hat', 'nicht', 'sich', 'mit', 'auf', 'für', 'von',
  'als', 'auch', 'noch', 'nach', 'bei', 'aus', 'wenn', 'dass', 'oder',
  'aber', 'wie', 'wird', 'sind', 'vor', 'nur', 'über', 'kann', 'schon',
]);
