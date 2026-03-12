import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface Principle {
  id: string;
  domain: string;
  statement: string;
  success_rate: number;
  sample_size: number;
  confidence: number;
  source: string;           // Which data led to this principle
}

export interface AntiPattern {
  id: string;
  domain: string;
  statement: string;
  failure_rate: number;
  sample_size: number;
  confidence: number;
  alternative: string;      // What to do instead
}

export interface Strategy {
  id: string;
  domain: string;
  description: string;
  conditions: string[];     // When does this strategy apply
  effectiveness: number;
  evidence_count: number;
}

export interface KnowledgePackage {
  id: string;
  created: number;
  domain: string;
  principles: Principle[];
  anti_patterns: AntiPattern[];
  strategies: Strategy[];
  confidence: number;
  evidence_summary: string;
  applicable_when: string[];
  transferable_to: string[];
}

export interface KnowledgeEvolution {
  domain: string;
  period: string;
  principles_added: number;
  principles_removed: number;
  anti_patterns_discovered: number;
  strategies_changed: number;
  confidence_trend: 'rising' | 'stable' | 'falling';
  highlights: string[];
}

export interface KnowledgeDistillerConfig {
  brainName: string;
  /** Minimum evidence to extract a principle. Default: 5 */
  minEvidence?: number;
  /** Minimum success rate for a principle. Default: 0.7 */
  minSuccessRate?: number;
  /** Minimum failure rate for an anti-pattern. Default: 0.6 */
  minFailureRate?: number;
}

// ── Migration ───────────────────────────────────────────

export function runKnowledgeDistillerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_principles (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      statement TEXT NOT NULL,
      success_rate REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_kp_domain ON knowledge_principles(domain);

    CREATE TABLE IF NOT EXISTS knowledge_anti_patterns (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      statement TEXT NOT NULL,
      failure_rate REAL NOT NULL,
      sample_size INTEGER NOT NULL,
      confidence REAL NOT NULL,
      alternative TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_kap_domain ON knowledge_anti_patterns(domain);

    CREATE TABLE IF NOT EXISTS knowledge_strategies (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      description TEXT NOT NULL,
      conditions TEXT NOT NULL,
      effectiveness REAL NOT NULL,
      evidence_count INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ks_domain ON knowledge_strategies(domain);

    CREATE TABLE IF NOT EXISTS knowledge_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      domain TEXT NOT NULL,
      principles_count INTEGER NOT NULL,
      anti_patterns_count INTEGER NOT NULL,
      strategies_count INTEGER NOT NULL,
      avg_confidence REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Engine ──────────────────────────────────────────────

export class KnowledgeDistiller {
  private db: Database.Database;
  private config: Required<KnowledgeDistillerConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config: KnowledgeDistillerConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      minEvidence: config.minEvidence ?? 3,
      minSuccessRate: config.minSuccessRate ?? 0.7,
      minFailureRate: config.minFailureRate ?? 0.6,
    };
    runKnowledgeDistillerMigration(db);
  }

  /** Distill knowledge from confirmed hypotheses, research discoveries, and strategy adaptations. */
  distill(): { principles: Principle[]; antiPatterns: AntiPattern[]; strategies: Strategy[] } {
    const principles = this.extractPrinciples();
    const antiPatterns = this.extractAntiPatterns();
    const strategies = this.extractStrategies();

    // Take snapshot for evolution tracking
    this.db.prepare(`
      INSERT INTO knowledge_snapshots (timestamp, domain, principles_count, anti_patterns_count, strategies_count, avg_confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      Date.now(),
      this.config.brainName,
      principles.length,
      antiPatterns.length,
      strategies.length,
      principles.length > 0 ? principles.reduce((s, p) => s + p.confidence, 0) / principles.length : 0,
    );

    return { principles, antiPatterns, strategies };
  }

  /** Get summary of all distilled knowledge. */
  getSummary(): { principles: number; antiPatterns: number; strategies: number; topPrinciples: Principle[]; avgConfidence: number } {
    const pCount = (this.db.prepare(`SELECT COUNT(*) as c FROM knowledge_principles`).get() as { c: number }).c;
    const apCount = (this.db.prepare(`SELECT COUNT(*) as c FROM knowledge_anti_patterns`).get() as { c: number }).c;
    const sCount = (this.db.prepare(`SELECT COUNT(*) as c FROM knowledge_strategies`).get() as { c: number }).c;

    const topPrinciples = this.getPrinciples(undefined, 5);
    const avgConf = topPrinciples.length > 0 ? topPrinciples.reduce((s, p) => s + p.confidence, 0) / topPrinciples.length : 0;

    return {
      principles: pCount,
      antiPatterns: apCount,
      strategies: sCount,
      topPrinciples,
      avgConfidence: avgConf,
    };
  }

  /** Get principles, optionally filtered by domain. */
  getPrinciples(domain?: string, limit = 20): Principle[] {
    let sql = `SELECT * FROM knowledge_principles`;
    const params: unknown[] = [];
    if (domain) {
      sql += ` WHERE domain = ?`;
      params.push(domain);
    }
    sql += ` ORDER BY confidence DESC, success_rate DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      domain: r.domain as string,
      statement: r.statement as string,
      success_rate: r.success_rate as number,
      sample_size: r.sample_size as number,
      confidence: r.confidence as number,
      source: r.source as string,
    }));
  }

  /** Get anti-patterns. */
  getAntiPatterns(domain?: string, limit = 20): AntiPattern[] {
    let sql = `SELECT * FROM knowledge_anti_patterns`;
    const params: unknown[] = [];
    if (domain) {
      sql += ` WHERE domain = ?`;
      params.push(domain);
    }
    sql += ` ORDER BY failure_rate DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      domain: r.domain as string,
      statement: r.statement as string,
      failure_rate: r.failure_rate as number,
      sample_size: r.sample_size as number,
      confidence: r.confidence as number,
      alternative: r.alternative as string,
    }));
  }

  /** Build a transferable knowledge package for a domain. */
  getPackage(domain: string): KnowledgePackage {
    const principles = this.getPrinciples(domain, 15);
    const antiPatterns = this.getAntiPatterns(domain, 10);

    const strategies = (this.db.prepare(`
      SELECT * FROM knowledge_strategies WHERE domain = ? ORDER BY effectiveness DESC LIMIT 10
    `).all(domain) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      domain: r.domain as string,
      description: r.description as string,
      conditions: JSON.parse(r.conditions as string),
      effectiveness: r.effectiveness as number,
      evidence_count: r.evidence_count as number,
    }));

    const allConf = [...principles.map(p => p.confidence), ...antiPatterns.map(a => a.confidence)];
    const avgConf = allConf.length > 0 ? allConf.reduce((a, b) => a + b, 0) / allConf.length : 0;

    return {
      id: `${domain}-${Date.now()}`,
      created: Date.now(),
      domain,
      principles,
      anti_patterns: antiPatterns,
      strategies,
      confidence: avgConf,
      evidence_summary: `${principles.length} principles, ${antiPatterns.length} anti-patterns, ${strategies.length} strategies from ${this.config.brainName}`,
      applicable_when: [`Working with ${domain} tasks`, `Debugging ${domain} issues`],
      transferable_to: this.suggestTransferDomains(domain),
    };
  }

  /** Track how knowledge has evolved over time. */
  getEvolution(domain?: string, periods = 5): KnowledgeEvolution[] {
    const snapshots = this.db.prepare(`
      SELECT * FROM knowledge_snapshots
      ${domain ? 'WHERE domain = ?' : ''}
      ORDER BY timestamp DESC LIMIT ?
    `).all(...(domain ? [domain, periods * 2] : [periods * 2])) as Array<Record<string, unknown>>;

    if (snapshots.length < 2) return [];

    const evolutions: KnowledgeEvolution[] = [];

    for (let i = 0; i < snapshots.length - 1; i++) {
      const current = snapshots[i];
      const previous = snapshots[i + 1];

      const principlesDelta = (current.principles_count as number) - (previous.principles_count as number);
      const antiPatternsDelta = (current.anti_patterns_count as number) - (previous.anti_patterns_count as number);
      const strategyDelta = (current.strategies_count as number) - (previous.strategies_count as number);

      const confCurrent = current.avg_confidence as number;
      const confPrev = previous.avg_confidence as number;
      const confTrend: 'rising' | 'stable' | 'falling' =
        confCurrent > confPrev + 0.02 ? 'rising' :
        confCurrent < confPrev - 0.02 ? 'falling' : 'stable';

      const highlights: string[] = [];
      if (principlesDelta > 0) highlights.push(`+${principlesDelta} new principles`);
      if (principlesDelta < 0) highlights.push(`${principlesDelta} principles removed (outdated)`);
      if (antiPatternsDelta > 0) highlights.push(`+${antiPatternsDelta} anti-patterns discovered`);
      if (strategyDelta !== 0) highlights.push(`${strategyDelta > 0 ? '+' : ''}${strategyDelta} strategy changes`);

      evolutions.push({
        domain: current.domain as string,
        period: new Date(current.timestamp as number).toLocaleDateString(),
        principles_added: Math.max(0, principlesDelta),
        principles_removed: Math.abs(Math.min(0, principlesDelta)),
        anti_patterns_discovered: Math.max(0, antiPatternsDelta),
        strategies_changed: Math.abs(strategyDelta),
        confidence_trend: confTrend,
        highlights,
      });
    }

    return evolutions;
  }

  private extractPrinciples(): Principle[] {
    const principles: Principle[] = [];

    // Extract from confirmed hypotheses
    try {
      const confirmed = this.db.prepare(`
        SELECT statement, type, variables, confidence, evidence_for, evidence_against
        FROM hypotheses
        WHERE status = 'confirmed' AND evidence_for >= ?
        ORDER BY confidence DESC
      `).all(this.config.minEvidence) as Array<Record<string, unknown>>;

      for (const h of confirmed) {
        const total = (h.evidence_for as number) + (h.evidence_against as number);
        const successRate = (h.evidence_for as number) / Math.max(total, 1);
        if (successRate < this.config.minSuccessRate) continue;

        const id = `hyp-${this.hashString(h.statement as string)}`;
        const principle: Principle = {
          id,
          domain: (h.type as string) || this.config.brainName,
          statement: h.statement as string,
          success_rate: successRate,
          sample_size: total,
          confidence: h.confidence as number,
          source: 'confirmed_hypothesis',
        };

        this.upsertPrinciple(principle);
        principles.push(principle);
      }
    } catch { /* hypotheses table might not exist */ }

    // Extract from resolved anomalies (patterns that were identified and resolved)
    try {
      const resolvedAnomalies = this.db.prepare(`
        SELECT type, title, description, metric, expected_value, actual_value, deviation, resolution
        FROM anomalies
        WHERE resolved = 1 AND resolution IS NOT NULL
        ORDER BY timestamp DESC LIMIT 20
      `).all() as Array<Record<string, unknown>>;

      for (const a of resolvedAnomalies) {
        const id = `anomaly-${this.hashString(a.title as string)}`;
        const principle: Principle = {
          id,
          domain: (a.type as string) || 'anomaly',
          statement: `When ${a.metric} deviates ${((a.deviation as number) || 0).toFixed(1)}% from expected: ${a.resolution}`,
          success_rate: 0.8,
          sample_size: 1,
          confidence: 0.65,
          source: 'resolved_anomaly',
        };

        this.upsertPrinciple(principle);
        principles.push(principle);
      }
    } catch { /* anomalies table might not exist */ }

    // Extract from successful auto-responses (patterns of effective automated reactions)
    try {
      const successfulResponses = this.db.prepare(`
        SELECT action, description, parameters_before, parameters_after
        FROM auto_responses
        WHERE success = 1 AND reverted = 0
        ORDER BY timestamp DESC LIMIT 20
      `).all() as Array<Record<string, unknown>>;

      for (const r of successfulResponses) {
        const id = `autofix-${this.hashString(r.description as string)}`;
        const principle: Principle = {
          id,
          domain: 'auto_response',
          statement: r.description as string,
          success_rate: 1.0,
          sample_size: 1,
          confidence: 0.7,
          source: `auto_response:${r.action}`,
        };

        this.upsertPrinciple(principle);
        principles.push(principle);
      }
    } catch { /* auto_responses table might not exist */ }

    // Extract from research discoveries
    try {
      const discoveries = this.db.prepare(`
        SELECT title, description, confidence, type, data
        FROM research_discoveries
        WHERE confidence >= 0.6 AND type IN ('confirmed_hypothesis', 'causal_chain')
        ORDER BY confidence DESC LIMIT 20
      `).all() as Array<Record<string, unknown>>;

      for (const d of discoveries) {
        const id = `disc-${this.hashString(d.title as string)}`;
        const principle: Principle = {
          id,
          domain: this.config.brainName,
          statement: d.title as string,
          success_rate: d.confidence as number,
          sample_size: 1,
          confidence: d.confidence as number,
          source: `research_discovery:${d.type}`,
        };

        this.upsertPrinciple(principle);
        principles.push(principle);
      }
    } catch { /* research_discoveries table might not exist */ }

    // Extract from notable/breakthrough journal discoveries (reliable early knowledge source)
    try {
      const journalEntries = this.db.prepare(`
        SELECT title, content, significance, type
        FROM research_journal
        WHERE significance IN ('breakthrough', 'notable') AND type = 'discovery'
        ORDER BY timestamp DESC LIMIT 30
      `).all() as Array<Record<string, unknown>>;

      for (const j of journalEntries) {
        const title = j.title as string;
        if (title.length < 10) continue; // Skip trivial entries
        const id = `journal-${this.hashString(title)}`;
        const existing = this.db.prepare(`SELECT id FROM knowledge_principles WHERE id = ?`).get(id);
        if (existing) continue; // Already extracted
        const principle: Principle = {
          id,
          domain: this.config.brainName,
          statement: title,
          success_rate: j.significance === 'breakthrough' ? 0.9 : 0.75,
          sample_size: 1,
          confidence: j.significance === 'breakthrough' ? 0.85 : 0.65,
          source: 'journal_discovery',
        };

        this.upsertPrinciple(principle);
        principles.push(principle);
      }
    } catch { /* journal table might not exist */ }

    return principles;
  }

  private extractAntiPatterns(): AntiPattern[] {
    const antiPatterns: AntiPattern[] = [];

    // Extract from rejected hypotheses (things that don't work)
    try {
      const rejected = this.db.prepare(`
        SELECT statement, type, evidence_for, evidence_against, confidence
        FROM hypotheses
        WHERE status = 'rejected' AND evidence_against >= ?
        ORDER BY evidence_against DESC
      `).all(this.config.minEvidence) as Array<Record<string, unknown>>;

      for (const h of rejected) {
        const total = (h.evidence_for as number) + (h.evidence_against as number);
        const failureRate = (h.evidence_against as number) / Math.max(total, 1);
        if (failureRate < this.config.minFailureRate) continue;

        const id = `anti-${this.hashString(h.statement as string)}`;
        const anti: AntiPattern = {
          id,
          domain: (h.type as string) || this.config.brainName,
          statement: `NOT: ${h.statement}`,
          failure_rate: failureRate,
          sample_size: total,
          confidence: h.confidence as number,
          alternative: 'See confirmed principles for what works instead.',
        };

        this.upsertAntiPattern(anti);
        antiPatterns.push(anti);
      }
    } catch { /* hypotheses table might not exist */ }

    // Extract from reverted auto-responses (automated fixes that failed)
    try {
      const revertedResponses = this.db.prepare(`
        SELECT action, description, parameters_before, parameters_after
        FROM auto_responses
        WHERE reverted = 1
        ORDER BY timestamp DESC LIMIT 20
      `).all() as Array<Record<string, unknown>>;

      for (const r of revertedResponses) {
        const id = `anti-auto-${this.hashString(r.description as string)}`;
        const anti: AntiPattern = {
          id,
          domain: 'auto_response',
          statement: `NOT: ${r.description}`,
          failure_rate: 1.0,
          sample_size: 1,
          confidence: 0.7,
          alternative: r.parameters_before
            ? `Revert to previous parameters: ${r.parameters_before}`
            : 'Avoid this automated response — it was reverted.',
        };

        this.upsertAntiPattern(anti);
        antiPatterns.push(anti);
      }
    } catch { /* auto_responses table might not exist */ }

    // Extract from recurring unresolved anomalies (patterns that keep happening)
    try {
      const recurringAnomalies = this.db.prepare(`
        SELECT type, metric, COUNT(*) as occurrences, AVG(deviation) as avg_deviation,
               MAX(title) as title
        FROM anomalies
        WHERE resolved = 0
        GROUP BY type, metric
        HAVING occurrences >= 3
        ORDER BY occurrences DESC LIMIT 10
      `).all() as Array<Record<string, unknown>>;

      for (const a of recurringAnomalies) {
        const id = `anti-anomaly-${a.metric}`;
        const anti: AntiPattern = {
          id,
          domain: (a.type as string) || 'anomaly',
          statement: `Recurring anomaly: ${a.metric} deviates avg ${((a.avg_deviation as number) || 0).toFixed(1)}% (${a.occurrences}x unresolved)`,
          failure_rate: 1.0,
          sample_size: a.occurrences as number,
          confidence: Math.min(0.5 + (a.occurrences as number) * 0.1, 0.95),
          alternative: `Investigate root cause of ${a.metric} instability. ${a.title}`,
        };

        this.upsertAntiPattern(anti);
        antiPatterns.push(anti);
      }
    } catch { /* anomalies table might not exist */ }

    // Extract from reverted strategy adaptations
    try {
      const reverted = this.db.prepare(`
        SELECT strategy, parameter, old_value, new_value, reason, revert_reason
        FROM strategy_adaptations
        WHERE reverted = 1
        ORDER BY timestamp DESC LIMIT 20
      `).all() as Array<Record<string, unknown>>;

      for (const r of reverted) {
        const id = `revert-${r.strategy}-${r.parameter}`;
        const anti: AntiPattern = {
          id,
          domain: r.strategy as string,
          statement: `Changing ${r.parameter} from ${r.old_value} to ${r.new_value} degrades performance`,
          failure_rate: 1.0,
          sample_size: 1,
          confidence: 0.7,
          alternative: `Keep ${r.parameter} at ${r.old_value}. Reason: ${r.revert_reason ?? r.reason}`,
        };

        this.upsertAntiPattern(anti);
        antiPatterns.push(anti);
      }
    } catch { /* strategy_adaptations table might not exist */ }

    return antiPatterns;
  }

  private extractStrategies(): Strategy[] {
    const strategies: Strategy[] = [];

    // Extract from successful strategy adaptations
    try {
      const successful = this.db.prepare(`
        SELECT strategy, parameter, old_value, new_value, reason, evidence,
               performance_before, performance_after
        FROM strategy_adaptations
        WHERE reverted = 0 AND performance_after IS NOT NULL
        AND performance_after > performance_before
        ORDER BY (performance_after - performance_before) DESC LIMIT 20
      `).all() as Array<Record<string, unknown>>;

      for (const s of successful) {
        const improvement = (s.performance_after as number) - (s.performance_before as number);
        const id = `strat-${s.strategy}-${s.parameter}-${Date.now()}`;

        const strategy: Strategy = {
          id,
          domain: s.strategy as string,
          description: `Set ${s.parameter} to ${s.new_value} (from ${s.old_value}) for ${(improvement * 100).toFixed(1)}% improvement`,
          conditions: [s.reason as string],
          effectiveness: improvement,
          evidence_count: 1,
        };

        this.upsertStrategy(strategy);
        strategies.push(strategy);
      }
    } catch { /* strategy_adaptations table might not exist */ }

    // Extract from successful auto-response patterns (strategies that work for anomalies)
    try {
      const responsePatterns = this.db.prepare(`
        SELECT action, COUNT(*) as uses, SUM(CASE WHEN reverted = 0 THEN 1 ELSE 0 END) as successes,
               MAX(description) as description
        FROM auto_responses
        WHERE success = 1
        GROUP BY action
        HAVING uses >= 2
        ORDER BY successes DESC LIMIT 10
      `).all() as Array<Record<string, unknown>>;

      for (const rp of responsePatterns) {
        const successRate = (rp.successes as number) / (rp.uses as number);
        if (successRate < 0.6) continue;

        const id = `strat-auto-${rp.action}`;
        const strategy: Strategy = {
          id,
          domain: 'auto_response',
          description: `Use "${rp.action}" response for anomalies (${((successRate) * 100).toFixed(0)}% success over ${rp.uses} uses)`,
          conditions: [`Anomaly detected`, rp.description as string],
          effectiveness: successRate,
          evidence_count: rp.uses as number,
        };

        this.upsertStrategy(strategy);
        strategies.push(strategy);
      }
    } catch { /* auto_responses table might not exist */ }

    // Extract from meta-learning optimizations
    try {
      const optimizations = this.db.prepare(`
        SELECT param_name, old_value, new_value, reason, improvement
        FROM meta_learning_optimizations
        WHERE improvement > 0
        ORDER BY improvement DESC LIMIT 10
      `).all() as Array<Record<string, unknown>>;

      for (const o of optimizations) {
        const id = `meta-${o.param_name}`;
        const strategy: Strategy = {
          id,
          domain: 'meta_learning',
          description: `Optimize ${o.param_name} to ${o.new_value} for ${((o.improvement as number) * 100).toFixed(1)}% gain`,
          conditions: [o.reason as string],
          effectiveness: o.improvement as number,
          evidence_count: 1,
        };

        this.upsertStrategy(strategy);
        strategies.push(strategy);
      }
    } catch { /* meta_learning_optimizations table might not exist */ }

    return strategies;
  }

  private suggestTransferDomains(domain: string): string[] {
    const allDomains = new Set<string>();
    try {
      const rows = this.db.prepare(`SELECT DISTINCT domain FROM knowledge_principles`).all() as Array<{ domain: string }>;
      for (const r of rows) allDomains.add(r.domain);
    } catch { /* ignore */ }

    allDomains.delete(domain);
    return [...allDomains].slice(0, 5);
  }

  /** Adjust a principle's confidence based on challenge outcome. */
  adjustPrincipleConfidence(principleId: string, factor: number): boolean {
    const row = this.db.prepare('SELECT id, confidence FROM knowledge_principles WHERE id = ?').get(principleId) as { id: string; confidence: number } | undefined;
    if (!row) return false;
    const newConfidence = Math.max(0, Math.min(1, row.confidence * factor));
    this.db.prepare('UPDATE knowledge_principles SET confidence = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newConfidence, principleId);
    this.log.info(`[distiller] Principle ${principleId} confidence adjusted: ${row.confidence.toFixed(3)} → ${newConfidence.toFixed(3)} (factor: ${factor})`);
    return true;
  }

  /** Remove a principle (e.g. when disproved). */
  removePrinciple(principleId: string): boolean {
    const changes = this.db.prepare('DELETE FROM knowledge_principles WHERE id = ?').run(principleId).changes;
    if (changes > 0) this.log.info(`[distiller] Principle ${principleId} removed (disproved)`);
    return changes > 0;
  }

  private upsertPrinciple(p: Principle): void {
    this.db.prepare(`
      INSERT INTO knowledge_principles (id, domain, statement, success_rate, sample_size, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        success_rate = excluded.success_rate,
        sample_size = excluded.sample_size,
        confidence = excluded.confidence,
        updated_at = datetime('now')
    `).run(p.id, p.domain, p.statement, p.success_rate, p.sample_size, p.confidence, p.source);
  }

  /**
   * Create an anti-pattern reactively from a rejected hypothesis.
   * Called immediately on rejection, not waiting for periodic distillation.
   */
  createAntiPatternFromRejection(hypothesis: {
    statement: string; type: string;
    evidence_for: number; evidence_against: number; confidence: number;
  }): AntiPattern | null {
    const totalEvidence = hypothesis.evidence_for + hypothesis.evidence_against;
    if (totalEvidence < 2) return null; // need some evidence

    const failureRate = totalEvidence > 0 ? hypothesis.evidence_against / totalEvidence : 0;
    if (failureRate < 0.4) return null; // not a clear enough failure

    const id = `ap-rej-${this.hashString(hypothesis.statement)}`;

    // Check if already exists
    const existing = this.db.prepare('SELECT id FROM knowledge_anti_patterns WHERE id = ?').get(id);
    if (existing) return null;

    const antiPattern: AntiPattern = {
      id,
      domain: hypothesis.type,
      statement: `Rejected hypothesis: ${hypothesis.statement}`,
      failure_rate: failureRate,
      sample_size: totalEvidence,
      confidence: Math.min(failureRate, 1 - hypothesis.confidence),
      alternative: 'Hypothesis was disproved — avoid assumptions based on this pattern.',
    };

    this.upsertAntiPattern(antiPattern);
    this.log.info(`[distiller] Anti-pattern from rejection: ${antiPattern.statement.substring(0, 80)}`);
    return antiPattern;
  }

  /**
   * Create an anti-pattern from a wrong prediction.
   * Called when PredictionEngine resolves a prediction as 'wrong'.
   */
  createAntiPatternFromPredictionFailure(prediction: {
    domain: string; metric: string; predicted_direction: string;
    confidence: number; error: number; reasoning: string;
  }): AntiPattern | null {
    if (prediction.error < 0.25) return null; // only for significant errors

    const id = `ap-pred-${this.hashString(prediction.metric + prediction.predicted_direction + prediction.reasoning)}`;

    const existing = this.db.prepare('SELECT id FROM knowledge_anti_patterns WHERE id = ?').get(id);
    if (existing) return null;

    const antiPattern: AntiPattern = {
      id,
      domain: prediction.domain,
      statement: `Wrong prediction: ${prediction.metric} predicted ${prediction.predicted_direction} (error: ${(prediction.error * 100).toFixed(0)}%)`,
      failure_rate: prediction.error,
      sample_size: 1,
      confidence: prediction.confidence * prediction.error,
      alternative: `Reduce confidence for ${prediction.metric} ${prediction.predicted_direction} predictions.`,
    };

    this.upsertAntiPattern(antiPattern);
    this.log.info(`[distiller] Anti-pattern from wrong prediction: ${prediction.metric}`);
    return antiPattern;
  }

  private upsertAntiPattern(a: AntiPattern): void {
    this.db.prepare(`
      INSERT INTO knowledge_anti_patterns (id, domain, statement, failure_rate, sample_size, confidence, alternative)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        failure_rate = excluded.failure_rate,
        sample_size = excluded.sample_size,
        confidence = excluded.confidence,
        updated_at = datetime('now')
    `).run(a.id, a.domain, a.statement, a.failure_rate, a.sample_size, a.confidence, a.alternative);
  }

  /**
   * Create a strategy from a cluster of confirmed hypotheses.
   * Called by orchestrator when 3+ hypotheses in same domain are confirmed.
   */
  createStrategyFromHypotheses(domain: string, statements: string[], evidenceCount: number): Strategy | null {
    const id = `strat-hyp-${this.hashString(domain + statements.join('|'))}`;

    const existing = this.db.prepare('SELECT id FROM knowledge_strategies WHERE id = ?').get(id);
    if (existing) return null;

    const strategy: Strategy = {
      id,
      domain,
      description: `Strategy from ${evidenceCount} confirmed ${domain} hypotheses`,
      conditions: statements,
      effectiveness: 0.5, // initial — will be updated by feedback
      evidence_count: evidenceCount,
    };

    this.upsertStrategy(strategy);
    this.log.info(`[distiller] Strategy emerged: ${strategy.description}`);
    return strategy;
  }

  private upsertStrategy(s: Strategy): void {
    this.db.prepare(`
      INSERT INTO knowledge_strategies (id, domain, description, conditions, effectiveness, evidence_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        effectiveness = excluded.effectiveness,
        evidence_count = knowledge_strategies.evidence_count + 1,
        updated_at = datetime('now')
    `).run(s.id, s.domain, s.description, JSON.stringify(s.conditions), s.effectiveness, s.evidence_count);
  }

  private hashString(s: string): string {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      const char = s.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}
