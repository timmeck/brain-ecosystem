import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { SelfObserver, type ObservationCategory } from './self-observer.js';
import { AdaptiveStrategyEngine } from './adaptive-strategy.js';
import { ExperimentEngine } from './experiment-engine.js';
import { CrossDomainEngine } from './cross-domain-engine.js';
import { CounterfactualEngine } from './counterfactual-engine.js';
import { KnowledgeDistiller } from './knowledge-distiller.js';
import { ResearchAgendaEngine } from './agenda-engine.js';
import { AnomalyDetective } from './anomaly-detective.js';
import { ResearchJournal } from './journal.js';
import type { CausalGraph } from '../causal/engine.js';
import type { ResearchCycleReport } from './autonomous-scheduler.js';
import type { DataMiner } from './data-miner.js';

// ── Types ───────────────────────────────────────────────

export interface ResearchOrchestratorConfig {
  brainName: string;
  /** Feedback loop interval in ms. Default: 300_000 (5 min) */
  feedbackIntervalMs?: number;
  /** Knowledge distillation every N cycles. Default: 5 */
  distillEvery?: number;
  /** Research agenda regeneration every N cycles. Default: 3 */
  agendaEvery?: number;
  /** Journal reflection every N cycles. Default: 10 */
  reflectEvery?: number;
}

// ── Orchestrator ────────────────────────────────────────

export class ResearchOrchestrator {
  readonly selfObserver: SelfObserver;
  readonly adaptiveStrategy: AdaptiveStrategyEngine;
  readonly experimentEngine: ExperimentEngine;
  readonly crossDomain: CrossDomainEngine;
  readonly counterfactual: CounterfactualEngine;
  readonly knowledgeDistiller: KnowledgeDistiller;
  readonly researchAgenda: ResearchAgendaEngine;
  readonly anomalyDetective: AnomalyDetective;
  readonly journal: ResearchJournal;

  private dataMiner: DataMiner | null = null;

  private brainName: string;
  private feedbackTimer: ReturnType<typeof setInterval> | null = null;
  private cycleCount = 0;
  private distillEvery: number;
  private agendaEvery: number;
  private reflectEvery: number;
  private log = getLogger();

  constructor(db: Database.Database, config: ResearchOrchestratorConfig, causalGraph?: CausalGraph) {
    this.brainName = config.brainName;
    this.distillEvery = config.distillEvery ?? 5;
    this.agendaEvery = config.agendaEvery ?? 3;
    this.reflectEvery = config.reflectEvery ?? 10;

    this.selfObserver = new SelfObserver(db, { brainName: config.brainName });
    this.adaptiveStrategy = new AdaptiveStrategyEngine(db, { brainName: config.brainName });
    this.experimentEngine = new ExperimentEngine(db, { brainName: config.brainName });
    this.crossDomain = new CrossDomainEngine(db);
    this.counterfactual = new CounterfactualEngine(db, causalGraph ?? null);
    this.knowledgeDistiller = new KnowledgeDistiller(db, { brainName: config.brainName });
    this.researchAgenda = new ResearchAgendaEngine(db, { brainName: config.brainName });
    this.anomalyDetective = new AnomalyDetective(db, { brainName: config.brainName });
    this.journal = new ResearchJournal(db, { brainName: config.brainName });
  }

  /** Set the DataMiner instance for DB-driven engine feeding. */
  setDataMiner(miner: DataMiner): void {
    this.dataMiner = miner;
  }

  /** Start the autonomous feedback loop timer. */
  start(intervalMs = 300_000): void {
    if (this.feedbackTimer) return;
    this.feedbackTimer = setInterval(() => {
      try { this.runFeedbackCycle(); }
      catch (err) { this.log.error('[orchestrator] Feedback cycle error', { error: (err as Error).message }); }
    }, intervalMs);
    this.log.info(`[orchestrator] Research orchestrator started (feedback every ${intervalMs}ms)`);
  }

  /** Stop the feedback loop. */
  stop(): void {
    if (this.feedbackTimer) {
      clearInterval(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  }

  /**
   * Feed a domain event from the brain's EventBus.
   * Routes to: SelfObserver, AnomalyDetective, CrossDomain.
   */
  onEvent(eventType: string, data: Record<string, unknown> = {}): void {
    this.selfObserver.record({
      category: categorize(eventType),
      event_type: eventType,
      metrics: data,
    });

    this.anomalyDetective.recordMetric(eventType, 1);
    this.crossDomain.recordEvent(this.brainName, eventType, data);
  }

  /**
   * Feed a cross-brain event from CrossBrainSubscription.
   * Routes to: CrossDomainEngine, AnomalyDetective.
   */
  onCrossBrainEvent(sourceBrain: string, eventType: string, data: Record<string, unknown> = {}): void {
    this.crossDomain.recordEvent(sourceBrain, eventType, data);
    this.anomalyDetective.recordMetric(`cross:${sourceBrain}:${eventType}`, 1);
  }

  /**
   * Hook into AutonomousResearchScheduler cycle completion.
   * Records discoveries in journal and feeds metrics to anomaly detection.
   */
  onResearchCycleComplete(report: ResearchCycleReport): void {
    // Record cycle metrics for anomaly detection
    this.anomalyDetective.recordMetric('research_discoveries', report.discoveriesProduced);
    this.anomalyDetective.recordMetric('research_hypotheses_tested', report.hypothesesTested);
    this.anomalyDetective.recordMetric('research_confirmed', report.hypothesesConfirmed);
    this.anomalyDetective.recordMetric('research_duration_ms', report.duration);

    // Self-observe the research cycle
    this.selfObserver.record({
      category: 'latency',
      event_type: 'research:cycle_complete',
      metrics: {
        cycle: report.cycle,
        discoveries: report.discoveriesProduced,
        duration_ms: report.duration,
        confirmed: report.hypothesesConfirmed,
        rejected: report.hypothesesRejected,
      },
    });

    // Journal the cycle
    if (report.discoveriesProduced > 0 || report.hypothesesConfirmed > 0) {
      this.journal.recordDiscovery(
        `Research Cycle #${report.cycle}`,
        `Cycle completed: ${report.discoveriesProduced} discoveries, ${report.hypothesesConfirmed} hypotheses confirmed, ${report.hypothesesRejected} rejected, ${report.causalEdgesFound} causal edges. Duration: ${report.duration}ms.`,
        { report },
        report.hypothesesConfirmed > 0 ? 'notable' : 'routine',
      );
    }
  }

  /**
   * Run one autonomous feedback cycle.
   * This is where the engines talk to each other.
   */
  runFeedbackCycle(): void {
    this.cycleCount++;
    const start = Date.now();
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} ───`);

    // 0. DataMiner: mine new data from DB into engines
    if (this.dataMiner) {
      try {
        this.dataMiner.mine();
      } catch (err) {
        this.log.error(`[orchestrator] DataMiner error: ${(err as Error).message}`);
      }
    }

    // 1. Self-observer analyzes accumulated observations → insights
    const insights = this.selfObserver.analyze();
    if (insights.length > 0) {
      this.log.info(`[orchestrator] Self-observer: ${insights.length} insights`);
      for (const insight of insights) {
        this.journal.recordDiscovery(
          insight.title,
          insight.description,
          { ...insight.evidence, type: insight.type, confidence: insight.confidence },
          insight.confidence > 0.8 ? 'notable' : 'routine',
        );
      }
    }

    // 2. Anomaly detection
    const anomalies = this.anomalyDetective.detect();
    if (anomalies.length > 0) {
      this.log.info(`[orchestrator] Anomalies detected: ${anomalies.length}`);
      for (const a of anomalies) {
        this.journal.write({
          type: 'anomaly',
          title: a.title,
          content: a.description,
          tags: [this.brainName, 'anomaly', a.type, a.severity],
          references: [],
          significance: a.severity === 'critical' ? 'breakthrough' : a.severity === 'high' ? 'notable' : 'routine',
          data: { metric: a.metric, expected: a.expected_value, actual: a.actual_value, deviation: a.deviation },
        });
      }
    }

    // 3. Cross-domain correlation analysis
    const correlations = this.crossDomain.analyze();
    const significant = correlations.filter(c => Math.abs(c.correlation) > 0.5 && c.p_value < 0.05);
    if (significant.length > 0) {
      this.log.info(`[orchestrator] Cross-domain: ${significant.length} significant correlations`);
      for (const corr of significant) {
        this.journal.recordDiscovery(
          `Cross-domain: ${corr.source_brain}:${corr.source_event} → ${corr.target_brain}:${corr.target_event}`,
          corr.narrative,
          { correlation: corr.correlation, pValue: corr.p_value, lag: corr.lag_seconds },
          'notable',
        );
      }
    }

    // 4. Adaptive strategy: check for regressions and revert
    const reverted = this.adaptiveStrategy.checkAndRevert(this.cycleCount);
    for (const r of reverted) {
      this.journal.write({
        type: 'adaptation',
        title: `Reverted: ${r.strategy}/${r.parameter}`,
        content: `Strategy adaptation reverted: ${r.parameter} from ${r.new_value} back to ${r.old_value}. Reason: ${r.reason}`,
        tags: [this.brainName, 'revert', r.strategy],
        references: [],
        significance: 'notable',
        data: { adaptation: r },
      });
    }

    // 5. Check running experiments
    const experiments = this.experimentEngine.list();
    for (const exp of experiments) {
      if (exp.status === 'analyzing' && exp.id) {
        const result = this.experimentEngine.analyze(exp.id);
        if (result?.conclusion) {
          const sig = result.conclusion.significant;
          this.journal.recordExperiment(
            exp.name,
            sig ? (result.conclusion.direction === 'positive' ? 'confirmed' : 'rejected') : 'inconclusive',
            { conclusion: result.conclusion, hypothesis: exp.hypothesis },
            sig,
          );
          this.log.info(`[orchestrator] Experiment "${exp.name}": ${sig ? result.conclusion.direction : 'inconclusive'} (p=${result.conclusion.p_value.toFixed(4)}, d=${result.conclusion.effect_size.toFixed(2)})`);
        }
      }
    }

    // 6. Knowledge distillation (periodic)
    if (this.cycleCount % this.distillEvery === 0) {
      const { principles, antiPatterns, strategies } = this.knowledgeDistiller.distill();
      if (principles.length + antiPatterns.length + strategies.length > 0) {
        this.log.info(`[orchestrator] Knowledge distilled: ${principles.length} principles, ${antiPatterns.length} anti-patterns, ${strategies.length} strategies`);
      }
    }

    // 7. Research agenda generation (periodic)
    if (this.cycleCount % this.agendaEvery === 0) {
      const agenda = this.researchAgenda.generate();
      if (agenda.length > 0) {
        this.log.info(`[orchestrator] Research agenda: ${agenda.length} items generated`);
      }
    }

    // 8. Journal reflection (periodic)
    if (this.cycleCount % this.reflectEvery === 0) {
      this.journal.reflect();
    }

    const duration = Date.now() - start;
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} complete (${duration}ms) ───`);
  }

  /** Get a comprehensive research summary for dashboards/API. */
  getSummary(): Record<string, unknown> {
    return {
      brainName: this.brainName,
      feedbackCycles: this.cycleCount,
      dataMiner: this.dataMiner?.getState() ?? null,
      selfInsights: this.selfObserver.getInsights(undefined, 10),
      anomalies: this.anomalyDetective.getAnomalies(undefined, 10),
      experiments: this.experimentEngine.list(undefined, 10),
      agenda: this.researchAgenda.getAgenda(10),
      journal: this.journal.getSummary(),
      knowledge: this.knowledgeDistiller.getSummary(),
      correlations: this.crossDomain.getCorrelations(10),
      strategy: this.adaptiveStrategy.getStatus(),
    };
  }
}

// ── Helpers ─────────────────────────────────────────────

function categorize(eventType: string): ObservationCategory {
  if (eventType.includes('cross_brain') || eventType.includes('cross:')) return 'cross_brain';
  if (eventType.includes('latency') || eventType.includes('duration')) return 'latency';
  if (eventType.includes('resolution') || eventType.includes('solved')) return 'resolution_rate';
  if (eventType.includes('query') || eventType.includes('search') || eventType.includes('recall')) return 'query_quality';
  return 'tool_usage';
}
