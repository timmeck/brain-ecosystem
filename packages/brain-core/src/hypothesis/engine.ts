import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { LLMService } from '../llm/llm-service.js';

// ── Types ───────────────────────────────────────────────

export type HypothesisStatus = 'proposed' | 'testing' | 'confirmed' | 'rejected' | 'inconclusive';

export interface Hypothesis {
  id?: number;
  statement: string;           // human-readable hypothesis
  type: string;                // category: temporal, correlation, threshold, trend
  source: string;              // which brain generated it
  variables: string[];         // event types / metrics involved
  condition: HypothesisCondition;
  status: HypothesisStatus;
  evidence_for: number;        // observations supporting
  evidence_against: number;    // observations contradicting
  confidence: number;          // 0-1
  p_value: number;             // statistical significance (lower = more significant)
  created_at?: string;
  tested_at?: string;
}

export interface HypothesisCondition {
  type: 'temporal' | 'correlation' | 'threshold' | 'frequency';
  params: Record<string, unknown>;
}

export interface HypothesisTestResult {
  hypothesisId: number;
  passed: boolean;
  evidenceFor: number;
  evidenceAgainst: number;
  pValue: number;
  confidence: number;
  newStatus: HypothesisStatus;
}

export interface Observation {
  source: string;
  type: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ── Migration ───────────────────────────────────────────

export function runHypothesisMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hypotheses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      variables TEXT NOT NULL,
      condition TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      evidence_for INTEGER NOT NULL DEFAULT 0,
      evidence_against INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      p_value REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      tested_at TEXT
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);
    CREATE INDEX IF NOT EXISTS idx_hypotheses_confidence ON hypotheses(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
    CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);
  `);
}

// ── Engine ───────────────────────────────────────────────

/**
 * Hypothesis Engine: generates and tests hypotheses autonomously.
 *
 * Research approach: The scientific method, automated.
 *
 * 1. OBSERVE: Collect observations from all brains
 * 2. HYPOTHESIZE: Generate hypotheses from patterns in observations
 *    - Temporal: "Event A occurs more often during time window X"
 *    - Correlation: "When metric A increases, metric B also increases"
 *    - Threshold: "Performance degrades when metric A exceeds value X"
 *    - Frequency: "Event A happens with period P"
 * 3. TEST: Evaluate hypotheses against historical data using statistical tests
 * 4. CONCLUDE: Accept or reject based on evidence
 */
export class HypothesisEngine {
  private logger = getLogger();
  private minEvidence: number;
  private confirmThreshold: number;   // p-value below this → confirmed
  private rejectThreshold: number;    // p-value above this → rejected
  private llm: LLMService | null = null;

  constructor(
    private db: Database.Database,
    config?: { minEvidence?: number; confirmThreshold?: number; rejectThreshold?: number },
  ) {
    runHypothesisMigration(db);
    this.minEvidence = config?.minEvidence ?? 10;
    this.confirmThreshold = config?.confirmThreshold ?? 0.05;
    this.rejectThreshold = config?.rejectThreshold ?? 0.5;
  }

  setLLMService(llm: LLMService): void { this.llm = llm; }

  /** Record an observation for hypothesis generation and testing. */
  observe(observation: Observation): void {
    this.db.prepare(`
      INSERT INTO observations (source, type, value, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      observation.source,
      observation.type,
      observation.value,
      observation.timestamp,
      observation.metadata ? JSON.stringify(observation.metadata) : null,
    );
  }

  /** Propose a hypothesis manually or from automated detection. */
  propose(hypothesis: Omit<Hypothesis, 'id' | 'status' | 'evidence_for' | 'evidence_against' | 'confidence' | 'p_value' | 'created_at' | 'tested_at'>): Hypothesis {
    const stmt = this.db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status)
      VALUES (?, ?, ?, ?, ?, 'proposed')
    `);
    const info = stmt.run(
      hypothesis.statement,
      hypothesis.type,
      hypothesis.source,
      JSON.stringify(hypothesis.variables),
      JSON.stringify(hypothesis.condition),
    );

    this.logger.info(`Hypothesis proposed: "${hypothesis.statement}"`);

    return this.get(Number(info.lastInsertRowid))!;
  }

  /**
   * Auto-generate hypotheses from observation patterns.
   * This is the creative part — the system forms its own theories.
   */
  generate(): Hypothesis[] {
    const generated: Hypothesis[] = [];

    // Strategy 1: Temporal patterns — "Event X happens more on certain hours"
    const temporalHypotheses = this.generateTemporalHypotheses();
    generated.push(...temporalHypotheses);

    // Strategy 2: Correlation — "When metric A is high, metric B is also high"
    const correlationHypotheses = this.generateCorrelationHypotheses();
    generated.push(...correlationHypotheses);

    // Strategy 3: Threshold — "Performance drops when metric exceeds X"
    const thresholdHypotheses = this.generateThresholdHypotheses();
    generated.push(...thresholdHypotheses);

    this.logger.info(`Generated ${generated.length} hypotheses`);
    return generated;
  }

  /**
   * Test a hypothesis against available data.
   * Returns the test result with updated status.
   */
  test(hypothesisId: number): HypothesisTestResult | null {
    const hyp = this.get(hypothesisId);
    if (!hyp) return null;

    const condition: HypothesisCondition = typeof hyp.condition === 'string'
      ? JSON.parse(hyp.condition as unknown as string)
      : hyp.condition;

    let result: { evidenceFor: number; evidenceAgainst: number; pValue: number };

    switch (condition.type) {
      case 'temporal':
        result = this.testTemporalHypothesis(hyp, condition);
        break;
      case 'correlation':
        result = this.testCorrelationHypothesis(hyp, condition);
        break;
      case 'threshold':
        result = this.testThresholdHypothesis(hyp, condition);
        break;
      case 'frequency':
        result = this.testFrequencyHypothesis(hyp, condition);
        break;
      default:
        return null;
    }

    const totalEvidence = result.evidenceFor + result.evidenceAgainst;
    const confidence = totalEvidence > 0 ? result.evidenceFor / totalEvidence : 0;

    let newStatus: HypothesisStatus = 'testing';
    if (totalEvidence >= this.minEvidence) {
      if (result.pValue < this.confirmThreshold) {
        newStatus = 'confirmed';
      } else if (result.pValue > this.rejectThreshold) {
        newStatus = 'rejected';
      } else {
        newStatus = 'inconclusive';
      }
    }

    // Update in DB
    this.db.prepare(`
      UPDATE hypotheses SET
        evidence_for = ?, evidence_against = ?,
        confidence = ?, p_value = ?, status = ?,
        tested_at = datetime('now')
      WHERE id = ?
    `).run(result.evidenceFor, result.evidenceAgainst, confidence, result.pValue, newStatus, hypothesisId);

    this.logger.info(`Hypothesis #${hypothesisId} tested: ${newStatus} (p=${result.pValue.toFixed(4)}, confidence=${confidence.toFixed(3)})`);

    return {
      hypothesisId,
      passed: newStatus === 'confirmed',
      evidenceFor: result.evidenceFor,
      evidenceAgainst: result.evidenceAgainst,
      pValue: result.pValue,
      confidence,
      newStatus,
    };
  }

  /** Test all proposed/testing hypotheses. */
  testAll(): HypothesisTestResult[] {
    const hypotheses = this.db.prepare(
      `SELECT id FROM hypotheses WHERE status IN ('proposed', 'testing')`,
    ).all() as { id: number }[];

    return hypotheses
      .map(h => this.test(h.id))
      .filter((r): r is HypothesisTestResult => r !== null);
  }

  /** Get a hypothesis by ID. */
  get(id: number): Hypothesis | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite row with JSON fields
    const row = this.db.prepare('SELECT * FROM hypotheses WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...row,
      variables: JSON.parse(row.variables),
      condition: JSON.parse(row.condition),
    };
  }

  /** List hypotheses by status. */
  list(status?: HypothesisStatus, limit = 50): Hypothesis[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite rows with JSON fields
    let rows: any[];
    if (status) {
      rows = this.db.prepare(
        'SELECT * FROM hypotheses WHERE status = ? ORDER BY confidence DESC LIMIT ?',
      ).all(status, limit);
    } else {
      rows = this.db.prepare(
        'SELECT * FROM hypotheses ORDER BY confidence DESC LIMIT ?',
      ).all(limit);
    }

    return rows.map(r => ({
      ...r,
      variables: JSON.parse(r.variables),
      condition: JSON.parse(r.condition),
    }));
  }

  /** Get summary statistics. */
  getSummary(): {
    total: number;
    proposed: number;
    testing: number;
    confirmed: number;
    rejected: number;
    inconclusive: number;
    totalObservations: number;
    topConfirmed: Hypothesis[];
  } {
    const counts = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM hypotheses GROUP BY status
    `).all() as { status: string; count: number }[];

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const { status, count } of counts) {
      statusMap[status] = count;
      total += count;
    }

    const obsCount = (this.db.prepare('SELECT COUNT(*) as c FROM observations').get() as { c: number }).c;

    const topConfirmed = this.list('confirmed', 5);

    return {
      total,
      proposed: statusMap['proposed'] ?? 0,
      testing: statusMap['testing'] ?? 0,
      confirmed: statusMap['confirmed'] ?? 0,
      rejected: statusMap['rejected'] ?? 0,
      inconclusive: statusMap['inconclusive'] ?? 0,
      totalObservations: obsCount,
      topConfirmed,
    };
  }

  // ── Creative Hypothesis Generation ──────────────

  /**
   * Generate "wild" hypotheses using creative strategies.
   * Uses LLM if available, otherwise falls back to heuristic strategies.
   */
  generateCreative(count = 3): Hypothesis[] {
    // Try LLM creative generation (fire-and-forget — results used in async version)
    if (this.llm?.isAvailable()) {
      void this.generateCreativeLLMAsync(count).catch(() => {});
    }

    // Always run heuristic version for sync compat
    return this.generateCreativeHeuristic(count);
  }

  /**
   * Async creative hypothesis generation via LLM.
   * Generates truly novel hypotheses by reasoning about the knowledge base.
   */
  async generateCreativeLLM(count = 3): Promise<Hypothesis[]> {
    if (!this.llm?.isAvailable()) return this.generateCreativeHeuristic(count);

    try {
      // Gather knowledge context
      const confirmed = this.list('confirmed', 10);
      const rejected = this.list('rejected', 5);
      const types = this.getObservationTypes();

      const context = [
        'Confirmed hypotheses:',
        ...confirmed.map(h => `- ${h.statement} (confidence: ${(h.confidence * 100).toFixed(0)}%)`),
        '',
        'Rejected hypotheses:',
        ...rejected.map(h => `- ${h.statement}`),
        '',
        'Known observation types:',
        ...types.map(t => `- ${t}`),
      ].join('\n');

      const prompt = `${context}\n\nGenerate ${count} novel, testable hypotheses. Each should explore non-obvious connections.\n\nOutput as JSON array: [{"statement": "...", "variables": ["var1", "var2"], "reasoning": "why this is interesting"}]`;

      const result = await this.llm.call('creative_hypothesis', prompt, { temperature: 0.9 });
      if (!result?.text) return this.generateCreativeHeuristic(count);

      // Parse JSON from LLM response
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return this.generateCreativeHeuristic(count);

      const hypotheses: Array<{ statement: string; variables: string[]; reasoning: string }> = JSON.parse(jsonMatch[0]);
      const generated: Hypothesis[] = [];

      for (const h of hypotheses.slice(0, count)) {
        // Check for duplicate
        const existing = this.db.prepare(
          "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
        ).get(h.statement) as { id: number } | undefined;
        if (existing) continue;

        generated.push(this.propose({
          statement: h.statement,
          type: 'creative',
          source: 'creative_llm',
          variables: h.variables || [],
          condition: { type: 'correlation', params: { strategy: 'llm', reasoning: h.reasoning } },
        }));
      }

      if (generated.length > 0) {
        this.logger.info(`Generated ${generated.length} LLM creative hypotheses`);
      }

      return generated.length > 0 ? generated : this.generateCreativeHeuristic(count);
    } catch (err) {
      this.logger.debug(`[HypothesisEngine] LLM creative failed: ${(err as Error).message}`);
      return this.generateCreativeHeuristic(count);
    }
  }

  private async generateCreativeLLMAsync(count: number): Promise<void> {
    await this.generateCreativeLLM(count);
  }

  private generateCreativeHeuristic(count = 3): Hypothesis[] {
    const generated: Hypothesis[] = [];
    const strategies = [
      () => this.creativeInversion(),
      () => this.creativeCombination(),
      () => this.creativeAnalogy(),
      () => this.creativeNegation(),
      () => this.creativeRandomWalk(),
    ];

    for (let i = 0; i < count; i++) {
      const strategy = strategies[i % strategies.length]!;
      const hypothesis = strategy();
      if (hypothesis) {
        generated.push(hypothesis);
      }
    }

    if (generated.length > 0) {
      this.logger.info(`Generated ${generated.length} creative hypotheses`);
    }

    return generated;
  }

  /** Get statistics about creative hypotheses. */
  getCreativeStats(): { total: number; confirmed: number; rejected: number; pendingRate: number } {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM hypotheses
      WHERE source LIKE 'creative_%'
      GROUP BY status
    `).all() as { status: string; count: number }[];

    let total = 0, confirmed = 0, rejected = 0, pending = 0;
    for (const { status, count } of rows) {
      total += count;
      if (status === 'confirmed') confirmed = count;
      else if (status === 'rejected') rejected = count;
      else pending += count; // proposed, testing, inconclusive
    }

    return {
      total,
      confirmed,
      rejected,
      pendingRate: total > 0 ? pending / total : 0,
    };
  }

  // ── Creative Strategies ──────────────────────────

  /**
   * Strategy 1: Inversion — take a confirmed hypothesis and invert it.
   * "What if the opposite of X is true?"
   */
  private creativeInversion(): Hypothesis | null {
    const confirmed = this.db.prepare(
      "SELECT * FROM hypotheses WHERE status = 'confirmed' ORDER BY RANDOM() LIMIT 1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite row
    ).get() as any;

    if (!confirmed) return null;

    const original = confirmed.statement as string;
    const statement = `What if the opposite is true: NOT "${original}"?`;

    // Check for duplicate
    const existing = this.db.prepare(
      "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
    ).get(statement) as { id: number } | undefined;
    if (existing) return null;

    return this.propose({
      statement,
      type: 'creative',
      source: 'creative_inversion',
      variables: JSON.parse(confirmed.variables),
      condition: { type: 'correlation', params: { strategy: 'inversion', originalId: confirmed.id } },
    });
  }

  /**
   * Strategy 2: Combination — merge 2 random confirmed hypotheses.
   * "Combined insight: X AND Y may be related"
   */
  private creativeCombination(): Hypothesis | null {
    const pair = this.db.prepare(
      "SELECT * FROM hypotheses WHERE status = 'confirmed' ORDER BY RANDOM() LIMIT 2",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite rows
    ).all() as any[];

    if (pair.length < 2) return null;

    const h1 = pair[0]!;
    const h2 = pair[1]!;
    const statement = `Combined insight: "${h1.statement}" AND "${h2.statement}" may be related`;

    const existing = this.db.prepare(
      "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
    ).get(statement) as { id: number } | undefined;
    if (existing) return null;

    const vars1 = JSON.parse(h1.variables) as string[];
    const vars2 = JSON.parse(h2.variables) as string[];
    const combinedVars = [...new Set([...vars1, ...vars2])];

    return this.propose({
      statement,
      type: 'creative',
      source: 'creative_combination',
      variables: combinedVars,
      condition: { type: 'correlation', params: { strategy: 'combination', sourceIds: [h1.id, h2.id] } },
    });
  }

  /**
   * Strategy 3: Analogy — take a pattern from one observation type and apply to another.
   * "By analogy: 'X' might also apply to Y events"
   */
  private creativeAnalogy(): Hypothesis | null {
    const confirmed = this.db.prepare(
      "SELECT * FROM hypotheses WHERE status = 'confirmed' ORDER BY RANDOM() LIMIT 1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite row
    ).get() as any;

    if (!confirmed) return null;

    const variables = JSON.parse(confirmed.variables) as string[];
    const sourceType = variables[0] || 'unknown';

    // Find a different observation type
    const otherTypes = this.db.prepare(
      'SELECT DISTINCT type FROM observations WHERE type != ? ORDER BY RANDOM() LIMIT 1',
    ).get(sourceType) as { type: string } | undefined;

    const targetType = otherTypes?.type || 'other_domain';
    const statement = `By analogy: "${confirmed.statement}" might also apply to ${targetType} events`;

    const existing = this.db.prepare(
      "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
    ).get(statement) as { id: number } | undefined;
    if (existing) return null;

    return this.propose({
      statement,
      type: 'creative',
      source: 'creative_analogy',
      variables: [sourceType, targetType],
      condition: { type: 'correlation', params: { strategy: 'analogy', originalId: confirmed.id, targetType } },
    });
  }

  /**
   * Strategy 4: Negation — pick a principle-like confirmed hypothesis and negate it.
   * "What if [established principle] is wrong?"
   */
  private creativeNegation(): Hypothesis | null {
    const principle = this.db.prepare(
      "SELECT * FROM hypotheses WHERE status = 'confirmed' AND confidence > 0.7 ORDER BY RANDOM() LIMIT 1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite row
    ).get() as any;

    if (!principle) return null;

    const statement = `What if "${principle.statement}" is actually wrong?`;

    const existing = this.db.prepare(
      "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
    ).get(statement) as { id: number } | undefined;
    if (existing) return null;

    return this.propose({
      statement,
      type: 'creative',
      source: 'creative_negation',
      variables: JSON.parse(principle.variables),
      condition: { type: 'correlation', params: { strategy: 'negation', originalId: principle.id } },
    });
  }

  /**
   * Strategy 5: Random Walk — connect two random unrelated observations.
   * "There might be a hidden connection between X and Y"
   */
  private creativeRandomWalk(): Hypothesis | null {
    const observations = this.db.prepare(
      'SELECT DISTINCT type FROM observations ORDER BY RANDOM() LIMIT 2',
    ).all() as { type: string }[];

    if (observations.length < 2) return null;

    const typeA = observations[0]!.type;
    const typeB = observations[1]!.type;
    const statement = `There might be a hidden connection between "${typeA}" and "${typeB}" events`;

    const existing = this.db.prepare(
      "SELECT id FROM hypotheses WHERE statement = ? AND status != 'rejected'",
    ).get(statement) as { id: number } | undefined;
    if (existing) return null;

    return this.propose({
      statement,
      type: 'creative',
      source: 'creative_random_walk',
      variables: [typeA, typeB],
      condition: { type: 'correlation', params: { strategy: 'random_walk', typeA, typeB } },
    });
  }

  // ── Hypothesis Generation Strategies ──────────────

  private generateTemporalHypotheses(): Hypothesis[] {
    const results: Hypothesis[] = [];
    const types = this.getObservationTypes();

    for (const type of types) {
      // Check if there's a time-of-day pattern
      const hourCounts = this.db.prepare(`
        SELECT (timestamp / 3600000) % 24 as hour, COUNT(*) as count
        FROM observations WHERE type = ?
        GROUP BY hour HAVING count >= 3
        ORDER BY count DESC LIMIT 1
      `).get(type) as { hour: number; count: number } | undefined;

      if (!hourCounts) continue;

      const totalCount = (this.db.prepare(
        'SELECT COUNT(*) as c FROM observations WHERE type = ?',
      ).get(type) as { c: number }).c;

      // If peak hour has > 2x average, propose a hypothesis
      const avgPerHour = totalCount / 24;
      if (hourCounts.count > avgPerHour * 2) {
        const existing = this.db.prepare(
          `SELECT id FROM hypotheses WHERE type = 'temporal' AND variables LIKE ? AND status != 'rejected'`,
        ).get(`%"${type}"%`) as { id: number } | undefined;

        if (!existing) {
          results.push(this.propose({
            statement: `"${type}" events occur disproportionately around hour ${hourCounts.hour}:00 UTC`,
            type: 'temporal',
            source: 'hypothesis-engine',
            variables: [type],
            condition: {
              type: 'temporal',
              params: { eventType: type, peakHour: hourCounts.hour, expectedRatio: hourCounts.count / avgPerHour },
            },
          }));
        }
      }
    }

    return results;
  }

  private generateCorrelationHypotheses(): Hypothesis[] {
    const results: Hypothesis[] = [];
    const types = this.getObservationTypes();

    // Check pairwise correlations between observation types
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const typeA = types[i]!;
        const typeB = types[j]!;

        // Simple correlation: count co-occurrences within 1 minute windows
        const coOccurrences = (this.db.prepare(`
          SELECT COUNT(*) as count FROM observations a
          INNER JOIN observations b ON b.type = ? AND ABS(a.timestamp - b.timestamp) < 60000
          WHERE a.type = ?
        `).get(typeB, typeA) as { count: number }).count;

        const countA = (this.db.prepare('SELECT COUNT(*) as c FROM observations WHERE type = ?').get(typeA) as { c: number }).c;

        if (countA > 0 && coOccurrences / countA > 0.3) {
          const existing = this.db.prepare(
            `SELECT id FROM hypotheses WHERE type = 'correlation' AND variables LIKE ? AND variables LIKE ? AND status != 'rejected'`,
          ).get(`%"${typeA}"%`, `%"${typeB}"%`) as { id: number } | undefined;

          if (!existing) {
            results.push(this.propose({
              statement: `"${typeA}" and "${typeB}" events tend to occur together (co-occurrence rate: ${(coOccurrences / countA * 100).toFixed(0)}%)`,
              type: 'correlation',
              source: 'hypothesis-engine',
              variables: [typeA, typeB],
              condition: {
                type: 'correlation',
                params: { typeA, typeB, windowMs: 60_000, observedRate: coOccurrences / countA },
              },
            }));
          }
        }
      }
    }

    return results;
  }

  private generateThresholdHypotheses(): Hypothesis[] {
    const results: Hypothesis[] = [];
    const types = this.getObservationTypes();

    for (const type of types) {
      // Look for value distributions with clear thresholds
      const stats = this.db.prepare(`
        SELECT AVG(value) as avg, MAX(value) as max, MIN(value) as min,
               COUNT(*) as count
        FROM observations WHERE type = ?
      `).get(type) as { avg: number; max: number; min: number; count: number };

      if (stats.count < 10) continue;

      // Check if high values correlate with other events
      const threshold = stats.avg + (stats.max - stats.avg) * 0.5;
      const highCount = (this.db.prepare(
        'SELECT COUNT(*) as c FROM observations WHERE type = ? AND value > ?',
      ).get(type, threshold) as { c: number }).c;

      if (highCount >= 3 && highCount < stats.count * 0.3) {
        const existing = this.db.prepare(
          `SELECT id FROM hypotheses WHERE type = 'threshold' AND variables LIKE ? AND status != 'rejected'`,
        ).get(`%"${type}"%`) as { id: number } | undefined;

        if (!existing) {
          results.push(this.propose({
            statement: `"${type}" shows anomalous behavior when value exceeds ${threshold.toFixed(2)} (affects ${(highCount / stats.count * 100).toFixed(0)}% of observations)`,
            type: 'threshold',
            source: 'hypothesis-engine',
            variables: [type],
            condition: {
              type: 'threshold',
              params: { eventType: type, threshold, aboveCount: highCount, totalCount: stats.count },
            },
          }));
        }
      }
    }

    return results;
  }

  // ── Hypothesis Testing ────────────────────────────

  private testTemporalHypothesis(hyp: Hypothesis, condition: HypothesisCondition): { evidenceFor: number; evidenceAgainst: number; pValue: number } {
    const { eventType, peakHour } = condition.params as { eventType: string; peakHour: number };

    const total = (this.db.prepare('SELECT COUNT(*) as c FROM observations WHERE type = ?').get(eventType) as { c: number }).c;
    const inPeak = (this.db.prepare(
      'SELECT COUNT(*) as c FROM observations WHERE type = ? AND (timestamp / 3600000) % 24 = ?',
    ).get(eventType, peakHour) as { c: number }).c;

    const expected = total / 24;
    const evidenceFor = inPeak;
    const evidenceAgainst = Math.max(0, Math.round(expected) - inPeak);

    // Chi-squared test approximation (1 degree of freedom)
    const chiSq = expected > 0 ? Math.pow(inPeak - expected, 2) / expected : 0;
    const pValue = Math.exp(-chiSq / 2); // rough p-value approximation

    return { evidenceFor, evidenceAgainst, pValue };
  }

  private testCorrelationHypothesis(hyp: Hypothesis, condition: HypothesisCondition): { evidenceFor: number; evidenceAgainst: number; pValue: number } {
    const { typeA, typeB, windowMs } = condition.params as { typeA: string; typeB: string; windowMs: number };

    const coOccurrences = (this.db.prepare(`
      SELECT COUNT(*) as count FROM observations a
      INNER JOIN observations b ON b.type = ? AND ABS(a.timestamp - b.timestamp) < ?
      WHERE a.type = ?
    `).get(typeB, windowMs, typeA) as { count: number }).count;

    const countA = (this.db.prepare('SELECT COUNT(*) as c FROM observations WHERE type = ?').get(typeA) as { c: number }).c;
    const countB = (this.db.prepare('SELECT COUNT(*) as c FROM observations WHERE type = ?').get(typeB) as { c: number }).c;

    if (countA === 0 || countB === 0) return { evidenceFor: 0, evidenceAgainst: 0, pValue: 1 };

    const observedRate = coOccurrences / countA;
    // Expected rate under independence
    const timeRange = this.getObservationTimeRange();
    const expectedRate = timeRange > 0 ? Math.min(1, (countB / timeRange) * windowMs * 2) : 0;

    const evidenceFor = coOccurrences;
    const evidenceAgainst = Math.max(0, countA - coOccurrences);

    // Simplified z-test for proportions
    if (expectedRate <= 0 || expectedRate >= 1) return { evidenceFor, evidenceAgainst, pValue: 1 };
    const z = (observedRate - expectedRate) / Math.sqrt(expectedRate * (1 - expectedRate) / countA);
    const pValue = Math.exp(-0.5 * z * z); // rough p-value

    return { evidenceFor, evidenceAgainst, pValue: Math.min(1, pValue) };
  }

  private testThresholdHypothesis(hyp: Hypothesis, condition: HypothesisCondition): { evidenceFor: number; evidenceAgainst: number; pValue: number } {
    const { eventType, threshold } = condition.params as { eventType: string; threshold: number };

    const above = (this.db.prepare(
      'SELECT COUNT(*) as c FROM observations WHERE type = ? AND value > ?',
    ).get(eventType, threshold) as { c: number }).c;

    const total = (this.db.prepare(
      'SELECT COUNT(*) as c FROM observations WHERE type = ?',
    ).get(eventType) as { c: number }).c;

    const below = total - above;

    // Test: is the proportion above threshold significantly different from random?
    const proportion = total > 0 ? above / total : 0;
    // Under null hypothesis, threshold splits data randomly
    const expectedProportion = 0.5;
    const z = total > 0
      ? (proportion - expectedProportion) / Math.sqrt(expectedProportion * (1 - expectedProportion) / total)
      : 0;

    // We care about the threshold being meaningful, so evidence is relative
    const pValue = Math.exp(-0.5 * z * z);

    return { evidenceFor: above, evidenceAgainst: below, pValue: Math.min(1, pValue) };
  }

  private testFrequencyHypothesis(_hyp: Hypothesis, _condition: HypothesisCondition): { evidenceFor: number; evidenceAgainst: number; pValue: number } {
    // Placeholder for frequency/periodicity testing
    return { evidenceFor: 0, evidenceAgainst: 0, pValue: 1 };
  }

  // ── Helpers ───────────────────────────────────────

  private getObservationTypes(): string[] {
    return (this.db.prepare('SELECT DISTINCT type FROM observations').all() as { type: string }[]).map(r => r.type);
  }

  private getObservationTimeRange(): number {
    const row = this.db.prepare(
      'SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM observations',
    ).get() as { min_ts: number | null; max_ts: number | null };
    return (row.max_ts ?? 0) - (row.min_ts ?? 0);
  }
}
