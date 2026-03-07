import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface CausalEvent {
  source: string;       // which brain
  type: string;         // event type (e.g. 'error:reported')
  timestamp: number;    // epoch ms
  data?: unknown;
}

export interface CausalEdge {
  id?: number;
  cause: string;        // event type that causes
  effect: string;       // event type that is caused
  strength: number;     // 0-1, how strong the causal relationship
  confidence: number;   // 0-1, statistical confidence
  lag_ms: number;       // average time lag between cause and effect
  sample_size: number;  // how many observations
  direction: number;    // +1 cause increases effect, -1 cause decreases effect
}

export interface CausalPath {
  chain: string[];      // event types forming a causal chain
  totalStrength: number;
  totalLag: number;
}

export interface CausalAnalysis {
  edges: CausalEdge[];
  roots: string[];      // events that cause others but are not caused
  leaves: string[];     // events that are caused but don't cause others
  strongestChain: CausalPath | null;
  interventionsCount: number;
}

export interface CausalIntervention {
  id?: number;
  cause: string;
  effect: string;
  interventionType: string;
  expectedDirection: string;
  actualDirection: string | null;
  confounders: string[];
  validated: boolean;
  timestamp: string;
}

export interface StrengthEvolution {
  cause: string;
  effect: string;
  dataPoints: Array<{ timestamp: string; strength: number; confidence: number }>;
}

// ── Migration ───────────────────────────────────────────

export function runCausalMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS causal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS causal_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cause TEXT NOT NULL,
      effect TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      lag_ms REAL NOT NULL DEFAULT 0,
      sample_size INTEGER NOT NULL DEFAULT 0,
      direction REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(cause, effect)
    );

    CREATE INDEX IF NOT EXISTS idx_causal_events_type ON causal_events(type);
    CREATE INDEX IF NOT EXISTS idx_causal_events_timestamp ON causal_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_causal_edges_strength ON causal_edges(strength DESC);

    CREATE TABLE IF NOT EXISTS causal_interventions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cause TEXT NOT NULL,
      effect TEXT NOT NULL,
      intervention_type TEXT NOT NULL DEFAULT 'manual',
      expected_direction TEXT NOT NULL DEFAULT 'increase',
      actual_direction TEXT DEFAULT NULL,
      confounders TEXT NOT NULL DEFAULT '[]',
      validated INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_causal_interventions_cause ON causal_interventions(cause, effect);
  `);
}

// ── Engine ───────────────────────────────────────────────

/**
 * Causal Inference Engine: detects cause→effect relationships between events.
 *
 * Research approach: Simplified Granger Causality.
 *
 * Granger causality asks: "Does knowing that event A happened improve
 * our ability to predict event B?" If yes, A Granger-causes B.
 *
 * Algorithm:
 * 1. Record all events with timestamps
 * 2. For each pair of event types (A, B):
 *    a. Count how often B occurs within a time window after A
 *    b. Compare this to the baseline rate of B
 *    c. If B is significantly more likely after A → A causes B
 * 3. Build a directed graph of causal relationships
 * 4. Detect causal chains (A → B → C)
 */
export class CausalGraph {
  private logger = getLogger();
  private maxWindowMs: number;      // max time lag to consider
  private minSamples: number;       // minimum observations for significance
  private significanceThreshold: number; // minimum ratio to baseline for significance

  constructor(
    private db: Database.Database,
    config?: { maxWindowMs?: number; minSamples?: number; significanceThreshold?: number },
  ) {
    runCausalMigration(db);
    this.maxWindowMs = config?.maxWindowMs ?? 300_000;      // 5 minutes
    this.minSamples = config?.minSamples ?? 5;
    this.significanceThreshold = config?.significanceThreshold ?? 1.5; // 50% above baseline
  }

  /** Record an event for causal analysis. */
  recordEvent(source: string, type: string, data?: unknown): void {
    this.db.prepare(`
      INSERT INTO causal_events (source, type, timestamp, data)
      VALUES (?, ?, ?, ?)
    `).run(source, type, Date.now(), data ? JSON.stringify(data) : null);
  }

  /**
   * Run Granger causality analysis on all event pairs.
   * This is the core research algorithm.
   */
  analyze(): CausalEdge[] {
    const eventTypes = this.getEventTypes();
    if (eventTypes.length < 2) return [];

    const edges: CausalEdge[] = [];

    // For each pair of event types, test for Granger causality
    for (const cause of eventTypes) {
      for (const effect of eventTypes) {
        if (cause === effect) continue;

        const edge = this.testGrangerCausality(cause, effect);
        if (edge) {
          this.upsertEdge(edge);
          edges.push(edge);
        }
      }
    }

    this.logger.info(`Causal analysis complete: ${edges.length} causal relationships detected`);
    return edges;
  }

  /**
   * Test if event type A Granger-causes event type B.
   *
   * Algorithm:
   * 1. Get all timestamps for A and B
   * 2. For each occurrence of A, check if B occurs within the window after
   * 3. Calculate: P(B after A) vs P(B in any random window)
   * 4. If ratio > threshold → A Granger-causes B
   */
  private testGrangerCausality(causeType: string, effectType: string): CausalEdge | null {
    const causeEvents = this.db.prepare(
      'SELECT timestamp FROM causal_events WHERE type = ? ORDER BY timestamp',
    ).all(causeType) as { timestamp: number }[];

    const effectEvents = this.db.prepare(
      'SELECT timestamp FROM causal_events WHERE type = ? ORDER BY timestamp',
    ).all(effectType) as { timestamp: number }[];

    if (causeEvents.length < this.minSamples || effectEvents.length < this.minSamples) {
      return null;
    }

    // Calculate: how often does effectType occur within maxWindowMs after causeType?
    let followCount = 0;
    let totalLag = 0;

    for (const cause of causeEvents) {
      // Find the first effect event within the window
      for (const effect of effectEvents) {
        const lag = effect.timestamp - cause.timestamp;
        if (lag > 0 && lag <= this.maxWindowMs) {
          followCount++;
          totalLag += lag;
          break; // only count first occurrence per cause event
        }
        if (lag > this.maxWindowMs) break; // past window, stop looking
      }
    }

    if (followCount < this.minSamples) return null;

    // P(effect follows cause) = followCount / causeEvents.length
    const pFollows = followCount / causeEvents.length;

    // Baseline: P(effect in any random window of same size)
    // Estimate: total effect events / total time * window size
    const timeRange = this.getTimeRange();
    if (timeRange <= 0) return null;

    const baselineRate = (effectEvents.length / timeRange) * this.maxWindowMs;
    const pBaseline = Math.min(1, baselineRate);

    // Significance: is the conditional probability significantly higher than baseline?
    if (pBaseline <= 0) return null;
    const ratio = pFollows / pBaseline;

    if (ratio < this.significanceThreshold) return null;

    // Calculate strength (0-1 normalized)
    const strength = Math.min(1, (ratio - 1) / (this.significanceThreshold * 2));

    // Confidence based on sample size (logistic curve, plateaus around 20 samples)
    const confidence = 1 - 1 / (1 + followCount / 10);

    // Average lag
    const avgLag = followCount > 0 ? totalLag / followCount : 0;

    return {
      cause: causeType,
      effect: effectType,
      strength,
      confidence,
      lag_ms: avgLag,
      sample_size: followCount,
      direction: 1, // cause increases likelihood of effect
    };
  }

  /** Get all detected causal edges (strongest first). */
  getEdges(minStrength = 0): CausalEdge[] {
    return this.db.prepare(
      'SELECT * FROM causal_edges WHERE strength >= ? ORDER BY strength DESC',
    ).all(minStrength) as CausalEdge[];
  }

  /** Get causes of a specific event type. */
  getCauses(eventType: string): CausalEdge[] {
    return this.db.prepare(
      'SELECT * FROM causal_edges WHERE effect = ? ORDER BY strength DESC',
    ).all(eventType) as CausalEdge[];
  }

  /** Get effects of a specific event type. */
  getEffects(eventType: string): CausalEdge[] {
    return this.db.prepare(
      'SELECT * FROM causal_edges WHERE cause = ? ORDER BY strength DESC',
    ).all(eventType) as CausalEdge[];
  }

  /** Find causal chains (A → B → C). */
  findChains(maxDepth = 4): CausalPath[] {
    const edges = this.getEdges(0.1);
    const adjacency = new Map<string, CausalEdge[]>();

    for (const edge of edges) {
      if (!adjacency.has(edge.cause)) adjacency.set(edge.cause, []);
      adjacency.get(edge.cause)!.push(edge);
    }

    const chains: CausalPath[] = [];
    const roots = this.findRoots(edges);

    for (const root of roots) {
      this.dfs(root, [root], 0, 0, adjacency, maxDepth, new Set(), chains);
    }

    // Sort by total strength descending
    chains.sort((a, b) => b.totalStrength - a.totalStrength);
    return chains.slice(0, 20); // top 20 chains
  }

  /** Full causal analysis including graph structure. */
  getAnalysis(): CausalAnalysis {
    const edges = this.getEdges();
    const roots = this.findRoots(edges);
    const leaves = this.findLeaves(edges);
    const chains = this.findChains();
    const interventionsCount = (this.db.prepare(
      'SELECT COUNT(*) as cnt FROM causal_interventions',
    ).get() as { cnt: number }).cnt;

    return {
      edges,
      roots,
      leaves,
      strongestChain: chains.length > 0 ? chains[0]! : null,
      interventionsCount,
    };
  }

  /** Get event type statistics. */
  getEventStats(): Array<{ type: string; count: number; first_seen: number; last_seen: number }> {
    return this.db.prepare(`
      SELECT type, COUNT(*) as count,
             MIN(timestamp) as first_seen,
             MAX(timestamp) as last_seen
      FROM causal_events
      GROUP BY type
      ORDER BY count DESC
    `).all() as Array<{ type: string; count: number; first_seen: string; last_seen: string }>;
  }

  // ── Confounder & Intervention Methods ──────────────

  /**
   * Detect confounders for a cause→effect pair.
   * A confounder is any node C where C→cause AND C→effect edges exist (shared parent).
   */
  detectConfounders(cause: string, effect: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT e1.cause AS confounder
      FROM causal_edges e1
      JOIN causal_edges e2 ON e1.cause = e2.cause
      WHERE e1.effect = ? AND e2.effect = ? AND e1.cause != ? AND e1.cause != ?
    `).all(cause, effect, cause, effect) as Array<{ confounder: string }>;
    return rows.map(r => r.confounder);
  }

  /**
   * Track how the causal strength between two event types evolved over time.
   * Splits recent events by day, runs Granger test on each day's subset.
   */
  trackStrengthEvolution(cause: string, effect: string, windowDays = 7): StrengthEvolution {
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - windowMs;

    const causeEvents = this.db.prepare(
      'SELECT timestamp FROM causal_events WHERE type = ? AND timestamp >= ? ORDER BY timestamp',
    ).all(cause, cutoff) as Array<{ timestamp: number }>;

    const effectEvents = this.db.prepare(
      'SELECT timestamp FROM causal_events WHERE type = ? AND timestamp >= ? ORDER BY timestamp',
    ).all(effect, cutoff) as Array<{ timestamp: number }>;

    // Group by day
    const dayMs = 24 * 60 * 60 * 1000;
    const dayBuckets = new Map<number, { causes: Array<{ timestamp: number }>; effects: Array<{ timestamp: number }> }>();

    for (const ev of causeEvents) {
      const day = Math.floor(ev.timestamp / dayMs);
      if (!dayBuckets.has(day)) dayBuckets.set(day, { causes: [], effects: [] });
      dayBuckets.get(day)!.causes.push(ev);
    }
    for (const ev of effectEvents) {
      const day = Math.floor(ev.timestamp / dayMs);
      if (!dayBuckets.has(day)) dayBuckets.set(day, { causes: [], effects: [] });
      dayBuckets.get(day)!.effects.push(ev);
    }

    const dataPoints: Array<{ timestamp: string; strength: number; confidence: number }> = [];
    const sortedDays = [...dayBuckets.keys()].sort((a, b) => a - b);

    for (const day of sortedDays) {
      const bucket = dayBuckets.get(day)!;
      if (bucket.causes.length < 2 || bucket.effects.length < 2) continue;

      // Simple follow-count analysis per day
      let followCount = 0;
      for (const c of bucket.causes) {
        for (const e of bucket.effects) {
          const lag = e.timestamp - c.timestamp;
          if (lag > 0 && lag <= this.maxWindowMs) {
            followCount++;
            break;
          }
          if (lag > this.maxWindowMs) break;
        }
      }

      const strength = bucket.causes.length > 0 ? followCount / bucket.causes.length : 0;
      const confidence = 1 - 1 / (1 + followCount / 5);
      const ts = new Date(day * dayMs).toISOString();
      dataPoints.push({ timestamp: ts, strength, confidence });
    }

    return { cause, effect, dataPoints };
  }

  /**
   * Validate a causal chain: checks if each consecutive pair still has a significant edge.
   * Returns which links are weak or missing.
   */
  validateChain(chain: string[]): { valid: boolean; weakLinks: string[] } {
    const weakLinks: string[] = [];

    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i]!;
      const to = chain[i + 1]!;

      const edge = this.db.prepare(
        'SELECT strength, confidence FROM causal_edges WHERE cause = ? AND effect = ?',
      ).get(from, to) as { strength: number; confidence: number } | undefined;

      if (!edge || edge.strength < 0.1 || edge.confidence < 0.3) {
        weakLinks.push(`${from} → ${to}`);
      }
    }

    return { valid: weakLinks.length === 0, weakLinks };
  }

  /**
   * Record an intervention: a deliberate change to test a causal relationship.
   * Confounders are auto-detected from the causal graph.
   */
  recordIntervention(
    cause: string,
    effect: string,
    expectedDirection: string,
    actualDirection: string | null,
  ): CausalIntervention {
    const confounders = this.detectConfounders(cause, effect);
    const validated = actualDirection !== null && actualDirection === expectedDirection;

    const result = this.db.prepare(`
      INSERT INTO causal_interventions (cause, effect, intervention_type, expected_direction, actual_direction, confounders, validated)
      VALUES (?, ?, 'manual', ?, ?, ?, ?)
    `).run(cause, effect, expectedDirection, actualDirection, JSON.stringify(confounders), validated ? 1 : 0);

    this.logger.info(`[CausalGraph] Intervention recorded: ${cause} → ${effect} (expected=${expectedDirection}, actual=${actualDirection})`);

    return {
      id: Number(result.lastInsertRowid),
      cause,
      effect,
      interventionType: 'manual',
      expectedDirection,
      actualDirection,
      confounders,
      validated,
      timestamp: new Date().toISOString(),
    };
  }

  /** Get recent intervention history. */
  getInterventionHistory(limit = 20): CausalIntervention[] {
    const rows = this.db.prepare(
      'SELECT * FROM causal_interventions ORDER BY id DESC LIMIT ?',
    ).all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.toIntervention(r));
  }

  // ── Private helpers ─────────────────────────────────

  private toIntervention(row: Record<string, unknown>): CausalIntervention {
    let confounders: string[] = [];
    try { confounders = JSON.parse((row.confounders as string) || '[]'); } catch { /* ignore */ }
    return {
      id: row.id as number,
      cause: row.cause as string,
      effect: row.effect as string,
      interventionType: row.intervention_type as string,
      expectedDirection: row.expected_direction as string,
      actualDirection: (row.actual_direction as string) ?? null,
      confounders,
      validated: (row.validated as number) === 1,
      timestamp: row.timestamp as string,
    };
  }

  private getEventTypes(): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT type FROM causal_events',
    ).all() as { type: string }[];
    return rows.map(r => r.type);
  }

  private getTimeRange(): number {
    const row = this.db.prepare(
      'SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM causal_events',
    ).get() as { min_ts: number | null; max_ts: number | null };
    if (!row.min_ts || !row.max_ts) return 0;
    return row.max_ts - row.min_ts;
  }

  private upsertEdge(edge: CausalEdge): void {
    this.db.prepare(`
      INSERT INTO causal_edges (cause, effect, strength, confidence, lag_ms, sample_size, direction)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cause, effect) DO UPDATE SET
        strength = ?, confidence = ?, lag_ms = ?, sample_size = ?, direction = ?,
        updated_at = datetime('now')
    `).run(
      edge.cause, edge.effect, edge.strength, edge.confidence, edge.lag_ms, edge.sample_size, edge.direction,
      edge.strength, edge.confidence, edge.lag_ms, edge.sample_size, edge.direction,
    );
  }

  private findRoots(edges: CausalEdge[]): string[] {
    const causes = new Set(edges.map(e => e.cause));
    const effects = new Set(edges.map(e => e.effect));
    return [...causes].filter(c => !effects.has(c));
  }

  private findLeaves(edges: CausalEdge[]): string[] {
    const causes = new Set(edges.map(e => e.cause));
    const effects = new Set(edges.map(e => e.effect));
    return [...effects].filter(e => !causes.has(e));
  }

  private dfs(
    node: string,
    path: string[],
    totalStrength: number,
    totalLag: number,
    adjacency: Map<string, CausalEdge[]>,
    maxDepth: number,
    visited: Set<string>,
    results: CausalPath[],
  ): void {
    if (path.length >= 3) {
      // Record any path of length 3+ as a chain
      results.push({
        chain: [...path],
        totalStrength: totalStrength / (path.length - 1), // average strength
        totalLag,
      });
    }

    if (path.length >= maxDepth) return;

    const neighbors = adjacency.get(node) ?? [];
    for (const edge of neighbors) {
      if (visited.has(edge.effect)) continue;
      visited.add(edge.effect);
      path.push(edge.effect);
      this.dfs(
        edge.effect, path,
        totalStrength + edge.strength,
        totalLag + edge.lag_ms,
        adjacency, maxDepth, visited, results,
      );
      path.pop();
      visited.delete(edge.effect);
    }
  }
}
