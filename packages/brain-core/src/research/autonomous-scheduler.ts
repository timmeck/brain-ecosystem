import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { MetaLearningEngine } from '../meta-learning/engine.js';
import type { HyperParameter, ParameterRecommendation } from '../meta-learning/engine.js';
import { CausalGraph } from '../causal/engine.js';
import type { CausalEdge, CausalPath } from '../causal/engine.js';
import { HypothesisEngine } from '../hypothesis/engine.js';
import type { HypothesisTestResult } from '../hypothesis/engine.js';

// ── Types ───────────────────────────────────────────────

export interface ResearchDiscovery {
  id?: number;
  type: 'causal_chain' | 'confirmed_hypothesis' | 'parameter_optimization' | 'anomaly' | 'root_cause';
  title: string;
  description: string;
  confidence: number;       // 0-1
  impact: number;           // 0-1, estimated impact
  source: string;           // which brain
  data: Record<string, unknown>;
  created_at?: string;
}

export interface ResearchCycleReport {
  cycle: number;
  timestamp: number;
  causalEdgesFound: number;
  causalChainsFound: number;
  hypothesesGenerated: number;
  hypothesesTested: number;
  hypothesesConfirmed: number;
  hypothesesRejected: number;
  parametersOptimized: number;
  discoveriesProduced: number;
  duration: number;
}

export interface AutonomousResearchConfig {
  /** How often to run the full research cycle (ms). Default: 600_000 (10 min) */
  intervalMs?: number;
  /** Initial delay before first cycle (ms). Default: 30_000 (30s) */
  initialDelayMs?: number;
  /** Brain name for event attribution. */
  brainName: string;
  /** Hyperparameters for meta-learning. */
  hyperParams?: HyperParameter[];
  /** Minimum causal edge strength to produce a discovery. Default: 0.3 */
  minCausalStrength?: number;
  /** Maximum discoveries per cycle. Default: 10 */
  maxDiscoveriesPerCycle?: number;
}

// ── Migration ───────────────────────────────────────────

export function runResearchDiscoveryMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_discoveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      impact REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS research_cycle_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      causal_edges_found INTEGER NOT NULL DEFAULT 0,
      causal_chains_found INTEGER NOT NULL DEFAULT 0,
      hypotheses_generated INTEGER NOT NULL DEFAULT 0,
      hypotheses_tested INTEGER NOT NULL DEFAULT 0,
      hypotheses_confirmed INTEGER NOT NULL DEFAULT 0,
      hypotheses_rejected INTEGER NOT NULL DEFAULT 0,
      parameters_optimized INTEGER NOT NULL DEFAULT 0,
      discoveries_produced INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_discoveries_type ON research_discoveries(type);
    CREATE INDEX IF NOT EXISTS idx_discoveries_confidence ON research_discoveries(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_cycle_reports_cycle ON research_cycle_reports(cycle);
  `);
}

// ── Scheduler ───────────────────────────────────────────

/**
 * Autonomous Research Scheduler: orchestrates the three research engines
 * into a self-running discovery pipeline.
 *
 * Flow:
 * 1. External code calls onLearningCycleComplete() after each learning cycle
 *    → feeds metrics into MetaLearningEngine
 *    → records causal events
 *    → records observations for hypothesis engine
 *
 * 2. On a timer (every intervalMs), runs a full research cycle:
 *    a. Run causal analysis → detect cause-effect relationships
 *    b. Auto-generate hypotheses from observation patterns
 *    c. Test all pending hypotheses
 *    d. Run meta-learning optimization (if enough data)
 *    e. Produce discoveries from confirmed hypotheses + causal chains
 *    f. Store everything in SQLite
 */
export class AutonomousResearchScheduler {
  private logger = getLogger();
  private timer: ReturnType<typeof setInterval> | null = null;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private cycleCount = 0;
  private running = false;

  readonly metaLearning: MetaLearningEngine;
  readonly causalGraph: CausalGraph;
  readonly hypothesisEngine: HypothesisEngine;

  private brainName: string;
  private intervalMs: number;
  private initialDelayMs: number;
  private minCausalStrength: number;
  private maxDiscoveriesPerCycle: number;

  constructor(
    private db: Database.Database,
    config: AutonomousResearchConfig,
  ) {
    runResearchDiscoveryMigration(db);

    this.brainName = config.brainName;
    this.intervalMs = config.intervalMs ?? 600_000;
    this.initialDelayMs = config.initialDelayMs ?? 30_000;
    this.minCausalStrength = config.minCausalStrength ?? 0.3;
    this.maxDiscoveriesPerCycle = config.maxDiscoveriesPerCycle ?? 10;

    // Default hyperparameters if none provided
    const hyperParams = config.hyperParams ?? [
      { name: 'learningRate', value: 0.1, min: 0.01, max: 0.5, step: 0.02 },
      { name: 'decayRate', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
      { name: 'pruneThreshold', value: 0.1, min: 0.01, max: 0.5, step: 0.02 },
    ];

    this.metaLearning = new MetaLearningEngine(db, hyperParams);
    this.causalGraph = new CausalGraph(db);
    this.hypothesisEngine = new HypothesisEngine(db);
  }

  /** Start the autonomous research timer. */
  start(): void {
    if (this.timer) return;

    this.logger.info(`[research] Autonomous research scheduler starting (interval: ${this.intervalMs}ms, delay: ${this.initialDelayMs}ms)`);

    if (this.initialDelayMs > 0) {
      this.delayTimer = setTimeout(() => {
        this.safeRunCycle();
        this.timer = setInterval(() => this.safeRunCycle(), this.intervalMs);
      }, this.initialDelayMs);
    } else {
      this.timer = setInterval(() => this.safeRunCycle(), this.intervalMs);
    }
  }

  /** Stop the autonomous research timer. */
  stop(): void {
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Call this after each learning cycle completes.
   * Feeds the cycle results into all three research engines.
   */
  onLearningCycleComplete(
    metrics: Record<string, number>,
    score: number,
    eventType = 'learning:cycle_complete',
  ): void {
    // 1. Feed meta-learning
    this.metaLearning.step(metrics, score);

    // 2. Record causal event
    this.causalGraph.recordEvent(this.brainName, eventType, metrics);

    // 3. Record observations for hypothesis engine
    for (const [key, value] of Object.entries(metrics)) {
      this.hypothesisEngine.observe({
        source: this.brainName,
        type: `metric:${key}`,
        value,
        timestamp: Date.now(),
        metadata: { eventType },
      });
    }

    this.logger.debug(`[research] Learning cycle recorded: score=${score.toFixed(3)}, metrics=${Object.keys(metrics).length}`);
  }

  /**
   * Record a domain event for causal + hypothesis tracking.
   * Call this from event listeners in each brain.
   */
  recordEvent(eventType: string, data?: Record<string, unknown>): void {
    this.causalGraph.recordEvent(this.brainName, eventType, data);

    // Also record as observation with value 1 (occurrence)
    this.hypothesisEngine.observe({
      source: this.brainName,
      type: eventType,
      value: 1,
      timestamp: Date.now(),
      metadata: data,
    });
  }

  /**
   * Run one full autonomous research cycle.
   * This is the core algorithm — the system thinking about itself.
   */
  runCycle(): ResearchCycleReport {
    if (this.running) {
      this.logger.warn('[research] Cycle already running, skipping');
      return this.emptyReport();
    }

    this.running = true;
    this.cycleCount++;
    const startTime = Date.now();

    this.logger.info(`[research] ═══ Autonomous Research Cycle #${this.cycleCount} ═══`);

    try {
      // Phase 1: Causal Analysis — detect cause-effect relationships
      const edges = this.causalGraph.analyze();
      const chains = this.causalGraph.findChains();
      this.logger.info(`[research] Phase 1: ${edges.length} causal edges, ${chains.length} chains detected`);

      // Phase 2: Hypothesis Generation — form theories from data
      const generated = this.hypothesisEngine.generate();
      this.logger.info(`[research] Phase 2: ${generated.length} new hypotheses generated`);

      // Phase 3: Hypothesis Testing — test all pending theories
      const tested = this.hypothesisEngine.testAll();
      const confirmed = tested.filter(t => t.newStatus === 'confirmed');
      const rejected = tested.filter(t => t.newStatus === 'rejected');
      this.logger.info(`[research] Phase 3: ${tested.length} tested, ${confirmed.length} confirmed, ${rejected.length} rejected`);

      // Phase 4: Meta-Learning Optimization — tune parameters
      const optimized = this.metaLearning.optimize();
      if (optimized.length > 0) {
        this.logger.info(`[research] Phase 4: ${optimized.length} parameters optimized`);
      }

      // Phase 5: Discovery Production — synthesize findings
      const discoveries = this.produceDiscoveries(edges, chains, confirmed, optimized);
      this.logger.info(`[research] Phase 5: ${discoveries.length} discoveries produced`);

      const duration = Date.now() - startTime;
      const report: ResearchCycleReport = {
        cycle: this.cycleCount,
        timestamp: startTime,
        causalEdgesFound: edges.length,
        causalChainsFound: chains.length,
        hypothesesGenerated: generated.length,
        hypothesesTested: tested.length,
        hypothesesConfirmed: confirmed.length,
        hypothesesRejected: rejected.length,
        parametersOptimized: optimized.length,
        discoveriesProduced: discoveries.length,
        duration,
      };

      // Store cycle report
      this.storeCycleReport(report);

      this.logger.info(`[research] ═══ Cycle #${this.cycleCount} complete (${duration}ms) ═══`);
      return report;

    } finally {
      this.running = false;
    }
  }

  /** Get all discoveries, optionally filtered by type. */
  getDiscoveries(type?: string, limit = 20): ResearchDiscovery[] {
    let rows: Array<Record<string, unknown>>;
    if (type) {
      rows = this.db.prepare(
        'SELECT * FROM research_discoveries WHERE type = ? ORDER BY confidence DESC LIMIT ?',
      ).all(type, limit) as Array<Record<string, unknown>>;
    } else {
      rows = this.db.prepare(
        'SELECT * FROM research_discoveries ORDER BY created_at DESC LIMIT ?',
      ).all(limit) as Array<Record<string, unknown>>;
    }
    return rows.map(r => ({
      ...r,
      data: JSON.parse(r.data as string),
    })) as ResearchDiscovery[];
  }

  /** Get cycle reports. */
  getCycleReports(limit = 20): ResearchCycleReport[] {
    return this.db.prepare(
      'SELECT * FROM research_cycle_reports ORDER BY cycle DESC LIMIT ?',
    ).all(limit) as ResearchCycleReport[];
  }

  /** Get a comprehensive research status. */
  getStatus(): {
    cyclesCompleted: number;
    totalDiscoveries: number;
    discoveryBreakdown: Record<string, number>;
    metaLearningStatus: ReturnType<MetaLearningEngine['getStatus']>;
    causalAnalysis: ReturnType<CausalGraph['getAnalysis']>;
    hypothesisSummary: ReturnType<HypothesisEngine['getSummary']>;
    lastCycleReport: ResearchCycleReport | null;
    isRunning: boolean;
  } {
    const discoveryRows = this.db.prepare(
      'SELECT type, COUNT(*) as count FROM research_discoveries GROUP BY type',
    ).all() as Array<{ type: string; count: number }>;

    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const row of discoveryRows) {
      breakdown[row.type] = row.count;
      total += row.count;
    }

    const reports = this.getCycleReports(1);

    return {
      cyclesCompleted: this.cycleCount,
      totalDiscoveries: total,
      discoveryBreakdown: breakdown,
      metaLearningStatus: this.metaLearning.getStatus(),
      causalAnalysis: this.causalGraph.getAnalysis(),
      hypothesisSummary: this.hypothesisEngine.getSummary(),
      lastCycleReport: reports.length > 0 ? reports[0]! : null,
      isRunning: this.running,
    };
  }

  // ── Private ───────────────────────────────────────────

  private safeRunCycle(): void {
    try {
      this.runCycle();
    } catch (err) {
      this.logger.error('[research] Autonomous research cycle error', { error: String(err) });
    }
  }

  /**
   * Produce discoveries from research findings.
   * This is where data becomes insight.
   */
  private produceDiscoveries(
    edges: CausalEdge[],
    chains: CausalPath[],
    confirmedHypotheses: HypothesisTestResult[],
    optimizations: ParameterRecommendation[],
  ): ResearchDiscovery[] {
    const discoveries: ResearchDiscovery[] = [];

    // 1. Strong causal chains → discoveries
    for (const chain of chains) {
      if (chain.totalStrength < this.minCausalStrength) continue;
      if (discoveries.length >= this.maxDiscoveriesPerCycle) break;

      const discovery: ResearchDiscovery = {
        type: 'causal_chain',
        title: `Causal chain: ${chain.chain.join(' → ')}`,
        description: `Events follow this causal sequence with average strength ${chain.totalStrength.toFixed(3)} and total lag ${(chain.totalLag / 1000).toFixed(1)}s`,
        confidence: Math.min(1, chain.totalStrength),
        impact: Math.min(1, chain.chain.length / 4),
        source: this.brainName,
        data: { chain: chain.chain, strength: chain.totalStrength, lagMs: chain.totalLag },
      };

      if (!this.isDuplicateDiscovery(discovery)) {
        this.storeDiscovery(discovery);
        discoveries.push(discovery);
      }
    }

    // 2. Root causes (causal nodes that cause but aren't caused) → discoveries
    const roots = this.findSignificantRoots(edges);
    for (const root of roots) {
      if (discoveries.length >= this.maxDiscoveriesPerCycle) break;

      const effects = edges.filter(e => e.cause === root.cause);
      const discovery: ResearchDiscovery = {
        type: 'root_cause',
        title: `Root cause identified: "${root.cause}"`,
        description: `"${root.cause}" causes ${effects.length} downstream effects with average strength ${root.avgStrength.toFixed(3)}`,
        confidence: root.avgConfidence,
        impact: Math.min(1, effects.length / 5),
        source: this.brainName,
        data: { rootCause: root.cause, effectCount: effects.length, effects: effects.map(e => e.effect) },
      };

      if (!this.isDuplicateDiscovery(discovery)) {
        this.storeDiscovery(discovery);
        discoveries.push(discovery);
      }
    }

    // 3. Confirmed hypotheses → discoveries
    for (const result of confirmedHypotheses) {
      if (discoveries.length >= this.maxDiscoveriesPerCycle) break;

      const hyp = this.hypothesisEngine.get(result.hypothesisId);
      if (!hyp) continue;

      const discovery: ResearchDiscovery = {
        type: 'confirmed_hypothesis',
        title: `Hypothesis confirmed: ${hyp.statement}`,
        description: `Confirmed with p-value ${result.pValue.toFixed(4)}, confidence ${result.confidence.toFixed(3)} (${result.evidenceFor} supporting, ${result.evidenceAgainst} opposing observations)`,
        confidence: result.confidence,
        impact: Math.min(1, (result.evidenceFor + result.evidenceAgainst) / 50),
        source: this.brainName,
        data: {
          hypothesisId: result.hypothesisId,
          statement: hyp.statement,
          type: hyp.type,
          pValue: result.pValue,
          evidenceFor: result.evidenceFor,
          evidenceAgainst: result.evidenceAgainst,
        },
      };

      if (!this.isDuplicateDiscovery(discovery)) {
        this.storeDiscovery(discovery);
        discoveries.push(discovery);
      }
    }

    // 4. Parameter optimizations → discoveries
    for (const opt of optimizations) {
      if (discoveries.length >= this.maxDiscoveriesPerCycle) break;
      if (opt.confidence < 0.5) continue; // only high-confidence optimizations

      const discovery: ResearchDiscovery = {
        type: 'parameter_optimization',
        title: `Parameter "${opt.name}" optimized: ${opt.currentValue.toFixed(4)} → ${opt.recommendedValue.toFixed(4)}`,
        description: `Expected improvement: ${(opt.expectedImprovement * 100).toFixed(1)}% (confidence: ${opt.confidence.toFixed(3)}, based on ${opt.evidence} observations)`,
        confidence: opt.confidence,
        impact: Math.min(1, Math.abs(opt.expectedImprovement)),
        source: this.brainName,
        data: {
          parameter: opt.name,
          oldValue: opt.currentValue,
          newValue: opt.recommendedValue,
          improvement: opt.expectedImprovement,
          evidence: opt.evidence,
        },
      };

      if (!this.isDuplicateDiscovery(discovery)) {
        this.storeDiscovery(discovery);
        discoveries.push(discovery);
      }
    }

    return discoveries;
  }

  private findSignificantRoots(edges: CausalEdge[]): Array<{ cause: string; avgStrength: number; avgConfidence: number }> {
    const causes = new Set(edges.map(e => e.cause));
    const effects = new Set(edges.map(e => e.effect));
    const roots = [...causes].filter(c => !effects.has(c));

    return roots
      .map(root => {
        const rootEdges = edges.filter(e => e.cause === root);
        const avgStrength = rootEdges.reduce((s, e) => s + e.strength, 0) / rootEdges.length;
        const avgConfidence = rootEdges.reduce((s, e) => s + e.confidence, 0) / rootEdges.length;
        return { cause: root, avgStrength, avgConfidence };
      })
      .filter(r => r.avgStrength >= this.minCausalStrength)
      .sort((a, b) => b.avgStrength - a.avgStrength)
      .slice(0, 5);
  }

  private isDuplicateDiscovery(discovery: ResearchDiscovery): boolean {
    const existing = this.db.prepare(
      'SELECT id FROM research_discoveries WHERE type = ? AND title = ?',
    ).get(discovery.type, discovery.title);
    return !!existing;
  }

  private storeDiscovery(discovery: ResearchDiscovery): void {
    this.db.prepare(`
      INSERT INTO research_discoveries (type, title, description, confidence, impact, source, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      discovery.type, discovery.title, discovery.description,
      discovery.confidence, discovery.impact, discovery.source,
      JSON.stringify(discovery.data),
    );
  }

  private storeCycleReport(report: ResearchCycleReport): void {
    this.db.prepare(`
      INSERT INTO research_cycle_reports (cycle, timestamp, causal_edges_found, causal_chains_found,
        hypotheses_generated, hypotheses_tested, hypotheses_confirmed, hypotheses_rejected,
        parameters_optimized, discoveries_produced, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.cycle, report.timestamp, report.causalEdgesFound, report.causalChainsFound,
      report.hypothesesGenerated, report.hypothesesTested, report.hypothesesConfirmed,
      report.hypothesesRejected, report.parametersOptimized, report.discoveriesProduced,
      report.duration,
    );
  }

  private emptyReport(): ResearchCycleReport {
    return {
      cycle: this.cycleCount,
      timestamp: Date.now(),
      causalEdgesFound: 0,
      causalChainsFound: 0,
      hypothesesGenerated: 0,
      hypothesesTested: 0,
      hypothesesConfirmed: 0,
      hypothesesRejected: 0,
      parametersOptimized: 0,
      discoveriesProduced: 0,
      duration: 0,
    };
  }
}
