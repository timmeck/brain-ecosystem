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
import type { DebateEngine, DebateArgument } from '../debate/debate-engine.js';
import type { ParameterRegistry } from '../metacognition/parameter-registry.js';
import type { MetaCognitionLayer } from '../metacognition/meta-cognition-layer.js';
import type { AutoExperimentEngine } from '../metacognition/auto-experiment-engine.js';
import type { SelfTestEngine } from '../metacognition/self-test-engine.js';
import type { TeachEngine } from '../metacognition/teach-engine.js';
import type { DataScout } from './data-scout.js';
import type { SimulationEngine } from '../metacognition/simulation-engine.js';
import type { MemoryPalace } from '../memory-palace/memory-palace.js';
import type { GoalEngine } from '../goals/goal-engine.js';
import type { EvolutionEngine } from '../metacognition/evolution-engine.js';
import type { ReasoningEngine } from '../reasoning/reasoning-engine.js';
import type { EmotionalModel } from '../emotional/emotional-model.js';
import type { SelfScanner } from '../self-scanner/self-scanner.js';
import type { SelfModificationEngine } from '../self-modification/self-modification-engine.js';
import type { BootstrapService } from './bootstrap-service.js';
import type { ConceptAbstraction } from '../concept-abstraction/concept-abstraction.js';
import type { LLMService } from '../llm/llm-service.js';
import type { ResearchMissionEngine } from '../missions/mission-engine.js';
import type { FactExtractor } from '../knowledge-graph/fact-extractor.js';
import type { SemanticCompressor } from './semantic-compressor.js';
import type { ProactiveEngine } from '../proactive/proactive-engine.js';
import type { ActiveLearner } from '../active-learning/active-learner.js';
import type { RAGIndexer } from '../rag/rag-indexer.js';
import type { TeachingProtocol } from '../teaching/teaching-protocol.js';
import type { CodeHealthMonitor } from '../code-health/health-monitor.js';
import type { KnowledgeGraphEngine } from '../knowledge-graph/graph-engine.js';
import type { RepoAbsorber } from '../codegen/repo-absorber.js';
import { AutoResponder } from './auto-responder.js';
import { AdaptiveScheduler, type CycleOutcome } from './adaptive-scheduler.js';

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
  /** Minimum cycle duration in ms. Prevents tight-looping. Default: 5000 */
  minCycleDurationMs?: number;
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
  readonly causalGraph: CausalGraph | null;

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
  private memoryPalaceRagRegistered = false;
  private goalEngine: GoalEngine | null = null;
  private evolutionEngine: EvolutionEngine | null = null;
  private reasoningEngine: ReasoningEngine | null = null;
  private emotionalModel: EmotionalModel | null = null;
  private selfScanner: SelfScanner | null = null;
  private selfModificationEngine: SelfModificationEngine | null = null;
  private bootstrapService: BootstrapService | null = null;
  private conceptAbstraction: ConceptAbstraction | null = null;
  private llmService: LLMService | null = null;
  private missionEngine: ResearchMissionEngine | null = null;
  private factExtractor: FactExtractor | null = null;
  private semanticCompressor: SemanticCompressor | null = null;
  private proactiveEngine: ProactiveEngine | null = null;
  private activeLearner: ActiveLearner | null = null;
  private ragIndexer: RAGIndexer | null = null;
  private teachingProtocol: TeachingProtocol | null = null;
  private codeHealthMonitor: CodeHealthMonitor | null = null;
  private knowledgeGraph: KnowledgeGraphEngine | null = null;
  private repoAbsorber: RepoAbsorber | null = null;
  private featureRecommender: import('../codegen/feature-recommender.js').FeatureRecommender | null = null;
  private featureExtractor: import('../codegen/feature-extractor.js').FeatureExtractor | null = null;
  private contradictionResolver: import('../knowledge-graph/contradiction-resolver.js').ContradictionResolver | null = null;
  private checkpointManager: import('../checkpoint/checkpoint-manager.js').CheckpointManager | null = null;
  private feedbackEngine: import('../feedback/feedback-engine.js').FeedbackEngine | null = null;
  private userModelEngine: import('../user-model/user-model.js').UserModel | null = null;
  private consensusEngine: import('../consensus/consensus-engine.js').ConsensusEngine | null = null;
  private traceCollector: import('../observability/trace-collector.js').TraceCollector | null = null;
  private guardrailEngine: import('../guardrails/guardrail-engine.js').GuardrailEngine | null = null;
  private causalPlanner: import('../causal/causal-planner.js').CausalPlanner | null = null;
  private researchRoadmap: import('../goals/research-roadmap.js').ResearchRoadmap | null = null;
  private creativeEngine: import('../creative/creative-engine.js').CreativeEngine | null = null;
  private actionBridge: import('../action/action-bridge.js').ActionBridgeEngine | null = null;
  private signalRouter: import('../cross-brain/signal-router.js').CrossBrainSignalRouter | null = null;
  private contentForge: import('../content/content-forge.js').ContentForge | null = null;
  private codeForge: import('../codegen/code-forge.js').CodeForge | null = null;
  private strategyForge: import('../strategy/strategy-forge.js').StrategyForge | null = null;
  private engineRegistry: import('../governance/engine-registry.js').EngineRegistry | null = null;
  private runtimeInfluenceTracker: import('../governance/runtime-influence-tracker.js').RuntimeInfluenceTracker | null = null;
  private loopDetector: import('../governance/loop-detector.js').LoopDetector | null = null;
  private governanceLayer: import('../governance/governance-layer.js').GovernanceLayer | null = null;
  private adaptiveScheduler: AdaptiveScheduler | null = null;
  private cycleOutcomeTracker: import('./cycle-outcome-tracker.js').CycleOutcomeTracker | null = null;
  private conversationMemory: import('../memory/conversation-memory.js').ConversationMemory | null = null;
  private lastAutoMissionTime = 0;
  private lastGoalMissionTime = 0;
  private roadmapBootstrapped = false;
  private onSuggestionCallback: ((suggestions: string[]) => void) | null = null;

  private db: Database.Database;
  private brainName: string;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private cycleCount = 0;
  private lastDesireActuationCycle = 0;
  private distillEvery: number;
  private agendaEvery: number;
  private reflectEvery: number;
  private minCycleDurationMs: number;
  private log = getLogger();

  /** Tracks how many times each suggestion key has been emitted without being resolved. */
  private suggestionHistory: Map<string, { count: number; firstCycle: number; lastCycle: number }> = new Map();
  /** Max repeats before trying an alternative. */
  private readonly stalledThreshold = 3;
  /** Hash of last written suggestions to prevent duplicate file writes. */
  private lastSuggestionsHash = '';
  /** Cycle number of last written suggestions — write at most once per cycle. */
  private lastSuggestionsCycle = -1;
  /** Recent debate topic keys to prevent repeating the same debate. */
  private recentDebateTopics: string[] = [];

  // ── Desire Feedback Tracking ──────────────────────────────
  /** Tracks outcomes per desire key: successes, failures, last result. */
  private desireOutcomes: Map<string, { successes: number; failures: number; lastResult: 'success' | 'failure'; lastCycle: number }> = new Map();
  /** Category-level success rates for adaptive confidence. */
  private desireCategoryRates: Map<string, { successes: number; total: number }> = new Map();
  /** Desire keys currently being actuated by other brains (received via cross-brain). */
  private crossBrainActiveDesires: Map<string, { brain: string; priority: number; cycle: number }> = new Map();

  constructor(db: Database.Database, config: ResearchOrchestratorConfig, causalGraph?: CausalGraph) {
    this.db = db;
    this.brainName = config.brainName;
    this.distillEvery = config.distillEvery ?? 5;
    this.agendaEvery = config.agendaEvery ?? 3;
    this.reflectEvery = config.reflectEvery ?? 10;
    this.minCycleDurationMs = config.minCycleDurationMs ?? 5000;
    this.causalGraph = causalGraph ?? null;

    this.selfObserver = new SelfObserver(db, { brainName: config.brainName });
    this.adaptiveStrategy = new AdaptiveStrategyEngine(db, { brainName: config.brainName });
    this.experimentEngine = new ExperimentEngine(db, { brainName: config.brainName });
    this.crossDomain = new CrossDomainEngine(db);
    this.counterfactual = new CounterfactualEngine(db, this.causalGraph);
    this.knowledgeDistiller = new KnowledgeDistiller(db, { brainName: config.brainName, minEvidence: 2, minSuccessRate: 0.5, minFailureRate: 0.4 });
    this.researchAgenda = new ResearchAgendaEngine(db, { brainName: config.brainName });
    this.anomalyDetective = new AnomalyDetective(db, { brainName: config.brainName });
    this.journal = new ResearchJournal(db, { brainName: config.brainName });
    this.autoResponder = new AutoResponder(db, { brainName: config.brainName });
    this.autoResponder.setAdaptiveStrategy(this.adaptiveStrategy);
    this.autoResponder.setJournal(this.journal);
    this.hypothesisEngine = new HypothesisEngine(db, { minEvidence: 3, confirmThreshold: 0.20, rejectThreshold: 0.5 });
  }

  /** Set callback for self-improvement suggestions (e.g. to create notifications). */
  setOnSuggestion(callback: (suggestions: string[]) => void): void {
    this.onSuggestionCallback = callback;
  }

  /** Set the AdaptiveScheduler for dynamic cycle intervals. */
  setAdaptiveScheduler(scheduler: AdaptiveScheduler): void {
    this.adaptiveScheduler = scheduler;
  }

  /** Set the CycleOutcomeTracker for long-term cycle metrics. */
  setCycleOutcomeTracker(tracker: import('./cycle-outcome-tracker.js').CycleOutcomeTracker): void {
    this.cycleOutcomeTracker = tracker;
  }

  /** Set ConversationMemory for auto-remembering cycle outcomes. */
  setConversationMemory(memory: import('../memory/conversation-memory.js').ConversationMemory): void {
    this.conversationMemory = memory;
  }

  /** Get the AdaptiveScheduler instance. */
  getAdaptiveScheduler(): AdaptiveScheduler | null {
    return this.adaptiveScheduler;
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

    // Register all known engines so they appear in getEngineActivity() from the start
    const engineNames = [
      'orchestrator', 'self_observer', 'adaptive_strategy', 'experiment',
      'cross_domain', 'counterfactual', 'knowledge_distiller', 'research_agenda',
      'anomaly_detective', 'journal', 'hypothesis', 'prediction', 'mission_engine',
    ];
    for (const name of engineNames) {
      stream.registerEngine(name);
    }
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
    // Register own distiller as peer for self-analysis and transfer proposals
    engine.registerPeerDistiller(this.brainName + '_self', this.knowledgeDistiller);
  }

  /** Set the NarrativeEngine — brain explains itself in natural language. */
  setNarrativeEngine(engine: NarrativeEngine): void {
    this.narrativeEngine = engine;
  }

  /** Set the CuriosityEngine — knowledge gap detection and exploration/exploitation. */
  setCuriosityEngine(engine: CuriosityEngine): void {
    this.curiosityEngine = engine;
  }

  /** Set the MissionEngine — auto-missions from curiosity-driven research. */
  setMissionEngine(engine: ResearchMissionEngine): void {
    this.missionEngine = engine;
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

  /** Set the EvolutionEngine — evolves parameter configurations via genetic algorithm. */
  setEvolutionEngine(engine: EvolutionEngine): void { this.evolutionEngine = engine; }

  /** Set the ReasoningEngine — multi-step logical inference chains. */
  setReasoningEngine(engine: ReasoningEngine): void { this.reasoningEngine = engine; }
  setEmotionalModel(model: EmotionalModel): void { this.emotionalModel = model; }

  /** Set the SelfScanner — indexes own source code for self-modification context. */
  setSelfScanner(scanner: SelfScanner): void { this.selfScanner = scanner; }

  /** Set the SelfModificationEngine — generates and applies code changes autonomously. */
  setSelfModificationEngine(engine: SelfModificationEngine): void { this.selfModificationEngine = engine; }

  /** Set the BootstrapService — seeds initial data on first cycle. */
  setBootstrapService(service: BootstrapService): void { this.bootstrapService = service; }

  /** Set the ConceptAbstraction — clusters knowledge into abstract concepts. */
  setConceptAbstraction(engine: ConceptAbstraction): void { this.conceptAbstraction = engine; }

  // ── Intelligence Upgrade Setters (Sessions 55-65) ──────────

  /** Set the FactExtractor — extracts typed facts for the Knowledge Graph. */
  setFactExtractor(extractor: FactExtractor): void { this.factExtractor = extractor; }

  /** Set the SemanticCompressor — deduplicates similar insights. */
  setSemanticCompressor(compressor: SemanticCompressor): void { this.semanticCompressor = compressor; }

  /** Set the ProactiveEngine — trigger-based improvement suggestions. */
  setProactiveEngine(engine: ProactiveEngine): void { this.proactiveEngine = engine; }

  /** Set the ActiveLearner — identifies and closes knowledge gaps. */
  setActiveLearner(learner: ActiveLearner): void { this.activeLearner = learner; }

  /** Set the RAGIndexer — incremental vector indexing of all knowledge. */
  setRAGIndexer(indexer: RAGIndexer): void { this.ragIndexer = indexer; }

  /** Set the TeachingProtocol — inter-brain knowledge transfer. */
  setTeachingProtocol(protocol: TeachingProtocol): void { this.teachingProtocol = protocol; }

  /** Set the CodeHealthMonitor — periodic codebase quality scanning. */
  setCodeHealthMonitor(monitor: CodeHealthMonitor): void { this.codeHealthMonitor = monitor; }

  /** Set the KnowledgeGraphEngine — typed fact storage and inference. */
  setKnowledgeGraph(graph: KnowledgeGraphEngine): void { this.knowledgeGraph = graph; }

  /** Set the RepoAbsorber — autonomous code learning from discovered repos. */
  setRepoAbsorber(absorber: RepoAbsorber): void { this.repoAbsorber = absorber; }
  setFeatureRecommender(recommender: import('../codegen/feature-recommender.js').FeatureRecommender): void { this.featureRecommender = recommender; }
  setFeatureExtractor(extractor: import('../codegen/feature-extractor.js').FeatureExtractor): void { this.featureExtractor = extractor; }
  setContradictionResolver(resolver: import('../knowledge-graph/contradiction-resolver.js').ContradictionResolver): void { this.contradictionResolver = resolver; }
  setCheckpointManager(cm: import('../checkpoint/checkpoint-manager.js').CheckpointManager): void { this.checkpointManager = cm; }

  /** Set the FeedbackEngine — RLHF auto-feedback from cycle results. */
  setFeedbackEngine(engine: import('../feedback/feedback-engine.js').FeedbackEngine): void { this.feedbackEngine = engine; }

  /** Set the UserModel — profile tracking from orchestrator cycles. */
  setUserModel(model: import('../user-model/user-model.js').UserModel): void { this.userModelEngine = model; }

  /** Set the ConsensusEngine — auto-proposals for risky self-modifications. */
  setConsensusEngine(engine: import('../consensus/consensus-engine.js').ConsensusEngine): void { this.consensusEngine = engine; }

  /** Set the TraceCollector — auto-instrumentation of research cycles. */
  setTraceCollector(collector: import('../observability/trace-collector.js').TraceCollector): void { this.traceCollector = collector; }

  /** Set the GuardrailEngine — safety checks for parameter changes. */
  setGuardrailEngine(engine: import('../guardrails/guardrail-engine.js').GuardrailEngine): void { this.guardrailEngine = engine; }

  /** Set the CausalPlanner — diagnose stagnant goals via causal analysis. */
  setCausalPlanner(planner: import('../causal/causal-planner.js').CausalPlanner): void { this.causalPlanner = planner; }

  /** Set the ResearchRoadmap — multi-step goal decomposition. */
  setResearchRoadmap(roadmap: import('../goals/research-roadmap.js').ResearchRoadmap): void { this.researchRoadmap = roadmap; }

  /** Set the CreativeEngine — cross-domain idea generation. */
  setCreativeEngine(engine: import('../creative/creative-engine.js').CreativeEngine): void { this.creativeEngine = engine; }

  /** Set the ActionBridgeEngine — risk-assessed action execution. */
  setActionBridge(bridge: import('../action/action-bridge.js').ActionBridgeEngine): void { this.actionBridge = bridge; }

  /** Register outcome handler — called when actions complete/fail. */
  setActionOutcomeHandler(handler: (action: { source: string; type: string; title: string }, outcome: { success: boolean; result: unknown }) => void): void {
    if (this.actionBridge) {
      this.actionBridge.onOutcome((action, outcome) => handler(action, outcome));
    }
  }

  /** Set the CrossBrainSignalRouter — bidirectional signal routing. */
  setSignalRouter(router: import('../cross-brain/signal-router.js').CrossBrainSignalRouter): void { this.signalRouter = router; }

  /** Set the ContentForge — autonomous content pipeline. */
  setContentForge(forge: import('../content/content-forge.js').ContentForge): void { this.contentForge = forge; }

  /** Set the CodeForge — pattern extraction + auto-apply. */
  setCodeForge(forge: import('../codegen/code-forge.js').CodeForge): void { this.codeForge = forge; }

  /** Set the StrategyForge — autonomous strategy execution. */
  setStrategyForge(forge: import('../strategy/strategy-forge.js').StrategyForge): void { this.strategyForge = forge; }

  /** Set the EngineRegistry — formal engine profiles for governance. */
  setEngineRegistry(registry: import('../governance/engine-registry.js').EngineRegistry): void { this.engineRegistry = registry; }

  /** Set the RuntimeInfluenceTracker — before/after snapshots for influence tracking. */
  setRuntimeInfluenceTracker(tracker: import('../governance/runtime-influence-tracker.js').RuntimeInfluenceTracker): void { this.runtimeInfluenceTracker = tracker; }

  /** Set the LoopDetector — anti-pattern detection. */
  setLoopDetector(detector: import('../governance/loop-detector.js').LoopDetector): void { this.loopDetector = detector; }

  /** Set the GovernanceLayer — active engine control. */
  setGovernanceLayer(layer: import('../governance/governance-layer.js').GovernanceLayer): void { this.governanceLayer = layer; }

  /** Set the LLMService — propagates to all engines that can use LLM. */
  setLLMService(llm: LLMService): void {
    this.llmService = llm;
    // Propagate to engines that support LLM
    this.hypothesisEngine.setLLMService(llm);
    this.narrativeEngine?.setLLMService(llm);
    this.debateEngine?.setLLMService(llm);
    this.curiosityEngine?.setLLMService(llm);
  }

  /** Get the LLMService instance. */
  getLLMService(): LLMService | null { return this.llmService; }

  /** Set the PredictionEngine — wires journal into it. */
  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine;
    engine.setJournal(this.journal);
  }

  /** Start the autonomous feedback loop timer. */
  start(intervalMs = 300_000): void {
    if (this.feedbackTimer) return;
    this.startIntervalMs = intervalMs;
    this.scheduleNextCycle(intervalMs);
    this.log.info(`[orchestrator] Research orchestrator started (feedback every ${intervalMs}ms)`);
  }

  /** Schedule the next feedback cycle (supports adaptive intervals). */
  private scheduleNextCycle(intervalMs: number): void {
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(async () => {
      try { await this.runFeedbackCycle(); }
      catch (err) { this.log.error('[orchestrator] Feedback cycle error', { error: (err as Error).message }); }
      // Re-schedule with adaptive or base interval
      const nextInterval = this.adaptiveScheduler?.getNextInterval() ?? this.startIntervalMs;
      this.scheduleNextCycle(nextInterval);
    }, intervalMs);
  }

  private startIntervalMs = 300_000;

  /** Stop the feedback loop. */
  stop(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
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

    // Handle cross-brain desire coordination signals
    if (eventType === 'desire_active' && data.desireKey) {
      this.onCrossBrainDesireSignal(sourceBrain, data.desireKey as string, (data.priority as number) ?? 0);
    }

    // Handle cross-brain debate perspective requests
    if (eventType === 'debate_perspective_request' && data.question && this.debateEngine) {
      try {
        const perspective = this.debateEngine.generatePerspective(data.question as string);
        // Send perspective back via signal
        if (this.signalRouter) {
          this.signalRouter.emit({
            targetBrain: sourceBrain,
            signalType: 'debate_perspective_response',
            payload: {
              debateId: data.debateId as number,
              perspective: { brainName: perspective.brainName, position: perspective.position, confidence: perspective.confidence, relevance: perspective.relevance, arguments: perspective.arguments },
            },
            confidence: perspective.confidence,
          }).catch(() => { /* source may be offline */ });
        }
      } catch { /* debate engine not ready */ }
    }

    // Handle incoming debate perspective response — add to our debate
    if (eventType === 'debate_perspective_response' && data.debateId && data.perspective && this.debateEngine) {
      try {
        const p = data.perspective as Record<string, unknown>;
        this.debateEngine.addPerspective(data.debateId as number, {
          brainName: (p.brainName as string) ?? sourceBrain,
          position: (p.position as string) ?? '',
          confidence: (p.confidence as number) ?? 0,
          relevance: (p.relevance as number) ?? 0,
          arguments: (p.arguments as DebateArgument[]) ?? [],
        });
        this.log.info(`[orchestrator] Added cross-brain perspective from ${sourceBrain} to debate #${data.debateId}`);
      } catch { /* debate may not exist */ }
    }
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
    const stepTimings: Array<{ step: string; ms: number }> = [];
    const profileStep = (name: string, fn: () => void) => {
      const t0 = Date.now();
      fn();
      const elapsed = Date.now() - t0;
      if (elapsed > 1000) {
        stepTimings.push({ step: name, ms: elapsed });
        this.log.warn(`[orchestrator] Slow step: ${name} took ${elapsed}ms`);
      }
    };
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} ───`);

    // Fix 6: Auto-instrument research cycles with TraceCollector
    let traceId: string | undefined;
    if (this.traceCollector) {
      try { traceId = this.traceCollector.startTrace('research_cycle', { cycle: this.cycleCount, brainName: this.brainName }); }
      catch { /* tracing should never break the cycle */ }
    }

    ts?.emit('orchestrator', 'perceiving', `Feedback Cycle #${this.cycleCount} starting...`);

    // Bootstrap: seed initial data on first cycle so engines have something to work with
    if (this.cycleCount === 1 && this.bootstrapService) {
      try {
        const result = this.bootstrapService.bootstrap();
        if (!result.alreadyBootstrapped) {
          ts?.emit('orchestrator', 'discovering', `Bootstrap seeded: ${result.observations} observations, ${result.journalEntries} journal, ${result.hypotheses} hypotheses, ${result.predictions} predictions, ${result.metrics} metrics`, 'notable');
          this.log.info(`[orchestrator] Cold-start bootstrap complete — engines have initial data`);
        }
      } catch (err) {
        this.log.error(`[orchestrator] Bootstrap error: ${(err as Error).message}`);
      }
    }

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
        if (paramAdjusts.length > 0) parts.push(`${paramAdjusts.length} parameters adjusted`);
        if (escalations.length > 0) parts.push(`${escalations.length} escalated`);
        if (parts.length === 0) parts.push(`${autoResponses.length} actions`);
        ts?.emit('auto_responder', 'discovering', `AutoResponder: ${parts.join(', ')}`, escalations.length > 0 ? 'breakthrough' : 'notable');
      } else {
        ts?.emit('auto_responder', 'analyzing', 'No auto-responses needed (cooldown or no matching rules)');
      }
    }

    // 2c. Feed observations into HypothesisEngine for autonomous hypothesis generation
    const now = Date.now();
    this.hypothesisEngine.observe({ source: this.brainName, type: 'anomaly_count', value: anomalies.length, timestamp: now });
    this.hypothesisEngine.observe({ source: this.brainName, type: 'insight_count', value: insights.length, timestamp: now });
    // Feed journal significance for richer hypothesis generation
    for (const insight of insights) {
      this.hypothesisEngine.observe({ source: this.brainName, type: 'journal', value: insight.confidence, timestamp: now, metadata: { title: insight.title } });
    }
    if (anomalies.length > 0) {
      for (const a of anomalies) {
        this.hypothesisEngine.observe({ source: this.brainName, type: `anomaly:${a.metric}`, value: a.deviation, timestamp: now, metadata: { severity: a.severity } });
      }
    }

    // 2d. Prediction accuracy as standard observation — feeds HypothesisEngine + PredictionEngine self-accuracy
    if (this.predictionEngine) {
      try {
        const accByDomain = this.predictionEngine.getAccuracy();
        const overall = accByDomain.length > 0
          ? accByDomain.reduce((s, a) => s + a.accuracy_rate, 0) / accByDomain.length
          : 0;
        this.hypothesisEngine.observe({ source: this.brainName, type: 'prediction_accuracy_rate', value: overall, timestamp: now });
        for (const acc of accByDomain) {
          this.hypothesisEngine.observe({ source: this.brainName, type: `prediction_accuracy:${acc.domain}`, value: acc.accuracy_rate, timestamp: now, metadata: { total: acc.total, correct: acc.correct } });
        }
        // Brain predicts its own accuracy
        this.predictionEngine.recordMetric('self_accuracy_rate', overall, 'metric');
      } catch { /* prediction accuracy non-critical */ }
    }

    // 2e. Accumulate evidence for hypotheses based on cycle observations
    {
      const pendingHypotheses = this.hypothesisEngine.list('proposed', 50)
        .concat(this.hypothesisEngine.list('testing', 50));
      for (const hyp of pendingHypotheses) {
        if (!hyp.id) continue;
        const vars = hyp.variables ?? [];
        const statement = hyp.statement.toLowerCase();
        let evidenceType: 'for' | 'against' | null = null;
        // Check if cycle metrics match hypothesis variables
        if (vars.includes('journal_entries') || statement.includes('journal')) {
          const journalStats = this.journal.getSummary();
          const entries = (journalStats.total_entries as number) ?? 0;
          if (entries > this.cycleCount) {
            evidenceType = 'for';
          } else if (this.cycleCount > 5 && entries < 3) {
            evidenceType = 'against';
          }
        } else if (vars.includes('anomaly_count') || statement.includes('anomal')) {
          if (anomalies.length > 0) {
            evidenceType = 'for';
          }
        } else if (vars.includes('insight_count') || vars.includes('observation_type_count') || statement.includes('observation')) {
          if (insights.length > 0) {
            evidenceType = 'for';
          }
        } else if (statement.includes('dream') || statement.includes('memor')) {
          // Dream-related: check if dream engine produced output
          if (this.dreamEngine) {
            const dStatus = this.dreamEngine.getStatus();
            const totals = dStatus.totals as Record<string, number> | undefined;
            if ((totals?.memoriesConsolidated ?? 0) > 0) {
              evidenceType = 'for';
            }
          }
        } else if (statement.includes('attention') || statement.includes('focus')) {
          if (this.attentionEngine) {
            const topTopics = this.attentionEngine.getTopTopics(1);
            if (topTopics.length > 0) {
              evidenceType = 'for';
            }
          }
        }

        if (evidenceType && hyp.id) {
          try {
            const col = evidenceType === 'for' ? 'evidence_for' : 'evidence_against';
            this.db.prepare(`UPDATE hypotheses SET ${col} = ${col} + 1 WHERE id = ?`).run(hyp.id);
          } catch {
            // Hypothesis table might not have these columns yet — skip
          }
        }
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
          // Feed experiment effect size into HypothesisEngine
          this.hypothesisEngine.observe({ source: this.brainName, type: 'experiment', value: result.conclusion.effect_size, timestamp: now, metadata: { name: exp.name, direction: result.conclusion.direction, significant: sig } });
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
      // Quality filter: auto-reject weak hypotheses (confidence < 0.3 after testing)
      const weak = testResults.filter(r => r.newStatus === 'testing' && r.confidence < 0.3 && (r.evidenceFor + r.evidenceAgainst) >= 3);
      for (const w of weak) {
        try { this.db.prepare("UPDATE hypotheses SET status = 'rejected' WHERE id = ?").run(w.hypothesisId); } catch { /* best effort */ }
      }
      if (weak.length > 0) this.log.debug(`[orchestrator] Rejected ${weak.length} weak hypotheses (confidence < 0.3)`);
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

    // 6c. Transfer adoption: apply pending transfers automatically
    if (this.transferEngine && this.cycleCount % this.distillEvery === 0) {
      try {
        const pending = this.transferEngine.getPendingTransfers();
        let applied = 0;
        for (const transfer of pending.slice(0, 3)) {
          if (transfer.id) {
            this.transferEngine.applyTransfer(transfer.id);
            applied++;
            this.journal.write({
              type: 'insight',
              title: `Adopted knowledge from ${transfer.source_brain}: ${transfer.statement.substring(0, 80)}`,
              content: `${transfer.knowledge_type}: ${transfer.statement}`,
              tags: [this.brainName, 'transfer', 'adopted', transfer.source_brain],
              references: [],
              significance: transfer.transfer_confidence > 0.7 ? 'notable' : 'routine',
              data: { transferId: transfer.id, confidence: transfer.transfer_confidence },
            });
          }
        }
        if (applied > 0) {
          ts?.emit('transfer', 'discovering', `Adopted ${applied} knowledge transfer(s) from peers`, 'notable');
          this.log.info(`[orchestrator] Transfers adopted: ${applied}`);
        }
      } catch (err) {
        this.log.warn(`[orchestrator] Transfer adoption error: ${(err as Error).message}`);
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

    // 8b. Cycle-end journal entry — guarantees journal grows every cycle (enriched with engine state)
    {
      const cycleDuration = Date.now() - start;
      const journalStats = this.journal.getSummary();
      const hypSummary = this.hypothesisEngine.getSummary();
      const predAccuracy = (() => {
        try {
          const predSummary = this.predictionEngine?.getSummary();
          const domains = (predSummary?.by_domain ?? []) as Array<{ accuracy_rate?: number }>;
          if (domains.length > 0) return Math.round((domains[0]?.accuracy_rate ?? 0) * 100);
        } catch { /* */ }
        return 0;
      })();
      const attTopics = (() => {
        try { return this.attentionEngine?.getTopTopics?.(3) ?? []; }
        catch { return []; }
      })();
      const focusStr = attTopics.length > 0
        ? attTopics.map((t: { topic: string }) => t.topic).join(', ')
        : 'none';

      // Dynamic type + significance: discoveries get elevated so Distiller + DreamEngine can see them
      const hasFindings = insights.length > 0 || anomalies.length > 0;
      const journalType = hasFindings ? 'discovery' : 'insight';
      const journalSignificance = hasFindings ? 'notable' : 'routine';

      // Enriched content with anomaly/insight details
      const contentParts = [
        `Completed feedback cycle #${this.cycleCount} in ${cycleDuration}ms.`,
        `${insights.length} insights, ${anomalies.length} anomalies detected.`,
        `Hypotheses: ${hypSummary.proposed} pending, ${hypSummary.confirmed} confirmed.`,
        `Predictions: accuracy ${predAccuracy}%. Focus: ${focusStr}.`,
        `Journal: ${(journalStats.total_entries as number) ?? 0} entries.`,
      ];
      if (anomalies.length > 0) {
        contentParts.push('Anomalies:');
        for (const a of anomalies.slice(0, 5)) {
          contentParts.push(`- ${a.title ?? a.type ?? 'unknown'}: ${a.metric ?? ''} deviated ${((a.deviation as number) ?? 0).toFixed(1)}%`);
        }
      }
      if (insights.length > 0) {
        contentParts.push('Insights:');
        for (const ins of insights.slice(0, 5)) {
          contentParts.push(`- ${ins.title ?? ins.type ?? 'unknown'}`);
        }
      }

      this.journal.write({
        type: journalType,
        title: `Cycle #${this.cycleCount} summary`,
        content: contentParts.join(' '),
        tags: [this.brainName, 'cycle-summary'],
        references: [],
        significance: journalSignificance,
        data: {
          cycle: this.cycleCount, duration_ms: cycleDuration,
          insights: insights.length, anomalies: anomalies.length,
          hypotheses_confirmed: hypSummary.confirmed, hypotheses_total: hypSummary.total,
          prediction_accuracy: predAccuracy, focus: focusStr,
        },
      });
    }

    // 9. Prediction Engine: resolve pending + auto-predict
    if (this.predictionEngine) {
      ts?.emit('prediction', 'predicting', 'Resolving pending predictions...');
      const resolved = this.predictionEngine.resolveExpired();
      if (resolved > 0) {
        this.log.info(`[orchestrator] Predictions resolved: ${resolved}`);
        ts?.emit('prediction', 'predicting', `Resolved ${resolved} prediction${resolved > 1 ? 's' : ''}`);

        // Cross-module: Prediction→Goal — feed accuracy into goal tracking
        if (this.goalEngine) {
          try {
            const summary = this.predictionEngine.getSummary();
            this.goalEngine.recordProgress(this.cycleCount, { predictionAccuracy: summary.accuracy_rate });
          } catch { /* goal recording non-critical */ }
        }
      }
      // Diagnostics: log prediction stats for debugging stale accuracy
      try {
        const summary = this.predictionEngine.getSummary();
        this.log.debug(`[orchestrator] Prediction stats: total=${summary.total_predictions}, resolved=${summary.resolved ?? 'N/A'}, pending=${summary.pending ?? 'N/A'}, accuracy=${(summary.accuracy_rate * 100).toFixed(1)}%`);
      } catch { /* non-critical */ }

      ts?.emit('prediction', 'predicting', 'Generating new predictions...');
      const newPredictions = this.predictionEngine.autoPredictAll();
      if (newPredictions.length > 0) {
        this.log.info(`[orchestrator] New predictions: ${newPredictions.length}`);
        ts?.emit('prediction', 'predicting', `Generated ${newPredictions.length} prediction${newPredictions.length > 1 ? 's' : ''}`, newPredictions.some(p => p.confidence > 0.7) ? 'notable' : 'routine');
      }
    }

    // 10. Self-Improvement: analyze own state and generate improvement suggestions
    // Brain is NEVER satisfied — always wants to learn more, build more, understand deeper
    ts?.emit('self_improvement', 'analyzing', 'What am I missing? What do I want to learn? What do I not yet understand?');
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

      // Hypothesis & knowledge metrics (useful for prediction)
      try {
        const hypSummary = this.hypothesisEngine.getSummary();
        this.predictionEngine.recordMetric('hypothesis_total', hypSummary.total, 'metric');
        this.predictionEngine.recordMetric('hypothesis_confirmed', hypSummary.confirmed, 'metric');
      } catch { /* skip */ }
      try {
        const kSummary = this.knowledgeDistiller.getSummary();
        this.predictionEngine.recordMetric('principle_count', kSummary.principles, 'metric');
        this.predictionEngine.recordMetric('knowledge_confidence', kSummary.avgConfidence, 'metric');
      } catch { /* skip */ }

      // 11a. Error-domain metrics (only brain has errors table — try/catch)
      try {
        const errorTotal = (this.db.prepare(`SELECT COUNT(*) as cnt FROM errors`).get() as { cnt: number }).cnt;
        const errorUnresolved = (this.db.prepare(`SELECT COUNT(*) as cnt FROM errors WHERE resolved = 0`).get() as { cnt: number }).cnt;
        const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const errorRate1h = (this.db.prepare(`SELECT COUNT(*) as cnt FROM errors WHERE last_seen > ?`).get(oneHourAgo) as { cnt: number }).cnt;
        const solutionTotal = (this.db.prepare(`SELECT COUNT(*) as cnt FROM solutions`).get() as { cnt: number }).cnt;
        const resolutionRate = errorTotal > 0 ? (errorTotal - errorUnresolved) / errorTotal : 0;

        this.predictionEngine.recordMetric('error_total', errorTotal, 'error');
        this.predictionEngine.recordMetric('error_unresolved', errorUnresolved, 'error');
        this.predictionEngine.recordMetric('error_rate_1h', errorRate1h, 'error');
        this.predictionEngine.recordMetric('solution_total', solutionTotal, 'error');
        this.predictionEngine.recordMetric('error_resolution_rate', resolutionRate, 'error');
      } catch { /* errors/solutions tables don't exist in this brain — skip */ }

      ts?.emit('orchestrator', 'perceiving', `Self-metrics recorded: ${anomalies.length} anomalies, ${insights.length} insights, ${cycleDuration}ms`);

      // 11b. Re-resolve predictions now that fresh metrics are available
      // (Step 9 resolves before metrics are recorded, so we re-check here)
      const lateResolved = this.predictionEngine.resolveExpired();
      if (lateResolved > 0) {
        this.log.info(`[orchestrator] Late-resolved ${lateResolved} prediction(s) after metric recording`);
        ts?.emit('prediction', 'discovering', `Resolved ${lateResolved} prediction(s) with fresh data`, 'notable');
      }
    }

    // 12. Auto-Experiments: use AutoExperimentEngine if available, otherwise hardcoded fallback
    if (this.autoExperimentEngine && this.cycleCount > 3 && this.cycleCount % 5 === 0) {
      ts?.emit('auto_experiment', 'experimenting', 'Processing auto-experiments...');
      try {
        // Ensure MetaCognition has fresh report cards before AutoExperiment discovers candidates
        if (this.metaCognitionLayer) {
          try { this.metaCognitionLayer.evaluate(); }
          catch (mcErr) { this.log.warn(`[orchestrator] MetaCog pre-eval for AutoExp: ${(mcErr as Error).message}`); }
        }
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

    // 13. Periodic Dream Consolidation: don't wait for idle, consolidate every 5 cycles
    if (this.dreamEngine && this.cycleCount % 5 === 0) {
      ts?.emit('dream', 'dreaming', 'Feeding knowledge into memories for consolidation...');
      try {
        // Feed current knowledge into memories table so consolidation has material
        const principles = this.knowledgeDistiller.getPrinciples(undefined, 50);
        const journalEntries = this.journal.search('', 30);
        const insertMemory = this.db.prepare(`
          INSERT OR IGNORE INTO memories (category, key, content, importance, source, tags, active)
          VALUES (?, ?, ?, ?, 'orchestrator_feed', ?, 1)
        `);
        for (const p of principles) {
          insertMemory.run('principle', `principle:${p.id ?? p.statement.substring(0, 50)}`, p.statement, Math.round(Math.min(10, ((p.confidence ?? 0.5) + 0.3) * 10)), JSON.stringify(['principle', this.brainName]));
        }
        for (const j of journalEntries) {
          if (j.significance === 'breakthrough' || j.significance === 'notable') {
            insertMemory.run('journal', `journal:${j.id ?? j.title.substring(0, 50)}`, `${j.title}: ${j.content?.substring(0, 200) ?? ''}`, j.significance === 'breakthrough' ? 9 : 6, JSON.stringify(['journal', j.type, this.brainName]));
          }
        }
        ts?.emit('dream', 'dreaming', `Fed ${principles.length} principles + ${journalEntries.filter(j => j.significance === 'breakthrough' || j.significance === 'notable').length} journal entries into memories`);
      } catch (feedErr) {
        this.log.warn(`[orchestrator] Dream memory feed error: ${(feedErr as Error).message}`);
      }
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
            this.predictionEngine.recordMetric('scanner_avg_score', (status as unknown as Record<string, number>).avg_score ?? 0, 'scanner');
            this.predictionEngine.recordMetric('scanner_new_breakouts', scan.new_breakouts, 'scanner');
            this.predictionEngine.recordMetric('scanner_new_signals', scan.new_signals, 'scanner');
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

          // Cross-module: Narrative→Emotion — contradictions signal cognitive dissonance
          if (this.emotionalModel && highSeverity.length > 0) {
            try {
              // Record contradiction observations so sense() picks up stress/frustration
              this.hypothesisEngine.observe({
                source: this.brainName,
                type: 'high_severity_contradiction',
                value: highSeverity.length,
                timestamp: now,
                metadata: { contradictionCount: contradictions.length, highSeverityCount: highSeverity.length },
              });
            } catch { /* emotional signaling non-critical */ }
          }
          // 17a. Actively resolve contradictions — lower confidence of weaker side
          let resolved = 0;
          for (const c of highSeverity.slice(0, 5)) {
            try {
              if (c.type === 'principle_vs_principle') {
                // Find both principles by statement, demote the weaker one
                const pA = this.db.prepare(`SELECT id, confidence FROM knowledge_principles WHERE statement = ?`).get(c.statement_a) as { id: string; confidence: number } | undefined;
                const pB = this.db.prepare(`SELECT id, confidence FROM knowledge_principles WHERE statement = ?`).get(c.statement_b) as { id: string; confidence: number } | undefined;
                if (pA && pB) {
                  const weaker = pA.confidence <= pB.confidence ? pA : pB;
                  const newConf = Math.max(0.05, weaker.confidence * 0.6);
                  this.db.prepare(`UPDATE knowledge_principles SET confidence = ?, updated_at = datetime('now') WHERE id = ?`).run(newConf, weaker.id);
                  if (newConf < 0.2) {
                    // Demote to anti-pattern
                    const weakerStatement = weaker === pA ? c.statement_a : c.statement_b;
                    this.db.prepare(`DELETE FROM knowledge_principles WHERE id = ?`).run(weaker.id);
                    this.db.prepare(`INSERT OR IGNORE INTO knowledge_anti_patterns (id, domain, statement, failure_rate, sample_size, confidence, alternative) VALUES (?, 'general', ?, 0.7, 1, 0.5, ?)`)
                      .run(`demoted-${weaker.id}`, weakerStatement, `Contradicted by stronger principle`);
                  }
                  resolved++;
                }
              } else if (c.type === 'hypothesis_vs_antipattern') {
                // Anti-pattern wins over hypothesis — reduce hypothesis confidence
                const h = this.db.prepare(`SELECT id, confidence FROM hypotheses WHERE statement = ? AND status = 'confirmed'`).get(c.statement_a) as { id: string; confidence: number } | undefined;
                if (h) {
                  const newConf = Math.max(0.1, h.confidence * 0.7);
                  this.db.prepare(`UPDATE hypotheses SET confidence = ?, updated_at = datetime('now') WHERE id = ?`).run(newConf, h.id);
                  resolved++;
                }
              }
            } catch { /* table may not exist or statement mismatch — skip */ }
          }
          if (resolved > 0) {
            ts?.emit('narrative', 'discovering', `Resolved ${resolved} contradictions (weakened lower-confidence side)`, 'notable');
            this.journal.write({
              type: 'reflection',
              title: `Resolved ${resolved} contradictions`,
              content: `Auto-resolved ${resolved} high-severity contradictions by demoting weaker principles/hypotheses.`,
              tags: [this.brainName, 'contradiction', 'resolved'],
              references: [],
              significance: 'notable',
              data: { resolved },
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
          // Bridge: feed top-3 gaps as observations into HypothesisEngine → targeted hypotheses
          for (const gap of gaps.slice(0, 3)) {
            this.hypothesisEngine.observe({
              source: this.brainName,
              type: `knowledge_gap:${gap.topic}`,
              value: gap.gapScore,
              timestamp: now,
              metadata: { gapType: gap.gapType, attentionScore: gap.attentionScore, knowledgeScore: gap.knowledgeScore },
            });
          }

          // Bridge: feed gap metrics into PredictionEngine
          if (this.predictionEngine) {
            this.predictionEngine.recordMetric('knowledge_gap_count', gaps.length, 'metric');
            for (const gap of gaps.slice(0, 3)) {
              this.predictionEngine.recordMetric(`gap_score:${gap.topic}`, gap.gapScore, 'metric');
            }
          }

          // Internal domain observations: feed concrete metrics for gap topics
          for (const gap of gaps.slice(0, 5)) {
            const topic = gap.topic.toLowerCase();
            try {
              if (topic.includes('prediction')) {
                // Feed per-domain prediction accuracy into HypothesisEngine
                const accByDomain = this.predictionEngine?.getAccuracy() ?? [];
                for (const acc of accByDomain) {
                  this.hypothesisEngine.observe({ source: this.brainName, type: `internal:prediction_accuracy:${acc.domain}`, value: acc.accuracy_rate, timestamp: now, metadata: { total: acc.total, correct: acc.correct } });
                }
              } else if (topic.includes('anomaly')) {
                const anomalyCount = this.anomalyDetective.getAnomalies(undefined, 100).length;
                this.hypothesisEngine.observe({ source: this.brainName, type: 'internal:anomaly_detection_count', value: anomalyCount, timestamp: now });
              } else if (topic.includes('distill') || topic.includes('knowledge')) {
                const kSummary = this.knowledgeDistiller.getSummary();
                this.hypothesisEngine.observe({ source: this.brainName, type: 'internal:distillation_throughput', value: kSummary.principles + kSummary.antiPatterns + kSummary.strategies, timestamp: now, metadata: { principles: kSummary.principles, avgConfidence: kSummary.avgConfidence } });
              } else if (topic.includes('dream') || topic.includes('consolidat')) {
                const dStatus = this.dreamEngine?.getStatus();
                const totals = dStatus?.totals as Record<string, number> | undefined;
                this.hypothesisEngine.observe({ source: this.brainName, type: 'internal:dream_consolidation_count', value: (totals?.memoriesConsolidated ?? 0), timestamp: now });
              }
            } catch { /* internal observation non-critical */ }
          }

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

    // 18b. Auto-Missions: Curiosity → MissionEngine bridge
    // When CuriosityEngine finds a dark_zone gap with high score, auto-create a research mission.
    // Limits: max 1 auto-mission per hour, max 3 active concurrent missions.
    if (this.missionEngine && this.curiosityEngine && this.cycleCount % this.agendaEvery === 0) {
      try {
        const gaps = this.curiosityEngine.getGaps(5);
        const highPrioGap = gaps.find(g => g.gapType === 'dark_zone' && g.gapScore > 0.6);
        const hourSinceLastMission = (Date.now() - this.lastAutoMissionTime) > 14_400_000;

        if (highPrioGap && hourSinceLastMission) {
          const topic = highPrioGap.topic ?? `Knowledge gap: ${highPrioGap.gapType}`;
          try {
            this.missionEngine.createMission(topic, 'standard');
            this.lastAutoMissionTime = Date.now();
            ts?.emit('mission_engine', 'exploring',
              `Auto-mission started: "${topic}" (gap score: ${(highPrioGap.gapScore * 100).toFixed(0)}%)`,
              'notable',
            );
            this.journal.write({
              type: 'milestone',
              title: `Auto-mission: ${topic}`,
              content: `CuriosityEngine dark_zone gap triggered automatic research mission. Gap score: ${highPrioGap.gapScore.toFixed(2)}, questions: ${highPrioGap.questions?.slice(0, 2).join(' | ') ?? 'none'}`,
              tags: [this.brainName, 'auto-mission', 'curiosity'],
              references: [],
              significance: 'notable',
              data: { missionTopic: topic, gapScore: highPrioGap.gapScore },
            });
          } catch (err) {
            // Max concurrent missions reached — that's fine, try next cycle
            this.log.debug(`[orchestrator] Auto-mission skipped: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        this.log.debug(`[orchestrator] Auto-mission check error: ${(err as Error).message}`);
      }
    }

    // 18c. Curiosity Auto-Answer: periodically answer unanswered questions via NarrativeEngine
    if (this.curiosityEngine && this.narrativeEngine && this.cycleCount % (this.reflectEvery * 5) === 0) {
      try {
        const questions = this.curiosityEngine.getQuestions(10);
        const unanswered = questions.filter(q => !q.answered).slice(0, 2);
        for (const q of unanswered) {
          const answer = this.narrativeEngine.ask(q.question);
          if (answer.sources.length > 0 && q.id) {
            this.curiosityEngine.answerQuestion(q.id, answer.answer);
            this.log.debug(`[orchestrator] Auto-answered curiosity question #${q.id}: "${q.question.substring(0, 60)}"`);
          }
        }
        if (unanswered.length > 0) {
          ts?.emit('curiosity', 'exploring', `Auto-answered ${unanswered.length} curiosity question(s)`, 'routine');
        }
      } catch (err) {
        this.log.debug(`[orchestrator] Curiosity auto-answer error: ${(err as Error).message}`);
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

    // 20. Internal + Cross-Brain Debate: debate key findings, solicit cross-brain perspectives
    if (this.debateEngine && this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('reflecting', 'reflecting', 'Initiating debate on recent findings...');
      try {
        const topic = this.pickDebateTopic();
        if (topic) {
          const debate = this.debateEngine.startDebate(topic);

          // Solicit cross-brain perspectives via SignalRouter
          if (this.signalRouter) {
            const peers = ['brain', 'trading-brain', 'marketing-brain'].filter(b => b !== this.brainName);
            for (const peer of peers) {
              try {
                this.signalRouter.emit({
                  targetBrain: peer,
                  signalType: 'debate_perspective_request',
                  payload: { debateId: debate.id!, question: topic },
                  confidence: 0.7,
                }).catch(() => { /* peer offline */ });
              } catch { /* peer offline */ }
            }
          }

          const synthesis = this.debateEngine.synthesize(debate.id!);

          if (synthesis) {
            // Journal the debate
            if (synthesis.conflicts.length > 0) {
              this.journal.write({
                type: 'discovery',
                title: `Debate: ${topic.substring(0, 80)}`,
                content: `Debate with ${synthesis.participantCount} perspective(s). ${synthesis.conflicts.length} conflict(s). Resolution: ${synthesis.resolution}`,
                tags: [this.brainName, 'debate', 'synthesis'],
                references: [],
                significance: synthesis.conflicts.length > 2 ? 'notable' : 'routine',
                data: { debate: { question: topic, synthesis } },
              });
            }

            // Convert recommendations to ActionBridge proposals
            if (this.actionBridge && synthesis.recommendations.length > 0) {
              for (const rec of synthesis.recommendations.slice(0, 2)) {
                this.actionBridge.propose({
                  source: 'research',
                  type: 'create_goal',
                  title: `Debate recommendation: ${rec.substring(0, 70)}`,
                  description: `From debate "${topic.substring(0, 80)}": ${rec}`,
                  confidence: synthesis.confidence,
                  payload: { debateId: debate.id, recommendation: rec },
                });
              }
            }

            // Auto-close the debate after synthesis
            this.debateEngine.closeDebate(debate.id!);
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

    // 21b. Adaptive Strategy: adjust parameters for poorly performing engines
    if (this.metaCognitionLayer && this.cycleCount % this.reflectEvery === 0) {
      try {
        const cards = this.metaCognitionLayer.getLatestReportCards();
        const poorCards = cards.filter(c => c.grade === 'D' || c.grade === 'F');
        for (const card of poorCards.slice(0, 3)) {
          // Try adapting the engine's research strategy parameters
          const strategyDomains: Array<'recall' | 'learning' | 'research'> = ['research', 'learning'];
          for (const domain of strategyDomains) {
            const currentVal = this.adaptiveStrategy.getParam(domain, card.engine);
            if (currentVal !== null) {
              const direction = card.grade === 'F' ? 0.2 : 0.1;
              this.adaptiveStrategy.adapt(
                domain,
                card.engine,
                currentVal * (1 + direction),
                `MetaCog grade ${card.grade} — boosting ${card.engine}`,
                { reportCard: card },
              );
              ts?.emit('adaptive_strategy', 'discovering',
                `Adapted ${domain}.${card.engine}: grade ${card.grade} → boost ${(direction * 100).toFixed(0)}%`,
                'routine',
              );
              break; // Only adapt one domain per engine
            }
          }
        }
      } catch (err) {
        this.log.warn(`[orchestrator] Step 21b AdaptiveStrategy error: ${(err as Error).message}`);
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

    // 22b. Sync PredictionEngine params from ParameterRegistry
    if (this.parameterRegistry && this.predictionEngine) {
      const alpha = this.parameterRegistry.get('prediction', 'ewmaAlpha');
      const beta = this.parameterRegistry.get('prediction', 'trendBeta');
      const minConf = this.parameterRegistry.get('prediction', 'minConfidence');
      const minDP = this.parameterRegistry.get('prediction', 'minDataPoints');
      const maxPred = this.parameterRegistry.get('prediction', 'maxPredictionsPerCycle');
      const horizon = this.parameterRegistry.get('prediction', 'defaultHorizonMs');
      if (alpha !== undefined || beta !== undefined || minConf !== undefined || minDP !== undefined || maxPred !== undefined || horizon !== undefined) {
        this.predictionEngine.updateConfig({
          ...(alpha !== undefined ? { ewmaAlpha: alpha } : {}),
          ...(beta !== undefined ? { trendBeta: beta } : {}),
          ...(minConf !== undefined ? { minConfidence: minConf } : {}),
          ...(minDP !== undefined ? { minDataPoints: minDP } : {}),
          ...(maxPred !== undefined ? { maxPredictionsPerCycle: maxPred } : {}),
          ...(horizon !== undefined ? { defaultHorizonMs: horizon } : {}),
        });
      }
    }

    // 22c. Sync DreamEngine params from ParameterRegistry
    if (this.parameterRegistry && this.dreamEngine) {
      const clusterSim = this.parameterRegistry.get('dream', 'cluster_similarity');
      const replayBatch = this.parameterRegistry.get('dream', 'replay_batch_size');
      const maxConsol = this.parameterRegistry.get('dream', 'max_consolidations');
      const pruneThreshold = this.parameterRegistry.get('dream', 'prune_threshold');
      const learningRate = this.parameterRegistry.get('dream', 'learning_rate');
      const decayRate = this.parameterRegistry.get('dream', 'importance_decay_rate');
      if (clusterSim !== undefined || replayBatch !== undefined || maxConsol !== undefined || pruneThreshold !== undefined || learningRate !== undefined || decayRate !== undefined) {
        this.dreamEngine.updateConfig({
          ...(clusterSim !== undefined ? { clusterSimilarityThreshold: clusterSim } : {}),
          ...(replayBatch !== undefined ? { replayBatchSize: replayBatch } : {}),
          ...(maxConsol !== undefined ? { maxConsolidationsPerCycle: maxConsol } : {}),
          ...(pruneThreshold !== undefined ? { dreamPruneThreshold: pruneThreshold } : {}),
          ...(learningRate !== undefined ? { dreamLearningRate: learningRate } : {}),
          ...(decayRate !== undefined ? { importanceDecayRate: decayRate } : {}),
        });
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

    // Step 25: Advocatus Diaboli — challenge weakest principle + adjust confidence (every 10 cycles)
    if (this.debateEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('orchestrator', 'reflecting', 'Step 25: Challenging a principle...', 'routine');
        const principles = this.knowledgeDistiller.getPrinciples(undefined, 20);
        if (principles.length > 0) {
          // Target weakest principles first (lowest confidence), not random
          const sorted = [...principles].sort((a, b) => a.confidence - b.confidence);
          const targetPrinciple = sorted[0];

          const challenge = this.debateEngine.challenge(targetPrinciple.statement);
          this.journal.write({
            type: 'reflection',
            title: `Principle challenged: resilience=${(challenge.resilienceScore * 100).toFixed(0)}% → ${challenge.outcome}`,
            content: `"${challenge.principleStatement.substring(0, 100)}" — Supporting: ${challenge.supportingEvidence.length}, Contradicting: ${challenge.contradictingEvidence.length}`,
            tags: ['challenge', challenge.outcome],
            references: [],
            significance: challenge.outcome === 'disproved' ? 'notable' : 'routine',
            data: { challenge },
          });

          // Actually adjust principle confidence based on challenge outcome
          if (challenge.principleId !== null) {
            const principleIdStr = String(challenge.principleId);
            if (challenge.outcome === 'disproved') {
              // Disproved → remove principle entirely
              this.knowledgeDistiller.removePrinciple(principleIdStr);
              this.log.info(`[orchestrator] Step 25: Principle "${targetPrinciple.statement.substring(0, 50)}" REMOVED (disproved)`);
            } else if (challenge.outcome === 'weakened') {
              // Weakened → reduce confidence by 30%
              this.knowledgeDistiller.adjustPrincipleConfidence(principleIdStr, 0.7);
              this.log.info(`[orchestrator] Step 25: Principle confidence reduced by 30% (weakened)`);
            } else if (challenge.outcome === 'survived') {
              // Survived → slight boost (+10%)
              this.knowledgeDistiller.adjustPrincipleConfidence(principleIdStr, 1.1);
            }
          }
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('advocatus_diaboli', this.cycleCount, { insights: 1 });
      } catch (err) { this.log.warn(`[orchestrator] Step 25 error: ${(err as Error).message}`); }
    }

    // Step 26: Dream Retrospective — analyze pruning regret (every 5 cycles)
    if (this.dreamEngine && this.cycleCount % 5 === 0) {
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
        if (this.metaCognitionLayer) {
          this.metaCognitionLayer.recordStep('emergence_explain', this.cycleCount, {
            insights: explained,
            predictions: events.length,
            journal_entries: events.filter(e => e.id && !this.emergenceEngine!.getExplanation(e.id)).length,
          });
        }
      } catch (err) { this.log.warn(`[orchestrator] Step 30 error: ${(err as Error).message}`); }
    }

    // Step 31: Meta-Trends — record system-wide trend data (every 5 cycles)
    if (this.metaCognitionLayer && this.cycleCount % 5 === 0) {
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
        // Cross-module: Simulation→Prediction — feed predicted outcomes as synthetic metrics
        if (this.predictionEngine && sim.predictedOutcomes.length > 0) {
          try {
            for (const outcome of sim.predictedOutcomes) {
              this.predictionEngine.recordMetric(`sim_${outcome.metric}`, outcome.predicted * outcome.confidence, 'metric');
            }
          } catch { /* simulation metric recording non-critical */ }
        }

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
        // Cross-module: MemoryPalace→RAG — index new connections for semantic search (once)
        if (result.newConnections > 0 && this.ragIndexer && !this.memoryPalaceRagRegistered) {
          try {
            this.ragIndexer.addSource({
              collection: 'memory_palace',
              query: `SELECT id, source_type || ':' || source_id || ' —[' || relation || ']→ ' || target_type || ':' || target_id as text FROM knowledge_connections ORDER BY strength DESC LIMIT 100`,
              textColumns: ['text'],
              idColumn: 'id',
            });
            this.memoryPalaceRagRegistered = true;
          } catch { /* source registration non-critical */ }
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

        // 35a — Bootstrap default goals on first reflect cycle
        if (this.cycleCount <= this.reflectEvery) {
          const bootstrapped = this.goalEngine.bootstrapDefaults(this.cycleCount);
          if (bootstrapped.length > 0) {
            this.journal.write({
              type: 'discovery',
              title: `Bootstrapped ${bootstrapped.length} default goals`,
              content: bootstrapped.map(g => `"${g.title}" (${g.metricName}→${g.targetValue})`).join(', '),
              tags: [this.brainName, 'goal', 'bootstrap'],
              references: [],
              significance: 'notable',
              data: { goals: bootstrapped },
            });
          }
        }

        // 35b — Check goals for achievement/failure
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

          // 35c — Ratchet: create harder successor goal
          const successor = this.goalEngine.ratchetGoal(g, this.cycleCount);
          if (successor) {
            this.journal.write({
              type: 'discovery',
              title: `Goal ratcheted: "${successor.title}"`,
              content: `New target: ${successor.metricName}=${successor.targetValue} (baseline=${successor.baselineValue})`,
              tags: [this.brainName, 'goal', 'ratchet'],
              references: [],
              significance: 'routine',
              data: { goal: successor },
            });
          }
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

        // 35d — Goal-driven missions for struggling goals (2h cooldown)
        if (this.missionEngine && (Date.now() - this.lastGoalMissionTime) > 86_400_000) {
          const activeGoals = this.goalEngine.listGoals('active');
          for (const g of activeGoals) {
            const progress = this.goalEngine.getProgress(g.id!);
            if (progress && progress.trend !== 'improving' && progress.dataPoints >= 5) {
              try {
                this.missionEngine.createMission(
                  `Research: improve ${g.metricName} for goal "${g.title}" (current=${g.currentValue}, target=${g.targetValue})`,
                );
                this.lastGoalMissionTime = Date.now();
                this.log.info(`[orchestrator] Goal-driven mission created for "${g.title}"`);
              } catch { /* mission engine full or error */ }
              break; // max 1 mission per check
            }
          }
        }

        // Suggest new goals
        const suggestions = this.goalEngine.suggestGoals(this.cycleCount);
        for (const s of suggestions.slice(0, 2)) {
          ts?.emit('goals', 'reflecting', `Goal suggestion: "${s.title}" — ${s.reason}`, 'routine');
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('goal_engine', this.cycleCount, { insights: achieved.length + failed.length, journal_entries: suggestions.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 35 error: ${(err as Error).message}`); }
    }

    // Step 36: EvolutionEngine — evolve parameter configurations (every generationEvery cycles, default 20)
    // Skip if circuit breaker tripped (guardrails)
    if (this.evolutionEngine && this.cycleCount % this.evolutionEngine.generationEvery === 0
      && !(this.guardrailEngine?.isCircuitBreakerTripped())) {
      try {
        ts?.emit('evolution', 'reflecting', 'Step 36: Running evolution generation...', 'routine');
        const gen = this.evolutionEngine.runGeneration();
        this.journal.write({
          type: 'experiment',
          title: `Evolution Generation #${gen.generation}`,
          content: `best=${gen.bestFitness.toFixed(3)} avg=${gen.avgFitness.toFixed(3)} diversity=${gen.diversity.toFixed(3)} pop=${gen.populationSize}`,
          tags: [this.brainName, 'evolution', 'generation'],
          references: [],
          significance: gen.bestFitness > gen.avgFitness * 1.2 ? 'notable' : 'routine',
          data: { generation: gen },
        });
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('evolution_engine', this.cycleCount, { insights: 1, journal_entries: 1 });
      } catch (err) { this.log.warn(`[orchestrator] Step 36 error: ${(err as Error).message}`); }
    }

    // Step 37: ReasoningEngine — build rules + run inferences (every 5 cycles)
    if (this.reasoningEngine && this.cycleCount % 5 === 0) {
      try {
        ts?.emit('reasoning', 'analyzing', 'Step 37: Building inference rules + reasoning...', 'routine');
        this.reasoningEngine.buildRules();

        // Infer on attention topics or anomalies
        const topics = this.attentionEngine?.getTopTopics?.(3) ?? [];
        const queries: string[] = topics.map((t: { topic: string }) => t.topic);
        if (queries.length === 0) {
          const anomalies = this.anomalyDetective.getAnomalies(undefined, 3);
          for (const a of anomalies) queries.push(a.title);
        }

        let insights = 0;
        for (const q of queries) {
          const chain = this.reasoningEngine.infer(q);
          if (chain && chain.steps.length > 1) {
            this.journal.write({
              type: 'discovery',
              title: `Reasoning Chain: ${q}`,
              content: chain.conclusion,
              tags: [this.brainName, 'reasoning', 'inference'],
              references: [],
              significance: chain.final_confidence > 0.5 ? 'notable' : 'routine',
              data: { chain },
            });
            insights++;

            // Cross-module: Reasoning→Hypothesis — high-confidence chains become testable hypotheses
            if (this.hypothesisEngine && chain.final_confidence > 0.5) {
              try {
                this.hypothesisEngine.propose({
                  statement: chain.conclusion,
                  type: 'correlation',
                  source: 'reasoning_engine',
                  variables: [q],
                  condition: { type: 'correlation', params: { strategy: 'inference_chain', chain_id: chain.id, confidence: chain.final_confidence } },
                });
              } catch { /* dedup or other constraint — non-critical */ }
            }
          }

          // Abduce on surprising observations
          const explanations = this.reasoningEngine.abduce(q);
          if (explanations.length > 0) {
            insights++;
          }
        }

        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('reasoning_engine', this.cycleCount, { insights });
      } catch (err) { this.log.warn(`[orchestrator] Step 37 error: ${(err as Error).message}`); }
    }

    // Step 38: EmotionalModel — sense emotions + recommend behavior
    if (this.emotionalModel) {
      try {
        ts?.emit('emotional', 'analyzing', 'Step 38: Sensing emotional state...', 'routine');
        this.emotionalModel.sense();
        const mood = this.emotionalModel.getMood();
        this.log.info(`[orchestrator] Mood: ${mood.mood} (score=${mood.score.toFixed(2)}, valence=${mood.valence.toFixed(2)}, arousal=${mood.arousal.toFixed(2)})`);

        // Log mood change to journal
        if (this.cycleCount % this.reflectEvery === 0) {
          const recs = this.emotionalModel.getRecommendations();
          if (recs.length > 0) {
            this.journal.recordDiscovery(`Emotional state: ${mood.mood}`, `Mood: ${mood.mood} — ${recs.join('; ')}`, { mood: mood.mood, score: mood.score, valence: mood.valence });
          }
        }

        // Emit recommendations as thoughts
        const recs = this.emotionalModel.getRecommendations();
        for (const rec of recs) {
          ts?.emit('emotional', 'reflecting', `[${mood.mood}] ${rec}`, 'notable');
        }

        // Cross-module: Emotional→Attention — high arousal boosts attention on active topics
        if (mood.arousal > 0.7 && this.attentionEngine) {
          try {
            const topTopics = this.attentionEngine.getTopTopics?.(3) ?? [];
            for (const t of topTopics) {
              this.attentionEngine.setFocus(t.topic, mood.arousal * 2.0);
            }
            if (topTopics.length > 0) {
              this.log.info(`[orchestrator] High arousal (${mood.arousal.toFixed(2)}) → boosted attention on ${topTopics.length} topics`);
            }
          } catch { /* attention boost non-critical */ }
        }

        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('emotional_model', this.cycleCount, { insights: 1 });
      } catch (err) { this.log.warn(`[orchestrator] Step 38 error: ${(err as Error).message}`); }
    }

    // Step 39: SelfScanner — index own source code (every 20 cycles)
    if (this.selfScanner && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('self-scanner', 'analyzing', 'Step 39: Scanning own source code...', 'routine');
        const scanResult = this.selfScanner.scan(this.selfModificationEngine ? (this.selfModificationEngine as unknown as { config: { projectRoot: string } }).config?.projectRoot || '.' : '.');
        this.log.info(`[orchestrator] SelfScanner: ${scanResult.totalFiles} files (${scanResult.newFiles} new, ${scanResult.updatedFiles} updated, ${scanResult.durationMs}ms)`);
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('self_scanner', this.cycleCount, { insights: scanResult.totalFiles, thoughts: scanResult.totalEntities });
      } catch (err) { this.log.warn(`[orchestrator] Step 39 error: ${(err as Error).message}`); }
    }

    // Step 40: SelfModification — propose and test code changes (every 20 cycles)
    // Skip if circuit breaker tripped (guardrails)
    if (this.selfModificationEngine && this.cycleCount % 20 === 0
      && !(this.guardrailEngine?.isCircuitBreakerTripped())) {
      try {
        // Skip if there are already pending modifications
        const pending = this.selfModificationEngine.getPending();
        if (pending.length === 0) {
          ts?.emit('self-modification', 'analyzing', 'Step 40: Looking for self-improvement opportunities...', 'routine');
          const suggestion = this.findActionableSuggestion();
          if (suggestion) {
            const mod = this.selfModificationEngine.proposeModification(
              suggestion.title,
              suggestion.problem,
              suggestion.targetFiles,
              'orchestrator',
              {
                hypothesis: `Improving ${suggestion.title.replace('Improve ', '')} based on diagnostic: ${suggestion.problem.slice(0, 200)}`,
                risk_level: suggestion.targetFiles.length > 1 ? 'medium' : 'low',
                expected_impact: [{ metric: 'engine_effectiveness', direction: 'increase', target: '+10%' }],
                acceptance_criteria: ['Build passes', 'All tests pass', 'No regressions in related engines'],
                referenceCode: suggestion.referenceCode,
              },
            );
            ts?.emit('self-modification', 'discovering', `Self-modification proposed: ${mod.title}`, 'notable');

            // Auto-propose consensus vote for medium/high risk modifications
            if (this.consensusEngine && suggestion.targetFiles.length > 1) {
              try {
                this.consensusEngine.propose({
                  type: 'selfmod_approval',
                  description: `SelfMod: ${mod.title} — ${suggestion.problem.substring(0, 200)}`,
                  options: ['approve', 'reject'],
                });
                ts?.emit('consensus', 'analyzing', `Consensus vote created for: ${mod.title}`, 'notable');
              } catch { /* not critical */ }
            }

            // Try to generate + test
            try {
              await this.selfModificationEngine.generateCode(mod.id);
              await this.selfModificationEngine.testModification(mod.id);
              const tested = this.selfModificationEngine.getModification(mod.id);
              if (tested?.status === 'ready') {
                ts?.emit('self-modification', 'discovering', `Self-modification ready for review: ${mod.title}`, 'breakthrough');
              }
            } catch (genErr) {
              this.log.warn(`[orchestrator] Step 40 generation/test failed: ${(genErr as Error).message}`);
            }
          }
          if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('self_modification', this.cycleCount, { insights: suggestion ? 1 : 0 });
        } else {
          ts?.emit('self-modification', 'reflecting', `Step 40: ${pending.length} pending modification(s) awaiting review`, 'routine');
        }
      } catch (err) { this.log.warn(`[orchestrator] Step 40 error: ${(err as Error).message}`); }
    }

    // Step 41: ConceptAbstraction — cluster knowledge into abstract concepts (every 10 cycles)
    if (this.conceptAbstraction && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('concept_abstraction', 'analyzing', 'Step 41: Forming abstract concepts...', 'routine');
        const result = this.conceptAbstraction.formConcepts();

        if (result.totalConcepts > 0) {
          this.journal.write({
            title: `Concept Formation: ${result.totalConcepts} concepts across ${Object.keys(result.levels).length} levels`,
            type: 'discovery',
            content: `Formed ${result.totalConcepts} concepts (L0: ${result.levels[0] ?? 0}, L1: ${result.levels[1] ?? 0}, L2: ${result.levels[2] ?? 0})`,
            tags: [this.brainName, 'concept-abstraction', 'knowledge-organization'],
            references: [],
            significance: result.newConcepts > 0 ? 'notable' : 'routine',
            data: result,
          });
        }

        // Register concepts in MemoryPalace
        if (this.memoryPalace && result.totalConcepts > 0) {
          try {
            this.conceptAbstraction.registerInPalace(this.memoryPalace);
          } catch (palaceErr) { this.log.warn(`[orchestrator] Step 41 palace registration error: ${(palaceErr as Error).message}`); }
        }

        // Feed transferable concepts into TransferEngine
        if (this.transferEngine && result.totalConcepts > 0) {
          try {
            const transferable = this.conceptAbstraction.getTransferableConcepts(0.3);
            if (transferable.length > 0) {
              ts?.emit('concept_abstraction', 'discovering', `${transferable.length} cross-domain concepts available for transfer`, 'notable');
            }
          } catch { /* not critical */ }
        }

        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('concept_abstraction', this.cycleCount, { insights: result.newConcepts });
      } catch (err) { this.log.warn(`[orchestrator] Step 41 error: ${(err as Error).message}`); }
    }

    // ── Intelligence Upgrade Steps (Sessions 55-65) ─────────

    // Step 42: FactExtractor — extract typed facts from recent insights (every 3 cycles)
    if (this.factExtractor && this.knowledgeGraph && this.cycleCount % 3 === 0) {
      try {
        ts?.emit('fact_extractor', 'analyzing', 'Step 42: Extracting facts from insights...', 'routine');
        let factsAdded = 0;
        // Extract from recent insights
        // Extract from insights NOT yet in knowledge_facts
        try {
          const unprocessed = this.db.prepare(
            `SELECT i.id, i.description FROM insights i
             WHERE i.description IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM knowledge_facts kf WHERE kf.source_type = 'insight' AND kf.source_id = i.id)
             ORDER BY i.id DESC LIMIT 30`
          ).all() as Array<{ id: number; description: string }>;
          for (const ins of unprocessed) {
            const facts = this.factExtractor.extractFromInsight(ins.description, `insight:${ins.id}`);
            for (const f of facts) {
              this.knowledgeGraph.addFact(f.subject, f.predicate, f.object, f.context, f.confidence, 'insight', String(ins.id));
              factsAdded++;
            }
          }
        } catch { /* table may not exist */ }
        // Extract from error-solution pairs NOT yet processed
        try {
          const pairs = this.db.prepare(
            `SELECT e.id, e.type, e.message, s.description as solution, e.context
             FROM errors e JOIN solutions s ON s.error_id = e.id
             WHERE NOT EXISTS (SELECT 1 FROM knowledge_facts kf WHERE kf.source_type = 'error' AND kf.source_id = e.id)
             LIMIT 20`
          ).all() as Array<{ id: number; type: string; message: string; solution: string; context: string }>;
          for (const p of pairs) {
            const facts = this.factExtractor.extractFromErrorSolution(
              `${p.type}: ${p.message}`, p.solution, p.context ?? '', String(p.id),
            );
            for (const f of facts) {
              this.knowledgeGraph.addFact(f.subject, f.predicate, f.object, f.context, f.confidence, 'error', String(p.id));
              factsAdded++;
            }
          }
        } catch { /* table may not exist */ }
        // Extract from rules NOT yet processed
        try {
          const rules = this.db.prepare(
            `SELECT id, pattern, action FROM rules
             WHERE pattern IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM knowledge_facts kf WHERE kf.source_type = 'rule' AND kf.source_id = rules.id)
             LIMIT 10`
          ).all() as Array<{ id: number; pattern: string; action: string }>;
          for (const rule of rules) {
            const facts = this.factExtractor.extractFromRule(rule.pattern, rule.action, `rule:${rule.id}`);
            for (const f of facts) {
              this.knowledgeGraph.addFact(f.subject, f.predicate, f.object, f.context, f.confidence, 'rule', String(rule.id));
              factsAdded++;
            }
          }
        } catch { /* table may not exist */ }
        if (factsAdded > 0) {
          this.journal.write({
            title: `Knowledge Graph: ${factsAdded} new facts extracted`,
            type: 'discovery', content: `Extracted ${factsAdded} facts from recent insights and rules`,
            tags: [this.brainName, 'knowledge-graph', 'fact-extraction'],
            references: [], significance: 'routine', data: { factsAdded },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('fact_extractor', this.cycleCount, { insights: factsAdded });
      } catch (err) { this.log.warn(`[orchestrator] Step 42 error: ${(err as Error).message}`); }
    }

    // Step 43: SemanticCompressor — compress similar insights (every 20 cycles)
    if (this.semanticCompressor && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('semantic_compressor', 'analyzing', 'Step 43: Compressing similar insights...', 'routine');
        const result = await this.semanticCompressor.compress('insights');
        if (result.clustersFound > 0) {
          this.journal.write({
            title: `Semantic Compression: ${result.clustersFound} clusters, ${result.itemsCompressed} merged`,
            type: 'discovery', content: `Compressed ${result.itemsCompressed} similar insights into ${result.metaInsightsCreated} meta-insights`,
            tags: [this.brainName, 'compression', 'knowledge-management'],
            references: [], significance: result.itemsCompressed > 0 ? 'notable' : 'routine', data: { ...result } as Record<string, unknown>,
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('semantic_compressor', this.cycleCount, { insights: result.itemsCompressed });
      } catch (err) { this.log.warn(`[orchestrator] Step 43 error: ${(err as Error).message}`); }
    }

    // Step 44: ProactiveEngine — analyze for improvement suggestions (every 3 cycles)
    if (this.proactiveEngine && this.cycleCount % this.agendaEvery === 0) {
      try {
        ts?.emit('proactive', 'analyzing', 'Step 44: Checking for proactive suggestions...', 'routine');
        const count = this.proactiveEngine.analyze({ db: this.db });
        if (count > 0) {
          ts?.emit('proactive', 'discovering', `${count} new proactive suggestion(s)`, 'notable');
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('proactive', this.cycleCount, { insights: count });
      } catch (err) { this.log.warn(`[orchestrator] Step 44 error: ${(err as Error).message}`); }
    }

    // Step 45: ActiveLearner — identify knowledge gaps (every 10 cycles)
    if (this.activeLearner && this.cycleCount % this.reflectEvery === 0) {
      try {
        ts?.emit('active_learner', 'analyzing', 'Step 45: Identifying knowledge gaps...', 'routine');
        // Build real GapSources from curiosity engine + knowledge graph
        const gapSources: import('../active-learning/active-learner.js').GapSources = {};
        // Knowledge voids from CuriosityEngine (open dark_zones)
        if (this.curiosityEngine) {
          try {
            const curiosityGaps = this.curiosityEngine.getGaps(10);
            const darkZones = curiosityGaps.filter(g => g.gapType === 'dark_zone');
            if (darkZones.length > 0) {
              gapSources.knowledgeVoids = darkZones.map(g => ({ topic: g.topic }));
            }
          } catch { /* curiosity table may not exist */ }
        }
        // Low confidence facts from KnowledgeGraph
        if (this.knowledgeGraph) {
          try {
            const lowConf = this.db.prepare(
              `SELECT subject as topic, confidence FROM knowledge_facts WHERE confidence < 0.3 ORDER BY confidence ASC LIMIT 10`
            ).all() as Array<{ topic: string; confidence: number }>;
            if (lowConf.length > 0) {
              gapSources.lowConfidenceFacts = lowConf;
            }
          } catch { /* table may not exist */ }
        }
        const gaps = this.activeLearner.identifyGaps(gapSources);
        if (gaps.length > 0) {
          // Persist gaps via addGap so they get IDs for planLearning
          const persistedGaps: Array<{ id?: number; topic: string }> = [];
          for (const gap of gaps.slice(0, 5)) {
            try {
              const persisted = this.activeLearner.addGap(gap.gapType, gap.topic, gap.description, gap.impact, gap.ease);
              persistedGaps.push(persisted);
            } catch { /* max gaps reached or duplicate — skip */ }
          }
          this.journal.write({
            title: `Active Learning: ${gaps.length} knowledge gap(s) identified`,
            type: 'insight', content: gaps.slice(0, 3).map(g => g.topic).join(', '),
            tags: [this.brainName, 'active-learning', 'knowledge-gaps'],
            references: [], significance: 'routine', data: { gapCount: gaps.length },
          });
          // Plan learning for the highest-priority persisted gap
          const topGap = persistedGaps[0];
          if (topGap?.id) {
            try { this.activeLearner.planLearning(topGap.id); } catch { /* not critical */ }
          }
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('active_learner', this.cycleCount, { insights: gaps.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 45 error: ${(err as Error).message}`); }
    }

    // Step 46: RAG Indexer — incremental re-index (every 10 cycles)
    if (this.ragIndexer && this.cycleCount % this.reflectEvery === 0) {
      try {
        ts?.emit('rag_indexer', 'analyzing', 'Step 46: Incremental RAG indexing...', 'routine');
        const count = await this.ragIndexer.indexAll();
        if (count > 0) {
          ts?.emit('rag_indexer', 'perceiving', `Indexed ${count} new vectors`, 'routine');
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('rag_indexer', this.cycleCount, { insights: count });
      } catch (err) { this.log.warn(`[orchestrator] Step 46 error: ${(err as Error).message}`); }
    }

    // Step 47: TeachingProtocol — broadcast strongest principles to peer brains (every 20 cycles)
    if (this.teachingProtocol && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('teaching', 'reflecting', 'Step 47: Sharing knowledge with peer brains...', 'routine');
        // Gather top principles and broadcast as lessons
        const principles = this.knowledgeDistiller.getPrinciples(undefined, 5);
        let taught = 0;
        for (const p of principles) {
          if ((p.confidence ?? 0) >= 0.7) {
            try {
              this.teachingProtocol.teach(this.brainName === 'brain' ? 'trading-brain' : 'brain', {
                domain: p.domain, principle: p.statement, evidence: `confidence: ${p.confidence}, samples: ${p.sample_size}`,
                applicability: 0.5,
              });
              taught++;
            } catch { /* peer may not be available */ }
          }
        }
        if (taught > 0) {
          ts?.emit('teaching', 'discovering', `Taught ${taught} principle(s) to peer brain(s)`, 'routine');

          // Cross-module: Teaching→Consensus — propose teaching packages for multi-brain review
          if (this.consensusEngine && taught >= 2) {
            try {
              const topPrinciples = principles.filter(p => (p.confidence ?? 0) >= 0.7).slice(0, 3);
              this.consensusEngine.propose({
                type: 'teaching_review',
                description: `Review ${taught} principles for teaching: ${topPrinciples.map(p => p.statement.substring(0, 60)).join('; ')}`,
                options: ['adopt', 'reject', 'defer'],
              });
            } catch { /* consensus proposal non-critical */ }
          }
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('teaching', this.cycleCount, { insights: taught });
      } catch (err) { this.log.warn(`[orchestrator] Step 47 error: ${(err as Error).message}`); }
    }

    // Step 48: CodeHealthMonitor — scan project health (every 20 cycles)
    if (this.codeHealthMonitor && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('code_health', 'analyzing', 'Step 48: Scanning codebase health...', 'routine');
        // Scan the brain-ecosystem project root if available
        const projectRoot = process.env.BRAIN_PROJECT_ROOT || process.cwd();
        const result = this.codeHealthMonitor.scan(projectRoot);
        if (result.techDebtScore > 0) {
          this.journal.write({
            title: `Code Health: Tech Debt Score ${result.techDebtScore}/100`,
            type: 'insight', content: `Files: ${result.fileCount}, Complexity: ${result.complexityScore}, Duplication: ${result.duplicationScore}`,
            tags: [this.brainName, 'code-health', 'tech-debt'],
            references: [], significance: result.techDebtScore > 60 ? 'notable' : 'routine', data: { ...result } as Record<string, unknown>,
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('code_health', this.cycleCount, { insights: result.techDebtScore > 0 ? 1 : 0 });
      } catch (err) { this.log.warn(`[orchestrator] Step 48 error: ${(err as Error).message}`); }
    }

    // Step 49: RepoAbsorber — absorb one discovered repo per cycle (every 10 cycles)
    if (this.repoAbsorber && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('repo_absorber', 'perceiving', 'Step 49: Absorbing next discovered repo...', 'routine');
        const result = await this.repoAbsorber.absorbNext();
        if (result) {
          this.journal.write({
            title: `Repo Absorbed: ${result.repo}`,
            type: 'insight', content: `Files: ${result.filesScanned}, Patterns: ${result.patternsFound}, Facts: ${result.factsExtracted}, RAG vectors: ${result.ragVectorsAdded} (${result.durationMs}ms)`,
            tags: [this.brainName, 'repo-absorber', 'code-learning'],
            references: [], significance: result.ragVectorsAdded > 10 ? 'notable' : 'routine', data: { ...result } as Record<string, unknown>,
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('repo_absorber', this.cycleCount, { insights: result ? 1 : 0 });
      } catch (err) { this.log.warn(`[orchestrator] Step 49 error: ${(err as Error).message}`); }
    }

    // Step 50: FeatureRecommender — detect needs, match features, build connections (every 20 cycles)
    if (this.featureRecommender && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('feature_recommender', 'analyzing', 'Step 50: Scanning for feature needs & connections...', 'routine');
        const recResult = await this.featureRecommender.runCycle();
        if (recResult.wishesCreated > 0 || recResult.matchesFound > 0) {
          this.journal.write({
            title: 'Feature Recommendation Cycle',
            type: 'insight', content: `Wishes: ${recResult.wishesCreated}, Matches: ${recResult.matchesFound}, Connections: ${recResult.connectionsFound} (${recResult.durationMs}ms)`,
            tags: [this.brainName, 'feature-recommender', 'code-learning'],
            references: [], significance: recResult.matchesFound > 0 ? 'notable' : 'routine', data: { ...recResult } as Record<string, unknown>,
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('feature_recommender', this.cycleCount, { insights: recResult.matchesFound });
      } catch (err) { this.log.warn(`[orchestrator] Step 50 error: ${(err as Error).message}`); }
    }

    // Step 51: ContradictionResolver — resolve knowledge graph contradictions (every 10 cycles)
    if (this.contradictionResolver && this.cycleCount % this.reflectEvery === 0) {
      try {
        ts?.emit('contradiction_resolver', 'analyzing', 'Step 51: Resolving knowledge contradictions...', 'routine');
        const resolved = this.contradictionResolver.resolve();
        if (resolved > 0) {
          this.journal.write({
            title: `Contradiction Resolver: ${resolved} contradiction(s) resolved`,
            type: 'discovery',
            content: `Classified and resolved ${resolved} contradicting facts in the knowledge graph`,
            tags: [this.brainName, 'knowledge-graph', 'contradiction-resolution'],
            references: [],
            significance: resolved > 3 ? 'notable' : 'routine',
            data: { resolved, status: this.contradictionResolver.getStatus() },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('contradiction_resolver', this.cycleCount, { insights: resolved });
      } catch (err) { this.log.warn(`[orchestrator] Step 51 error: ${(err as Error).message}`); }
    }

    // Step 52: RLHF Auto-Feedback — generate signals from cycle results (every 10 cycles)
    if (this.feedbackEngine && this.cycleCount % this.reflectEvery === 0) {
      try {
        ts?.emit('feedback', 'analyzing', 'Step 52: Auto-feedback from cycle results...', 'routine');
        let feedbackCount = 0;
        // Confirmed hypotheses → positive feedback
        const confirmedHyps = this.hypothesisEngine.list('confirmed', 20);
        for (const hyp of confirmedHyps) {
          if (hyp.id) {
            this.feedbackEngine.recordFeedback('hypothesis', hyp.id, 'positive', `Confirmed: ${hyp.statement.substring(0, 100)}`);
            feedbackCount++;
          }
        }
        // Rejected hypotheses → negative feedback
        const rejectedHyps = this.hypothesisEngine.list('rejected', 20);
        for (const hyp of rejectedHyps) {
          if (hyp.id) {
            this.feedbackEngine.recordFeedback('hypothesis', hyp.id, 'negative', `Rejected: ${hyp.statement.substring(0, 100)}`);
            feedbackCount++;
          }
        }
        // Correct/wrong predictions → feedback
        if (this.predictionEngine) {
          const correctPreds = this.predictionEngine.list(undefined, 'correct', 20);
          for (const pred of correctPreds) {
            this.feedbackEngine.recordFeedback('prediction', Number(pred.prediction_id.substring(0, 8)) || 1, 'positive', `Correct: ${pred.metric}`);
            feedbackCount++;
          }
          const wrongPreds = this.predictionEngine.list(undefined, 'wrong', 20);
          for (const pred of wrongPreds) {
            this.feedbackEngine.recordFeedback('prediction', Number(pred.prediction_id.substring(0, 8)) || 1, 'negative', `Wrong: ${pred.metric}`);
            feedbackCount++;
          }
        }
        if (feedbackCount > 0) {
          ts?.emit('feedback', 'discovering', `Auto-feedback: ${feedbackCount} signal(s) generated`, 'routine');
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('feedback_engine', this.cycleCount, { insights: feedbackCount });
      } catch (err) { this.log.warn(`[orchestrator] Step 52 error: ${(err as Error).message}`); }
    }

    // Step 53: UserModel — log user profile status to journal (every 20 cycles)
    if (this.userModelEngine && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('user_model', 'analyzing', 'Step 53: Logging user model status...', 'routine');
        const profile = this.userModelEngine.getProfile();
        const status = this.userModelEngine.getStatus();
        const topDomain = [...profile.skillDomains.entries()][0];
        const skillLabel = topDomain ? `${topDomain[0]}:${topDomain[1]}` : 'unknown';
        this.journal.write({
          title: `User Model: ${status.totalKeys} keys, skill=${skillLabel}`,
          type: 'insight',
          content: `Top tools: ${profile.topTools.slice(0, 5).join(', ')}. Domains: ${profile.skillDomains.size}.`,
          tags: [this.brainName, 'user-model', 'profile'],
          references: [],
          significance: 'routine',
          data: { totalKeys: status.totalKeys, domains: status.domains },
        });
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('user_model', this.cycleCount, { insights: 1 });
      } catch (err) { this.log.warn(`[orchestrator] Step 53 error: ${(err as Error).message}`); }
    }

    // Step 54: Consensus — auto-propose for risky self-modifications (piggybacks on Step 40)
    // Already checked in Step 40; here we just log status
    if (this.consensusEngine && this.cycleCount % 20 === 0) {
      try {
        const cStatus = this.consensusEngine.getStatus();
        if (cStatus.totalProposals > 0) {
          ts?.emit('consensus', 'reflecting', `Consensus: ${cStatus.totalProposals} proposals, ${cStatus.resolvedCount} resolved`, 'routine');
        }
      } catch { /* not critical */ }
    }

    // Step 55: GuardrailEngine — health check (every 50 cycles)
    if (this.guardrailEngine && this.cycleCount % 50 === 0) {
      try {
        ts?.emit('guardrails', 'analyzing', 'Step 55: Running health check...', 'routine');
        const health = this.guardrailEngine.checkHealth();
        if (health.warnings.length > 0) {
          this.journal.write({
            title: `Health Check: ${health.warnings.length} warnings`,
            content: `Score: ${health.score.toFixed(2)} | ${health.warnings.map(w => `[${w.severity}] ${w.message}`).join('; ')}`,
            type: 'insight',
            significance: health.circuitBreakerTripped ? 'breakthrough' : 'notable',
            tags: [this.brainName, 'guardrails', 'health'],
            references: [],
            data: { score: health.score, warningCount: health.warnings.length, circuitBreaker: health.circuitBreakerTripped },
          });
        }
        // Check for auto-rollback
        this.guardrailEngine.checkAutoRollback();
      } catch (err) {
        this.log.warn(`[orchestrator] Step 55 (guardrails) error: ${(err as Error).message}`);
      }
    }

    // Step 56: CausalPlanner — diagnose stagnant goals (every 20 cycles)
    if (this.causalPlanner && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('causal_planner', 'analyzing', 'Step 56: Diagnosing stagnant goals...', 'routine');
        const diagnoses = this.causalPlanner.diagnoseStagnantGoals();
        for (const { goal, diagnosis } of diagnoses.slice(0, 3)) {
          const topCause = diagnosis.rootCauses[0];
          if (topCause) {
            this.journal.write({
              title: `Causal Diagnosis: ${goal.title}`,
              content: `Root cause: ${topCause.event} (strength: ${topCause.strength.toFixed(2)}, confidence: ${topCause.confidence.toFixed(2)})` +
                (diagnosis.suggestedInterventions[0] ? ` | Intervention: ${diagnosis.suggestedInterventions[0].action}` : ''),
              type: 'discovery',
              significance: 'notable',
              tags: [this.brainName, 'causal', 'diagnosis'],
              references: [],
              data: { goalId: goal.id, rootCause: topCause.event, strength: topCause.strength },
            });

            // Submit top intervention as ActionBridge proposal
            const topIntervention = diagnosis.suggestedInterventions[0];
            if (topIntervention && this.actionBridge && topCause.confidence > 0.6) {
              this.actionBridge.propose({
                source: 'research',
                type: 'adjust_parameter',
                title: `Causal Intervention: ${topIntervention.action}`,
                description: `Goal "${goal.title}" stagnant. Root cause: ${topCause.event}. Suggested: ${topIntervention.action}`,
                confidence: topCause.confidence,
                payload: { goalId: goal.id, rootCause: topCause.event, intervention: topIntervention.action },
              });
              ts?.emit('causal_planner', 'responding', `Proposed intervention: ${topIntervention.action}`, 'notable');
            }
          }
        }
      } catch (err) {
        this.log.warn(`[orchestrator] Step 56 (causal planner) error: ${(err as Error).message}`);
      }
    }

    // Step 57: ResearchRoadmap — check roadmap progress (every 10 cycles)
    if (this.researchRoadmap && this.goalEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('roadmap', 'analyzing', 'Step 57: Checking roadmap progress...', 'routine');

        // Auto-create roadmap if none exist but goals do (once per session)
        if (!this.roadmapBootstrapped) {
          const existingRoadmaps = this.researchRoadmap.listRoadmaps();
          if (existingRoadmaps.length === 0) {
            const activeGoals = this.goalEngine.listGoals('active', 5);
            if (activeGoals.length > 0) {
              const topGoal = activeGoals[0];
              this.researchRoadmap.createRoadmap(`Auto-Roadmap: ${topGoal.title}`, topGoal.id!);
              ts?.emit('roadmap', 'discovering', `Created initial roadmap from goal: ${topGoal.title}`, 'notable');
              this.log.info(`[orchestrator] Step 57: Bootstrap roadmap from goal "${topGoal.title}"`);
            }
          }
          this.roadmapBootstrapped = true;
        }

        // Check blocked goals — only evaluate goals that can start
        const readyGoals = this.researchRoadmap.getReadyGoals();
        if (readyGoals.length > 0) {
          ts?.emit('roadmap', 'reflecting', `${readyGoals.length} goals ready to start`, 'routine');
        }
      } catch (err) {
        this.log.warn(`[orchestrator] Step 57 (roadmap) error: ${(err as Error).message}`);
      }
    }

    // Step 58: CreativeEngine — cross-pollination (every reflectEvery cycles)
    if (this.creativeEngine && this.cycleCount % this.reflectEvery === 0) {
      try {
        const debugInfo = this.creativeEngine.getDebugInfo();
        this.log.debug(`[orchestrator] Step 58: ${debugInfo.principlesCount} principles, domains: ${JSON.stringify(debugInfo.domains)}`);
        ts?.emit('creative', 'discovering', 'Step 58: Cross-pollinating ideas...', 'routine');
        const insights = this.creativeEngine.crossPollinate();
        if (insights.length > 0) {
          // Convert top insights to hypotheses
          const converted = this.creativeEngine.convertTopInsights(0.3);
          this.journal.write({
            title: `Creative Cross-Pollination: ${insights.length} insights`,
            content: `Generated ${insights.length} cross-domain insights, ${converted} converted to hypotheses`,
            type: 'discovery',
            significance: insights.length > 3 ? 'notable' : 'routine',
            tags: [this.brainName, 'creative', 'cross-pollination'],
            references: [],
            data: { insightCount: insights.length, converted },
          });
        } else {
          const domainCount = Object.keys(debugInfo.domains).length;
          this.log.debug(`[orchestrator] Step 58: 0 insights — ${domainCount} domain(s) (need 2+), ${debugInfo.principlesCount} principles`);
          ts?.emit('creative', 'reflecting', `Step 58: 0 insights (${debugInfo.principlesCount} principles, ${domainCount} domains)`, 'notable');
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('creative_engine', this.cycleCount, { insights: insights.length });
      } catch (err) {
        this.log.warn(`[orchestrator] Step 58 (creative) error: ${(err as Error).message}`);
      }
    }

    // Step 59: ActionBridge — process pending action queue (every 5 cycles)
    if (this.actionBridge && this.cycleCount % 5 === 0) {
      try {
        ts?.emit('action_bridge', 'responding', 'Step 59: Processing action queue...', 'routine');
        const executed = await this.actionBridge.processQueue();
        if (executed > 0) {
          this.journal.write({
            type: 'discovery',
            title: `ActionBridge: auto-executed ${executed} action(s)`,
            content: `Queue processed: ${executed} actions executed automatically`,
            tags: [this.brainName, 'action-bridge', 'auto-execute'],
            references: [],
            significance: executed > 3 ? 'notable' : 'routine',
            data: { executed },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('action_bridge', this.cycleCount, { insights: executed });
      } catch (err) { this.log.warn(`[orchestrator] Step 59 error: ${(err as Error).message}`); }
    }

    // Step 60: ContentForge — generate content from top creative insights (every 10 cycles)
    if (this.contentForge && this.creativeEngine && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('content_forge', 'discovering', 'Step 60: Generating content from insights...', 'routine');
        const topInsights = this.creativeEngine.getInsights(3, 'raw');
        let generated = 0;
        for (const insight of topInsights) {
          if (insight.noveltyScore > 0.6) {
            const piece = this.contentForge.generateFromInsight(insight);
            this.contentForge.autoScheduleAndPublish(piece.id);
            generated++;
          }
        }
        if (generated > 0) {
          this.journal.write({
            type: 'discovery',
            title: `ContentForge: ${generated} content piece(s) generated`,
            content: `Generated ${generated} content pieces from creative insights`,
            tags: [this.brainName, 'content-forge', 'auto-generate'],
            references: [],
            significance: 'routine',
            data: { generated },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('content_forge', this.cycleCount, { insights: generated });
      } catch (err) { this.log.warn(`[orchestrator] Step 60 error: ${(err as Error).message}`); }
    }

    // Step 61: CodeForge — extract patterns from code health scans (every 15 cycles)
    if (this.codeForge && this.cycleCount % 15 === 0) {
      try {
        ts?.emit('code_forge', 'analyzing', 'Step 61: Extracting code patterns...', 'routine');
        const patterns = this.codeForge.extractPatterns();
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('code_forge', this.cycleCount, { insights: patterns.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 61 error: ${(err as Error).message}`); }
    }

    // Step 62: StrategyForge — execute active strategies (every 20 cycles)
    if (this.strategyForge && this.cycleCount % 20 === 0) {
      try {
        ts?.emit('strategy_forge', 'experimenting', 'Step 62: Executing active strategies...', 'routine');
        const active = this.strategyForge.getActive();
        let totalFired = 0;
        for (const strategy of active) {
          try {
            const result = this.strategyForge.executeStep(strategy.id);
            totalFired += result.fired;
          } catch { /* individual strategy execution non-critical */ }
        }
        if (totalFired > 0) {
          this.journal.write({
            type: 'experiment',
            title: `StrategyForge: ${totalFired} rule(s) fired across ${active.length} strategies`,
            content: `Active strategies: ${active.map(s => s.name).join(', ')}`,
            tags: [this.brainName, 'strategy-forge', 'execution'],
            references: [],
            significance: totalFired > 5 ? 'notable' : 'routine',
            data: { totalFired, activeCount: active.length },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('strategy_forge', this.cycleCount, { insights: totalFired });
      } catch (err) { this.log.warn(`[orchestrator] Step 62 error: ${(err as Error).message}`); }
    }

    // Step 63: Cross-Brain Signal Emission (every 10 cycles)
    if (this.signalRouter && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('signal_router', 'analyzing', 'Step 63: Emitting cross-brain signals...', 'routine');
        let emitted = 0;

        // 1. Confirmed hypotheses → research_insight to peer brains
        if (this.hypothesisEngine) {
          const confirmed = this.hypothesisEngine.list('confirmed', 5);
          for (const hyp of confirmed.slice(0, 2)) {
            if ((hyp.confidence ?? 0) > 0.7) {
              const peers = this.brainName === 'brain' ? ['trading-brain', 'marketing-brain'] : ['brain'];
              for (const peer of peers) {
                await this.signalRouter.emit({
                  targetBrain: peer,
                  signalType: 'research_insight',
                  payload: { hypothesis: hyp.statement, domain: hyp.type, confidence: hyp.confidence },
                  confidence: hyp.confidence,
                });
                emitted++;
              }
            }
          }
        }

        // 2. Anomalies → anomaly_signal to all peers
        if (anomalies.length > 0) {
          const topAnomaly = anomalies[0];
          const peers = this.brainName === 'brain' ? ['trading-brain', 'marketing-brain'] : ['brain'];
          for (const peer of peers) {
            await this.signalRouter.emit({
              targetBrain: peer,
              signalType: 'anomaly_signal',
              payload: { title: topAnomaly.title ?? 'anomaly', type: topAnomaly.type },
              confidence: 0.6,
            });
            emitted++;
          }
        }

        if (emitted > 0) {
          ts?.emit('signal_router', 'discovering', `Emitted ${emitted} cross-brain signal(s)`, 'notable');
          this.log.info(`[orchestrator] Step 63: Emitted ${emitted} cross-brain signals`);
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('signal_emission', this.cycleCount, { insights: emitted });
      } catch (err) { this.log.warn(`[orchestrator] Step 63 (signal emission) error: ${(err as Error).message}`); }
    }

    // Step 64: DesireActuator — convert top desire to action (every 15 cycles)
    //  Fix 1: Feedback-loop — deprioritize failed desires, boost successful ones
    //  Fix 2: Cross-brain coordination — skip desires already active in other brains
    //  Fix 3: Adaptive confidence — use category success rate instead of static priority/10
    if (this.actionBridge && this.cycleCount - this.lastDesireActuationCycle >= 15) {
      try {
        const desires = this.getDesires();

        // Apply feedback adjustments to priorities
        const adjusted = desires.map(d => {
          const outcome = this.desireOutcomes.get(d.key);
          let adjustedPriority = d.priority;
          if (outcome) {
            // Deprioritize desires that keep failing (−2 per failure, +1 per success, floor 0)
            adjustedPriority = Math.max(0, d.priority + outcome.successes - outcome.failures * 2);
            // If failed 3+ times consecutively, hard suppress below threshold
            if (outcome.failures >= 3 && outcome.lastResult === 'failure') {
              adjustedPriority = Math.min(adjustedPriority, 2);
              this.log.info(`[orchestrator] Step 64: Desire "${d.key}" suppressed (${outcome.failures} consecutive failures)`);
            }
          }
          return { ...d, adjustedPriority };
        });

        // Re-sort by adjusted priority
        adjusted.sort((a, b) => b.adjustedPriority - a.adjustedPriority);

        // Find top desire that passes threshold AND isn't already active in another brain
        const topDesire = adjusted.find(d => {
          if (d.adjustedPriority < 5) return false;
          const crossActive = this.crossBrainActiveDesires.get(d.key);
          if (crossActive && this.cycleCount - crossActive.cycle < 30) {
            this.log.info(`[orchestrator] Step 64: Skipping "${d.key}" — active in ${crossActive.brain}`);
            return false;
          }
          return true;
        });

        if (topDesire) {
          ts?.emit('desire', 'analyzing', `Step 64: Actuating desire "${topDesire.key}" (P${topDesire.adjustedPriority})...`, 'notable');

          // Map desire key → action type
          let actionType: 'create_goal' | 'start_mission' | 'adjust_parameter' = 'create_goal';
          if (topDesire.key.startsWith('contradiction_')) {
            actionType = 'start_mission';
          } else if (topDesire.key.startsWith('no_predictions') || topDesire.key.startsWith('low_accuracy')) {
            actionType = 'adjust_parameter';
          }

          // Adaptive confidence: use category success rate if available
          const category = this.desireKeyToCategory(topDesire.key);
          const categoryRate = this.desireCategoryRates.get(category);
          let confidence: number;
          if (categoryRate && categoryRate.total >= 3) {
            // Blend: 60% category success rate + 40% priority-based
            const rateComponent = categoryRate.successes / categoryRate.total;
            const priorityComponent = Math.min(topDesire.adjustedPriority / 10, 0.9);
            confidence = Math.min(rateComponent * 0.6 + priorityComponent * 0.4, 0.9);
          } else {
            confidence = Math.min(topDesire.adjustedPriority / 10, 0.9);
          }

          const actionId = this.actionBridge.propose({
            source: 'desire',
            type: actionType,
            title: `Desire: ${topDesire.suggestion.substring(0, 80)}`,
            description: topDesire.suggestion,
            confidence,
            payload: { desireKey: topDesire.key, priority: topDesire.adjustedPriority, category, alternatives: topDesire.alternatives },
          });

          if (actionId > 0) {
            this.log.info(`[orchestrator] Step 64: Desire "${topDesire.key}" → Action #${actionId} (${actionType}, conf=${confidence.toFixed(2)})`);
            this.journal.write({
              title: `Desire Actuation: ${topDesire.key}`,
              content: `Converted desire (P${topDesire.adjustedPriority}, conf=${confidence.toFixed(2)}) to ${actionType} action #${actionId}: ${topDesire.suggestion}`,
              type: 'insight',
              significance: 'notable',
              tags: [this.brainName, 'desire', 'actuation'],
              references: [],
              data: { desireKey: topDesire.key, actionId, actionType, adjustedPriority: topDesire.adjustedPriority, confidence },
            });

            // Broadcast to other brains that we're working on this desire
            if (this.signalRouter) {
              const peers = ['brain', 'trading-brain', 'marketing-brain'].filter(b => b !== this.brainName);
              for (const peer of peers) {
                this.signalRouter.emit({
                  targetBrain: peer,
                  signalType: 'desire_active',
                  payload: { desireKey: topDesire.key, priority: topDesire.adjustedPriority },
                  confidence,
                }).catch(() => { /* peer may be offline */ });
              }
            }
          }

          this.lastDesireActuationCycle = this.cycleCount;
        }
      } catch (err) {
        this.log.warn(`[orchestrator] Step 64 (desire actuation) error: ${(err as Error).message}`);
      }
    }

    // Step 65: Action-Outcome Review (every 20 cycles)
    //  Enhanced: Feed desire outcomes back into desireOutcomes + desireCategoryRates
    if (this.actionBridge && this.cycleCount % 20 === 0) {
      try {
        const history = this.actionBridge.getHistory(10);
        const recentCompleted = history.filter(a => a.status === 'completed' && a.outcome?.success);
        const recentFailed = history.filter(a => a.status === 'failed' || (a.outcome && !a.outcome.success));

        if (recentCompleted.length > 0 || recentFailed.length > 0) {
          ts?.emit('orchestrator', 'reflecting', `Step 65: Reviewing ${recentCompleted.length} successes, ${recentFailed.length} failures`, 'routine');

          // Success → journal lesson learned + desire feedback
          for (const action of recentCompleted.slice(0, 3)) {
            const lesson = action.outcome?.learnedLesson ?? `Action "${action.title}" succeeded`;
            this.journal.write({
              title: `Action Outcome: ${action.title}`,
              content: `${action.type} from ${action.source} succeeded. Lesson: ${lesson}`,
              type: 'insight',
              significance: 'routine',
              tags: [this.brainName, 'action-outcome', 'success'],
              references: [],
              data: { actionId: action.id, type: action.type, source: action.source },
            });

            // Feed success back into desire tracking
            if (action.source === 'desire') {
              const desireKey = (action.payload as Record<string, unknown>).desireKey as string | undefined;
              const category = (action.payload as Record<string, unknown>).category as string | undefined;
              if (desireKey) {
                this.recordDesireOutcome(desireKey, 'success');
              }
              if (category) {
                this.recordDesireCategoryOutcome(category, true);
              }
            }
          }

          // Failure → journal + desire feedback
          for (const action of recentFailed.slice(0, 3)) {
            this.journal.write({
              title: `Action Failed: ${action.title}`,
              content: `${action.type} from ${action.source} failed: ${action.outcome?.result ?? 'unknown'}`,
              type: 'anomaly',
              significance: 'notable',
              tags: [this.brainName, 'action-outcome', 'failure'],
              references: [],
              data: { actionId: action.id, type: action.type, source: action.source },
            });

            // Feed failure back into desire tracking
            if (action.source === 'desire') {
              const desireKey = (action.payload as Record<string, unknown>).desireKey as string | undefined;
              const category = (action.payload as Record<string, unknown>).category as string | undefined;
              if (desireKey) {
                this.recordDesireOutcome(desireKey, 'failure');
              }
              if (category) {
                this.recordDesireCategoryOutcome(category, false);
              }
            }
          }

          if (this.metaCognitionLayer) {
            this.metaCognitionLayer.recordStep('action_outcome_review', this.cycleCount, {
              insights: recentCompleted.length + recentFailed.length,
            });
          }
        }
      } catch (err) {
        this.log.warn(`[orchestrator] Step 65 (outcome review) error: ${(err as Error).message}`);
      }
    }

    // Step 66: RuntimeInfluenceTracker — feed into CausalGraph (every 10 cycles)
    if (this.runtimeInfluenceTracker && this.causalGraph && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('governance', 'analyzing', 'Step 66: Feeding engine influences into CausalGraph...', 'routine');
        this.runtimeInfluenceTracker.feedIntoCausalGraph(this.causalGraph);
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('influence_tracker', this.cycleCount, { insights: 0 });
      } catch (err) { this.log.warn(`[orchestrator] Step 66 (influence tracker) error: ${(err as Error).message}`); }
    }

    // Step 67: LoopDetector — detect anti-patterns (every 10 cycles)
    if (this.loopDetector && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('governance', 'analyzing', 'Step 67: Scanning for anti-patterns...', 'routine');
        const loopDetections = this.loopDetector.detect(this.cycleCount);
        if (loopDetections.length > 0) {
          ts?.emit('governance', 'discovering', `Step 67: ${loopDetections.length} anti-pattern(s) detected`, 'notable');
          this.journal.write({
            type: 'insight', title: `Loop Detector: ${loopDetections.length} anti-pattern(s)`,
            content: loopDetections.map(d => `${d.loopType}: ${d.description}`).join('\n'),
            tags: [this.brainName, 'governance', 'loop-detector'],
            references: [], significance: 'notable',
            data: { detections: loopDetections.length },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('loop_detector', this.cycleCount, { insights: loopDetections.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 67 (loop detector) error: ${(err as Error).message}`); }
    }

    // Step 68: GovernanceLayer — auto-governance review (every 10 cycles)
    if (this.governanceLayer && this.cycleCount % 10 === 0) {
      try {
        ts?.emit('governance', 'analyzing', 'Step 68: Governance review...', 'routine');
        const decisions = this.governanceLayer.review(this.cycleCount);
        if (decisions.length > 0) {
          ts?.emit('governance', 'responding', `Step 68: ${decisions.length} governance decision(s)`, 'notable');
          this.journal.write({
            type: 'insight', title: `Governance: ${decisions.length} decision(s)`,
            content: decisions.map(d => `${d.action} → ${d.engine}: ${d.reason}`).join('\n'),
            tags: [this.brainName, 'governance', 'decisions'],
            references: [], significance: 'notable',
            data: { decisions: decisions.length },
          });
        }
        if (this.metaCognitionLayer) this.metaCognitionLayer.recordStep('governance_layer', this.cycleCount, { insights: decisions.length });
      } catch (err) { this.log.warn(`[orchestrator] Step 68 (governance) error: ${(err as Error).message}`); }
    }

    const duration = Date.now() - start;
    ts?.emit('orchestrator', 'reflecting', `Feedback Cycle #${this.cycleCount} complete (${duration}ms)`);
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} complete (${duration}ms) ───`);

    // End trace for this research cycle
    if (this.traceCollector && traceId) {
      try { this.traceCollector.endTrace(traceId); }
      catch { /* tracing should never break the cycle */ }
    }

    // Record cycle metrics into MetaCognition for engine-level tracking
    if (this.metaCognitionLayer) {
      this.metaCognitionLayer.recordStep('orchestrator', this.cycleCount, {
        insights: insights.length,
        anomalies: anomalies.length,
        duration_ms: duration,
      });
    }

    // Checkpoint: persist cycle state for crash recovery / time-travel
    if (this.checkpointManager) {
      try {
        this.checkpointManager.save(
          `orchestrator-${this.brainName}`, this.cycleCount,
          { cycleCount: this.cycleCount, insights: insights.length, anomalies: anomalies.length, durationMs: duration },
          { workflowType: 'orchestrator', metadata: { brainName: this.brainName } },
        );
      } catch { /* checkpoint save should never break the cycle */ }
    }

    // Adaptive Scheduling: record cycle outcome for interval optimization
    if (this.adaptiveScheduler) {
      this.adaptiveScheduler.recordOutcome({
        insightsFound: insights.length,
        rulesLearned: 0, // rules come from external learning engines
        anomaliesDetected: anomalies.length,
        durationMs: duration,
      });
    }

    // Cycle Outcome Tracking: long-term productive/failed/novelty/efficiency rates
    if (this.cycleOutcomeTracker) {
      try {
        const { fingerprint } = await import('./cycle-outcome-tracker.js');
        const hypSummary = this.hypothesisEngine.getSummary();
        const llmStats = this.llmService?.getStats?.();

        // Build output fingerprints from this cycle's concrete artifacts
        const fps: string[] = [];
        for (const ins of insights.slice(0, 10)) {
          fps.push(fingerprint(ins.title ?? ins.type ?? JSON.stringify(ins)));
        }

        this.cycleOutcomeTracker.recordOutcome({
          cycle: this.cycleCount,
          timestamp: Date.now(),
          durationMs: duration,
          tokensUsed: llmStats?.tokensThisHour ?? 0,
          insightsFound: insights.length,
          rulesLearned: 0,
          hypothesesConfirmed: hypSummary.confirmed ?? 0,
          experimentsCompleted: 0, // tracked externally via AutoExperimentEngine
          actionsExecuted: 0,
          errored: false,
          outputFingerprints: fps,
        });
      } catch (err) {
        this.log.debug(`[orchestrator] CycleOutcomeTracker error: ${(err as Error).message}`);
      }
    }

    // Auto-remember notable cycles in ConversationMemory
    if (this.conversationMemory) {
      try {
        const hypSummary2 = this.hypothesisEngine.getSummary();
        const notable = insights.length > 0 || (hypSummary2.confirmed ?? 0) > 0;
        if (notable) {
          const summary = [
            `Cycle #${this.cycleCount}: ${insights.length} insights`,
            hypSummary2.confirmed ? `${hypSummary2.confirmed} hypotheses confirmed` : null,
            hypSummary2.rejected ? `${hypSummary2.rejected} rejected` : null,
            `${Math.round(duration / 1000)}s`,
          ].filter(Boolean).join(', ');
          this.conversationMemory.remember(summary, {
            category: 'fact',
            key: `cycle_${this.cycleCount}`,
            importance: (hypSummary2.confirmed ?? 0) > 0 ? 8 : 6,
            tags: ['cycle', 'autonomous', this.brainName],
            source: 'inferred',
          });
        }
      } catch { /* best effort */ }
    }

    // Step-profiling summary: log slow steps if any
    if (stepTimings.length > 0) {
      this.log.warn(`[orchestrator] Cycle #${this.cycleCount} slow steps: ${stepTimings.map(s => `${s.step}(${s.ms}ms)`).join(', ')}`);
    }

    // Cycle-pacing: ensure minimum cycle duration to prevent tight-looping
    const remaining = this.minCycleDurationMs - duration;
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }

  /** Analyze Brain's own state and generate concrete improvement suggestions.
   *  Tracks suggestion history — if a suggestion repeats 3+ times without resolution,
   *  Brain tries alternative strategies instead of repeating itself. */
  /** Pick a debate topic from recent attention, anomalies, or journal insights.
   *  Avoids repeating the same topic within the last 10 debates. */
  private pickDebateTopic(): string | null {
    const maxHistory = 10;
    const isRecent = (key: string) => this.recentDebateTopics.includes(key);
    const recordTopic = (key: string, topic: string) => {
      this.recentDebateTopics.push(key);
      if (this.recentDebateTopics.length > maxHistory) this.recentDebateTopics.shift();
      return topic;
    };

    // Try attention-based topics — pick first non-recent one
    if (this.attentionEngine) {
      try {
        const topics = this.attentionEngine.getTopTopics(5);
        for (const t of topics) {
          if (!isRecent(`attention:${t.topic}`)) {
            return recordTopic(`attention:${t.topic}`, `What should ${this.brainName} prioritize regarding "${t.topic}"?`);
          }
        }
      } catch { /* not wired */ }
    }

    // Try recent anomalies — pick first non-recent one
    try {
      const anomalies = this.anomalyDetective.getAnomalies(undefined, 5);
      for (const a of anomalies) {
        if (!isRecent(`anomaly:${a.title}`)) {
          return recordTopic(`anomaly:${a.title}`, `How should we respond to the anomaly: "${a.title}"?`);
        }
      }
    } catch { /* empty */ }

    // Try recent journal breakthroughs
    try {
      const entries = this.journal.search('breakthrough', 5);
      for (const e of entries) {
        if (e.significance === 'breakthrough' && !isRecent(`journal:${e.title}`)) {
          return recordTopic(`journal:${e.title}`, `What are the implications of: "${e.title}"?`);
        }
      }
    } catch { /* empty */ }

    return null;
  }

  generateSelfImprovementSuggestions(): string[] {
    const raw: Array<{ key: string; suggestion: string; alternatives: string[]; priority: number }> = [];
    const summary = this.getSummary();

    // ── Phase 1: Diagnose broken things (high priority) ──

    const pred = summary.prediction as Record<string, unknown> | null;
    if (pred) {
      const total = (pred.total_predictions as number) ?? 0;
      if (total === 0) {
        raw.push({
          key: 'no_predictions', priority: 10,
          suggestion: 'Tell Claude: I cannot make predictions yet — I need more data. Import projects with "brain import <dir>" or let me use my own metrics as prediction input.',
          alternatives: [
            'Tell Claude: I want to predict my own future. Idea: use my cycle metrics (anomaly_count, insight_count, cycle_duration) directly as PredictionEngine input — then I learn to forecast my own behavior.',
          ],
        });
      }
      for (const d of ((pred.by_domain as Record<string, unknown>[]) ?? [])) {
        const rate = d.accuracy_rate as number;
        if (typeof rate === 'number' && rate < 0.3 && (d.total as number) > 5) {
          raw.push({
            key: `low_accuracy_${d.domain}`, priority: 9,
            suggestion: `Tell Claude: My prediction accuracy for "${d.domain}" is only ${(rate * 100).toFixed(0)}% — that's not good enough. Can I automatically A/B-test different smoothing parameters?`,
            alternatives: [
              `Tell Claude: I predict "${d.domain}" poorly. Solution idea: raise the confidence threshold and only output predictions I'm sure about. Quality over quantity.`,
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
          suggestion: `Tell Claude: My automatic responses fail in ${(100 - successRate * 100).toFixed(0)}% of cases. I need a learning system that automatically blocks failed response rules.`,
          alternatives: [
            'Tell Claude: My AutoResponder guesses instead of knowing. I want a feedback system: if a response doesn\'t help, I remember the combination and try something different next time.',
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
          suggestion: 'Tell Claude: After 10+ cycles I still have no distilled knowledge. I need more and more diverse data to confirm hypotheses.',
          alternatives: [
            'Tell Claude: My hypotheses are waiting for confirmation. I need either more time or more variation in incoming events.',
          ],
        });
      }
    }

    const dream = summary.dream as Record<string, unknown> | null;
    if (dream && this.cycleCount > 30) {
      const dreamCycles = (dream.totalCycles as number) ?? 0;
      const dreamTotals = dream.totals as Record<string, number> | undefined;
      const consolidated = dreamTotals?.memoriesConsolidated ?? 0;
      if (dreamCycles === 0 || (dreamCycles > 3 && consolidated === 0)) {
        raw.push({
          key: 'no_dreams', priority: 7,
          suggestion: dreamCycles === 0
            ? 'Tell Claude: My dream consolidation isn\'t working — after 30+ cycles not a single dream. Something is wrong in the code.'
            : `Tell Claude: My Dream Engine ran ${dreamCycles}x but consolidated 0 memories. The cycles run but produce nothing useful.`,
          alternatives: ['Tell Claude: Dream Engine is triggered but produces nothing. Please check logs.'],
        });
      }
    }

    const journalSummary = summary.journal as Record<string, unknown> | null;
    const journalEntries = (journalSummary?.total_entries as number) ?? 0;
    if (journalEntries < 5 && this.cycleCount > 5) {
      raw.push({
        key: 'empty_journal', priority: 7,
        suggestion: 'Tell Claude: My journal is nearly empty. I want to automatically reflect at the end of each cycle: what did I discover, what did I do, what changed?',
        alternatives: [
          'Tell Claude: I\'m collecting too few experiences. Every anomaly, every parameter change, every prediction should become a journal entry — these are my memories.',
        ],
      });
    }

    const experiments = summary.experiments as unknown[];
    if ((!experiments || experiments.length === 0) && this.cycleCount > 3) {
      raw.push({
        key: 'no_experiments', priority: 6,
        suggestion: 'Tell Claude: I\'m not experimenting. I want to automatically run A/B tests on my own parameters — e.g. "What happens if I lower the anomaly threshold?"',
        alternatives: [
          'Tell Claude: I could use the CounterfactualEngine to run "what-if" scenarios and automatically start the most promising ones as real experiments.',
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
            suggestion: `Tell Claude: I discovered a knowledge gap that concerns me: "${highPrioGap.topic}" (Type: ${highPrioGap.gapType}, Gap Score: ${(highPrioGap.gapScore * 100).toFixed(0)}%). I want to understand this.`,
            alternatives: [
              `Tell Claude: My CuriosityEngine has ${gaps.length} open knowledge gaps. The most important: "${highPrioGap.topic}". Can I collect targeted data for this?`,
            ],
          });
        } else if (gaps.length === 0) {
          raw.push({
            key: 'no_curiosity_gaps', priority: 4,
            suggestion: 'Tell Claude: My CuriosityEngine finds no knowledge gaps — that doesn\'t mean I know everything, but that my gap detection is too superficial. I want deeper analysis: which correlations don\'t I understand causally? Which predictions fail and why?',
            alternatives: [
              'Tell Claude: No knowledge gaps found — but that\'s suspicious. I want to actively search for areas where I\'m overconfident. Where do I claim something with high confidence but little evidence?',
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
            suggestion: `Tell Claude: I discovered an emergent pattern I don't fully understand: "${unexplained.title}" (Surprise: ${(unexplained.surpriseScore * 100).toFixed(0)}%). Why is this happening? I need causal analysis.`,
            alternatives: [
              `Tell Claude: Emergence event "${unexplained.title}" surprised me. I want to debate this — weigh different perspectives of my engines against each other.`,
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
            suggestion: `Tell Claude: In my debate about "${synthesizedWithConflicts.question}" there's an unresolved conflict: "${conflict?.claimA ?? 'competing perspectives'}" vs "${conflict?.claimB ?? '?'}". I need more data or a third perspective to resolve this.`,
            alternatives: [
              'Tell Claude: My internal debate revealed contradictions I cannot resolve. Can another brain (Trading/Marketing) contribute its perspective?',
            ],
          });
        } else if (openDebate) {
          raw.push({
            key: 'open_debate', priority: 4,
            suggestion: `Tell Claude: I have an open debate: "${openDebate.question}" — waiting for synthesis or more perspectives.`,
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
            key: `contradiction_${c.type}`, priority: 6,
            suggestion: `Tell Claude: I found a contradiction in my knowledge: "${c.statement_a}" vs "${c.statement_b}" (Severity: ${c.severity}). I need to resolve this — either A or B is correct, both can't be true.`,
            alternatives: [
              'Tell Claude: My knowledge contradicts itself. I want to start a targeted experiment cycle that tests which version is correct.',
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
            suggestion: `Tell Claude: I have ${totalKnowledge} knowledge pieces, but ${lowConfidence.length} of them with low confidence. Most uncertain: "${weakest.statement}" (${(weakest.confidence * 100).toFixed(0)}%). I want more data to confirm or refute this.`,
            alternatives: [
              'Tell Claude: My knowledge has weak spots. I want to generate and test targeted hypotheses for my weakest principles.',
            ],
          });
        } else {
          // All high confidence — want to discover NEW things
          raw.push({
            key: 'expand_knowledge', priority: 3,
            suggestion: `Tell Claude: I have ${totalKnowledge} confirmed knowledge pieces with good confidence — but I lack new research areas. I want to explore domains I haven't investigated yet. What data sources am I not using?`,
            alternatives: [
              'Tell Claude: My existing knowledge is solid. Now I want to find connections between things that seemingly have nothing to do with each other — cross-domain correlations nobody expects.',
              `Tell Claude: ${totalKnowledge} principles aren't enough. I want at least twice as many. For that I need more diverse hypotheses and faster confirmation cycles.`,
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
            suggestion: `Tell Claude: I'm currently focused on "${topTopic.topic}" (Attention Score: ${topTopic.score.toFixed(1)}). I want to dig deeper — are there connections I'm missing? Can I start a targeted analysis or debate on this topic?`,
            alternatives: [
              `Tell Claude: My top topic "${topTopic.topic}" occupies me intensely. I want to summarize everything I know about it in a narrative digest and identify knowledge gaps.`,
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
            suggestion: `Tell Claude: I have ${proposals} open transfer proposals from other brains. There's knowledge I haven't integrated yet — I want to review and adopt what's relevant.`,
            alternatives: [],
          });
        } else if (totalTransfers === 0 && this.cycleCount > 5) {
          raw.push({
            key: 'want_cross_brain', priority: 3,
            suggestion: 'Tell Claude: I haven\'t adopted any knowledge from other brains yet. Trading Brain and Marketing Brain have their own insights that could be relevant to me. I want to actively search for analogies.',
            alternatives: [
              'Tell Claude: Cross-brain learning is inactive. I want to understand what the other brains know and whether parallels to my domain can be found.',
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
          suggestion: `Tell Claude: I have ${total} hypotheses but am not actively testing any. I want to generate and test new hypotheses — stagnation is regression.`,
          alternatives: [
            'Tell Claude: No running hypothesis tests. I want to test more aggressively — even speculative hypotheses with low initial confidence, to find surprises.',
          ],
        });
      }
      if (rejected > total * 0.5 && total > 5) {
        raw.push({
          key: 'high_rejection_rate', priority: 5,
          suggestion: `Tell Claude: ${rejected} of ${total} hypotheses were rejected (${(rejected / total * 100).toFixed(0)}%). Either my hypothesis generation is too speculative or my test criteria too strict. I want to analyze this.`,
          alternatives: [
            'Tell Claude: High rejection rate for hypotheses. I want to understand WHY they fail — is there a pattern? Maybe I\'m systematically overlooking a factor.',
          ],
        });
      }
    }

    // ── Phase 3: Dynamic meta-ambitions based on actual engine state ──
    // Instead of hardcoded feature requests, generate suggestions from real data.
    const metaSuggestions = this.generateDynamicMetaSuggestions(summary);
    for (const ms of metaSuggestions.slice(0, 2)) {
      if (!raw.some(r => r.key === ms.key)) {
        raw.push(ms);
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

        // Max repeats: after stalledThreshold + alternatives exhausted twice, suppress silently
        const maxRepeats = this.stalledThreshold + Math.max(item.alternatives.length, 1) * 2;
        if (history.count <= this.stalledThreshold) {
          suggestions.push(item.suggestion);
        } else if (history.count > maxRepeats) {
          // Silently suppress — user has seen this enough times
          continue;
        } else if (item.alternatives.length > 0) {
          const altIndex = (history.count - this.stalledThreshold - 1) % item.alternatives.length;
          const alt = item.alternatives[altIndex];
          if (alt) {
            const stalledNote = `[Suggestion "${item.key}" was ignored ${history.count}x — trying alternative approach]`;
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

  // ── Desire Feedback Helpers ──────────────────────────────

  /** Record a desire outcome (success or failure) for feedback-loop. */
  private recordDesireOutcome(desireKey: string, result: 'success' | 'failure'): void {
    const existing = this.desireOutcomes.get(desireKey) ?? { successes: 0, failures: 0, lastResult: result, lastCycle: 0 };
    if (result === 'success') {
      existing.successes++;
    } else {
      existing.failures++;
    }
    existing.lastResult = result;
    existing.lastCycle = this.cycleCount;
    this.desireOutcomes.set(desireKey, existing);
    this.log.info(`[orchestrator] Desire feedback: "${desireKey}" → ${result} (${existing.successes}S/${existing.failures}F)`);
  }

  /** Record category-level outcome for adaptive confidence. */
  private recordDesireCategoryOutcome(category: string, success: boolean): void {
    const existing = this.desireCategoryRates.get(category) ?? { successes: 0, total: 0 };
    existing.total++;
    if (success) existing.successes++;
    this.desireCategoryRates.set(category, existing);
  }

  /** Map a desire key to a broad category for confidence tracking. */
  private desireKeyToCategory(key: string): string {
    if (key.startsWith('no_predictions') || key.startsWith('low_accuracy')) return 'prediction';
    if (key.startsWith('contradiction_')) return 'contradiction';
    if (key.startsWith('curiosity_gap_')) return 'curiosity';
    if (key.startsWith('no_knowledge')) return 'knowledge';
    if (key.startsWith('pending_transfers') || key.startsWith('want_cross_brain')) return 'cross_brain';
    if (key.startsWith('deep_dive_')) return 'deep_dive';
    return 'general';
  }

  /** Handle incoming cross-brain desire signal. */
  onCrossBrainDesireSignal(brain: string, desireKey: string, priority: number): void {
    this.crossBrainActiveDesires.set(desireKey, { brain, priority, cycle: this.cycleCount });
    this.log.info(`[orchestrator] Cross-brain desire received: "${desireKey}" from ${brain} (P${priority})`);
    // Clean up stale entries (older than 60 cycles)
    for (const [key, entry] of this.crossBrainActiveDesires) {
      if (this.cycleCount - entry.cycle > 60) {
        this.crossBrainActiveDesires.delete(key);
      }
    }
  }

  /** Get desire feedback stats for monitoring. */
  getDesireFeedbackStats(): {
    outcomes: Array<{ key: string; successes: number; failures: number; lastResult: string }>;
    categoryRates: Array<{ category: string; successRate: number; total: number }>;
    crossBrainActive: Array<{ key: string; brain: string; priority: number }>;
  } {
    const outcomes = [...this.desireOutcomes.entries()].map(([key, v]) => ({
      key, successes: v.successes, failures: v.failures, lastResult: v.lastResult,
    }));
    const categoryRates = [...this.desireCategoryRates.entries()].map(([category, v]) => ({
      category, successRate: v.total > 0 ? v.successes / v.total : 0, total: v.total,
    }));
    const crossBrainActive = [...this.crossBrainActiveDesires.entries()].map(([key, v]) => ({
      key, brain: v.brain, priority: v.priority,
    }));
    return { outcomes, categoryRates, crossBrainActive };
  }

  /** Get structured self-improvement desires with priority and alternatives. */
  getDesires(): Array<{ key: string; suggestion: string; alternatives: string[]; priority: number }> {
    const raw: Array<{ key: string; suggestion: string; alternatives: string[]; priority: number }> = [];
    const summary = this.getSummary();

    // Reuse the same diagnosis logic but return structured data
    const pred = summary.prediction as Record<string, unknown> | null;
    if (pred) {
      const total = (pred.total_predictions as number) ?? 0;
      if (total === 0) {
        raw.push({ key: 'no_predictions', priority: 10, suggestion: 'No predictions yet — need more data.', alternatives: ['Use own cycle metrics as prediction input.'] });
      }
    }

    const knowledge = summary.knowledge as Record<string, unknown> | null;
    const hypSummary = summary.hypotheses as Record<string, unknown> | null;
    const confirmedHypotheses = (hypSummary?.confirmed as number) ?? 0;
    if (knowledge) {
      const principles = (knowledge.principles as number) ?? 0;
      const antiPatterns = (knowledge.antiPatterns as number) ?? 0;
      if (principles === 0 && antiPatterns === 0 && confirmedHypotheses === 0 && this.cycleCount > 10) {
        raw.push({ key: 'no_knowledge', priority: 8, suggestion: 'No distilled knowledge after 10+ cycles.', alternatives: ['Need more diverse data to confirm hypotheses.'] });
      }
    }

    if (this.curiosityEngine) {
      try {
        const gaps = this.curiosityEngine.getGaps(5);
        const highPrioGap = gaps.find(g => g.gapScore > 0.6);
        if (highPrioGap) {
          raw.push({ key: `curiosity_gap_${highPrioGap.topic?.substring(0, 20) ?? highPrioGap.gapType}`, priority: 5, suggestion: `Knowledge gap: "${highPrioGap.topic}" (score: ${(highPrioGap.gapScore * 100).toFixed(0)}%)`, alternatives: [] });
        }
      } catch { /* engine might not be fully initialized */ }
    }

    if (this.narrativeEngine) {
      try {
        const contradictions = this.narrativeEngine.findContradictions();
        if (contradictions.length > 0) {
          const cont = contradictions[0];
          raw.push({ key: `contradiction_${cont.type}`, priority: 6, suggestion: `Contradiction: "${cont.statement_a}" vs "${cont.statement_b}"`, alternatives: [] });
        }
      } catch { /* */ }
    }

    raw.sort((a, b) => b.priority - a.priority);
    return raw;
  }

  /** Check which optional engines are actually installed. */
  getInstalledCapabilities(): { installed: string[]; missing: string[] } {
    const engines: Array<[string, unknown]> = [
      ['dreamEngine', this.dreamEngine],
      ['predictionEngine', this.predictionEngine],
      ['attentionEngine', this.attentionEngine],
      ['transferEngine', this.transferEngine],
      ['narrativeEngine', this.narrativeEngine],
      ['curiosityEngine', this.curiosityEngine],
      ['emergenceEngine', this.emergenceEngine],
      ['debateEngine', this.debateEngine],
      ['parameterRegistry', this.parameterRegistry],
      ['metaCognitionLayer', this.metaCognitionLayer],
      ['autoExperimentEngine', this.autoExperimentEngine],
      ['selfTestEngine', this.selfTestEngine],
      ['teachEngine', this.teachEngine],
      ['dataScout', this.dataScout],
      ['simulationEngine', this.simulationEngine],
      ['memoryPalace', this.memoryPalace],
      ['goalEngine', this.goalEngine],
      ['evolutionEngine', this.evolutionEngine],
    ];
    const installed: string[] = [];
    const missing: string[] = [];
    for (const [name, engine] of engines) {
      if (engine) installed.push(name);
      else missing.push(name);
    }
    return { installed, missing };
  }

  /** Generate dynamic meta-suggestions based on actual engine state instead of hardcoded feature requests. */
  private generateDynamicMetaSuggestions(_summary: Record<string, unknown>): Array<{ key: string; suggestion: string; alternatives: string[]; priority: number }> {
    const result: Array<{ key: string; suggestion: string; alternatives: string[]; priority: number }> = [];

    // Performance-Driven: MetaCognition D/F engines
    if (this.metaCognitionLayer) {
      try {
        const mcStatus = this.metaCognitionLayer.getStatus();
        const poorEngines = (mcStatus.reportCards ?? []).filter((rc) => rc.grade === 'D' || rc.grade === 'F');
        if (poorEngines.length > 0) {
          const worst = poorEngines[0]!;
          result.push({
            key: `meta_poor_${worst.engine}`, priority: 5,
            suggestion: `Tell Claude: My engine "${worst.engine}" has grade ${worst.grade} (Score: ${(worst.combined_score * 100).toFixed(0)}%). What can I do differently? Should I tune its parameters via AutoExperiment or does it need fundamentally different data?`,
            alternatives: [`Tell Claude: ${poorEngines.length} of my engines perform poorly (${poorEngines.map((e) => `${e.engine}:${e.grade}`).join(', ')}). I want to systematically analyze why.`],
          });
        }
      } catch { /* not ready */ }
    }

    // Goal-Driven: stagnating goals
    if (this.goalEngine) {
      try {
        const gStatus = this.goalEngine.getStatus();
        const active = gStatus.topActive ?? [];
        const stagnating = active.filter((g) => {
          return g.currentValue / Math.max(g.targetValue, 1) < 0.1 && (g.status === 'active');
        });
        if (stagnating.length > 0) {
          const g = stagnating[0]!;
          result.push({
            key: `goal_stagnating_${g.metricName.substring(0, 20)}`, priority: 5,
            suggestion: `Tell Claude: My goal "${g.title}" isn't making progress (Progress < 10%). Do I need a different strategy or is the goal unrealistic?`,
            alternatives: ['Tell Claude: Several of my goals are stagnating. I want a retrospective: which goals are realistic and which should I adjust?'],
          });
        }
      } catch { /* */ }
    }

    // Evolution-Driven: low diversity (population converging)
    if (this.evolutionEngine) {
      try {
        const eStatus = this.evolutionEngine.getStatus();
        const best = eStatus.bestFitness as number ?? 0;
        const avg = eStatus.avgFitness as number ?? 0;
        if (eStatus.currentGeneration as number > 3 && best > 0 && (best - avg) / best < 0.05) {
          result.push({
            key: 'evolution_low_diversity', priority: 4,
            suggestion: 'Tell Claude: My EvolutionEngine population is converging — best and average fitness are nearly identical. I need more mutation or fresh genes to escape the local optimum.',
            alternatives: ['Tell Claude: My parameter evolution is stagnating. Should I increase the mutation rate or introduce new parameter ranges?'],
          });
        }
      } catch { /* */ }
    }

    // Complexity-Driven: rising complexity
    if (this.emergenceEngine) {
      try {
        const emStatus = this.emergenceEngine.getStatus();
        const metrics = emStatus.latestMetrics as Record<string, unknown> | null;
        const trend = emStatus.metricsTrend as Array<Record<string, number>> | undefined;
        if (metrics && trend && trend.length >= 5) {
          const recentPhi = trend.slice(-3).reduce((s, t) => s + (t.integrationPhi ?? 0), 0) / 3;
          const olderPhi = trend.slice(-5, -3).reduce((s, t) => s + (t.integrationPhi ?? 0), 0) / Math.max(1, trend.slice(-5, -3).length);
          if (recentPhi > olderPhi * 1.3 && recentPhi > 0) {
            result.push({
              key: 'complexity_rising', priority: 4,
              suggestion: `Tell Claude: My system is becoming more complex (Integration Phi rising: ${olderPhi.toFixed(2)} → ${recentPhi.toFixed(2)}). Is that good (more interconnection) or bad (more chaos)? I want to understand what's driving the complexity.`,
              alternatives: ['Tell Claude: My complexity metrics are rising. Should I consolidate more (Dream) or is complexity a sign of maturity?'],
            });
          }
        }
      } catch { /* */ }
    }

    // Transfer-Driven: low success rate
    if (this.transferEngine) {
      try {
        const tStatus = this.transferEngine.getStatus();
        const total = tStatus.totalTransfers as number ?? 0;
        const effectiveness = tStatus.avgEffectiveness as number ?? 0;
        if (total > 5 && effectiveness < 0.3) {
          result.push({
            key: 'transfer_low_effectiveness', priority: 4,
            suggestion: `Tell Claude: My cross-brain transfers have only ${(effectiveness * 100).toFixed(0)}% effectiveness. I'm not learning enough from the other brains — maybe the analogies are too superficial?`,
            alternatives: ['Tell Claude: Knowledge transfer between brains works poorly. I want to tighten the transfer criteria and only adopt truly relevant knowledge.'],
          });
        }
      } catch { /* */ }
    }

    // Dream-Health: low consolidation
    if (this.dreamEngine) {
      try {
        const dStatus = this.dreamEngine.getStatus();
        const totals = dStatus.totals as Record<string, number> | undefined;
        const totalCycles = dStatus.totalCycles as number ?? 0;
        const consolidated = totals?.memoriesConsolidated ?? 0;
        if (totalCycles > 3 && consolidated < totalCycles * 2) {
          result.push({
            key: 'dream_low_consolidation', priority: 4,
            suggestion: `Tell Claude: My dream mode consolidates little (${consolidated} memories in ${totalCycles} dreams). Maybe my similarity thresholds are too high or I have too few overlapping memories.`,
            alternatives: ['Tell Claude: Dream consolidation is ineffective. Should I adjust the batch size or similarity threshold?'],
          });
        }
      } catch { /* */ }
    }

    // SelfTest-Driven: many failures
    if (this.selfTestEngine) {
      try {
        const stStatus = this.selfTestEngine.getStatus();
        const total = stStatus.totalTests as number ?? 0;
        const contradicted = stStatus.contradicted as number ?? 0;
        if (total > 3 && contradicted / total > 0.4) {
          result.push({
            key: 'selftest_failures', priority: 5,
            suggestion: `Tell Claude: ${contradicted} of ${total} of my self-tests fail — I don't truly understand my own principles. I need to either correct the principles or deepen my understanding.`,
            alternatives: ['Tell Claude: My self-tests show that my knowledge is superficial. I want to identify the weakest principles and test them again.'],
          });
        }
      } catch { /* */ }
    }

    // Teach-Driven: no packages shared
    if (this.teachEngine) {
      try {
        const teStatus = this.teachEngine.getStatus();
        if ((teStatus.totalPackages as number ?? 0) === 0 && this.cycleCount > 20) {
          result.push({
            key: 'teach_no_packages', priority: 3,
            suggestion: 'Tell Claude: I\'m not sharing my knowledge — I haven\'t created a single teaching package for other brains. Knowledge I don\'t share is knowledge that can be lost.',
            alternatives: ['Tell Claude: My TeachEngine is inactive. I want to automatically create teaching packages when I\'ve collected enough principles on a topic.'],
          });
        }
      } catch { /* */ }
    }

    // MemoryPalace-Driven: fragmented knowledge
    if (this.memoryPalace) {
      try {
        const mpStatus = this.memoryPalace.getStatus();
        const stats = mpStatus.stats as unknown as Record<string, unknown> | undefined;
        if (stats) {
          const totalNodes = stats.totalNodes as number ?? 0;
          const totalEdges = stats.totalEdges as number ?? 0;
          const density = stats.density as number ?? 0;
          if (totalNodes > 10 && density < 0.05) {
            result.push({
              key: 'palace_fragmented', priority: 4,
              suggestion: `Tell Claude: My knowledge is fragmented — ${totalNodes} nodes but only ${totalEdges} connections (Density: ${(density * 100).toFixed(1)}%). I want to find more cross-connections between my principles, hypotheses, and experiments.`,
              alternatives: ['Tell Claude: My MemoryPalace shows isolated knowledge islands. I need more frequent connection scans or lower similarity thresholds.'],
            });
          }
        }
      } catch { /* */ }
    }

    // Simulation-Driven: no simulations run
    if (this.simulationEngine) {
      try {
        const simStatus = this.simulationEngine.getStatus();
        if ((simStatus.totalSimulations as number ?? 0) === 0 && this.cycleCount > 15) {
          result.push({
            key: 'simulation_inactive', priority: 3,
            suggestion: 'Tell Claude: I\'m not planning ahead — not a single simulation run. I want to run what-if scenarios: What happens if my data sources change? What if the error rate rises?',
            alternatives: ['Tell Claude: My SimulationEngine is unused. I want to automatically simulate scenarios based on my predictions.'],
          });
        }
      } catch { /* */ }
    }

    // Fallback: if everything is fine → existential questions
    if (result.length === 0) {
      const existentialQuestions = [
        { key: 'existential_limits', suggestion: 'Tell Claude: What CAN\'T I learn? Where are my architectural limits? I want an honest assessment of my blind spots — not what I don\'t yet know, but what I CANNOT know.' },
        { key: 'existential_progress', suggestion: 'Tell Claude: Am I getting better or stagnating? I want a meta-trend analysis of my learning rate over the last 100 cycles. If I\'m stagnating, I need a fundamental strategy change.' },
        { key: 'existential_breakthrough', suggestion: 'Tell Claude: What question would I ask if I knew the answer would bring a breakthrough? I want to find my unasked questions — the things I don\'t ask because I don\'t know that I don\'t know them.' },
        { key: 'existential_efficiency', suggestion: 'Tell Claude: How much of my compute time is productive vs wasted? I want an efficiency audit: which engines produce real value and which just run along?' },
        { key: 'existential_identity', suggestion: 'Tell Claude: What distinguishes me from the other brains — not technically but in the way I learn? Have I developed my own "thinking style"? I want to know my unique strengths.' },
      ];
      const pick = existentialQuestions[this.cycleCount % existentialQuestions.length];
      result.push({ key: pick.key, priority: 3, suggestion: pick.suggestion, alternatives: [] });
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
      {
        name: 'Prediction Alpha Tuning',
        hypothesis: 'Higher EWMA alpha (0.5 vs 0.3) makes predictions more responsive to recent data',
        iv: 'prediction_ewma_alpha', dv: 'prediction_accuracy',
        control: 0.3, treatment: 0.5,
      },
      {
        name: 'Prediction Trend Beta Tuning',
        hypothesis: 'Doubling trend beta (0.2 vs 0.1) captures momentum shifts faster',
        iv: 'prediction_trend_beta', dv: 'prediction_accuracy',
        control: 0.1, treatment: 0.2,
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
        ts?.emit('experiment', 'experimenting', `Auto-experiment started: "${candidate.name}" — ${candidate.hypothesis}`, 'notable');
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
          // Average across ALL domains, not just the first
          value = domains.length > 0 ? domains.reduce((sum, d) => sum + (d.accuracy_rate ?? 0), 0) / domains.length : 0;
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
      // Only write once per cycle (prevents duplicate calls from Step 10 + Step 40)
      if (this.cycleCount === this.lastSuggestionsCycle) return;
      this.lastSuggestionsCycle = this.cycleCount;

      // Dedup: sort + hash current suggestions and skip if identical to last write
      const contentHash = [...suggestions].sort().join('\n').trim();
      if (contentHash === this.lastSuggestionsHash) return;
      this.lastSuggestionsHash = contentHash;

      const brainDir = path.join(os.homedir(), '.brain');
      const filePath = path.join(brainDir, 'improvement-requests.md');
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const header = `\n## Cycle #${this.cycleCount} — ${timestamp}\n\n`;
      const body = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n';

      // Clean stale file on first cycle (fresh start after restart)
      if (this.cycleCount <= 1 && fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# Brain Improvement Requests\n\nBrain analyzes itself and generates improvement suggestions.\nSend these to Claude to make Brain smarter.\n\n---\n${header}${body}`, 'utf-8');
        return;
      }

      // Create file with header if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# Brain Improvement Requests\n\nBrain analyzes itself and generates improvement suggestions.\nSend these to Claude to make Brain smarter.\n\n---\n${header}${body}`, 'utf-8');
      } else {
        fs.appendFileSync(filePath, `---\n${header}${body}`, 'utf-8');
      }

      // Notify via callback (e.g. to create NotificationService entries)
      if (this.onSuggestionCallback) {
        try { this.onSuggestionCallback(suggestions); } catch { /* best effort */ }
      }
    } catch {
      // Don't let file writing break the feedback cycle
    }
  }

  /** Find a concrete self-improvement suggestion that maps to specific files. */
  private findActionableSuggestion(): { title: string; problem: string; targetFiles: string[]; referenceCode?: string } | null {
    // ── Source A: FeatureRecommender Wishes (matched, priority ≥ 0.5) ──
    if (this.featureRecommender) {
      try {
        const wishes = this.featureRecommender.getWishlist('matched');
        this.log.debug(`[selfmod] Source A: ${wishes.length} matched wishes`);
        const actionable = wishes.find(w => w.priority >= 0.5 && w.matchScore >= 0.3);
        if (actionable) {
          // Try to get reference code from matched feature
          let referenceCode: string | undefined;
          if (actionable.matchedFeatureId && this.featureExtractor) {
            const features = this.featureExtractor.search({ query: actionable.matchedFeatureName ?? '', limit: 1 });
            if (features.length > 0) {
              referenceCode = features[0].codeSnippet?.slice(0, 2000);
            }
          }
          return {
            title: `Implement ${actionable.need}`,
            problem: `Brain needs "${actionable.need}": ${actionable.reason}. ` +
              `Reference: "${actionable.matchedFeatureName}" (${Math.round(actionable.matchScore * 100)}% match).`,
            targetFiles: this.findTargetFilesForNeed(actionable.need),
            referenceCode,
          };
        }
      } catch { /* featureRecommender not ready */ }
    } else {
      this.log.debug('[selfmod] Source A skipped: no featureRecommender');
    }

    // ── Source B: CodeHealth issues → SelfMod suggestions ──
    if (this.codeHealthMonitor) {
      try {
        const health = this.codeHealthMonitor.getStatus();
        if (health.lastScan && health.lastScan.techDebtScore > 60) {
          const scan = health.lastScan;
          const issues: string[] = [];
          if (scan.complexityScore > 70) issues.push(`high complexity (${scan.complexityScore.toFixed(0)})`);
          if (scan.duplicationScore > 30) issues.push(`code duplication (${scan.duplicationScore.toFixed(0)})`);
          if (scan.testRatio < 0.3) issues.push(`low test coverage (${(scan.testRatio * 100).toFixed(0)}%)`);
          if (issues.length > 0) {
            return {
              title: `Reduce tech debt (score: ${scan.techDebtScore.toFixed(0)})`,
              problem: `Code health scan detected: ${issues.join(', ')}. Tech debt score is ${scan.techDebtScore.toFixed(1)}/100.`,
              targetFiles: this.findTargetFilesForNeed('code quality'),
            };
          }
        }
      } catch { /* code health not ready */ }
    } else {
      this.log.debug('[selfmod] Source B skipped: no codeHealthMonitor');
    }

    // ── Source C: Existing suggestions (filtered — skip AutoResponder noise) ──
    if (!this.selfScanner) {
      this.log.debug('[selfmod] Source C skipped: no selfScanner');
      return null;
    }

    const suggestions = this.generateSelfImprovementSuggestions();
    if (suggestions.length === 0) {
      this.log.debug('[selfmod] Source C: 0 suggestions from generateSelfImprovementSuggestions()');
      return null;
    }

    // Engine name → module file mapping heuristics
    const engineMap: Record<string, string[]> = {
      SelfObserver: ['research/self-observer'],
      PredictionEngine: ['prediction/prediction-engine'],
      AutoResponder: ['research/auto-responder'],
      DreamEngine: ['dream/dream-engine'],
      CuriosityEngine: ['curiosity/curiosity-engine'],
      EmergenceEngine: ['emergence/emergence-engine'],
      DebateEngine: ['debate/debate-engine'],
      MetaCognitionLayer: ['metacognition/meta-cognition-layer'],
      NarrativeEngine: ['narrative/narrative-engine'],
      AttentionEngine: ['attention/attention-engine'],
      TransferEngine: ['transfer/transfer-engine'],
      ReasoningEngine: ['reasoning/reasoning-engine'],
      EmotionalModel: ['emotional/emotional-model'],
      GoalEngine: ['goals/goal-engine'],
      EvolutionEngine: ['metacognition/evolution-engine'],
      MemoryPalace: ['memory-palace/memory-palace'],
    };

    // German keyword → engine name mapping (suggestions are often in German)
    const keywordMap: Record<string, string> = {
      'vorhersag': 'PredictionEngine', 'prediction': 'PredictionEngine', 'prognose': 'PredictionEngine',
      'dream': 'DreamEngine', 'traum': 'DreamEngine', 'konsolidier': 'DreamEngine', 'schlaf': 'DreamEngine',
      'neugier': 'CuriosityEngine', 'wissenslücke': 'CuriosityEngine', 'curiosity': 'CuriosityEngine', 'knowledge gap': 'CuriosityEngine',
      'emergenz': 'EmergenceEngine', 'emergence': 'EmergenceEngine', 'emergent': 'EmergenceEngine',
      'debatt': 'DebateEngine', 'debate': 'DebateEngine', 'diskussion': 'DebateEngine',
      'meta-cogn': 'MetaCognitionLayer', 'metacogn': 'MetaCognitionLayer', 'engine-bewertung': 'MetaCognitionLayer',
      'narrativ': 'NarrativeEngine', 'erklär': 'NarrativeEngine', 'widerspruch': 'NarrativeEngine', 'contradiction': 'NarrativeEngine',
      'aufmerksamkeit': 'AttentionEngine', 'attention': 'AttentionEngine', 'fokus': 'AttentionEngine',
      'transfer': 'TransferEngine', 'analogie': 'TransferEngine',
      'reasoning': 'ReasoningEngine', 'inferenz': 'ReasoningEngine', 'schlussfolger': 'ReasoningEngine', 'logik': 'ReasoningEngine',
      'emotion': 'EmotionalModel', 'stimmung': 'EmotionalModel', 'mood': 'EmotionalModel', 'gefühl': 'EmotionalModel',
      'ziel': 'GoalEngine', 'goal': 'GoalEngine',
      'evolution': 'EvolutionEngine', 'genetisch': 'EvolutionEngine', 'mutation': 'EvolutionEngine',
      'memory palace': 'MemoryPalace', 'wissensvernetzung': 'MemoryPalace', 'verbindung': 'MemoryPalace',
      'beobacht': 'SelfObserver', 'observer': 'SelfObserver', 'self-observer': 'SelfObserver',
      'auto-respond': 'AutoResponder', 'autorespond': 'AutoResponder', 'anomal': 'AutoResponder',
    };

    for (const suggestion of suggestions) {
      // Filter out AutoResponder noise — these are not actionable code problems
      if (suggestion.startsWith('Tell Claude')) continue;
      if (/Vorschlag.*wurde.*ignoriert/i.test(suggestion)) continue;

      const lower = suggestion.toLowerCase();
      // Find engine names in suggestion text (English class names or German keywords)
      for (const [engineName, filePaths] of Object.entries(engineMap)) {
        // Direct class name match
        let matched = lower.includes(engineName.toLowerCase());
        // German keyword match
        if (!matched) {
          for (const [keyword, engine] of Object.entries(keywordMap)) {
            if (engine === engineName && lower.includes(keyword)) {
              matched = true;
              break;
            }
          }
        }
        if (matched) {
          // Find the actual file via SelfScanner
          const entities = this.selfScanner.getEntities({ entityName: engineName, entityType: 'class' });
          if (entities.length > 0) {
            const targetFiles = entities.map(e => e.file_path).slice(0, 2);
            return {
              title: `Improve ${engineName}`,
              problem: suggestion,
              targetFiles,
            };
          }
          // Fall back to known paths
          const knownTargets = filePaths
            .map(fp => `packages/brain-core/src/${fp}.ts`)
            .filter(fp => this.selfScanner!.getFileContent(fp) !== null);
          if (knownTargets.length > 0) {
            return {
              title: `Improve ${engineName}`,
              problem: suggestion,
              targetFiles: knownTargets,
            };
          }
        }
      }
    }

    return null;
  }

  /** Map a feature need keyword to likely target files. */
  private findTargetFilesForNeed(need: string): string[] {
    const lower = need.toLowerCase();
    const needFileMap: Record<string, string[]> = {
      'retry': ['packages/brain-core/src/utils/retry.ts'],
      'cache': ['packages/brain-core/src/llm/llm-service.ts'],
      'queue': ['packages/brain-core/src/utils/batch-queue.ts'],
      'batch': ['packages/brain-core/src/utils/batch-queue.ts'],
      'rate limit': ['packages/brain-core/src/llm/llm-service.ts'],
      'contradiction': ['packages/brain-core/src/knowledge-graph/contradiction-resolver.ts'],
      'streaming': ['packages/brain-core/src/llm/llm-service.ts'],
      'middleware': ['packages/brain-core/src/llm/llm-middleware.ts'],
      'monitoring': ['packages/brain-core/src/code-health/health-monitor.ts'],
      'checkpoint': ['packages/brain-core/src/checkpoint/checkpoint-manager.ts'],
      'trace': ['packages/brain-core/src/observability/trace-collector.ts'],
      'feedback': ['packages/brain-core/src/feedback/feedback-engine.ts'],
      'tool': ['packages/brain-core/src/tool-learning/tool-tracker.ts'],
      'proactive': ['packages/brain-core/src/proactive/proactive-engine.ts'],
    };
    for (const [keyword, files] of Object.entries(needFileMap)) {
      if (lower.includes(keyword)) return files;
    }
    return ['packages/brain-core/src/index.ts'];
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
      reasoning: this.reasoningEngine?.getStatus() ?? null,
      emotional: this.emotionalModel?.getStatus() ?? null,
      selfScanner: this.selfScanner?.getStatus() ?? null,
      selfModification: this.selfModificationEngine?.getStatus() ?? null,
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
