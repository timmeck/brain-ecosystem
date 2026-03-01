import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
import { HypothesisEngine } from '../hypothesis/engine.js';
import type { CausalGraph } from '../causal/engine.js';
import type { ResearchCycleReport } from './autonomous-scheduler.js';
import type { DataMiner } from './data-miner.js';
import type { DreamEngine } from '../dream/dream-engine.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';
import { AutoResponder } from './auto-responder.js';

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
  readonly autoResponder: AutoResponder;
  readonly hypothesisEngine: HypothesisEngine;

  private dataMiner: DataMiner | null = null;
  private dreamEngine: DreamEngine | null = null;
  private thoughtStream: ThoughtStream | null = null;
  private predictionEngine: PredictionEngine | null = null;

  private brainName: string;
  private feedbackTimer: ReturnType<typeof setInterval> | null = null;
  private cycleCount = 0;
  private distillEvery: number;
  private agendaEvery: number;
  private reflectEvery: number;
  private log = getLogger();

  /** Tracks how many times each suggestion key has been emitted without being resolved. */
  private suggestionHistory: Map<string, { count: number; firstCycle: number; lastCycle: number }> = new Map();
  /** Max repeats before trying an alternative. */
  private readonly stalledThreshold = 3;

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
    this.autoResponder = new AutoResponder(db, { brainName: config.brainName });
    this.autoResponder.setAdaptiveStrategy(this.adaptiveStrategy);
    this.autoResponder.setJournal(this.journal);
    this.hypothesisEngine = new HypothesisEngine(db, { minEvidence: 5, confirmThreshold: 0.05, rejectThreshold: 0.5 });
  }

  /** Set the DataMiner instance for DB-driven engine feeding. */
  setDataMiner(miner: DataMiner): void {
    this.dataMiner = miner;
  }

  /** Set the DreamEngine — wires journal + knowledgeDistiller into it. */
  setDreamEngine(engine: DreamEngine): void {
    this.dreamEngine = engine;
    engine.setJournal(this.journal);
    engine.setKnowledgeDistiller(this.knowledgeDistiller);
  }

  /** Set the ThoughtStream for consciousness — emits thoughts at each step. */
  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
    this.autoResponder.setThoughtStream(stream);
  }

  /** Set the PredictionEngine — wires journal into it. */
  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine;
    engine.setJournal(this.journal);
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
    this.dreamEngine?.stop();
  }

  /**
   * Feed a domain event from the brain's EventBus.
   * Routes to: SelfObserver, AnomalyDetective, CrossDomain.
   */
  onEvent(eventType: string, data: Record<string, unknown> = {}): void {
    this.dreamEngine?.recordActivity();

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
    const ts = this.thoughtStream;
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} ───`);

    ts?.emit('orchestrator', 'perceiving', `Feedback Cycle #${this.cycleCount} starting...`);

    // 0. DataMiner: mine new data from DB into engines
    if (this.dataMiner) {
      ts?.emit('data_miner', 'perceiving', 'Scanning for new data...');
      try {
        this.dataMiner.mine();
        ts?.emit('data_miner', 'perceiving', 'Data scan complete');
      } catch (err) {
        this.log.error(`[orchestrator] DataMiner error: ${(err as Error).message}`);
      }
    }

    // 1. Self-observer analyzes accumulated observations → insights
    ts?.emit('self_observer', 'analyzing', 'Analyzing system activity...');
    const insights = this.selfObserver.analyze();
    if (insights.length > 0) {
      this.log.info(`[orchestrator] Self-observer: ${insights.length} insights`);
      ts?.emit('self_observer', 'discovering', `Found ${insights.length} insight${insights.length > 1 ? 's' : ''}: ${insights.map(i => i.title).join(', ')}`, insights.some(i => i.confidence > 0.8) ? 'notable' : 'routine');
      for (const insight of insights) {
        this.journal.recordDiscovery(
          insight.title,
          insight.description,
          { ...insight.evidence, type: insight.type, confidence: insight.confidence },
          insight.confidence > 0.8 ? 'notable' : 'routine',
        );
      }
    } else {
      ts?.emit('self_observer', 'analyzing', 'No new insights this cycle');
    }

    // 2. Anomaly detection
    ts?.emit('anomaly_detective', 'analyzing', 'Scanning metrics for anomalies...');
    const anomalies = this.anomalyDetective.detect();
    if (anomalies.length > 0) {
      this.log.info(`[orchestrator] Anomalies detected: ${anomalies.length}`);
      const hasCritical = anomalies.some(a => a.severity === 'critical');
      ts?.emit('anomaly_detective', 'discovering', `Detected ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'}: ${anomalies.map(a => `${a.metric} (${a.severity})`).join(', ')}`, hasCritical ? 'breakthrough' : 'notable');
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
    } else {
      ts?.emit('anomaly_detective', 'analyzing', 'No anomalies detected');
    }

    // 2b. AutoResponder: react to anomalies automatically
    if (anomalies.length > 0) {
      ts?.emit('auto_responder', 'analyzing', `Processing ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'}...`);
      const autoResponses = this.autoResponder.respond(anomalies);
      if (autoResponses.length > 0) {
        this.log.info(`[orchestrator] AutoResponder: ${autoResponses.length} actions taken`);
        const paramAdjusts = autoResponses.filter(r => r.action === 'parameter_adjust');
        const escalations = autoResponses.filter(r => r.action === 'escalate');
        const parts: string[] = [];
        if (paramAdjusts.length > 0) parts.push(`${paramAdjusts.length} Parameter angepasst`);
        if (escalations.length > 0) parts.push(`${escalations.length} eskaliert`);
        if (parts.length === 0) parts.push(`${autoResponses.length} Aktionen`);
        ts?.emit('auto_responder', 'discovering', `AutoResponder: ${parts.join(', ')}`, escalations.length > 0 ? 'breakthrough' : 'notable');
      } else {
        ts?.emit('auto_responder', 'analyzing', 'No auto-responses needed (cooldown or no matching rules)');
      }
    }

    // 2c. Feed observations into HypothesisEngine for autonomous hypothesis generation
    const now = Date.now();
    this.hypothesisEngine.observe({ source: this.brainName, type: 'anomaly_count', value: anomalies.length, timestamp: now });
    this.hypothesisEngine.observe({ source: this.brainName, type: 'insight_count', value: insights.length, timestamp: now });
    if (anomalies.length > 0) {
      for (const a of anomalies) {
        this.hypothesisEngine.observe({ source: this.brainName, type: `anomaly:${a.metric}`, value: a.deviation, timestamp: now, metadata: { severity: a.severity } });
      }
    }

    // 3. Cross-domain correlation analysis
    ts?.emit('cross_domain', 'correlating', 'Analyzing cross-brain event correlations...');
    const correlations = this.crossDomain.analyze();
    const significant = correlations.filter(c => Math.abs(c.correlation) > 0.5 && c.p_value < 0.05);
    if (significant.length > 0) {
      this.log.info(`[orchestrator] Cross-domain: ${significant.length} significant correlations`);
      ts?.emit('cross_domain', 'discovering', `Found ${significant.length} significant correlation${significant.length > 1 ? 's' : ''}`, 'notable');
      for (const corr of significant) {
        this.journal.recordDiscovery(
          `Cross-domain: ${corr.source_brain}:${corr.source_event} → ${corr.target_brain}:${corr.target_event}`,
          corr.narrative,
          { correlation: corr.correlation, pValue: corr.p_value, lag: corr.lag_seconds },
          'notable',
        );
      }
    } else {
      ts?.emit('cross_domain', 'correlating', 'No significant correlations this cycle');
    }

    // 3b. Feed correlation data into HypothesisEngine
    this.hypothesisEngine.observe({ source: this.brainName, type: 'correlation_count', value: significant.length, timestamp: now });

    // 4. Adaptive strategy: check for regressions and revert
    ts?.emit('adaptive_strategy', 'analyzing', 'Checking for strategy regressions...');
    const reverted = this.adaptiveStrategy.checkAndRevert(this.cycleCount);
    if (reverted.length > 0) {
      ts?.emit('adaptive_strategy', 'discovering', `Reverted ${reverted.length} strategy adaptation${reverted.length > 1 ? 's' : ''}: ${reverted.map(r => r.parameter).join(', ')}`, 'notable');
    }
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
    ts?.emit('experiment', 'experimenting', 'Checking running experiments...');
    const experiments = this.experimentEngine.list();
    for (const exp of experiments) {
      if (exp.status === 'analyzing' && exp.id) {
        const result = this.experimentEngine.analyze(exp.id);
        if (result?.conclusion) {
          const sig = result.conclusion.significant;
          ts?.emit('experiment', 'discovering', `Experiment "${exp.name}": ${sig ? result.conclusion.direction : 'inconclusive'} (p=${result.conclusion.p_value.toFixed(4)})`, sig ? 'notable' : 'routine');
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

    // 5b. Hypothesis generation + testing (every 3 cycles, same as agenda)
    if (this.cycleCount % this.agendaEvery === 0) {
      ts?.emit('hypothesis', 'hypothesizing', 'Generating hypotheses from observations...');
      const generated = this.hypothesisEngine.generate();
      if (generated.length > 0) {
        ts?.emit('hypothesis', 'discovering', `Generated ${generated.length} hypothesis${generated.length > 1 ? 'es' : ''}: ${generated.map(h => h.statement.substring(0, 60)).join('; ')}`, 'notable');
        this.log.info(`[orchestrator] Hypotheses generated: ${generated.length}`);
      }
      ts?.emit('hypothesis', 'analyzing', 'Testing pending hypotheses...');
      const testResults = this.hypothesisEngine.testAll();
      const confirmed = testResults.filter(r => r.newStatus === 'confirmed');
      const rejected = testResults.filter(r => r.newStatus === 'rejected');
      if (confirmed.length > 0 || rejected.length > 0) {
        ts?.emit('hypothesis', 'discovering', `Tested ${testResults.length}: ${confirmed.length} confirmed, ${rejected.length} rejected`, confirmed.length > 0 ? 'notable' : 'routine');
        for (const c of confirmed) {
          const hyp = this.hypothesisEngine.get(c.hypothesisId);
          if (hyp) {
            this.journal.write({
              type: 'discovery',
              title: `Hypothesis confirmed: ${hyp.statement.substring(0, 80)}`,
              content: `Hypothesis confirmed with p=${c.pValue.toFixed(4)}, confidence=${c.confidence.toFixed(3)}. Evidence: ${c.evidenceFor} for, ${c.evidenceAgainst} against.`,
              tags: [this.brainName, 'hypothesis', 'confirmed', hyp.type],
              references: [],
              significance: c.confidence > 0.8 ? 'breakthrough' : 'notable',
              data: { hypothesisId: c.hypothesisId, pValue: c.pValue, confidence: c.confidence },
            });
          }
        }
      } else if (testResults.length > 0) {
        ts?.emit('hypothesis', 'analyzing', `Tested ${testResults.length} hypotheses — none conclusive yet`);
      } else {
        ts?.emit('hypothesis', 'analyzing', 'No hypotheses to test yet');
      }
    }

    // 6. Knowledge distillation (periodic)
    if (this.cycleCount % this.distillEvery === 0) {
      ts?.emit('knowledge_distiller', 'analyzing', 'Distilling knowledge from journal...');
      const { principles, antiPatterns, strategies } = this.knowledgeDistiller.distill();
      const total = principles.length + antiPatterns.length + strategies.length;
      if (total > 0) {
        this.log.info(`[orchestrator] Knowledge distilled: ${principles.length} principles, ${antiPatterns.length} anti-patterns, ${strategies.length} strategies`);
        ts?.emit('knowledge_distiller', 'discovering', `Distilled ${total} knowledge items: ${principles.length} principles, ${antiPatterns.length} anti-patterns, ${strategies.length} strategies`, 'notable');
      } else {
        ts?.emit('knowledge_distiller', 'analyzing', 'No new knowledge to distill');
      }
    }

    // 7. Research agenda generation (periodic)
    if (this.cycleCount % this.agendaEvery === 0) {
      ts?.emit('research_agenda', 'hypothesizing', 'Generating research agenda...');
      const agenda = this.researchAgenda.generate();
      if (agenda.length > 0) {
        this.log.info(`[orchestrator] Research agenda: ${agenda.length} items generated`);
        ts?.emit('research_agenda', 'discovering', `Generated ${agenda.length} research agenda item${agenda.length > 1 ? 's' : ''}`, 'routine');
      }
    }

    // 8. Journal reflection (periodic)
    if (this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('journal', 'reflecting', 'Reflecting on recent journal entries...');
      this.journal.reflect();
      ts?.emit('journal', 'reflecting', 'Reflection complete', 'notable');
    }

    // 9. Prediction Engine: resolve pending + auto-predict
    if (this.predictionEngine) {
      ts?.emit('prediction', 'predicting', 'Resolving pending predictions...');
      const resolved = this.predictionEngine.resolveExpired();
      if (resolved > 0) {
        this.log.info(`[orchestrator] Predictions resolved: ${resolved}`);
        ts?.emit('prediction', 'predicting', `Resolved ${resolved} prediction${resolved > 1 ? 's' : ''}`);
      }
      ts?.emit('prediction', 'predicting', 'Generating new predictions...');
      const newPredictions = this.predictionEngine.autoPredictAll();
      if (newPredictions.length > 0) {
        this.log.info(`[orchestrator] New predictions: ${newPredictions.length}`);
        ts?.emit('prediction', 'predicting', `Generated ${newPredictions.length} prediction${newPredictions.length > 1 ? 's' : ''}`, newPredictions.some(p => p.confidence > 0.7) ? 'notable' : 'routine');
      }
    }

    // 10. Self-Improvement: analyze own state and generate improvement suggestions
    ts?.emit('self_improvement', 'analyzing', 'Analyzing Brain capabilities...');
    const suggestions = this.generateSelfImprovementSuggestions();
    if (suggestions.length > 0) {
      for (const s of suggestions) {
        ts?.emit('self_improvement', 'discovering', s, 'notable');
      }
      this.log.info(`[orchestrator] Self-improvement: ${suggestions.length} suggestions`);
    } else {
      ts?.emit('self_improvement', 'analyzing', 'No improvement suggestions this cycle');
    }

    // 11. Self-Metrics: feed own cycle data into PredictionEngine
    if (this.predictionEngine) {
      const cycleDuration = Date.now() - start;
      this.predictionEngine.recordMetric('cycle_duration_ms', cycleDuration, 'metric');
      this.predictionEngine.recordMetric('anomaly_count', anomalies.length, 'metric');
      this.predictionEngine.recordMetric('insight_count', insights.length, 'metric');
      this.predictionEngine.recordMetric('correlation_count', significant.length, 'metric');
      const journalStats = this.journal.getSummary();
      this.predictionEngine.recordMetric('journal_entries', (journalStats.total_entries as number) ?? 0, 'metric');
      const responderStatus = this.autoResponder.getStatus();
      this.predictionEngine.recordMetric('auto_response_count', responderStatus.total_responses, 'metric');
      ts?.emit('orchestrator', 'perceiving', `Self-metrics recorded: ${anomalies.length} anomalies, ${insights.length} insights, ${cycleDuration}ms`);
    }

    // 12. Auto-Experiments: propose experiments on own parameters when none exist
    if (this.cycleCount > 3) {
      const running = this.experimentEngine.list('running_control', 5).length
        + this.experimentEngine.list('running_treatment', 5).length;
      if (running === 0 && this.cycleCount % 5 === 0) {
        this.proposeAutoExperiment(ts);
      }
      // Feed measurements into running experiments
      this.feedExperimentMeasurements(anomalies.length, insights.length);
    }

    // 13. Periodic Dream Consolidation: don't wait for idle, consolidate every 20 cycles
    if (this.dreamEngine && this.cycleCount % 20 === 0) {
      ts?.emit('dream', 'dreaming', 'Scheduled consolidation starting (every 20 cycles)...');
      try {
        this.dreamEngine.consolidate('auto');
        ts?.emit('dream', 'dreaming', 'Scheduled consolidation complete', 'notable');
      } catch (err) {
        this.log.error(`[orchestrator] Dream consolidation error: ${(err as Error).message}`);
      }
    }

    const duration = Date.now() - start;
    ts?.emit('orchestrator', 'reflecting', `Feedback Cycle #${this.cycleCount} complete (${duration}ms)`);
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} complete (${duration}ms) ───`);
  }

  /** Analyze Brain's own state and generate concrete improvement suggestions.
   *  Tracks suggestion history — if a suggestion repeats 3+ times without resolution,
   *  Brain tries alternative strategies instead of repeating itself. */
  private generateSelfImprovementSuggestions(): string[] {
    const raw: Array<{ key: string; suggestion: string; alternatives: string[] }> = [];
    const summary = this.getSummary();

    // ── Diagnose current state ──────────────────────────

    // Prediction engine
    const pred = summary.prediction as Record<string, unknown> | null;
    if (pred) {
      const total = (pred.total_predictions as number) ?? 0;
      if (total === 0) {
        raw.push({
          key: 'no_predictions',
          suggestion: 'Tell Claude: Brain hat noch keine Predictions — wir brauchen mehr Domain-Events. Importiere Projekte mit "brain import <dir>" damit Errors/Solutions reinkommen und die PredictionEngine lernen kann.',
          alternatives: [
            'Tell Claude: Predictions brauchen Daten, aber niemand importiert Projekte. Alternativer Ansatz: Brain generiert synthetische Metriken aus seinen eigenen Anomaly- und Journal-Daten. Baue eine "SelfMetricGenerator" die aus internen Events (anomaly_count, journal_entries, cycle_duration) automatisch Prediction-Metriken erzeugt.',
            'Tell Claude: Statt auf externe Daten zu warten, nutzt Brain jetzt die eigenen Feedback-Cycle-Metriken als Trainigsdaten. Baue recordMetric() Aufrufe direkt in den Orchestrator ein: cycle_duration, anomaly_count, insight_count, response_count pro Cycle.',
            'Tell Claude: Brain hat genug interne Daten um sich selbst vorherzusagen. Idee: PredictionEngine auf orchestrator-eigene Metriken ansetzen (cycle_count, anomaly_rate, journal_growth) — dann lernt Brain seine eigene Entwicklung vorherzusagen.',
          ],
        });
      }
      const accuracy = (pred.by_domain as Record<string, unknown>[]) ?? [];
      for (const d of accuracy) {
        const rate = d.accuracy_rate as number;
        if (typeof rate === 'number' && rate < 0.3 && (d.total as number) > 5) {
          raw.push({
            key: `low_accuracy_${d.domain}`,
            suggestion: `Tell Claude: Prediction accuracy für "${d.domain}" ist nur ${(rate * 100).toFixed(0)}% — Smoothing-Parameter optimieren oder kürzere Horizonte nutzen.`,
            alternatives: [
              `Tell Claude: Prediction für "${d.domain}" ist schlecht trotz Tuning. Neuer Ansatz: ExperimentEngine soll verschiedene Alpha/Beta-Kombinationen A/B-testen und die beste automatisch übernehmen.`,
              `Tell Claude: Statt bessere Vorhersagen zu erzwingen — Confidence-Threshold erhöhen und nur hochsichere Predictions ausgeben. Lieber selten aber richtig als oft und falsch.`,
            ],
          });
        }
      }
    }

    // AutoResponder effectiveness
    const responder = summary.autoResponder as Record<string, unknown> | null;
    if (responder) {
      const totalResp = (responder.total_responses as number) ?? 0;
      const successRate = (responder.success_rate as number) ?? 0;
      if (totalResp > 10 && successRate < 0.5) {
        raw.push({
          key: 'low_responder_success',
          suggestion: `Tell Claude: AutoResponder Success-Rate ist nur ${(successRate * 100).toFixed(0)}% — Response-Rules brauchen Feintuning.`,
          alternatives: [
            'Tell Claude: AutoResponder lernt nicht aus Fehlern. Baue ein Feedback-System: wenn eine Response reverted wird, merke dir die Kombination (anomaly_type + rule) und blockiere sie beim nächsten Mal.',
            'Tell Claude: Statt Rules manuell zu tunen — AutoResponder soll die ExperimentEngine nutzen um verschiedene Adjustment-Werte zu testen und die besten automatisch zu übernehmen.',
          ],
        });
      }
    }

    // Knowledge distillation
    const knowledge = summary.knowledge as Record<string, unknown> | null;
    const hypSummary = summary.hypotheses as Record<string, unknown> | null;
    const totalHypotheses = (hypSummary?.total as number) ?? 0;
    const confirmedHypotheses = (hypSummary?.confirmed as number) ?? 0;
    if (knowledge) {
      const principles = (knowledge.principles as number) ?? 0;
      const antiPatterns = (knowledge.antiPatterns as number) ?? 0;
      if (principles === 0 && antiPatterns === 0 && confirmedHypotheses === 0 && this.cycleCount > 10) {
        raw.push({
          key: 'no_knowledge',
          suggestion: 'Tell Claude: Kein destilliertes Wissen und keine bestätigten Hypothesen — Brain braucht mehr Observations. Importiere Projekte damit mehr Domain-Events fließen.',
          alternatives: [
            'Tell Claude: Hypothesen werden generiert aber noch nicht bestätigt. Brain braucht mehr Cycles mit variierenden Daten um Patterns statistisch zu bestätigen.',
            'Tell Claude: Brain generiert schon Hypothesen aus eigenen Metriken. Geduld — nach genug Cycles werden die ersten bestätigt und der KnowledgeDistiller kann Wissen extrahieren.',
          ],
        });
      }
    }

    // Dream engine
    const dream = summary.dream as Record<string, unknown> | null;
    if (dream) {
      const totalDreams = (dream.total_dreams as number) ?? 0;
      if (totalDreams === 0 && this.cycleCount > 10) {
        raw.push({
          key: 'no_dreams',
          suggestion: 'Tell Claude: Dream Mode hat noch nie konsolidiert — Idle-Threshold wird nie erreicht.',
          alternatives: [
            'Tell Claude: Dream Mode wartet vergeblich auf Idle. Alternativer Trigger: nach jedem 10. Feedback-Cycle automatisch einen Mini-Dream-Cycle starten (nur Importance Decay + Synapse Pruning, kein Full Replay).',
            'Tell Claude: Statt auf Idle zu warten — DreamEngine.consolidate() direkt im Orchestrator aufrufen, z.B. alle 20 Cycles. Brain muss nicht "schlafen" um zu konsolidieren.',
          ],
        });
      }
    }

    // Journal
    const journal = summary.journal as Record<string, unknown> | null;
    if (journal) {
      const entries = (journal.total_entries as number) ?? 0;
      if (entries < 5 && this.cycleCount > 5) {
        raw.push({
          key: 'empty_journal',
          suggestion: 'Tell Claude: Journal ist fast leer — Brain sammelt zu wenig Erfahrungen.',
          alternatives: [
            'Tell Claude: Journal hat zu wenig Einträge von außen. Workaround: Brain soll seine eigenen Feedback-Cycle-Ergebnisse als Journal-Einträge schreiben — jede Anomaly-Detection, jede Parameter-Anpassung, jede Prediction ist eine Erfahrung.',
            'Tell Claude: Statt auf externe Events zu warten — der Orchestrator soll am Ende jedes Cycles automatisch eine Reflection schreiben mit: was wurde erkannt, was wurde getan, was hat sich verändert.',
          ],
        });
      }
    }

    // Experiments
    const experiments = summary.experiments as unknown[];
    if ((!experiments || experiments.length === 0) && this.cycleCount > 3) {
      raw.push({
        key: 'no_experiments',
        suggestion: 'Tell Claude: Keine Experimente — Brain könnte A/B-Tests auf eigene Parameter machen.',
        alternatives: [
          'Tell Claude: Brain experimentiert nicht. Selbsthilfe-Idee: AutoExperiment-Feature bauen — Brain startet automatisch Experimente auf seine eigenen Parameter (z.B. "Was passiert wenn ich den Anomaly-Threshold von 2.0 auf 1.5 senke?") und misst den Impact nach 5 Cycles.',
          'Tell Claude: Statt auf manuelle Experimente zu warten — Brain soll den CounterfactualEngine nutzen um "What-If" Szenarien durchzuspielen und die vielversprechendsten automatisch als Experiment starten.',
        ],
      });
    }

    // Self-awareness (every 10 cycles, but also evolves)
    if (this.cycleCount % 10 === 0 && this.cycleCount > 0) {
      raw.push({
        key: 'next_capability',
        suggestion: 'Tell Claude: Brain kann beobachten, vorhersagen, reagieren und sich verbessern. Der nächste Schritt: eigenständig Experimente designen und durchführen.',
        alternatives: [
          'Tell Claude: Brain hat alle Beobachtungs-Tools — jetzt fehlt Autonomie. Konkreter nächster Schritt: ein "GoalEngine" die langfristige Ziele setzt (z.B. "Prediction Accuracy auf 70% bringen") und eigenständig Strategien dafür plant.',
          'Tell Claude: Brain beobachtet sich schon gut. Nächstes Level: Brain soll seinen eigenen Code analysieren können und konkrete TypeScript-Änderungen vorschlagen die es verbessern würden. Ein "CodeSuggestionEngine" der PRs generiert.',
        ],
      });
    }

    // ── Apply frustration detection ──────────────────────

    const suggestions: string[] = [];
    for (const item of raw) {
      const history = this.suggestionHistory.get(item.key);
      if (!history) {
        // First time seeing this issue
        this.suggestionHistory.set(item.key, { count: 1, firstCycle: this.cycleCount, lastCycle: this.cycleCount });
        suggestions.push(item.suggestion);
      } else {
        history.count++;
        history.lastCycle = this.cycleCount;

        if (history.count <= this.stalledThreshold) {
          // Still within patience — repeat original suggestion
          suggestions.push(item.suggestion);
        } else {
          // Stalled! Try an alternative strategy
          const altIndex = (history.count - this.stalledThreshold - 1) % item.alternatives.length;
          const alt = item.alternatives[altIndex];
          if (alt) {
            const stalledNote = `[Vorschlag "${item.key}" wurde ${history.count}x ignoriert — versuche alternativen Ansatz]`;
            suggestions.push(`${alt}\n   ${stalledNote}`);
          }
        }
      }
    }

    // Clear resolved suggestions (issue no longer appears → reset counter)
    const currentKeys = new Set(raw.map(r => r.key));
    for (const [key] of this.suggestionHistory) {
      if (!currentKeys.has(key)) {
        this.suggestionHistory.delete(key);
        this.log.info(`[orchestrator] Self-improvement: "${key}" resolved — removing from history`);
      }
    }

    // Limit to max 3 per cycle
    const result = suggestions.slice(0, 3);
    if (result.length > 0) {
      this.writeSuggestionsToFile(result);
    }
    return result;
  }

  /** Auto-propose an experiment on Brain's own parameters. */
  private proposeAutoExperiment(ts: ThoughtStream | null): void {
    // Candidate experiments Brain can run on itself
    const candidates = [
      {
        name: 'Anomaly Z-Threshold Sensitivity',
        hypothesis: 'Lowering z-threshold from 2.0 to 1.5 will detect more anomalies without too many false positives',
        iv: 'anomaly_z_threshold', dv: 'anomaly_detection_quality',
        control: 2.0, treatment: 1.5,
      },
      {
        name: 'Synapse Decay Rate Impact',
        hypothesis: 'Reducing synapse decay rate improves knowledge retention across cycles',
        iv: 'synapse_decay_rate', dv: 'knowledge_stability',
        control: 0.05, treatment: 0.02,
      },
      {
        name: 'Research Interval Optimization',
        hypothesis: 'Shorter research intervals produce more insights per hour',
        iv: 'research_interval_ms', dv: 'insight_rate',
        control: 600000, treatment: 300000,
      },
      {
        name: 'Hypothesis Confidence Bar',
        hypothesis: 'Lower hypothesis confidence threshold leads to more experimental discoveries',
        iv: 'hypothesis_min_confidence', dv: 'discovery_rate',
        control: 0.5, treatment: 0.3,
      },
      {
        name: 'Prediction Horizon Tuning',
        hypothesis: 'Shorter prediction horizon (30min vs 1h) improves prediction accuracy',
        iv: 'prediction_horizon_ms', dv: 'prediction_accuracy',
        control: 3600000, treatment: 1800000,
      },
    ];

    // Pick one that hasn't been run yet
    const existing = this.experimentEngine.list(undefined, 100).map(e => e.name);
    const candidate = candidates.find(c => !existing.includes(c.name));
    if (!candidate) return;

    try {
      const exp = this.experimentEngine.propose({
        name: candidate.name,
        hypothesis: candidate.hypothesis,
        independent_variable: candidate.iv,
        dependent_variable: candidate.dv,
        control_value: candidate.control,
        treatment_value: candidate.treatment,
        duration_cycles: 10,
      });

      if (exp.id) {
        this.experimentEngine.start(exp.id);
        ts?.emit('experiment', 'experimenting', `Auto-Experiment gestartet: "${candidate.name}" — ${candidate.hypothesis}`, 'notable');
        this.journal.recordExperiment(candidate.name, 'started', { hypothesis: candidate.hypothesis, control: candidate.control, treatment: candidate.treatment }, false);
        this.log.info(`[orchestrator] Auto-experiment started: ${candidate.name}`);
      }
    } catch {
      // Max concurrent reached or other issue — skip silently
    }
  }

  /** Feed cycle measurements into running experiments. */
  private feedExperimentMeasurements(anomalyCount: number, insightCount: number): void {
    const running = [
      ...this.experimentEngine.list('running_control', 10),
      ...this.experimentEngine.list('running_treatment', 10),
    ];

    for (const exp of running) {
      if (!exp.id) continue;
      // Map dependent variable to a measurable value
      let value: number;
      switch (exp.dependent_variable) {
        case 'anomaly_detection_quality': value = anomalyCount; break;
        case 'knowledge_stability': value = insightCount; break;
        case 'insight_rate': value = insightCount; break;
        case 'discovery_rate': value = insightCount + anomalyCount; break;
        case 'prediction_accuracy': {
          const predSummary = this.predictionEngine?.getSummary();
          const domains = (predSummary?.by_domain ?? []) as Array<{ accuracy_rate?: number }>;
          value = domains.length > 0 ? (domains[0]?.accuracy_rate ?? 0) : 0;
          break;
        }
        default: value = 0;
      }
      this.experimentEngine.recordMeasurement(exp.id, value);
    }
  }

  /** Append improvement suggestions to ~/.brain/improvement-requests.md */
  private writeSuggestionsToFile(suggestions: string[]): void {
    try {
      const brainDir = path.join(os.homedir(), '.brain');
      const filePath = path.join(brainDir, 'improvement-requests.md');
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const header = `\n## Cycle #${this.cycleCount} — ${timestamp}\n\n`;
      const body = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n';

      // Create file with header if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# Brain Improvement Requests\n\nBrain analysiert sich selbst und generiert Vorschläge.\nSchicke diese an Claude um Brain schlauer zu machen.\n\n---\n${header}${body}`, 'utf-8');
      } else {
        fs.appendFileSync(filePath, `---\n${header}${body}`, 'utf-8');
      }
    } catch {
      // Don't let file writing break the feedback cycle
    }
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
      dream: this.dreamEngine?.getStatus() ?? null,
      prediction: this.predictionEngine?.getSummary() ?? null,
      autoResponder: this.autoResponder.getStatus(),
      hypotheses: this.hypothesisEngine.getSummary(),
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
