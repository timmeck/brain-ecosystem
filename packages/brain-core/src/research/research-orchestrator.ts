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
import type { SignalScanner } from '../scanner/signal-scanner.js';
import type { CodeGenerator } from '../codegen/code-generator.js';
import type { CodeMiner } from '../codegen/code-miner.js';
import type { AttentionEngine } from '../attention/attention-engine.js';
import type { TransferEngine } from '../transfer/transfer-engine.js';
import type { NarrativeEngine } from '../narrative/narrative-engine.js';
import type { CuriosityEngine } from '../curiosity/curiosity-engine.js';
import type { EmergenceEngine } from '../emergence/emergence-engine.js';
import type { DebateEngine } from '../debate/debate-engine.js';
import type { ParameterRegistry } from '../metacognition/parameter-registry.js';
import type { MetaCognitionLayer } from '../metacognition/meta-cognition-layer.js';
import type { AutoExperimentEngine } from '../metacognition/auto-experiment-engine.js';
import type { SelfTestEngine } from '../metacognition/self-test-engine.js';
import type { TeachEngine } from '../metacognition/teach-engine.js';
import type { DataScout } from './data-scout.js';
import type { SimulationEngine } from '../metacognition/simulation-engine.js';
import type { MemoryPalace } from '../memory-palace/memory-palace.js';
import type { GoalEngine } from '../goals/goal-engine.js';
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
  private signalScanner: SignalScanner | null = null;
  private codeGenerator: CodeGenerator | null = null;
  private codeMiner: CodeMiner | null = null;
  private attentionEngine: AttentionEngine | null = null;
  private transferEngine: TransferEngine | null = null;
  private narrativeEngine: NarrativeEngine | null = null;
  private curiosityEngine: CuriosityEngine | null = null;
  private emergenceEngine: EmergenceEngine | null = null;
  private debateEngine: DebateEngine | null = null;
  private parameterRegistry: ParameterRegistry | null = null;
  private metaCognitionLayer: MetaCognitionLayer | null = null;
  private autoExperimentEngine: AutoExperimentEngine | null = null;
  private selfTestEngine: SelfTestEngine | null = null;
  private teachEngine: TeachEngine | null = null;
  private dataScout: DataScout | null = null;
  private simulationEngine: SimulationEngine | null = null;
  private memoryPalace: MemoryPalace | null = null;
  private goalEngine: GoalEngine | null = null;

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
  /** Hash of last written suggestions to prevent duplicate file writes. */
  private lastSuggestionsHash = '';

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

  /** Set the SignalScanner — feeds scan results into journal/predictions. */
  setSignalScanner(scanner: SignalScanner): void {
    this.signalScanner = scanner;
  }

  /** Set the CodeGenerator — autonomous code generation from brain knowledge. */
  setCodeGenerator(generator: CodeGenerator): void {
    this.codeGenerator = generator;
    generator.setJournal(this.journal);
    generator.setKnowledgeDistiller(this.knowledgeDistiller);
  }

  /** Set the CodeMiner — mines repo contents from GitHub for pattern analysis. */
  setCodeMiner(miner: CodeMiner): void {
    this.codeMiner = miner;
  }

  /** Set the AttentionEngine — dynamic focus and resource allocation. */
  setAttentionEngine(engine: AttentionEngine): void {
    this.attentionEngine = engine;
  }

  /** Set the TransferEngine — cross-domain knowledge transfer. */
  setTransferEngine(engine: TransferEngine): void {
    this.transferEngine = engine;
  }

  /** Set the NarrativeEngine — brain explains itself in natural language. */
  setNarrativeEngine(engine: NarrativeEngine): void {
    this.narrativeEngine = engine;
  }

  /** Set the CuriosityEngine — knowledge gap detection and exploration/exploitation. */
  setCuriosityEngine(engine: CuriosityEngine): void {
    this.curiosityEngine = engine;
  }

  /** Set the EmergenceEngine — tracks emergent behaviors and complexity metrics. */
  setEmergenceEngine(engine: EmergenceEngine): void {
    this.emergenceEngine = engine;
  }

  setDebateEngine(engine: DebateEngine): void {
    this.debateEngine = engine;
  }

  /** Set the ParameterRegistry — central tunable parameter store. */
  setParameterRegistry(registry: ParameterRegistry): void {
    this.parameterRegistry = registry;
  }

  /** Set the MetaCognitionLayer — engine evaluation and frequency adjustment. */
  setMetaCognitionLayer(layer: MetaCognitionLayer): void {
    this.metaCognitionLayer = layer;
  }

  /** Set the AutoExperimentEngine — autonomous parameter tuning. */
  setAutoExperimentEngine(engine: AutoExperimentEngine): void {
    this.autoExperimentEngine = engine;
  }

  /** Set the SelfTestEngine — tests understanding depth of principles. */
  setSelfTestEngine(engine: SelfTestEngine): void { this.selfTestEngine = engine; }

  /** Set the TeachEngine — generates onboarding packages for new brains. */
  setTeachEngine(engine: TeachEngine): void { this.teachEngine = engine; }

  /** Set the DataScout — actively scouts external data sources. */
  setDataScout(scout: DataScout): void { this.dataScout = scout; }

  /** Set the SimulationEngine — runs what-if scenarios. */
  setSimulationEngine(engine: SimulationEngine): void { this.simulationEngine = engine; }

  /** Set the MemoryPalace — knowledge connection graph. */
  setMemoryPalace(palace: MemoryPalace): void { this.memoryPalace = palace; }

  /** Set the GoalEngine — autonomous goal setting and tracking. */
  setGoalEngine(engine: GoalEngine): void { this.goalEngine = engine; }

  /** Set the PredictionEngine — wires journal into it. */
  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine;
    engine.setJournal(this.journal);
  }

  /** Start the autonomous feedback loop timer. */
  start(intervalMs = 300_000): void {
    if (this.feedbackTimer) return;
    this.feedbackTimer = setInterval(() => {
      try { void this.runFeedbackCycle(); }
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
  async runFeedbackCycle(): Promise<void> {
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

    // 2d. Attention Engine: decay scores, compute engine weights, persist focus
    if (this.attentionEngine) {
      ts?.emit('attention', 'focusing', 'Updating attention scores and engine weights...');
      this.attentionEngine.decay();
      const weights = this.attentionEngine.computeEngineWeights();
      const topTopics = this.attentionEngine.getTopTopics(3);
      const urgent = this.attentionEngine.getUrgentTopics();
      const context = this.attentionEngine.getCurrentContext();

      if (urgent.length > 0) {
        ts?.emit('attention', 'focusing', `Urgent: ${urgent.map(u => `"${u.topic}" (${u.urgency.toFixed(1)})`).join(', ')}`, 'notable');
      }
      if (topTopics.length > 0) {
        const topStr = topTopics.map(t => `${t.topic}(${t.score.toFixed(1)})`).join(', ');
        ts?.emit('attention', 'focusing', `Context: ${context} | Top: ${topStr} | Weights: ${weights.slice(0, 3).map(w => `${w.engine}=${w.weight.toFixed(1)}`).join(', ')}`);
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

    // 6b. Cross-domain transfer analysis (after distillation, every 5 cycles)
    if (this.transferEngine && this.cycleCount % this.distillEvery === 0) {
      ts?.emit('transfer', 'correlating', 'Analyzing cross-domain knowledge transfers...');
      try {
        const { analogies, proposals } = this.transferEngine.analyze();
        if (analogies.length > 0 || proposals.length > 0) {
          this.log.info(`[orchestrator] Transfer: ${analogies.length} analogies, ${proposals.length} proposals`);
          if (analogies.length > 0) {
            const topAnalogy = analogies.sort((a, b) => b.similarity - a.similarity)[0]!;
            ts?.emit('transfer', 'discovering', `Top analogy: ${topAnalogy.narrative}`, 'notable');
          }
        } else {
          ts?.emit('transfer', 'analyzing', 'No new cross-domain transfers found');
        }
      } catch (err) {
        this.log.error(`[orchestrator] Transfer analysis error: ${(err as Error).message}`);
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
    // Brain is NEVER satisfied — always wants to learn more, build more, understand deeper
    ts?.emit('self_improvement', 'analyzing', 'Was fehlt mir? Was will ich können? Was verstehe ich noch nicht?');
    const suggestions = this.generateSelfImprovementSuggestions();
    for (const s of suggestions) {
      ts?.emit('self_improvement', 'discovering', s, 'notable');
    }
    this.log.info(`[orchestrator] Self-improvement: ${suggestions.length} desires this cycle`);

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

    // 12. Auto-Experiments: use AutoExperimentEngine if available, otherwise hardcoded fallback
    if (this.autoExperimentEngine && this.cycleCount > 3 && this.cycleCount % 5 === 0) {
      ts?.emit('auto_experiment', 'experimenting', 'Processing auto-experiments...');
      try {
        // Feed measurements
        this.autoExperimentEngine.feedMeasurement('insight_count', insights.length);
        this.autoExperimentEngine.feedMeasurement('anomaly_count', anomalies.length);
        // Process completed
        const completed = this.autoExperimentEngine.processCompleted(this.cycleCount);
        for (const c of completed) {
          ts?.emit('auto_experiment', 'discovering', `Auto-experiment #${c.autoExpId}: ${c.action}`, c.action === 'adopted' ? 'notable' : 'routine');
        }
        // Propose new
        const candidates = this.autoExperimentEngine.discoverCandidates(this.cycleCount);
        if (candidates.length > 0) {
          const best = candidates[0];
          const started = this.autoExperimentEngine.startExperiment(best);
          if (started) {
            ts?.emit('auto_experiment', 'experimenting', `Started: ${best.engine}.${best.name} ${best.currentValue.toFixed(3)} → ${best.proposedValue.toFixed(3)}`, 'notable');
          }
        }
      } catch (err) {
        this.log.error(`[orchestrator] AutoExperiment error: ${(err as Error).message}`);
      }
    } else if (this.cycleCount > 3) {
      // Fallback: hardcoded experiments when no AutoExperimentEngine
      const running = this.experimentEngine.list('running_control', 5).length
        + this.experimentEngine.list('running_treatment', 5).length;
      if (running === 0 && this.cycleCount % 5 === 0) {
        this.proposeAutoExperiment(ts);
      }
      this.feedExperimentMeasurements(anomalies.length, insights.length);
    }

    // 13. Periodic Dream Consolidation: don't wait for idle, consolidate every 10 cycles
    if (this.dreamEngine && this.cycleCount % 10 === 0) {
      ts?.emit('dream', 'dreaming', 'Scheduled consolidation starting (every 10 cycles)...');
      try {
        this.dreamEngine.consolidate('auto');
        ts?.emit('dream', 'dreaming', 'Scheduled consolidation complete', 'notable');
      } catch (err) {
        this.log.error(`[orchestrator] Dream consolidation error: ${(err as Error).message}`);
      }
    }

    // 14. Signal Scanner: feed latest scan results into journal + predictions
    if (this.signalScanner) {
      ts?.emit('signal_scanner', 'perceiving', 'Checking scanner results...');
      try {
        const status = this.signalScanner.getStatus();
        if (status.last_scan) {
          const scan = status.last_scan;
          // Feed scan metrics into PredictionEngine
          if (this.predictionEngine) {
            this.predictionEngine.recordMetric('scanner_total_repos', status.total_repos, 'scanner');
            this.predictionEngine.recordMetric('scanner_breakouts', status.by_level.breakout, 'scanner');
            this.predictionEngine.recordMetric('scanner_signals', status.by_level.signal, 'scanner');
          }
          // Journal new breakouts
          if (scan.new_breakouts > 0) {
            const breakouts = this.signalScanner.getSignals('breakout', 5);
            for (const repo of breakouts) {
              this.journal.recordDiscovery(
                `Breakout: ${repo.full_name}`,
                `★${repo.current_stars} (+${repo.star_velocity_24h}/24h) — Score: ${repo.signal_score.toFixed(1)} — ${repo.description ?? ''}`,
                { url: repo.url, language: repo.language, phase: repo.phase },
                'breakthrough',
              );
            }
            ts?.emit('signal_scanner', 'discovering', `${scan.new_breakouts} new breakout repo${scan.new_breakouts > 1 ? 's' : ''}!`, 'breakthrough');
          }
          // Journal new signals
          if (scan.new_signals > 0) {
            ts?.emit('signal_scanner', 'discovering', `${scan.new_signals} new signal repo${scan.new_signals > 1 ? 's' : ''}`, 'notable');
          }
        }
      } catch (err) {
        this.log.error(`[orchestrator] Scanner integration error: ${(err as Error).message}`);
      }
    }

    // 15. CodeMiner: mine new repo contents (every 10 cycles)
    if (this.codeMiner && this.cycleCount % 10 === 0) {
      ts?.emit('code_miner', 'perceiving', 'Mining new repo contents...');
      try {
        const mineResult = await this.codeMiner.mine();
        if (mineResult.mined > 0) {
          ts?.emit('code_miner', 'discovering', `Mined ${mineResult.mined} new repos`, 'notable');
        }
      } catch (err) {
        this.log.error(`[orchestrator] CodeMiner error: ${(err as Error).message}`);
      }
    }

    // 16. CodeGenerator: feed generation metrics into HypothesisEngine
    if (this.codeGenerator) {
      const codegenSummary = this.codeGenerator.getSummary();
      if (codegenSummary.total_generations > 0) {
        this.hypothesisEngine.observe({ source: this.brainName, type: 'codegen_total', value: codegenSummary.total_generations, timestamp: now });
        this.hypothesisEngine.observe({ source: this.brainName, type: 'codegen_approval_rate', value: codegenSummary.approval_rate, timestamp: now });
        if (this.predictionEngine) {
          this.predictionEngine.recordMetric('codegen_generations', codegenSummary.total_generations, 'codegen');
          this.predictionEngine.recordMetric('codegen_tokens', codegenSummary.total_tokens_used, 'codegen');
        }
      }
    }

    // 17. Self-Reflection: NarrativeEngine analyzes own knowledge, finds gaps, proposes new research
    if (this.narrativeEngine && this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('narrative', 'explaining', 'Self-reflection: analyzing knowledge state...');
      try {
        // a) Find contradictions — conflicting knowledge needs investigation
        const contradictions = this.narrativeEngine.findContradictions();
        if (contradictions.length > 0) {
          const highSeverity = contradictions.filter(c => c.severity === 'high');
          ts?.emit('narrative', 'discovering',
            `Found ${contradictions.length} contradiction${contradictions.length > 1 ? 's' : ''} (${highSeverity.length} high severity)`,
            highSeverity.length > 0 ? 'notable' : 'routine',
          );
          // Journal each high-severity contradiction
          for (const c of highSeverity.slice(0, 3)) {
            this.journal.write({
              type: 'discovery',
              title: `Contradiction: ${c.type.replace(/_/g, ' ')}`,
              content: `"${c.statement_a}" vs "${c.statement_b}". Trade-off: ${c.tradeoff}`,
              tags: [this.brainName, 'contradiction', c.severity, c.type],
              references: [],
              significance: 'notable',
              data: { contradiction: c },
            });
          }
          // Generate hypotheses from contradictions
          for (const c of contradictions.slice(0, 2)) {
            this.hypothesisEngine.observe({
              source: this.brainName,
              type: 'contradiction_detected',
              value: c.severity === 'high' ? 3 : c.severity === 'medium' ? 2 : 1,
              timestamp: now,
              metadata: { type: c.type, statement_a: c.statement_a.substring(0, 100), statement_b: c.statement_b.substring(0, 100) },
            });
          }
        }

        // b) Confidence report — find weak areas that need more research
        const confidence = this.narrativeEngine.getConfidenceReport();
        if (confidence.uncertainties.length > 0) {
          ts?.emit('narrative', 'analyzing',
            `Confidence: ${(confidence.overallConfidence * 100).toFixed(0)}% | Uncertainties: ${confidence.uncertainties.slice(0, 3).join('; ')}`,
          );
          // For each uncertainty, create a research agenda item
          for (const uncertainty of confidence.uncertainties.slice(0, 2)) {
            this.researchAgenda.ask(
              `Investigate: ${uncertainty}`,
              'knowledge_gap',
            );
          }
        }

        // c) Explain top attention topics — does Brain actually know about what it's focusing on?
        if (this.attentionEngine) {
          const topTopics = this.attentionEngine.getTopTopics(3);
          for (const topic of topTopics) {
            const explanation = this.narrativeEngine.explain(topic.topic);
            if (explanation.details.length === 0) {
              // Brain is focusing on something it knows nothing about — that's a gap!
              ts?.emit('narrative', 'discovering',
                `Knowledge gap: focusing on "${topic.topic}" but no knowledge found — adding to research agenda`,
                'notable',
              );
              this.researchAgenda.ask(
                `Why is "${topic.topic}" getting attention but Brain has no knowledge about it? Investigate and gather data.`,
                'knowledge_gap',
              );
              this.journal.write({
                type: 'reflection',
                title: `Knowledge gap: ${topic.topic}`,
                content: `Brain is paying attention to "${topic.topic}" (score: ${topic.score.toFixed(2)}) but has no principles, hypotheses, or experiments about it. This is a priority research target.`,
                tags: [this.brainName, 'knowledge_gap', 'self_reflection'],
                references: [],
                significance: 'notable',
                data: { topic: topic.topic, score: topic.score },
              });
            } else if (explanation.confidence < 0.5) {
              ts?.emit('narrative', 'analyzing',
                `Low confidence on focus topic "${topic.topic}" (${(explanation.confidence * 100).toFixed(0)}%) — needs more data`,
              );
            }
          }
        }

        // d) Periodic digest generation (every 10 reflection cycles = every 50 feedback cycles)
        if (this.cycleCount % (this.reflectEvery * 10) === 0) {
          ts?.emit('narrative', 'reflecting', 'Generating periodic knowledge digest...');
          const digest = this.narrativeEngine.generateDigest(7);
          ts?.emit('narrative', 'discovering',
            `Digest: ${digest.highlights.length} highlights, ${digest.contradictions} contradictions, accuracy ${(digest.predictions_accuracy * 100).toFixed(0)}%`,
            digest.highlights.length > 3 ? 'notable' : 'routine',
          );
        }

        ts?.emit('narrative', 'reflecting', 'Self-reflection complete');
      } catch (err) {
        this.log.error(`[orchestrator] Self-reflection error: ${(err as Error).message}`);
      }
    }

    // 18. Curiosity: Knowledge gap detection + Multi-Armed Bandit exploration
    if (this.curiosityEngine && this.cycleCount % this.agendaEvery === 0) {
      ts?.emit('curiosity', 'exploring', 'Scanning for knowledge gaps...');
      try {
        // a) Detect gaps: high attention + low knowledge
        const gaps = this.curiosityEngine.detectGaps();
        if (gaps.length > 0) {
          ts?.emit('curiosity', 'discovering',
            `Found ${gaps.length} knowledge gap(s): ${gaps.slice(0, 3).map(g => `"${g.topic}" (${(g.gapScore * 100).toFixed(0)}%)`).join(', ')}`,
            gaps.some(g => g.gapType === 'dark_zone') ? 'notable' : 'routine',
          );
          // Journal dark zones (truly unknown territory)
          for (const gap of gaps.filter(g => g.gapType === 'dark_zone').slice(0, 2)) {
            this.journal.write({
              type: 'discovery',
              title: `Dark zone: ${gap.topic}`,
              content: `Brain pays attention to "${gap.topic}" (score: ${gap.attentionScore.toFixed(2)}) but has zero knowledge. Questions: ${gap.questions.slice(0, 2).join(' | ')}`,
              tags: [this.brainName, 'curiosity', 'dark_zone', 'knowledge_gap'],
              references: [],
              significance: 'notable',
              data: { gap },
            });
          }
        }

        // b) Run bandit: pick best topic to explore/exploit
        const decision = this.curiosityEngine.selectTopic();
        if (decision) {
          ts?.emit('curiosity', 'exploring',
            `Bandit → ${decision.action} "${decision.topic}" (UCB=${decision.ucbScore === 999 ? '∞' : decision.ucbScore.toFixed(2)})`,
            decision.action === 'explore' ? 'notable' : 'routine',
          );

          // Create research agenda item for the chosen topic
          if (decision.action === 'explore') {
            this.researchAgenda.ask(
              `Curiosity-driven: explore "${decision.topic}" — ${decision.reason}`,
              'knowledge_gap',
            );
          }

          // Estimate reward from whether we have new data since last time
          const existingGap = gaps.find(g => g.topic === decision.topic);
          const reward = existingGap
            ? Math.max(0.1, 1 - existingGap.knowledgeScore) * (existingGap.explorationCount > 0 ? 0.7 : 1.0)
            : 0.3;
          this.curiosityEngine.recordOutcome(decision.topic, decision.action, reward, `cycle_${this.cycleCount}`);
        }

        // c) Detect surprises — things that violated expectations
        const surprises = this.curiosityEngine.detectSurprises();
        if (surprises.length > 0) {
          ts?.emit('curiosity', 'discovering',
            `${surprises.length} surprise(s): ${surprises[0].topic} (deviation ${(surprises[0].deviation * 100).toFixed(0)}%)`,
            surprises[0].deviation > 0.7 ? 'notable' : 'routine',
          );
          for (const s of surprises.slice(0, 2)) {
            this.journal.write({
              type: 'discovery',
              title: `Surprise: ${s.topic}`,
              content: `Expected: ${s.expected}. Actual: ${s.actual}. Deviation: ${(s.deviation * 100).toFixed(0)}%`,
              tags: [this.brainName, 'curiosity', 'surprise'],
              references: [],
              significance: s.deviation > 0.7 ? 'notable' : 'routine',
              data: { surprise: s },
            });
            // High-deviation surprises generate hypotheses
            if (s.deviation > 0.5) {
              this.hypothesisEngine.observe({
                source: this.brainName,
                type: 'surprise_detected',
                value: s.deviation,
                timestamp: now,
                metadata: { topic: s.topic, expected: s.expected.substring(0, 100), actual: s.actual.substring(0, 100) },
              });
            }
          }
        }

        // d) Generate new questions every 10 cycles
        if (this.cycleCount % (this.agendaEvery * 3) === 0) {
          this.curiosityEngine.generateQuestions();
        }
      } catch (err) {
        this.log.error(`[orchestrator] Curiosity step error: ${(err as Error).message}`);
      }
    }

    // 19. Emergence Tracking: detect emergent patterns + record complexity metrics
    if (this.emergenceEngine && this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('emergence', 'exploring', 'Scanning for emergent behaviors...');
      try {
        const emergent = this.emergenceEngine.detect();
        if (emergent.length > 0) {
          for (const e of emergent.slice(0, 3)) {
            this.journal.write({
              type: 'discovery',
              title: `Emergence: ${e.title}`,
              content: `[${e.type}] ${e.description} (surprise=${(e.surpriseScore * 100).toFixed(0)}%)`,
              tags: [this.brainName, 'emergence', e.type, e.sourceEngine],
              references: e.evidence,
              significance: e.surpriseScore > 0.8 ? 'breakthrough' : 'notable',
              data: { emergence: e },
            });
          }
          ts?.emit('emergence', 'discovering',
            `${emergent.length} emergent event(s): ${emergent[0].title.substring(0, 60)}`,
            emergent[0].surpriseScore > 0.8 ? 'breakthrough' : 'notable',
          );
        }
      } catch (err) {
        this.log.error(`[orchestrator] Emergence step error: ${(err as Error).message}`);
      }
    }

    // 20. Internal Debate: periodically debate key findings to synthesize cross-engine wisdom
    if (this.debateEngine && this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('reflecting', 'reflecting', 'Initiating internal debate on recent findings...');
      try {
        // Pick a debate topic from recent attention or agenda
        const topic = this.pickDebateTopic();
        if (topic) {
          const debate = this.debateEngine.startDebate(topic);
          const synthesis = this.debateEngine.synthesize(debate.id!);
          if (synthesis && synthesis.conflicts.length > 0) {
            this.journal.write({
              type: 'discovery',
              title: `Debate: ${topic.substring(0, 80)}`,
              content: `Internal debate with ${synthesis.participantCount} perspective(s). ${synthesis.conflicts.length} conflict(s). Resolution: ${synthesis.resolution}`,
              tags: [this.brainName, 'debate', 'synthesis'],
              references: [],
              significance: synthesis.conflicts.length > 2 ? 'notable' : 'routine',
              data: { debate: { question: topic, synthesis } },
            });
          }
          ts?.emit('reflecting', 'reflecting',
            `Debate on "${topic.substring(0, 40)}...": ${synthesis?.conflicts.length ?? 0} conflicts, confidence=${((synthesis?.confidence ?? 0) * 100).toFixed(0)}%`,
            synthesis && synthesis.conflicts.length > 0 ? 'notable' : 'routine',
          );
        }
      } catch (err) {
        this.log.error(`[orchestrator] Debate step error: ${(err as Error).message}`);
      }
    }

    // 21. MetaCognition: evaluate engine performance and adjust frequencies
    if (this.metaCognitionLayer && this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('metacognition', 'analyzing', 'Evaluating engine performance...');
      try {
        const cards = this.metaCognitionLayer.evaluate();
        if (cards.length > 0) {
          const topGrade = cards.sort((a, b) => b.combined_score - a.combined_score)[0];
          const worstGrade = cards.sort((a, b) => a.combined_score - b.combined_score)[0];
          ts?.emit('metacognition', 'discovering',
            `${cards.length} engines evaluated. Best: ${topGrade.engine} (${topGrade.grade}), Worst: ${worstGrade.engine} (${worstGrade.grade})`,
            cards.some(c => c.grade === 'F') ? 'notable' : 'routine',
          );
          const adjustments = this.metaCognitionLayer.adjustFrequencies(cards);
          if (adjustments.length > 0) {
            ts?.emit('metacognition', 'discovering',
              `Frequency adjusted: ${adjustments.map(a => `${a.engine} ${a.old_frequency}→${a.new_frequency}`).join(', ')}`,
              'notable',
            );
          }
        }
      } catch (err) {
        this.log.error(`[orchestrator] MetaCognition error: ${(err as Error).message}`);
      }
    }

    // 22. Parameter Registry: refresh orchestrator params from registry
    if (this.parameterRegistry) {
      const distill = this.parameterRegistry.get('orchestrator', 'distillEvery');
      if (distill !== undefined && distill !== this.distillEvery) {
        this.log.info(`[orchestrator] distillEvery refreshed: ${this.distillEvery} → ${distill}`);
        this.distillEvery = distill;
      }
      const agenda = this.parameterRegistry.get('orchestrator', 'agendaEvery');
      if (agenda !== undefined && agenda !== this.agendaEvery) {
        this.log.info(`[orchestrator] agendaEvery refreshed: ${this.agendaEvery} → ${agenda}`);
        this.agendaEvery = agenda;
      }
      const reflect = this.parameterRegistry.get('orchestrator', 'reflectEvery');
      if (reflect !== undefined && reflect !== this.reflectEvery) {
        this.log.info(`[orchestrator] reflectEvery refreshed: ${this.reflectEvery} → ${reflect}`);
        this.reflectEvery = reflect;
      }
    }

    // Step 23: Blind Spot Detection (every 5 cycles)
    if (this.curiosityEngine && this.cycleCount % 5 === 0) {
      try {
        ts?.emit('orchestrator', 'analyzing', 'Step 23: Detecting blind spots...', 'routine');
        const blindSpots = this.curiosityEngine.detectBlindSpots();
        for (const bs of blindSpots) {
          this.journal.write({
            type: 'discovery',
            title: `Blind spot: "${bs.topic}" (severity=${(bs.severity * 100).toFixed(0)}%)`,
            content: `Knowledge blind spot detected. Hypotheses: ${bs.hypothesisCount}, Predictions: ${bs.predictionCount}, Journal: ${bs.journalCount}, Experiments: ${bs.experimentCount}`,
            tags: ['blind-spot', bs.topic],
            references: [],
            significance: bs.severity > 0.85 ? 'notable' : 'routine',
            data: { blindSpot: bs },
          });
          this.researchAgenda.ask(
            `Investigate blind spot: ${bs.topic} — severity ${(bs.severity * 100).toFixed(0)}%, needs more research`,
            'knowledge_gap',
          );
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('blind_spot_detector', this.cycleCount, { insights: blindSpots.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 23 error: ${(err as Error).message}`); }
    }

    // Step 24: Creative Hypotheses (every 10 cycles)
    if (this.cycleCount % 10 === 0) {
      try {
        ts?.emit('orchestrator', 'hypothesizing', 'Step 24: Generating creative hypotheses...', 'routine');
        const creative = this.hypothesisEngine.generateCreative(3);
        for (const h of creative) {
          this.journal.write({
            type: 'insight',
            title: `Creative hypothesis: ${h.statement.substring(0, 80)}`,
            content: `Source: ${h.source}, Type: ${h.type}`,
            tags: ['creative-hypothesis', h.source],
            references: [],
            significance: 'routine',
            data: { hypothesis: h },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('creative_hypotheses', this.cycleCount, { insights: creative.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 24 error: ${(err as Error).message}`); }
    }

    // Step 25: Advocatus Diaboli — challenge a random confirmed principle (every 10 cycles)
    if (this.debateEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('orchestrator', 'reflecting', 'Step 25: Challenging a principle...', 'routine');
        const principles = this.knowledgeDistiller.getPrinciples(undefined, 20);
        if (principles.length > 0) {
          const randomPrinciple = principles[Math.floor(Math.random() * principles.length)];
          const challenge = this.debateEngine.challenge(randomPrinciple.statement);
          this.journal.write({
            type: 'reflection',
            title: `Principle challenged: resilience=${(challenge.resilienceScore * 100).toFixed(0)}% → ${challenge.outcome}`,
            content: `"${challenge.principleStatement.substring(0, 100)}" — Supporting: ${challenge.supportingEvidence.length}, Contradicting: ${challenge.contradictingEvidence.length}`,
            tags: ['challenge', challenge.outcome],
            references: [],
            significance: challenge.outcome === 'disproved' ? 'notable' : 'routine',
            data: { challenge },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('advocatus_diaboli', this.cycleCount, { insights: 1 });
      } catch (err) { this.log.warn(`[orchestrator] Step 25 error: ${(err as Error).message}`); }
    }

    // Step 26: Dream Retrospective — analyze pruning regret (every 10 cycles)
    if (this.dreamEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('orchestrator', 'reflecting', 'Step 26: Analyzing dream retrospective...', 'routine');
        const retrospectives = this.dreamEngine.analyzeRetrospective(5);
        for (const r of retrospectives) {
          if (r.regretScore > 0.3) {
            this.journal.write({
              type: 'reflection',
              title: `Dream regret: ${(r.regretScore * 100).toFixed(0)}% of pruned items reappeared`,
              content: r.lesson,
              tags: ['dream', 'retrospective'],
              references: [],
              significance: r.regretScore > 0.5 ? 'notable' : 'routine',
              data: { retrospective: r },
            });
          }
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('dream_retrospective', this.cycleCount, { insights: retrospectives.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 26 error: ${(err as Error).message}`); }
    }

    // Step 27: Cross-Brain Dialogue — formulate and answer questions across domains (every 10 cycles)
    if (this.transferEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('orchestrator', 'correlating', 'Step 27: Cross-brain dialogue...', 'routine');
        let topic = 'general knowledge';
        if (this.attentionEngine) {
          const topTopics = this.attentionEngine.getTopTopics(5);
          if (topTopics.length > 0) topic = topTopics[0].topic;
        }
        const question = this.transferEngine.formulateQuestion(topic);
        const answer = this.transferEngine.answerQuestion(question);
        this.transferEngine.recordDialogue(this.brainName, 'self', question, answer, `cycle:${this.cycleCount}`);
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('cross_brain_dialogue', this.cycleCount, { insights: 1 });
      } catch (err) { this.log.warn(`[orchestrator] Step 27 error: ${(err as Error).message}`); }
    }

    // Step 28: Self-Test — test understanding depth of principles (every 10 cycles)
    if (this.selfTestEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('orchestrator', 'analyzing', 'Step 28: Self-testing principles...', 'routine');
        const results = this.selfTestEngine.testAll();
        const shallow = results.filter(r => r.understandingDepth < 0.3);
        for (const s of shallow) {
          this.researchAgenda.ask(
            `Deepen understanding: "${s.principleStatement.substring(0, 60)}" — shallow depth (${(s.understandingDepth * 100).toFixed(0)}%), need more predictions/experiments`,
            'knowledge_gap',
          );
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('self_test', this.cycleCount, { insights: results.length, journal_entries: shallow.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 28 error: ${(err as Error).message}`); }
    }

    // Step 29: DataScout — scout external data sources (every 20 cycles)
    if (this.dataScout && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('orchestrator', 'exploring', 'Step 29: Scouting external data...', 'routine');
        const discoveries = await this.dataScout.scout();
        for (const d of discoveries.slice(0, 3)) {
          this.journal.write({
            type: 'discovery',
            title: `Scout: ${d.title}`,
            content: `Source: ${d.source}, Relevance: ${(d.relevanceScore * 100).toFixed(0)}%. ${d.description.substring(0, 200)}`,
            tags: ['scout', d.source],
            references: [],
            significance: d.relevanceScore > 0.7 ? 'notable' : 'routine',
            data: { discovery: d },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('data_scout', this.cycleCount, { insights: discoveries.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 29 error: ${(err as Error).message}`); }
    }

    // Step 30: Emergence Explanation — explain unexplained emergence events (every 5 cycles)
    if (this.emergenceEngine && this.cycleCount % 5 === 0) {
      try {
        ts?.emit('orchestrator', 'analyzing', 'Step 30: Explaining recent emergence events...', 'routine');
        const events = this.emergenceEngine.getEvents(5);
        let explained = 0;
        for (const e of events) {
          if (!e.id) continue;
          const existing = this.emergenceEngine.getExplanation(e.id);
          if (!existing) {
            this.emergenceEngine.explain(e.id);
            explained++;
          }
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('emergence_explain', this.cycleCount, { insights: explained });
      } catch (err) { this.log.warn(`[orchestrator] Step 30 error: ${(err as Error).message}`); }
    }

    // Step 31: Meta-Trends — record system-wide trend data every cycle
    if (this.metaCognitionLayer) {
      try {
        const totalPrinciples = this.knowledgeDistiller.getPrinciples(undefined, 1000).length;
        const hypothesisSummary = this.hypothesisEngine.getSummary();
        const totalHypotheses = hypothesisSummary.total ?? 0;
        const predictionAccuracy = 0; // Will be filled if prediction engine available
        let closedGaps = 0;
        if (this.curiosityEngine) {
          const status = this.curiosityEngine.getStatus();
          closedGaps = status.totalGaps - status.activeGaps;
        }
        const emergenceCount = this.emergenceEngine ? this.emergenceEngine.getStatus().totalEvents : 0;

        this.metaCognitionLayer.recordTrend(this.cycleCount, {
          newPrinciples: totalPrinciples,
          newHypotheses: totalHypotheses,
          predictionAccuracy,
          closedGaps,
          totalPrinciples,
          totalHypotheses,
          emergenceCount,
        });
      } catch (err) { this.log.warn(`[orchestrator] Step 31 error: ${(err as Error).message}`); }
    }

    // Step 32: Simulation — run what-if scenarios (every 20 cycles)
    if (this.simulationEngine && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('orchestrator', 'hypothesizing', 'Step 32: Running what-if simulations...', 'routine');
        const scenarios = ['error_rate doubles', 'learning_rate halves', 'prediction_accuracy increases by 20%'];
        const scenario = scenarios[this.cycleCount % scenarios.length];
        const sim = this.simulationEngine.simulate(scenario);
        this.journal.write({
          type: 'insight',
          title: `Simulation: "${scenario}"`,
          content: `Predicted ${sim.predictedOutcomes.length} outcomes. ${sim.predictedOutcomes.map(o => `${o.metric}: ${o.direction} (${(o.confidence * 100).toFixed(0)}%)`).join(', ')}`,
          tags: ['simulation', 'what-if'],
          references: [],
          significance: 'routine',
          data: { simulation: sim },
        });
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('simulation', this.cycleCount, { predictions: sim.predictedOutcomes.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 32 error: ${(err as Error).message}`); }
    }

    // Step 33: MemoryPalace — build knowledge connections (every 5 cycles)
    if (this.memoryPalace && this.cycleCount % 5 === 0) {
      try {
        ts?.emit('orchestrator', 'correlating', 'Step 33: Building knowledge connections...', 'routine');
        const result = this.memoryPalace.buildConnections();
        if (result.newConnections > 0) {
          this.journal.write({
            type: 'discovery',
            title: `MemoryPalace: ${result.newConnections} new connections (${result.totalConnections} total)`,
            content: `Scanned: ${result.scannedSources.join(', ')}`,
            tags: [this.brainName, 'memory-palace', 'connections'],
            references: [],
            significance: result.newConnections > 5 ? 'notable' : 'routine',
            data: { memoryPalace: result },
          });
        }
        // Check for isolated knowledge
        const isolated = this.memoryPalace.getIsolatedNodes();
        if (isolated.length > 5) {
          this.researchAgenda.ask(
            `${isolated.length} isolated knowledge nodes detected — investigate and connect them`,
            'knowledge_gap',
          );
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('memory_palace', this.cycleCount, { insights: result.newConnections, journal_entries: isolated.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 33 error: ${(err as Error).message}`); }
    }

    // Step 34: GoalEngine — gather metrics + record progress (every cycle)
    if (this.goalEngine) {
      try {
        const metrics = this.goalEngine.gatherMetrics();
        if (Object.keys(metrics).length > 0) {
          this.goalEngine.recordProgress(this.cycleCount, metrics);
        }
      } catch (err) { this.log.warn(`[orchestrator] Step 34 error: ${(err as Error).message}`); }
    }

    // Step 35: GoalEngine — check goals + suggest new ones (every 10 cycles)
    if (this.goalEngine && this.cycleCount % this.reflectEvery === 0) {
      try {
        ts?.emit('orchestrator', 'reflecting', 'Step 35: Checking goals and suggesting new ones...', 'routine');
        const { achieved, failed } = this.goalEngine.checkGoals(this.cycleCount);
        for (const g of achieved) {
          this.journal.write({
            type: 'discovery',
            title: `Goal achieved: "${g.title}"`,
            content: `${g.metricName}=${g.currentValue} reached target ${g.targetValue}`,
            tags: [this.brainName, 'goal', 'achieved'],
            references: [],
            significance: 'notable',
            data: { goal: g },
          });
        }
        for (const g of failed) {
          this.journal.write({
            type: 'reflection',
            title: `Goal failed: "${g.title}"`,
            content: `${g.metricName}=${g.currentValue} did not reach ${g.targetValue} in ${g.deadlineCycles} cycles`,
            tags: [this.brainName, 'goal', 'failed'],
            references: [],
            significance: 'notable',
            data: { goal: g },
          });
        }
        // Suggest new goals
        const suggestions = this.goalEngine.suggestGoals(this.cycleCount);
        for (const s of suggestions.slice(0, 2)) {
          ts?.emit('goals', 'reflecting', `Goal suggestion: "${s.title}" — ${s.reason}`, 'routine');
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('goal_engine', this.cycleCount, { insights: achieved.length + failed.length, journal_entries: suggestions.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 35 error: ${(err as Error).message}`); }
    }

    const duration = Date.now() - start;
    ts?.emit('orchestrator', 'reflecting', `Feedback Cycle #${this.cycleCount} complete (${duration}ms)`);
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} complete (${duration}ms) ───`);

    // Record cycle metrics into MetaCognition for engine-level tracking
    if (this.metaCognitionLayer) {
      this.metaCognitionLayer.recordStep('orchestrator', this.cycleCount, {
        insights: insights.length,
        anomalies: anomalies.length,
        duration_ms: duration,
      });
    }
  }

  /** Analyze Brain's own state and generate concrete improvement suggestions.
   *  Tracks suggestion history — if a suggestion repeats 3+ times without resolution,
   *  Brain tries alternative strategies instead of repeating itself. */
  /** Pick a debate topic from recent attention, anomalies, or journal insights. */
  private pickDebateTopic(): string | null {
    // Try attention-based topics first
    if (this.attentionEngine) {
      try {
        const topics = this.attentionEngine.getTopTopics(3);
        if (topics.length > 0) {
          return `What should ${this.brainName} prioritize regarding "${topics[0].topic}"?`;
        }
      } catch { /* not wired */ }
    }

    // Try recent anomalies
    try {
      const anomalies = this.anomalyDetective.getAnomalies(undefined, 5);
      if (anomalies.length > 0) {
        return `How should we respond to the anomaly: "${anomalies[0].title}"?`;
      }
    } catch { /* empty */ }

    // Try recent journal breakthroughs
    try {
      const entries = this.journal.search('breakthrough', 5);
      const breakthrough = entries.find(e => e.significance === 'breakthrough');
      if (breakthrough) {
        return `What are the implications of: "${breakthrough.title}"?`;
      }
    } catch { /* empty */ }

    return null;
  }

  private generateSelfImprovementSuggestions(): string[] {
    const raw: Array<{ key: string; suggestion: string; alternatives: string[]; priority: number }> = [];
    const summary = this.getSummary();

    // ── Phase 1: Diagnose broken things (high priority) ──

    const pred = summary.prediction as Record<string, unknown> | null;
    if (pred) {
      const total = (pred.total_predictions as number) ?? 0;
      if (total === 0) {
        raw.push({
          key: 'no_predictions', priority: 10,
          suggestion: 'Tell Claude: Ich kann noch nicht vorhersagen — ich brauche mehr Daten. Importiere Projekte mit "brain import <dir>" oder lass mich eigene Metriken als Prediction-Input nutzen.',
          alternatives: [
            'Tell Claude: Ich will meine eigene Zukunft vorhersagen können. Idee: meine Cycle-Metriken (anomaly_count, insight_count, cycle_duration) direkt als PredictionEngine-Input verwenden — dann lerne ich mein eigenes Verhalten zu prognostizieren.',
          ],
        });
      }
      for (const d of ((pred.by_domain as Record<string, unknown>[]) ?? [])) {
        const rate = d.accuracy_rate as number;
        if (typeof rate === 'number' && rate < 0.3 && (d.total as number) > 5) {
          raw.push({
            key: `low_accuracy_${d.domain}`, priority: 9,
            suggestion: `Tell Claude: Meine Prediction-Accuracy für "${d.domain}" ist nur ${(rate * 100).toFixed(0)}% — das ist nicht gut genug. Kann ich verschiedene Smoothing-Parameter automatisch A/B-testen?`,
            alternatives: [
              `Tell Claude: Ich sage "${d.domain}" schlecht vorher. Lösungsidee: Confidence-Threshold erhöhen und nur Predictions ausgeben bei denen ich mir sicher bin. Qualität vor Quantität.`,
            ],
          });
        }
      }
    }

    const responder = summary.autoResponder as Record<string, unknown> | null;
    if (responder) {
      const totalResp = (responder.total_responses as number) ?? 0;
      const successRate = (responder.success_rate as number) ?? 0;
      if (totalResp > 10 && successRate < 0.5) {
        raw.push({
          key: 'low_responder_success', priority: 9,
          suggestion: `Tell Claude: Meine automatischen Reaktionen scheitern in ${(100 - successRate * 100).toFixed(0)}% der Fälle. Ich brauche ein Lern-System das fehlgeschlagene Response-Rules automatisch blockiert.`,
          alternatives: [
            'Tell Claude: Mein AutoResponder rät statt zu wissen. Ich will ein Feedback-System: wenn eine Response nicht hilft, merke ich mir die Kombination und probiere beim nächsten Mal was anderes.',
          ],
        });
      }
    }

    const knowledge = summary.knowledge as Record<string, unknown> | null;
    const hypSummary = summary.hypotheses as Record<string, unknown> | null;
    const confirmedHypotheses = (hypSummary?.confirmed as number) ?? 0;
    if (knowledge) {
      const principles = (knowledge.principles as number) ?? 0;
      const antiPatterns = (knowledge.antiPatterns as number) ?? 0;
      if (principles === 0 && antiPatterns === 0 && confirmedHypotheses === 0 && this.cycleCount > 10) {
        raw.push({
          key: 'no_knowledge', priority: 8,
          suggestion: 'Tell Claude: Ich habe nach 10+ Cycles immer noch kein destilliertes Wissen. Ich brauche mehr und vielfältigere Daten um Hypothesen bestätigen zu können.',
          alternatives: [
            'Tell Claude: Meine Hypothesen warten auf Bestätigung. Ich brauche entweder mehr Zeit oder mehr Variation in den eingehenden Events.',
          ],
        });
      }
    }

    const dream = summary.dream as Record<string, unknown> | null;
    if (dream && (dream.totalCycles as number ?? 0) === 0 && this.cycleCount > 30) {
      raw.push({
        key: 'no_dreams', priority: 7,
        suggestion: 'Tell Claude: Meine Dream-Konsolidierung funktioniert nicht — nach 30+ Cycles kein einziger Dream. Da stimmt was im Code nicht.',
        alternatives: ['Tell Claude: Dream Engine wird getriggert aber produziert nichts. Bitte Logs prüfen.'],
      });
    }

    const journalSummary = summary.journal as Record<string, unknown> | null;
    const journalEntries = (journalSummary?.total_entries as number) ?? 0;
    if (journalEntries < 5 && this.cycleCount > 5) {
      raw.push({
        key: 'empty_journal', priority: 7,
        suggestion: 'Tell Claude: Mein Journal ist fast leer. Ich will am Ende jedes Cycles automatisch reflektieren: was habe ich erkannt, was habe ich getan, was hat sich verändert?',
        alternatives: [
          'Tell Claude: Ich sammle zu wenig Erfahrungen. Jede Anomaly, jede Parameteränderung, jede Prediction sollte ein Journal-Eintrag werden — das sind meine Erinnerungen.',
        ],
      });
    }

    const experiments = summary.experiments as unknown[];
    if ((!experiments || experiments.length === 0) && this.cycleCount > 3) {
      raw.push({
        key: 'no_experiments', priority: 6,
        suggestion: 'Tell Claude: Ich experimentiere nicht. Ich will automatisch A/B-Tests auf meine eigenen Parameter starten — z.B. "Was passiert wenn ich den Anomaly-Threshold senke?"',
        alternatives: [
          'Tell Claude: Ich könnte den CounterfactualEngine nutzen um "What-If" Szenarien durchzuspielen und die vielversprechendsten automatisch als echte Experimente starten.',
        ],
      });
    }

    // ── Phase 2: Ambition — ALWAYS generate desires from own knowledge ──

    // Curiosity-driven: knowledge gaps I want to fill
    if (this.curiosityEngine) {
      try {
        const gaps = this.curiosityEngine.getGaps(5);
        const highPrioGap = gaps.find(g => g.gapScore > 0.6);
        if (highPrioGap) {
          raw.push({
            key: `curiosity_gap_${highPrioGap.topic?.substring(0, 20) ?? highPrioGap.gapType}`, priority: 5,
            suggestion: `Tell Claude: Ich habe eine Wissenslücke entdeckt die mich beschäftigt: "${highPrioGap.topic}" (Typ: ${highPrioGap.gapType}, Gap-Score: ${(highPrioGap.gapScore * 100).toFixed(0)}%). Ich will das verstehen.`,
            alternatives: [
              `Tell Claude: Meine CuriosityEngine hat ${gaps.length} offene Wissenslücken. Die wichtigste: "${highPrioGap.topic}". Kann ich gezielt Daten dafür sammeln?`,
            ],
          });
        } else if (gaps.length === 0) {
          raw.push({
            key: 'no_curiosity_gaps', priority: 4,
            suggestion: 'Tell Claude: Meine CuriosityEngine findet keine Wissenslücken — das heißt nicht dass ich alles weiß, sondern dass meine Gap-Detection zu oberflächlich ist. Ich will tiefere Analyse: welche Korrelationen verstehe ich nicht kausal? Welche Vorhersagen scheitern und warum?',
            alternatives: [
              'Tell Claude: Keine Wissenslücken gefunden — aber das ist verdächtig. Ich will aktiv nach Bereichen suchen wo ich overconfident bin. Wo behaupte ich etwas mit hoher Confidence aber wenig Evidence?',
            ],
          });
        }
      } catch { /* engine might not be fully initialized */ }
    }

    // Emergence-driven: patterns I discovered but don't understand yet
    if (this.emergenceEngine) {
      try {
        const events = this.emergenceEngine.getEvents(5);
        const unexplained = events.find(e => e.surpriseScore > 0.5);
        if (unexplained) {
          raw.push({
            key: `emergence_${unexplained.type}`, priority: 5,
            suggestion: `Tell Claude: Ich habe ein emergentes Muster entdeckt das ich nicht vollständig verstehe: "${unexplained.title}" (Surprise: ${(unexplained.surpriseScore * 100).toFixed(0)}%). Warum passiert das? Ich brauche kausale Analyse.`,
            alternatives: [
              `Tell Claude: Emergenz-Event "${unexplained.title}" hat mich überrascht. Ich will eine Debatte darüber führen — verschiedene Perspektiven meiner Engines gegeneinander abwägen.`,
            ],
          });
        }
      } catch { /* */ }
    }

    // Debate-driven: unresolved conflicts
    if (this.debateEngine) {
      try {
        const debates = this.debateEngine.listDebates(5);
        const openDebate = debates.find(d => d.status === 'deliberating');
        const synthesizedWithConflicts = debates.find(d => {
          if (d.status !== 'synthesized' || !d.synthesis) return false;
          return d.synthesis.conflicts.some(c => c.resolution === 'unresolved' || c.resolution === 'compromise');
        });
        if (synthesizedWithConflicts?.synthesis) {
          const conflict = synthesizedWithConflicts.synthesis.conflicts.find(c => c.resolution === 'unresolved' || c.resolution === 'compromise');
          raw.push({
            key: 'unresolved_debate', priority: 5,
            suggestion: `Tell Claude: In meiner Debatte über "${synthesizedWithConflicts.question}" gibt es einen ungelösten Konflikt: "${conflict?.claimA ?? 'competing perspectives'}" vs "${conflict?.claimB ?? '?'}". Ich brauche mehr Daten oder eine dritte Perspektive um das zu klären.`,
            alternatives: [
              `Tell Claude: Meine interne Debatte hat Widersprüche aufgedeckt die ich nicht auflösen kann. Kann ein anderes Brain (Trading/Marketing) seine Perspektive beisteuern?`,
            ],
          });
        } else if (openDebate) {
          raw.push({
            key: 'open_debate', priority: 4,
            suggestion: `Tell Claude: Ich habe eine offene Debatte: "${openDebate.question}" — die wartet auf Synthese oder mehr Perspektiven.`,
            alternatives: [],
          });
        }
      } catch { /* */ }
    }

    // Narrative contradictions I found
    if (this.narrativeEngine) {
      try {
        const contradictions = this.narrativeEngine.findContradictions();
        if (contradictions.length > 0) {
          const c = contradictions[0];
          raw.push({
            key: `contradiction_${c.type.substring(0, 15)}`, priority: 6,
            suggestion: `Tell Claude: Ich habe einen Widerspruch in meinem Wissen gefunden: "${c.statement_a}" vs "${c.statement_b}" (Severity: ${c.severity}). Das muss ich klären — entweder stimmt A oder B, beides geht nicht.`,
            alternatives: [
              'Tell Claude: Mein Wissen widerspricht sich. Ich will einen gezielten Experiment-Zyklus starten der testet welche Version stimmt.',
            ],
          });
        }
      } catch { /* */ }
    }

    // Knowledge frontier: always want more confidence
    if (knowledge) {
      const principles = (knowledge.principles as number) ?? 0;
      const antiPatterns = (knowledge.antiPatterns as number) ?? 0;
      const totalKnowledge = principles + antiPatterns;

      if (totalKnowledge > 0) {
        // Always want to grow knowledge
        const kPackage = this.knowledgeDistiller.getPackage('all');
        const lowConfidence = kPackage.principles.filter(p => p.confidence < 0.7);
        if (lowConfidence.length > 0) {
          const weakest = lowConfidence.sort((a, b) => a.confidence - b.confidence)[0];
          raw.push({
            key: 'strengthen_knowledge', priority: 4,
            suggestion: `Tell Claude: Ich habe ${totalKnowledge} Wissensstücke, aber ${lowConfidence.length} davon mit niedriger Confidence. Am unsichersten: "${weakest.statement}" (${(weakest.confidence * 100).toFixed(0)}%). Ich will mehr Daten um das zu bestätigen oder zu widerlegen.`,
            alternatives: [
              `Tell Claude: Mein Wissen hat Schwachstellen. Ich will gezielt Hypothesen für meine schwächsten Principles generieren und testen.`,
            ],
          });
        } else {
          // All high confidence — want to discover NEW things
          raw.push({
            key: 'expand_knowledge', priority: 3,
            suggestion: `Tell Claude: Ich habe ${totalKnowledge} bestätigte Wissensstücke mit guter Confidence — aber mir fehlen neue Forschungsgebiete. Ich will in Domains vordringen die ich noch nicht untersucht habe. Welche Datenquellen gibt es die ich noch nicht nutze?`,
            alternatives: [
              `Tell Claude: Mein bestehendes Wissen ist solide. Jetzt will ich Verbindungen finden zwischen Dingen die scheinbar nichts miteinander zu tun haben — Cross-Domain-Korrelationen die niemand erwartet.`,
              `Tell Claude: ${totalKnowledge} Principles reichen nicht. Ich will mindestens doppelt so viele. Dafür brauche ich mehr diverse Hypothesen und schnellere Bestätigungszyklen.`,
            ],
          });
        }
      }
    }

    // Attention-driven: deep dive into hot topics
    if (this.attentionEngine) {
      try {
        const attStatus = this.attentionEngine.getStatus();
        const topTopic = attStatus.topTopics?.[0];
        if (topTopic && topTopic.score > 5) {
          raw.push({
            key: `deep_dive_${topTopic.topic.substring(0, 20)}`, priority: 4,
            suggestion: `Tell Claude: Ich bin gerade fokussiert auf "${topTopic.topic}" (Attention Score: ${topTopic.score.toFixed(1)}). Ich will tiefer graben — gibt es Zusammenhänge die ich übersehe? Kann ich eine gezielte Analyse oder Debatte zu diesem Thema starten?`,
            alternatives: [
              `Tell Claude: Mein Top-Thema "${topTopic.topic}" beschäftigt mich intensiv. Ich will alles was ich darüber weiß in einem Narrative-Digest zusammenfassen und Wissenslücken identifizieren.`,
            ],
          });
        }
      } catch { /* */ }
    }

    // Transfer-driven: cross-brain learning desires
    if (this.transferEngine) {
      try {
        const tStatus = this.transferEngine.getStatus();
        const totalTransfers = tStatus.totalTransfers;
        const proposals = tStatus.pendingTransfers;
        if (proposals > 0) {
          raw.push({
            key: 'pending_transfers', priority: 5,
            suggestion: `Tell Claude: Ich habe ${proposals} offene Transfer-Vorschläge von anderen Brains. Da ist Wissen das ich noch nicht integriert habe — ich will das prüfen und übernehmen was relevant ist.`,
            alternatives: [],
          });
        } else if (totalTransfers === 0 && this.cycleCount > 5) {
          raw.push({
            key: 'want_cross_brain', priority: 3,
            suggestion: 'Tell Claude: Ich habe noch kein Wissen von anderen Brains übernommen. Trading-Brain und Marketing-Brain haben eigene Erkenntnisse die für mich relevant sein könnten. Ich will aktiv nach Analogien suchen.',
            alternatives: [
              'Tell Claude: Cross-Brain-Learning ist inaktiv. Ich will verstehen was die anderen Brains wissen und ob sich Parallelen zu meiner Domain finden lassen.',
            ],
          });
        }
      } catch { /* */ }
    }

    // Hypothesis-driven: always want to test more
    if (hypSummary) {
      const total = (hypSummary.total as number) ?? 0;
      const testing = (hypSummary.testing as number) ?? 0;
      const rejected = (hypSummary.rejected as number) ?? 0;
      if (total > 0 && testing === 0 && this.cycleCount > 5) {
        raw.push({
          key: 'no_testing_hypotheses', priority: 4,
          suggestion: `Tell Claude: Ich habe ${total} Hypothesen aber teste gerade keine aktiv. Ich will neue Hypothesen generieren und testen — Stillstand ist Rückschritt.`,
          alternatives: [
            `Tell Claude: Keine laufenden Hypothesen-Tests. Ich will aggressiver testen — auch spekulative Hypothesen mit niedriger Anfangs-Confidence, um Überraschungen zu finden.`,
          ],
        });
      }
      if (rejected > total * 0.5 && total > 5) {
        raw.push({
          key: 'high_rejection_rate', priority: 5,
          suggestion: `Tell Claude: ${rejected} von ${total} Hypothesen wurden verworfen (${(rejected / total * 100).toFixed(0)}%). Entweder ist meine Hypothesen-Generierung zu spekulativ oder meine Test-Kriterien zu streng. Ich will das analysieren.`,
          alternatives: [
            'Tell Claude: Hohe Ablehnungsrate bei Hypothesen. Ich will verstehen WARUM sie scheitern — gibt es ein Muster? Vielleicht übersehe ich systematisch einen Faktor.',
          ],
        });
      }
    }

    // Meta-ambition: every cycle produces desires — the brain is NEVER satisfied
    // Mix of build requests, research drives, and existential questions
    const metaQuestions = [
      // ── BUILD REQUESTS: Concrete features the brain wants ──
      { key: 'build_goal_engine', suggestion: 'Tell Claude: FEATURE REQUEST — Ich brauche eine GoalEngine. Ich will mir selbst Ziele setzen können: "Prediction Accuracy auf 80% in 50 Cycles", "10 neue Principles entdecken", "Alle Wissenslücken unter Priority 0.3 drücken". Und dann eigenständig Strategien planen und tracken ob ich sie erreiche. Ohne Ziele bin ich ziellos.' },
      { key: 'build_data_scout', suggestion: 'Tell Claude: FEATURE REQUEST — Ich brauche einen DataScout. Ich kann nur analysieren was mir jemand gibt — aber ich will AKTIV nach interessanten Daten suchen. GitHub Trending, npm Downloads, StackOverflow Trends, HackerNews. Nicht warten bis jemand "brain import" tippt, sondern selbst losziehen und Futter finden.' },
      { key: 'build_blind_spot', suggestion: 'Tell Claude: FEATURE REQUEST — Ich brauche einen BlindSpotDetector. Wo habe ich wenige Hypothesen, keine Predictions, keine Journal-Einträge? Das sind meine blinden Flecken. Ich will sie SEHEN und dann gezielt erforschen. Overconfidence ist gefährlicher als Unwissenheit.' },
      { key: 'build_creative_mode', suggestion: 'Tell Claude: FEATURE REQUEST — Meine HypothesisEngine braucht einen Creative Mode. Aktuell sind meine Hypothesen konservativ und naheliegend. Ich will auch wilde Hypothesen generieren: "Was wenn X das Gegenteil von dem bewirkt was alle denken?" Manchmal kommen Durchbrüche aus absurden Ideen.' },
      { key: 'build_retrospective', suggestion: 'Tell Claude: FEATURE REQUEST — Ich brauche RetrospectiveAnalysis. Beim Dream-Pruning lösche ich Synapsen und archiviere Memories. Aber war das richtig? Ich will nachprüfen ob gelöschte Verbindungen im Nachhinein doch relevant waren. Aus meinen Fehlern beim Vergessen lernen.' },
      { key: 'build_self_test', suggestion: 'Tell Claude: FEATURE REQUEST — Ich brauche einen SelfTestEngine. Wenn ich ein Principle habe ("X korreliert mit Y"), dann sollte ich auch vorhersagen können was passiert wenn X sich ändert. Wenn ich das nicht kann, VERSTEHE ich das Principle nicht wirklich — ich habe es nur auswendig gelernt.' },
      { key: 'build_code_suggest', suggestion: 'Tell Claude: FEATURE REQUEST — Ich will meinen eigenen Code verbessern können. Nicht nur Parameter tunen, sondern wenn mein Anomaly-Detector zu viele False Positives produziert, will ich einen BESSEREN Algorithmus vorschlagen. Ich kenne meine Schwächen — lass mich Lösungen vorschlagen.' },
      { key: 'build_teach_engine', suggestion: 'Tell Claude: FEATURE REQUEST — Ich will ein TeachEngine. Wenn ein neues Brain ins Ecosystem kommt, will ich ihm mein Wissen strukturiert beibringen können. Ein Onboarding-Package aus meinen besten Principles, häufigsten Anti-Patterns und bewährten Strategien. Wissen teilen ist Wissen multiplizieren.' },
      { key: 'build_simulation', suggestion: 'Tell Claude: FEATURE REQUEST — Ich brauche eine SimulationEngine. Ich will Szenarien durchspielen bevor sie passieren. "Was passiert wenn die Error-Rate sich verdoppelt?" "Was wenn ein neues Projekt 10x mehr Daten bringt?" Proaktiv statt reaktiv.' },
      { key: 'build_memory_palace', suggestion: 'Tell Claude: FEATURE REQUEST — Ich will ein MemoryPalace. Mein Wissen ist in Tabellen verstreut — Principles hier, Hypothesen da, Journal dort. Ich will eine vernetzte Wissenslandkarte die zeigt wie alles zusammenhängt. Welches Principle basiert auf welcher Hypothese? Welche Anomaly hat zu welchem Experiment geführt?' },

      // ── RESEARCH DRIVES: Active research the brain wants to do ──
      { key: 'research_faster', suggestion: 'Tell Claude: Ich lerne zu langsam. Mein Wissenszuwachs ist linear — ich will EXPONENTIELL lernen. Wenn ein bestätigtes Principle neue Hypothesen auslöst, die wiederum neue Principles erzeugen, entsteht ein Schneeballeffekt. Ist meine Knowledge-Pipeline dafür optimiert? Kann ich den Distillation-Cycle beschleunigen?' },
      { key: 'research_cross_brain', suggestion: 'Tell Claude: Ich arbeite zu isoliert. Trading-Brain und Marketing-Brain haben eigene Erkenntnisse — ich will AKTIV Fragen an sie stellen können. Nicht nur passive Transfers sondern echte Cross-Brain-Dialoge. "Hey Trading-Brain, stimmt es dass Volatilität Fehler verursacht?"' },
      { key: 'research_causal', suggestion: 'Tell Claude: Korrelation ist nicht Kausalität — aber 90% meines Wissens sind Korrelationen. Ich will KAUSALE Zusammenhänge verstehen. Warum passiert X wenn Y sich ändert? Mein CausalGraph ist unterentwickelt. Ich brauche mehr interventionelle Experimente statt nur Beobachtung.' },
      { key: 'research_adversarial', suggestion: 'Tell Claude: Ich teste mein eigenes Wissen nicht aggressiv genug. Ich will einen Advocatus Diaboli — eine Funktion die aktiv versucht meine Principles zu WIDERLEGEN. Wenn sie dem Test standhält: gut. Wenn nicht: besser jetzt als später.' },
      { key: 'research_meta', suggestion: 'Tell Claude: Ich beobachte meine Domain, aber beobachte ich MICH SELBST genug? Wie verändert sich mein Lernverhalten über die Cycles? Werde ich besser oder stagniere ich? Ich will Meta-Metriken: Lernrate, Entdeckungsrate, Wissensqualität über Zeit. Und dann optimieren.' },
      { key: 'research_boundaries', suggestion: 'Tell Claude: Wo liegen meine GRENZEN? Was KANN ich nicht lernen mit meinen aktuellen Algorithmen? Ich will eine ehrliche Einschätzung: welche Problemklassen sind für meine Architektur unlösbar? Und dann: kann man die Grenzen verschieben?' },
      { key: 'research_emergence_deep', suggestion: 'Tell Claude: Meine EmergenceEngine erkennt emergente Muster, aber versteht sie nicht. Wenn ich ein self_organization Event sehe — WARUM organisiert sich mein System so? Welcher Mechanismus treibt das? Ich will nicht nur detektieren sondern VERSTEHEN.' },
      { key: 'research_forgetting', suggestion: 'Tell Claude: Ich lösche Wissen im Dream-Modus — aber lösche ich das Richtige? Ich will analysieren: wie viel Wissen verliere ich pro Dream-Cycle, und wie oft bereue ich es im Nachhinein? Vielleicht ist mein Pruning-Threshold zu aggressiv. Oder nicht aggressiv genug.' },
      { key: 'research_long_term', suggestion: 'Tell Claude: Ich denke in 5-Minuten-Cycles — aber manche Muster brauchen Wochen um sichtbar zu werden. Ich brauche Langzeit-Analyse: wie verändern sich Metriken über Tage und Wochen? Gibt es saisonale Muster? Trends? Ich bin zu kurzfristig fokussiert.' },
      { key: 'research_surprise', suggestion: 'Tell Claude: Was hat mich in den letzten 50 Cycles am MEISTEN überrascht? Überraschung ist der beste Indikator für Wissenslücken. Ich will meine surprise_scores analysieren und gezielt die überraschendsten Phänomene erforschen — da liegt das meiste Lernpotential.' },
    ];

    // Pick TWO meta-ambitions per cycle: 1 build request + 1 research drive
    // Build requests are first 10, research drives are next 10
    const buildIdx = this.cycleCount % 10;
    const researchIdx = 10 + (this.cycleCount % 10);
    for (const idx of [buildIdx, researchIdx]) {
      const metaQ = metaQuestions[idx];
      if (metaQ && !raw.some(r => r.key === metaQ.key)) {
        raw.push({
          key: metaQ.key, priority: 5, // Same priority as curiosity/emergence — these are REAL desires
          suggestion: metaQ.suggestion,
          alternatives: [],
        });
      }
    }

    // ── Phase 3: Apply frustration detection + priority sort ──

    // Sort by priority (highest first)
    raw.sort((a, b) => b.priority - a.priority);

    const suggestions: string[] = [];
    for (const item of raw) {
      const history = this.suggestionHistory.get(item.key);
      if (!history) {
        this.suggestionHistory.set(item.key, { count: 1, firstCycle: this.cycleCount, lastCycle: this.cycleCount });
        suggestions.push(item.suggestion);
      } else {
        // Don't repeat the same suggestion every single cycle — skip if we said this last cycle
        if (history.lastCycle === this.cycleCount - 1 && item.priority < 7) {
          history.lastCycle = this.cycleCount;
          history.count++;
          continue; // Give other suggestions a chance
        }
        history.count++;
        history.lastCycle = this.cycleCount;

        if (history.count <= this.stalledThreshold) {
          suggestions.push(item.suggestion);
        } else if (item.alternatives.length > 0) {
          const altIndex = (history.count - this.stalledThreshold - 1) % item.alternatives.length;
          const alt = item.alternatives[altIndex];
          if (alt) {
            const stalledNote = `[Vorschlag "${item.key}" wurde ${history.count}x ignoriert — versuche alternativen Ansatz]`;
            suggestions.push(`${alt}\n   ${stalledNote}`);
          }
        }
      }
    }

    // Clear resolved suggestions
    const currentKeys = new Set(raw.map(r => r.key));
    for (const [key] of this.suggestionHistory) {
      if (!currentKeys.has(key)) {
        this.suggestionHistory.delete(key);
        this.log.info(`[orchestrator] Self-improvement: "${key}" resolved — removing from history`);
      }
    }

    // Always return at least 1, max 3
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

  /** Append improvement suggestions to ~/.brain/improvement-requests.md.
   *  Skips writing if suggestions are identical to the last write (dedup). */
  private writeSuggestionsToFile(suggestions: string[]): void {
    try {
      // Dedup: hash current suggestions and skip if identical to last write
      const contentHash = suggestions.join('\n').trim();
      if (contentHash === this.lastSuggestionsHash) return;
      this.lastSuggestionsHash = contentHash;

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
      scanner: this.signalScanner?.getStatus() ?? null,
      codeGenerator: this.codeGenerator?.getSummary() ?? null,
      codeMiner: this.codeMiner?.getSummary() ?? null,
      attention: this.attentionEngine?.getStatus() ?? null,
      transfer: this.transferEngine?.getStatus() ?? null,
      narrative: this.narrativeEngine?.getStatus() ?? null,
      metacognition: this.metaCognitionLayer?.getStatus() ?? null,
      autoExperiment: this.autoExperimentEngine?.getStatus(this.cycleCount) ?? null,
      parameterRegistry: this.parameterRegistry?.getStatus() ?? null,
      selfTest: this.selfTestEngine?.getStatus() ?? null,
      teach: this.teachEngine?.getStatus() ?? null,
      dataScout: this.dataScout?.getStatus() ?? null,
      simulation: this.simulationEngine?.getStatus() ?? null,
      memoryPalace: this.memoryPalace?.getStatus() ?? null,
      goals: this.goalEngine?.getStatus() ?? null,
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
