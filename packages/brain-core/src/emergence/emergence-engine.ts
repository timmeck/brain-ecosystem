import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { ResearchJournal } from '../research/journal.js';
import type { AnomalyDetective } from '../research/anomaly-detective.js';
import type { ExperimentEngine } from '../research/experiment-engine.js';
import type { CuriosityEngine } from '../curiosity/curiosity-engine.js';

// ── Types ───────────────────────────────────────────────

export interface EmergenceEngineConfig {
  brainName: string;
  /** Minimum surprise score to record an emergence event. Default: 0.5 */
  surpriseThreshold?: number;
  /** Metrics snapshot interval in cycles. Default: 5 */
  metricsEvery?: number;
}

export interface EmergenceDataSources {
  knowledgeDistiller?: KnowledgeDistiller;
  hypothesisEngine?: HypothesisEngine;
  journal?: ResearchJournal;
  anomalyDetective?: AnomalyDetective;
  experimentEngine?: ExperimentEngine;
  curiosityEngine?: CuriosityEngine;
  /** Function that returns synapse network stats from the brain's DB. */
  getNetworkStats?: () => NetworkSnapshot;
}

export interface EmergenceEvent {
  id?: number;
  timestamp: string;
  type: EmergenceType;
  title: string;
  description: string;
  surpriseScore: number;
  evidence: string[];
  sourceEngine: string;
  wasPredicted: boolean;
  relatedPrinciples: string[];
}

export type EmergenceType =
  | 'unpredicted_pattern'     // Statistically significant pattern not in any rule
  | 'spontaneous_hypothesis'  // Hypothesis confirmed that contradicts prior knowledge
  | 'cross_domain_bridge'     // Unexpected connection between domains
  | 'phase_transition'        // Sudden qualitative change in system behavior
  | 'self_organization'       // System spontaneously organizing without explicit rules
  | 'novel_behavior';         // Behavior not traceable to any single component

export interface ComplexityMetrics {
  timestamp: string;
  /** Approximate Kolmogorov complexity via compression ratio (0-1, higher = more complex). */
  compressionComplexity: number;
  /** Shannon entropy over knowledge categories (bits). */
  knowledgeEntropy: number;
  /** Network density: synapses / (nodes * (nodes-1)). */
  networkDensity: number;
  /** Total synapse count. */
  synapseCount: number;
  /** Total node count. */
  nodeCount: number;
  /** Average synapse weight. */
  avgWeight: number;
  /** Diversity: unique categories / total items. */
  knowledgeDiversity: number;
  /** Integration proxy (Phi): how interconnected is the knowledge? */
  integrationPhi: number;
  /** Cycle number when measured. */
  cycle: number;
}

export interface NetworkSnapshot {
  totalNodes: number;
  totalSynapses: number;
  avgWeight: number;
  nodesByType: Record<string, number>;
}

export interface EmergenceStatus {
  totalEvents: number;
  eventsByType: Record<string, number>;
  unpredictedCount: number;
  avgSurpriseScore: number;
  latestMetrics: ComplexityMetrics | null;
  metricsTrend: Array<{ cycle: number; compressionComplexity: number; integrationPhi: number; knowledgeEntropy: number }>;
  topEvents: EmergenceEvent[];
  uptime: number;
}

// ── Migration ───────────────────────────────────────────

export function runEmergenceMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emergence_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      surprise_score REAL NOT NULL DEFAULT 0,
      evidence TEXT NOT NULL DEFAULT '[]',
      source_engine TEXT NOT NULL DEFAULT '',
      was_predicted INTEGER NOT NULL DEFAULT 0,
      related_principles TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_emergence_events_type ON emergence_events(type);
    CREATE INDEX IF NOT EXISTS idx_emergence_events_surprise ON emergence_events(surprise_score DESC);

    CREATE TABLE IF NOT EXISTS emergence_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      compression_complexity REAL NOT NULL DEFAULT 0,
      knowledge_entropy REAL NOT NULL DEFAULT 0,
      network_density REAL NOT NULL DEFAULT 0,
      synapse_count INTEGER NOT NULL DEFAULT 0,
      node_count INTEGER NOT NULL DEFAULT 0,
      avg_weight REAL NOT NULL DEFAULT 0,
      knowledge_diversity REAL NOT NULL DEFAULT 0,
      integration_phi REAL NOT NULL DEFAULT 0,
      cycle INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_emergence_metrics_cycle ON emergence_metrics(cycle);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class EmergenceEngine {
  private readonly db: Database.Database;
  private readonly config: Required<EmergenceEngineConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: EmergenceDataSources = {};
  private startTime = Date.now();
  private cycleCount = 0;

  // Prepared statements
  private readonly stmtInsertEvent: Database.Statement;
  private readonly stmtListEvents: Database.Statement;
  private readonly stmtEventsByType: Database.Statement;
  private readonly stmtTotalEvents: Database.Statement;
  private readonly stmtUnpredictedCount: Database.Statement;
  private readonly stmtAvgSurprise: Database.Statement;
  private readonly stmtInsertMetrics: Database.Statement;
  private readonly stmtLatestMetrics: Database.Statement;
  private readonly stmtMetricsTrend: Database.Statement;

  constructor(db: Database.Database, config: EmergenceEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      surpriseThreshold: config.surpriseThreshold ?? 0.5,
      metricsEvery: config.metricsEvery ?? 5,
    };

    runEmergenceMigration(db);

    this.stmtInsertEvent = db.prepare(`
      INSERT INTO emergence_events (type, title, description, surprise_score, evidence, source_engine, was_predicted, related_principles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtListEvents = db.prepare('SELECT * FROM emergence_events ORDER BY surprise_score DESC LIMIT ?');
    this.stmtEventsByType = db.prepare('SELECT type, COUNT(*) as cnt FROM emergence_events GROUP BY type');
    this.stmtTotalEvents = db.prepare('SELECT COUNT(*) as cnt FROM emergence_events');
    this.stmtUnpredictedCount = db.prepare('SELECT COUNT(*) as cnt FROM emergence_events WHERE was_predicted = 0');
    this.stmtAvgSurprise = db.prepare('SELECT AVG(surprise_score) as avg FROM emergence_events');
    this.stmtInsertMetrics = db.prepare(`
      INSERT INTO emergence_metrics (compression_complexity, knowledge_entropy, network_density,
        synapse_count, node_count, avg_weight, knowledge_diversity, integration_phi, cycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtLatestMetrics = db.prepare('SELECT * FROM emergence_metrics ORDER BY cycle DESC LIMIT 1');
    this.stmtMetricsTrend = db.prepare('SELECT cycle, compression_complexity, integration_phi, knowledge_entropy FROM emergence_metrics ORDER BY cycle DESC LIMIT ?');

    this.log.debug(`[EmergenceEngine] Initialized for ${this.config.brainName}`);
  }

  // ── Setters ──────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }

  setDataSources(sources: EmergenceDataSources): void {
    this.sources = sources;
  }

  // ── Core: Emergence Detection ─────────────────────────

  /**
   * Scan for emergent patterns — things the system discovered
   * that weren't explicitly programmed or predicted.
   */
  detect(): EmergenceEvent[] {
    this.cycleCount++;
    this.ts?.emit('emergence', 'exploring', 'Scanning for emergent patterns...', 'routine');

    const events: EmergenceEvent[] = [];

    // 1. Unpredicted confirmed hypotheses
    events.push(...this.detectUnpredictedHypotheses());

    // 2. Anomaly patterns that repeat without rules
    events.push(...this.detectRecurringAnomalies());

    // 3. Cross-domain bridges (unexpected connections)
    events.push(...this.detectCrossDomainBridges());

    // 4. Phase transitions (sudden metric shifts)
    events.push(...this.detectPhaseTransitions());

    // 5. Novel experiment results
    events.push(...this.detectNovelExperiments());

    // Filter by surprise threshold and deduplicate
    const significant = events.filter(e => e.surpriseScore >= this.config.surpriseThreshold);
    const deduped = this.deduplicateEvents(significant);

    // Persist new events
    for (const e of deduped) {
      const info = this.stmtInsertEvent.run(
        e.type, e.title, e.description, e.surpriseScore,
        JSON.stringify(e.evidence), e.sourceEngine,
        e.wasPredicted ? 1 : 0, JSON.stringify(e.relatedPrinciples),
      );
      e.id = Number(info.lastInsertRowid);
    }

    if (deduped.length > 0) {
      const best = deduped[0];
      this.ts?.emit('emergence', 'discovering',
        `${deduped.length} emergent event(s)! Top: "${best.title}" (surprise=${(best.surpriseScore * 100).toFixed(0)}%)`,
        best.surpriseScore > 0.8 ? 'breakthrough' : 'notable',
      );
    }

    // Record complexity metrics periodically
    if (this.cycleCount % this.config.metricsEvery === 0) {
      this.recordMetrics();
    }

    return deduped;
  }

  // ── Core: Complexity Metrics ─────────────────────────

  /**
   * Compute and store complexity metrics for the current state.
   * Approximates Kolmogorov complexity, Shannon entropy, and Phi (integration).
   */
  recordMetrics(): ComplexityMetrics {
    this.ts?.emit('emergence', 'analyzing', 'Computing complexity metrics...', 'routine');

    const compressionComplexity = this.computeCompressionComplexity();
    const knowledgeEntropy = this.computeKnowledgeEntropy();
    const { density, synapseCount, nodeCount, avgWeight } = this.computeNetworkMetrics();
    const knowledgeDiversity = this.computeKnowledgeDiversity();
    const integrationPhi = this.computeIntegrationPhi();

    const metrics: ComplexityMetrics = {
      timestamp: new Date().toISOString(),
      compressionComplexity,
      knowledgeEntropy,
      networkDensity: density,
      synapseCount,
      nodeCount,
      avgWeight,
      knowledgeDiversity,
      integrationPhi,
      cycle: this.cycleCount,
    };

    this.stmtInsertMetrics.run(
      compressionComplexity, knowledgeEntropy, density,
      synapseCount, nodeCount, avgWeight, knowledgeDiversity,
      integrationPhi, this.cycleCount,
    );

    this.ts?.emit('emergence', 'analyzing',
      `Complexity: K=${compressionComplexity.toFixed(3)}, H=${knowledgeEntropy.toFixed(2)}bit, Φ=${integrationPhi.toFixed(3)}, density=${density.toFixed(4)}`,
      'routine',
    );

    return metrics;
  }

  /**
   * Compute surprise score for an observation.
   * Uses Shannon information content: -log2(P(observation)).
   * Normalized to 0-1.
   */
  computeSurpriseScore(observation: string, context: Record<string, unknown> = {}): number {
    // Base surprise from rarity of related terms in journal
    let baseSurprise = 0.5;

    if (this.sources.journal) {
      try {
        const summary = this.sources.journal.getSummary();
        const totalEntries = summary.total_entries || 1;
        // Search for similar entries — fewer matches = more surprising
        const entries = this.sources.journal.search(observation, 10);
        const matchRate = entries.length / Math.max(totalEntries, 1);
        baseSurprise = 1 - matchRate; // Rare = surprising
      } catch { /* not wired */ }
    }

    // Boost if contradicts known principles
    let contradictionBoost = 0;
    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        const contradicts = pkg.anti_patterns.some(ap =>
          observation.toLowerCase().includes(ap.statement.toLowerCase().substring(0, 30)),
        );
        if (contradicts) contradictionBoost = 0.2;
      } catch { /* not wired */ }
    }

    // Boost from context severity/deviation
    const deviation = (context.deviation as number) ?? 0;
    const deviationBoost = Math.min(0.3, deviation * 0.1);

    return Math.min(1, baseSurprise + contradictionBoost + deviationBoost);
  }

  // ── Query Methods ────────────────────────────────────

  getEvents(limit = 20): EmergenceEvent[] {
    const rows = this.stmtListEvents.all(limit) as Record<string, unknown>[];
    return rows.map(r => this.toEvent(r));
  }

  getEventsByType(type?: EmergenceType): EmergenceEvent[] {
    if (type) {
      const rows = this.db.prepare(
        'SELECT * FROM emergence_events WHERE type = ? ORDER BY surprise_score DESC LIMIT 50',
      ).all(type) as Record<string, unknown>[];
      return rows.map(r => this.toEvent(r));
    }
    return this.getEvents(50);
  }

  getLatestMetrics(): ComplexityMetrics | null {
    const row = this.stmtLatestMetrics.get() as Record<string, unknown> | undefined;
    return row ? this.toMetrics(row) : null;
  }

  getMetricsTrend(limit = 20): Array<{ cycle: number; compressionComplexity: number; integrationPhi: number; knowledgeEntropy: number }> {
    const rows = this.stmtMetricsTrend.all(limit) as Record<string, unknown>[];
    return rows.map(r => ({
      cycle: r.cycle as number,
      compressionComplexity: r.compression_complexity as number,
      integrationPhi: r.integration_phi as number,
      knowledgeEntropy: r.knowledge_entropy as number,
    })).reverse(); // Chronological order
  }

  getStatus(): EmergenceStatus {
    const total = (this.stmtTotalEvents.get() as { cnt: number }).cnt;
    const unpredicted = (this.stmtUnpredictedCount.get() as { cnt: number }).cnt;
    const avgSurprise = (this.stmtAvgSurprise.get() as { avg: number | null }).avg ?? 0;
    const byType: Record<string, number> = {};
    const typeRows = this.stmtEventsByType.all() as Array<{ type: string; cnt: number }>;
    for (const r of typeRows) byType[r.type] = r.cnt;

    return {
      totalEvents: total,
      eventsByType: byType,
      unpredictedCount: unpredicted,
      avgSurpriseScore: avgSurprise,
      latestMetrics: this.getLatestMetrics(),
      metricsTrend: this.getMetricsTrend(20),
      topEvents: this.getEvents(5),
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Private: Detection Methods ────────────────────────

  /** Find hypotheses that were confirmed but weren't predicted by any principle. */
  private detectUnpredictedHypotheses(): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    if (!this.sources.hypothesisEngine) return events;

    try {
      const confirmed = this.sources.hypothesisEngine.list('confirmed', 20);
      const principles = this.sources.knowledgeDistiller
        ? this.sources.knowledgeDistiller.getPackage(this.config.brainName).principles
        : [];

      for (const h of confirmed) {
        // Check if this hypothesis is covered by any principle
        const coveredByPrinciple = principles.some(p =>
          this.textOverlap(p.statement, h.statement) > 0.3,
        );

        if (!coveredByPrinciple) {
          // This was discovered autonomously — emergent!
          const surprise = this.computeSurpriseScore(h.statement, {
            confidence: h.confidence,
            evidence_for: h.evidence_for,
          });
          events.push({
            type: 'unpredicted_pattern',
            title: `Autonomous discovery: ${h.statement.substring(0, 80)}`,
            description: `Hypothesis confirmed (p=${h.p_value.toFixed(4)}, evidence: ${h.evidence_for}/${h.evidence_for + h.evidence_against}) without matching any known principle. This was discovered by the system itself.`,
            surpriseScore: surprise,
            evidence: [`hypothesis:${h.id}`, `confidence:${h.confidence.toFixed(2)}`],
            sourceEngine: 'HypothesisEngine',
            wasPredicted: false,
            relatedPrinciples: [],
            timestamp: h.tested_at || new Date().toISOString(),
          });
        }
      }
    } catch { /* not wired */ }

    return events;
  }

  /** Find anomalies that recur in patterns not covered by any rule. */
  private detectRecurringAnomalies(): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    if (!this.sources.anomalyDetective) return events;

    try {
      const anomalies = this.sources.anomalyDetective.getAnomalies(undefined, 50);

      // Group by metric to find recurring patterns
      const byMetric = new Map<string, Array<{ deviation: number; timestamp: number }>>();
      for (const a of anomalies) {
        const key = `${a.type}:${a.metric}`;
        if (!byMetric.has(key)) byMetric.set(key, []);
        byMetric.get(key)!.push({ deviation: a.deviation, timestamp: a.timestamp });
      }

      for (const [key, occurrences] of byMetric) {
        if (occurrences.length >= 3) {
          // Recurring anomaly — is this covered by any principle?
          const principles = this.sources.knowledgeDistiller
            ? this.sources.knowledgeDistiller.getPackage(this.config.brainName).principles
            : [];

          const metricName = key.split(':')[1] || key;
          const covered = principles.some(p =>
            p.statement.toLowerCase().includes(metricName.toLowerCase()),
          );

          if (!covered) {
            const avgDeviation = occurrences.reduce((s, o) => s + Math.abs(o.deviation), 0) / occurrences.length;
            events.push({
              type: 'self_organization',
              title: `Recurring anomaly pattern: ${metricName} (${occurrences.length}x)`,
              description: `The metric "${metricName}" shows recurring anomalies (${occurrences.length} occurrences, avg deviation: ${avgDeviation.toFixed(2)}) without any principle explaining this pattern. The system is detecting a regularity it wasn't programmed to find.`,
              surpriseScore: Math.min(1, 0.4 + avgDeviation * 0.1 + occurrences.length * 0.05),
              evidence: occurrences.map((_, i) => `anomaly:${key}:${i}`),
              sourceEngine: 'AnomalyDetective',
              wasPredicted: false,
              relatedPrinciples: [],
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch { /* not wired */ }

    return events;
  }

  /** Find unexpected cross-domain connections. */
  private detectCrossDomainBridges(): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    if (!this.sources.journal) return events;

    try {
      // Look for journal entries tagged with multiple domains
      const recent = this.sources.journal.search('cross-domain', 20);
      for (const entry of recent) {
        if (entry.significance === 'notable' || entry.significance === 'breakthrough') {
          const domains = (entry.tags || []).filter(t =>
            ['brain', 'trading', 'marketing', 'cross-domain', 'cross_domain'].includes(t.toLowerCase()),
          );
          if (domains.length >= 2) {
            events.push({
              type: 'cross_domain_bridge',
              title: `Cross-domain link: ${entry.title}`,
              description: entry.content.substring(0, 300),
              surpriseScore: entry.significance === 'breakthrough' ? 0.9 : 0.6,
              evidence: [`journal:${entry.id}`],
              sourceEngine: 'ResearchJournal',
              wasPredicted: false,
              relatedPrinciples: [],
              timestamp: entry.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch { /* not wired */ }

    return events;
  }

  /** Detect phase transitions: sudden jumps in metrics. */
  private detectPhaseTransitions(): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    const trend = this.getMetricsTrend(10);
    if (trend.length < 3) return events;

    // Check for sudden jumps in complexity or entropy
    for (let i = 2; i < trend.length; i++) {
      const prev = trend[i - 1];
      const curr = trend[i];

      // Phi jump: > 50% increase
      if (prev.integrationPhi > 0 && curr.integrationPhi / prev.integrationPhi > 1.5) {
        events.push({
          type: 'phase_transition',
          title: `Integration spike: Φ jumped ${((curr.integrationPhi / prev.integrationPhi - 1) * 100).toFixed(0)}%`,
          description: `Knowledge integration (Phi) jumped from ${prev.integrationPhi.toFixed(3)} to ${curr.integrationPhi.toFixed(3)} between cycles ${prev.cycle} and ${curr.cycle}. This suggests a qualitative shift in how knowledge is interconnected.`,
          surpriseScore: Math.min(1, 0.5 + (curr.integrationPhi / prev.integrationPhi - 1) * 0.3),
          evidence: [`metrics:cycle:${prev.cycle}`, `metrics:cycle:${curr.cycle}`],
          sourceEngine: 'EmergenceEngine',
          wasPredicted: false,
          relatedPrinciples: [],
          timestamp: curr.compressionComplexity ? new Date().toISOString() : new Date().toISOString(),
        });
      }

      // Entropy jump: > 30% increase
      if (prev.knowledgeEntropy > 0 && curr.knowledgeEntropy / prev.knowledgeEntropy > 1.3) {
        events.push({
          type: 'phase_transition',
          title: `Knowledge entropy spike: H jumped ${((curr.knowledgeEntropy / prev.knowledgeEntropy - 1) * 100).toFixed(0)}%`,
          description: `Knowledge entropy rose from ${prev.knowledgeEntropy.toFixed(2)} to ${curr.knowledgeEntropy.toFixed(2)} bits. New categories of knowledge are being created rapidly.`,
          surpriseScore: Math.min(1, 0.4 + (curr.knowledgeEntropy / prev.knowledgeEntropy - 1) * 0.5),
          evidence: [`metrics:cycle:${prev.cycle}`, `metrics:cycle:${curr.cycle}`],
          sourceEngine: 'EmergenceEngine',
          wasPredicted: false,
          relatedPrinciples: [],
          timestamp: new Date().toISOString(),
        });
      }
    }

    return events;
  }

  /** Find experiments with unexpectedly large effects. */
  private detectNovelExperiments(): EmergenceEvent[] {
    const events: EmergenceEvent[] = [];
    if (!this.sources.experimentEngine) return events;

    try {
      const completed = this.sources.experimentEngine.list('complete', 20);
      for (const exp of completed) {
        if (exp.conclusion?.significant && exp.conclusion.effect_size) {
          const effectSize = Math.abs(exp.conclusion.effect_size);
          // Large effect (Cohen's d > 0.8) = novel finding
          if (effectSize > 0.8) {
            events.push({
              type: 'novel_behavior',
              title: `Large experiment effect: ${exp.name}`,
              description: `Experiment "${exp.name}" showed effect d=${exp.conclusion.effect_size.toFixed(2)} (p=${exp.conclusion.p_value?.toFixed(4)}). Hypothesis: "${exp.hypothesis}". This is a large, statistically significant effect discovered through autonomous experimentation.`,
              surpriseScore: Math.min(1, 0.5 + effectSize * 0.2),
              evidence: [`experiment:${exp.id}`, `effect:${effectSize.toFixed(2)}`],
              sourceEngine: 'ExperimentEngine',
              wasPredicted: false,
              relatedPrinciples: [],
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch { /* not wired */ }

    return events;
  }

  // ── Private: Complexity Computations ──────────────────

  /**
   * Approximate Kolmogorov complexity via compression ratio.
   * Serialize knowledge → measure compressibility.
   * Less compressible = more complex (more unique information).
   */
  private computeCompressionComplexity(): number {
    let serialized = '';

    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        for (const p of pkg.principles) serialized += p.statement + '|';
        for (const ap of pkg.anti_patterns) serialized += ap.statement + '|';
        for (const s of pkg.strategies) serialized += s.id + ':' + s.description + '|';
      } catch { /* not wired */ }
    }

    if (this.sources.hypothesisEngine) {
      try {
        const all = this.sources.hypothesisEngine.list(undefined, 50);
        for (const h of all) serialized += h.statement + ':' + h.status + '|';
      } catch { /* not wired */ }
    }

    if (serialized.length < 10) return 0;

    // Simple compression ratio: unique bigrams / total bigrams
    const bigrams = new Set<string>();
    let totalBigrams = 0;
    for (let i = 0; i < serialized.length - 1; i++) {
      bigrams.add(serialized.substring(i, i + 2));
      totalBigrams++;
    }

    // Ratio: 0 = fully repetitive, 1 = all unique (high complexity)
    return totalBigrams > 0 ? bigrams.size / totalBigrams : 0;
  }

  /**
   * Shannon entropy over knowledge categories.
   * Higher entropy = more diverse knowledge.
   */
  private computeKnowledgeEntropy(): number {
    const counts: Record<string, number> = {};
    let total = 0;

    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        counts['principles'] = pkg.principles.length;
        counts['anti_patterns'] = pkg.anti_patterns.length;
        counts['strategies'] = pkg.strategies.length;
        total += pkg.principles.length + pkg.anti_patterns.length + pkg.strategies.length;
      } catch { /* not wired */ }
    }

    if (this.sources.hypothesisEngine) {
      try {
        const all = this.sources.hypothesisEngine.list(undefined, 100);
        for (const h of all) {
          const key = `hypothesis:${h.status}`;
          counts[key] = (counts[key] || 0) + 1;
          total++;
        }
      } catch { /* not wired */ }
    }

    if (this.sources.journal) {
      try {
        const summary = this.sources.journal.getSummary();
        for (const [type, count] of Object.entries(summary.by_type || {})) {
          counts[`journal:${type}`] = count as number;
          total += count as number;
        }
      } catch { /* not wired */ }
    }

    if (total === 0) return 0;

    // Shannon entropy: H = -Σ p(x) * log2(p(x))
    let entropy = 0;
    for (const count of Object.values(counts)) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Network metrics from synapse data.
   */
  private computeNetworkMetrics(): { density: number; synapseCount: number; nodeCount: number; avgWeight: number } {
    if (this.sources.getNetworkStats) {
      try {
        const stats = this.sources.getNetworkStats();
        const n = stats.totalNodes;
        const density = n > 1 ? stats.totalSynapses / (n * (n - 1)) : 0;
        return {
          density: Math.min(1, density),
          synapseCount: stats.totalSynapses,
          nodeCount: n,
          avgWeight: stats.avgWeight,
        };
      } catch { /* not wired */ }
    }
    return { density: 0, synapseCount: 0, nodeCount: 0, avgWeight: 0 };
  }

  /**
   * Knowledge diversity: unique knowledge types / total types possible.
   */
  private computeKnowledgeDiversity(): number {
    const categories = new Set<string>();
    let maxCategories = 0;

    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        if (pkg.principles.length > 0) categories.add('principles');
        if (pkg.anti_patterns.length > 0) categories.add('anti_patterns');
        if (pkg.strategies.length > 0) categories.add('strategies');
        maxCategories += 3;
      } catch { /* not wired */ }
    }

    if (this.sources.hypothesisEngine) {
      try {
        const statuses: string[] = ['proposed', 'testing', 'confirmed', 'rejected', 'inconclusive'];
        for (const s of statuses) {
          const list = this.sources.hypothesisEngine.list(s as 'confirmed', 1);
          if (list.length > 0) categories.add(`hypothesis:${s}`);
        }
        maxCategories += 5;
      } catch { /* not wired */ }
    }

    if (this.sources.experimentEngine) {
      try {
        const exps = this.sources.experimentEngine.list(undefined, 1);
        if (exps.length > 0) categories.add('experiments');
        maxCategories += 1;
      } catch { /* not wired */ }
    }

    if (this.sources.curiosityEngine) {
      try {
        const status = this.sources.curiosityEngine.getStatus();
        if (status.totalGaps > 0) categories.add('knowledge_gaps');
        if (status.totalExplorations > 0) categories.add('explorations');
        maxCategories += 2;
      } catch { /* not wired */ }
    }

    return maxCategories > 0 ? categories.size / maxCategories : 0;
  }

  /**
   * Integration proxy (Phi): measures how interconnected the knowledge is.
   * Approximated by: cross-references between knowledge categories.
   * Higher Phi = knowledge is more integrated (parts inform each other).
   */
  private computeIntegrationPhi(): number {
    let crossRefs = 0;
    let totalItems = 0;

    if (this.sources.journal) {
      try {
        const summary = this.sources.journal.getSummary();
        totalItems += summary.total_entries || 0;

        // Count entries that reference other entries
        const recent = this.sources.journal.search('', 50);
        for (const entry of recent) {
          if (entry.references && entry.references.length > 0) {
            crossRefs += entry.references.length;
          }
          // Multi-tag entries indicate cross-cutting knowledge
          if (entry.tags && entry.tags.length > 2) {
            crossRefs += entry.tags.length - 2;
          }
        }
      } catch { /* not wired */ }
    }

    if (this.sources.hypothesisEngine) {
      try {
        const all = this.sources.hypothesisEngine.list(undefined, 50);
        totalItems += all.length;
        // Hypotheses with multiple variables indicate integration
        for (const h of all) {
          if (h.variables && h.variables.length > 1) {
            crossRefs += h.variables.length - 1;
          }
        }
      } catch { /* not wired */ }
    }

    // Phi ≈ crossRefs / totalItems (normalized)
    if (totalItems === 0) return 0;
    return Math.min(1, crossRefs / (totalItems * 2)); // Normalize: 2 refs per item = fully integrated
  }

  // ── Private: Helpers ─────────────────────────────────

  /** Simple word overlap ratio between two texts. */
  private textOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    return overlap / Math.max(wordsA.size, wordsB.size);
  }

  /** Deduplicate events by title similarity. */
  private deduplicateEvents(events: EmergenceEvent[]): EmergenceEvent[] {
    const unique: EmergenceEvent[] = [];
    const seenTitles = new Set<string>();

    // Also check against already-persisted events
    const existing = this.getEvents(50);
    for (const e of existing) seenTitles.add(e.title.toLowerCase().substring(0, 60));

    for (const e of events) {
      const key = e.title.toLowerCase().substring(0, 60);
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        unique.push(e);
      }
    }

    return unique.sort((a, b) => b.surpriseScore - a.surpriseScore);
  }

  private toEvent(row: Record<string, unknown>): EmergenceEvent {
    let evidence: string[] = [];
    let relatedPrinciples: string[] = [];
    try { evidence = JSON.parse((row.evidence as string) || '[]'); } catch { /* ignore */ }
    try { relatedPrinciples = JSON.parse((row.related_principles as string) || '[]'); } catch { /* ignore */ }

    return {
      id: row.id as number,
      timestamp: row.timestamp as string,
      type: row.type as EmergenceType,
      title: row.title as string,
      description: row.description as string,
      surpriseScore: row.surprise_score as number,
      evidence,
      sourceEngine: row.source_engine as string,
      wasPredicted: (row.was_predicted as number) === 1,
      relatedPrinciples,
    };
  }

  private toMetrics(row: Record<string, unknown>): ComplexityMetrics {
    return {
      timestamp: row.timestamp as string,
      compressionComplexity: row.compression_complexity as number,
      knowledgeEntropy: row.knowledge_entropy as number,
      networkDensity: row.network_density as number,
      synapseCount: row.synapse_count as number,
      nodeCount: row.node_count as number,
      avgWeight: row.avg_weight as number,
      knowledgeDiversity: row.knowledge_diversity as number,
      integrationPhi: row.integration_phi as number,
      cycle: row.cycle as number,
    };
  }
}
