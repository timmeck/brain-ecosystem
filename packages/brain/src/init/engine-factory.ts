/**
 * Engine factory — extracted from BrainCore.start() sections 55-76 + 86-101 + 11k-11m.
 * Creates Intelligence Upgrade engines, Masterplan 3-5 engines, scanners, and code generation.
 * Pure extraction, no logic changes.
 */
import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { BrainConfig } from '../types/config.types.js';
import type { Services } from '../ipc/router.js';
import type { EmbeddingEngine } from '../embeddings/engine.js';
import { getCurrentVersion } from '../cli/update-check.js';

import {
  RAGEngine, RAGIndexer, KnowledgeGraphEngine, FactExtractor, SemanticCompressor,
  FeedbackEngine, ToolTracker, ToolPatternAnalyzer, ProactiveEngine, UserModel,
  CodeHealthMonitor, TeachingProtocol, Curriculum, ConsensusEngine, ActiveLearner,
  RepoAbsorber, FeatureExtractor, FeatureRecommender, ContradictionResolver,
  CheckpointManager, TraceCollector, MessageRouter, TelegramBot, DiscordBot,
  BenchmarkSuite, AgentTrainer, ToolScopeManager, PluginMarketplace, CodeSandbox,
  GuardrailEngine, CausalPlanner, ResearchRoadmap, runRoadmapMigration,
  CreativeEngine, runCreativeMigration,
  ActionBridgeEngine, runActionBridgeMigration, createMissionHandler,
  ContentForge, runContentForgeMigration,
  CodeForge, runCodeForgeMigration,
  StrategyForge, runStrategyForgeMigration,
  CrossBrainSignalRouter, runSignalRouterMigration,
  ChatEngine, runChatMigration,
  SubAgentFactory, runSubAgentMigration,
  ConversationMemory, runConversationMemoryMigration,
  BrowserAgent, runBrowserAgentMigration,
  BrainBot, runBrainBotMigration,
  EngineRegistry, getDefaultEngineProfiles,
  RuntimeInfluenceTracker,
  LoopDetector,
  GovernanceLayer,
  SignalScanner, CodeMiner, PatternExtractor, ContextBuilder, CodeGenerator,
  TechRadarEngine, runTechRadarMigration,
  NotificationService as MultiChannelNotificationService, runNotificationMigration,
  DiscordProvider, TelegramProvider, EmailProvider,
} from '@timmeck/brain-core';
import type {
  ResearchOrchestrator, AutonomousResearchScheduler, CrossBrainNotifier,
  ThoughtStream, GoalEngine, LLMService,
} from '@timmeck/brain-core';

// ── Types ────────────────────────────────────────────────

export interface IntelligenceDeps {
  db: Database.Database;
  config: BrainConfig;
  services: Services;
  embeddingEngine: EmbeddingEngine | null;
  orchestrator: ResearchOrchestrator;
  researchScheduler: AutonomousResearchScheduler;
  thoughtStream: ThoughtStream;
  llmService: LLMService;
  notifier: CrossBrainNotifier | null;
  goalEngine: GoalEngine;
}

export interface IntelligenceResult {
  guardrailEngine: GuardrailEngine;
  causalPlanner: CausalPlanner;
  researchRoadmap: ResearchRoadmap;
  creativeEngine: CreativeEngine;
  telegramBot: TelegramBot;
  discordBot: DiscordBot;
  patternExtractor: PatternExtractor | undefined;
  conversationMemory: ConversationMemory;
  browserAgent: BrowserAgent;
  brainBot: BrainBot;
}

// ── Intelligence Upgrade (Sessions 55-76) ────────────────

export function createIntelligenceEngines(deps: IntelligenceDeps): IntelligenceResult {
  const { db, config, services, embeddingEngine, orchestrator, researchScheduler, thoughtStream, llmService, notifier, goalEngine } = deps;
  const logger = getLogger();

  // 55. RAG Pipeline — vector search across all knowledge
  const ragEngine = new RAGEngine(db, { brainName: 'brain' });
  if (embeddingEngine) ragEngine.setEmbeddingEngine(embeddingEngine);
  ragEngine.setThoughtStream(thoughtStream);
  if (llmService.isAvailable()) ragEngine.setLLMService(llmService);
  services.ragEngine = ragEngine;

  const ragIndexer = new RAGIndexer(db);
  ragIndexer.setRAGEngine(ragEngine);
  services.ragIndexer = ragIndexer;
  // Background: initial RAG indexing after 30s startup delay
  setTimeout(() => {
    ragIndexer.indexAll().then(count => {
      if (count > 0) logger.info(`[RAG] Initial indexing: ${count} vectors`);
    }).catch(err => logger.debug(`[RAG] Initial indexing skipped: ${(err as Error).message}`));
  }, 30_000);

  // 56. Knowledge Graph 2.0 — typed fact relations
  const knowledgeGraph = new KnowledgeGraphEngine(db, { brainName: 'brain' });
  knowledgeGraph.setThoughtStream(thoughtStream);
  services.knowledgeGraph = knowledgeGraph;

  const factExtractor = new FactExtractor(db, { brainName: 'brain' });
  if (llmService.isAvailable()) factExtractor.setLLMService(llmService);
  services.factExtractor = factExtractor;

  // 57. Semantic Compression — deduplicate knowledge
  const semanticCompressor = new SemanticCompressor(db, { brainName: 'brain' });
  semanticCompressor.setRAGEngine(ragEngine);
  if (llmService.isAvailable()) semanticCompressor.setLLMService(llmService);
  semanticCompressor.setThoughtStream(thoughtStream);
  services.semanticCompressor = semanticCompressor;

  // 58. Feedback Learning — RLHF reward signals
  const feedbackEngine = new FeedbackEngine(db, { brainName: 'brain' });
  feedbackEngine.setThoughtStream(thoughtStream);
  services.feedbackEngine = feedbackEngine;

  // 59. Tool-Use Learning — track tool outcomes
  const toolTracker = new ToolTracker(db, { brainName: 'brain' });
  const toolPatternAnalyzer = new ToolPatternAnalyzer(db);
  services.toolTracker = toolTracker;
  services.toolPatternAnalyzer = toolPatternAnalyzer;

  // 60. Proactive Suggestions — trigger-based improvement proposals
  const proactiveEngine = new ProactiveEngine(db, { brainName: 'brain' });
  proactiveEngine.setThoughtStream(thoughtStream);
  services.proactiveEngine = proactiveEngine;

  // 61. User Modeling — adaptive responses
  const userModel = new UserModel(db, { brainName: 'brain' });
  services.userModel = userModel;

  // 62. Code Health Monitor — codebase quality tracking
  const codeHealthMonitor = new CodeHealthMonitor(db, { brainName: 'brain' });
  codeHealthMonitor.setThoughtStream(thoughtStream);
  services.codeHealthMonitor = codeHealthMonitor;

  // 63. Inter-Brain Teaching — knowledge transfer protocol
  const teachingProtocol = new TeachingProtocol(db, { brainName: 'brain' });
  if (notifier) teachingProtocol.setNotifier(notifier);
  services.teachingProtocol = teachingProtocol;
  const curriculum = new Curriculum(db);
  services.curriculum = curriculum;

  // 64. Consensus Decisions — multi-brain voting
  const consensusEngine = new ConsensusEngine(db, { brainName: 'brain' });
  services.consensusEngine = consensusEngine;

  // 65. Active Learning — gap identification & closing strategies
  const activeLearner = new ActiveLearner(db, { brainName: 'brain' });
  activeLearner.setThoughtStream(thoughtStream);
  services.activeLearner = activeLearner;

  // 66. RepoAbsorber — autonomous code learning from discovered repos
  const repoAbsorber = new RepoAbsorber(db);
  repoAbsorber.setThoughtStream(thoughtStream);
  repoAbsorber.setRAGEngine(ragEngine);
  repoAbsorber.setKnowledgeGraph(knowledgeGraph);
  services.repoAbsorber = repoAbsorber;

  // 67. FeatureExtractor — extract useful functions/patterns from absorbed repos
  const featureExtractor = new FeatureExtractor(db);
  featureExtractor.setRAGEngine(ragEngine);
  featureExtractor.setKnowledgeGraph(knowledgeGraph);
  if (services.llmService) featureExtractor.setLLMService(services.llmService);
  services.featureExtractor = featureExtractor;
  repoAbsorber.setFeatureExtractor(featureExtractor);

  // 68. FeatureRecommender — wishlist, connections, periodic need scanning
  const featureRecommender = new FeatureRecommender(db);
  featureRecommender.setFeatureExtractor(featureExtractor);
  featureRecommender.setRAGEngine(ragEngine);
  featureRecommender.setKnowledgeGraph(knowledgeGraph);
  featureRecommender.setThoughtStream(thoughtStream);
  services.featureRecommender = featureRecommender;

  // 69. ContradictionResolver — resolve knowledge graph contradictions
  const contradictionResolver = new ContradictionResolver(db);
  contradictionResolver.setKnowledgeGraph(knowledgeGraph);
  services.contradictionResolver = contradictionResolver;

  // 70. CheckpointManager — workflow state persistence for crash recovery & time-travel
  const checkpointManager = new CheckpointManager(db);
  services.checkpointManager = checkpointManager;

  // 71. TraceCollector — observability & tracing for all workflows
  const traceCollector = new TraceCollector(db);
  services.traceCollector = traceCollector;

  // 72. Messaging Bots — bidirectional Telegram/Discord (optional, if tokens configured)
  const messageRouter = new MessageRouter({ brainName: 'brain' });
  services.messageRouter = messageRouter;
  const telegramBot = new TelegramBot();
  telegramBot.setRouter(messageRouter);
  services.telegramBot = telegramBot;
  const discordBot = new DiscordBot();
  discordBot.setRouter(messageRouter);
  services.discordBot = discordBot;

  // 73. Agent Training — BenchmarkSuite + AgentTrainer (eval harness with curriculum learning)
  const benchmarkSuite = new BenchmarkSuite(db);
  const agentTrainer = new AgentTrainer(db);
  agentTrainer.setBenchmarkSuite(benchmarkSuite);
  services.benchmarkSuite = benchmarkSuite;
  services.agentTrainer = agentTrainer;

  // 74. Tool Scoping — dynamic tool availability per workflow phase (LangGraph-inspired)
  const toolScopeManager = new ToolScopeManager(db);
  toolScopeManager.registerDefaults();
  services.toolScopeManager = toolScopeManager;

  // 75. Plugin Marketplace — browse, install, rate plugins (OpenClaw-inspired)
  const pluginMarketplace = new PluginMarketplace(db, { brainVersion: getCurrentVersion() });
  services.pluginMarketplace = pluginMarketplace;

  // 76. Code Sandbox — isolated code execution with Docker/local fallback (AutoGen-inspired)
  const codeSandbox = new CodeSandbox(db);
  services.codeSandbox = codeSandbox;

  // Wire CodeSandbox into SelfModificationEngine for pre-validation
  if (services.selfModificationEngine) {
    services.selfModificationEngine.setSandbox(codeSandbox);
    logger.info('SelfModificationEngine: Sandbox pre-validation enabled');
  }

  // 89. GuardrailEngine — self-protection: parameter bounds, circuit breaker, health checks
  const guardrailEngine = new GuardrailEngine(db, { brainName: 'brain' });
  guardrailEngine.setParameterRegistry(services.parameterRegistry!);
  if (goalEngine) guardrailEngine.setGoalEngine(goalEngine);
  guardrailEngine.setThoughtStream(thoughtStream);
  services.guardrailEngine = guardrailEngine;

  // 86. CausalPlanner — root-cause diagnosis + intervention planning
  const causalPlanner = new CausalPlanner(researchScheduler.causalGraph);
  causalPlanner.setGoalEngine(goalEngine);
  services.causalPlanner = causalPlanner;

  // 87. ResearchRoadmap — goal dependencies + multi-step research plans
  runRoadmapMigration(db);
  const researchRoadmap = new ResearchRoadmap(db, goalEngine);
  researchRoadmap.setThoughtStream(thoughtStream);
  services.researchRoadmap = researchRoadmap;

  // 88. CreativeEngine — cross-domain idea generation
  runCreativeMigration(db);
  const creativeEngine = new CreativeEngine(db, { brainName: 'brain' });
  creativeEngine.setKnowledgeDistiller(orchestrator.knowledgeDistiller);
  creativeEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
  if (llmService) creativeEngine.setLLMService(llmService);
  creativeEngine.setThoughtStream(thoughtStream);
  services.creativeEngine = creativeEngine;

  // 91. ActionBridgeEngine — risk-assessed auto-execution of proposed actions
  runActionBridgeMigration(db);
  const actionBridge = new ActionBridgeEngine(db, { brainName: 'brain' });
  // Outcome callback: log results + inform orchestrator
  actionBridge.onOutcome((action, outcome) => {
    const status = outcome.success ? 'SUCCESS' : 'FAILED';
    logger.info(`[action-outcome] #${action.id} ${action.title} → ${status} (source=${action.source})`);
    if (action.source === 'creative' && outcome.success && creativeEngine) {
      // Mark creative insight as tested
      try {
        const insightId = action.payload?.insightId as number | undefined;
        if (insightId) {
          db.prepare("UPDATE creative_insights SET status = 'tested' WHERE id = ?").run(insightId);
        }
      } catch { /* best effort */ }
    }
  });
  services.actionBridge = actionBridge;

  // Register start_mission handler → MissionEngine
  if (services.missionEngine) {
    const missionRef = services.missionEngine;
    actionBridge.registerHandler('start_mission', createMissionHandler({
      createMission: (topic, mode) => missionRef.createMission(topic, mode as 'quick' | 'standard' | 'deep'),
    }));
    logger.info('Registered start_mission handler → MissionEngine');
  }

  // 92. ContentForge — autonomous content generation + publishing
  runContentForgeMigration(db);
  const contentForge = new ContentForge(db, { brainName: 'brain' });
  if (llmService) contentForge.setLLMService(llmService);
  contentForge.setActionBridge(actionBridge);
  services.contentForge = contentForge;

  // 93. CodeForge — pattern extraction + auto-apply code changes
  runCodeForgeMigration(db);
  const codeForge = new CodeForge(db, { brainName: 'brain' });
  codeForge.setActionBridge(actionBridge);
  if (services.guardrailEngine) codeForge.setGuardrailEngine(services.guardrailEngine);
  if (services.selfModificationEngine) codeForge.setSelfModificationEngine(services.selfModificationEngine);
  if (services.codeHealthMonitor) codeForge.setCodeHealthMonitor(services.codeHealthMonitor);
  services.codeForge = codeForge;

  // 94. StrategyForge — autonomous strategy creation + execution
  runStrategyForgeMigration(db);
  const strategyForge = new StrategyForge(db, { brainName: 'brain' });
  strategyForge.setActionBridge(actionBridge);
  strategyForge.setKnowledgeDistiller(orchestrator.knowledgeDistiller);
  services.strategyForge = strategyForge;

  // CrossBrainSignalRouter — bidirectional signal routing
  runSignalRouterMigration(db);
  const signalRouter = new CrossBrainSignalRouter(db, 'brain');
  if (notifier) signalRouter.setNotifier(notifier);
  // Handle incoming trade signals → create insight
  signalRouter.onSignal('trade_signal', (signal) => {
    const symbol = (signal.payload.symbol as string) ?? 'unknown';
    const direction = (signal.payload.direction as string) ?? 'neutral';
    try {
      services.research.createInsight({
        title: `Trade signal: ${symbol} ${direction}`,
        type: 'cross-brain',
        description: `Received ${direction} signal for ${symbol} from ${signal.sourceBrain} (confidence: ${signal.confidence.toFixed(2)})`,
      });
    } catch { /* best effort */ }
    logger.info(`[signal-router] Created insight from trade signal: ${symbol} ${direction}`);
  });

  // Handle incoming engagement signals → create insight
  signalRouter.onSignal('engagement_signal', (signal) => {
    const topic = (signal.payload.topic as string) ?? 'unknown';
    try {
      services.research.createInsight({
        title: `Engagement signal: ${topic}`,
        type: 'cross-brain',
        description: `Engagement signal from ${signal.sourceBrain}: ${signal.payload.summary ?? topic}`,
      });
    } catch { /* best effort */ }
    logger.info(`[signal-router] Created insight from engagement signal: ${topic}`);
  });

  services.signalRouter = signalRouter;

  // 100. ChatEngine — NLU-routed chat interface
  runChatMigration(db);
  const chatEngine = new ChatEngine(db, { brainName: 'brain' });
  services.chatEngine = chatEngine;

  // 101. SubAgentFactory — spawn specialized sub-agents
  runSubAgentMigration(db);
  const subAgentFactory = new SubAgentFactory(db);
  services.subAgentFactory = subAgentFactory;

  // ConversationMemory — long-term session memory (SQLite + FTS5 + RAG)
  runConversationMemoryMigration(db);
  const conversationMemory = new ConversationMemory(db);
  if (services.ragEngine) conversationMemory.setRAG(services.ragEngine);
  if (services.journal) conversationMemory.setJournal(services.journal as any);
  if (services.knowledgeGraph) conversationMemory.setKnowledgeGraph(services.knowledgeGraph);
  services.conversationMemory = conversationMemory;

  // BrowserAgent — LLM-steered autonomous browser (Playwright + StallDetector)
  runBrowserAgentMigration(db);
  const browserAgent = new BrowserAgent(db);
  services.browserAgent = browserAgent;

  // BrainBot — Discord/Telegram bridge to ChatEngine
  runBrainBotMigration(db);
  const brainBot = new BrainBot(db);
  brainBot.setChatEngine(chatEngine);
  services.brainBot = brainBot;

  // 116. EngineRegistry — formal engine profiles for governance
  const engineRegistry = new EngineRegistry(db);
  for (const profile of getDefaultEngineProfiles()) {
    engineRegistry.register(profile);
  }
  services.engineRegistry = engineRegistry;

  // 117. RuntimeInfluenceTracker — before/after snapshots for influence tracking
  const runtimeInfluenceTracker = new RuntimeInfluenceTracker(db);
  services.runtimeInfluenceTracker = runtimeInfluenceTracker;

  // 118. LoopDetector — anti-pattern detection
  const loopDetector = new LoopDetector(db);
  loopDetector.setInfluenceTracker(runtimeInfluenceTracker);
  services.loopDetector = loopDetector;

  // 119. GovernanceLayer — active engine control
  const governanceLayer = new GovernanceLayer(db);
  governanceLayer.setLoopDetector(loopDetector);
  governanceLayer.setEngineRegistry(engineRegistry);
  services.governanceLayer = governanceLayer;

  // ── Wire intelligence engines into autonomous ResearchOrchestrator ──
  orchestrator.setFactExtractor(factExtractor);
  orchestrator.setKnowledgeGraph(knowledgeGraph);
  orchestrator.setSemanticCompressor(semanticCompressor);
  orchestrator.setProactiveEngine(proactiveEngine);
  orchestrator.setActiveLearner(activeLearner);
  orchestrator.setRAGIndexer(ragIndexer);
  orchestrator.setTeachingProtocol(teachingProtocol);
  orchestrator.setCodeHealthMonitor(codeHealthMonitor);
  orchestrator.setRepoAbsorber(repoAbsorber);
  orchestrator.setFeatureRecommender(featureRecommender);
  orchestrator.setFeatureExtractor(featureExtractor);
  orchestrator.setContradictionResolver(contradictionResolver);
  orchestrator.setCheckpointManager(checkpointManager);
  orchestrator.setFeedbackEngine(feedbackEngine);
  orchestrator.setUserModel(userModel);
  orchestrator.setConsensusEngine(consensusEngine);
  orchestrator.setTraceCollector(traceCollector);
  orchestrator.setGuardrailEngine(guardrailEngine);
  orchestrator.setCausalPlanner(causalPlanner);
  orchestrator.setResearchRoadmap(researchRoadmap);
  orchestrator.setCreativeEngine(creativeEngine);
  orchestrator.setActionBridge(actionBridge);
  orchestrator.setContentForge(contentForge);
  orchestrator.setCodeForge(codeForge);
  orchestrator.setStrategyForge(strategyForge);
  orchestrator.setSignalRouter(signalRouter);
  orchestrator.setEngineRegistry(engineRegistry);
  orchestrator.setRuntimeInfluenceTracker(runtimeInfluenceTracker);
  orchestrator.setLoopDetector(loopDetector);
  orchestrator.setGovernanceLayer(governanceLayer);
  orchestrator.setConversationMemory(conversationMemory);

  // Wire ConversationMemory into ChatEngine for auto-remembering interactions
  chatEngine.setConversationMemory(conversationMemory);

  logger.info('Intelligence upgrade active (RAG, KG, Compression, Feedback, Tool-Learning, Proactive, UserModel, CodeHealth, Teaching, Consensus, ActiveLearning, RepoAbsorber, Guardrails, CausalPlanner, Roadmap, Creative, EngineRegistry, InfluenceTracker — all wired into orchestrator)');

  logger.info('Research orchestrator started (48+ steps, feedback loops active, DataMiner bootstrapped, Dream Mode active, Prediction Engine active)');

  // 11k. Signal Scanner — GitHub/HN/Crypto signal tracking
  if (config.scanner.enabled) {
    const signalScanner = new SignalScanner(db, config.scanner);
    orchestrator.setSignalScanner(signalScanner);
    signalScanner.start();
    services.signalScanner = signalScanner;
    logger.info(`Signal scanner started (interval: ${config.scanner.scanIntervalMs}ms, token: ${config.scanner.githubToken ? 'yes' : 'NO — set GITHUB_TOKEN'})`);
  }

  // 11k2. TechRadar Engine — daily tech trend scanning + relevance analysis
  try {
    runTechRadarMigration(db);
    const techRadar = new TechRadarEngine(db, {
      githubToken: config.scanner.githubToken,
    });
    if (llmService) techRadar.setLLMService(llmService);
    techRadar.start();
    services.techRadar = techRadar;
    logger.info('TechRadar engine started');
  } catch (err) {
    logger.warn(`TechRadar setup failed (non-critical): ${(err as Error).message}`);
  }

  // 11k3. NotificationService — multi-channel notifications
  try {
    runNotificationMigration(db);
    const notificationService = new MultiChannelNotificationService(db);
    // Auto-register available providers
    const discordProv = new DiscordProvider();
    const telegramProv = new TelegramProvider();
    const emailProvider = new EmailProvider();
    discordProv.isAvailable().then(ok => {
      if (ok) { notificationService.registerProvider(discordProv); logger.info('Discord notification provider registered'); }
    }).catch(() => {});
    telegramProv.isAvailable().then(ok => {
      if (ok) { notificationService.registerProvider(telegramProv); logger.info('Telegram notification provider registered'); }
    }).catch(() => {});
    emailProvider.isAvailable().then(ok => {
      if (ok) { notificationService.registerProvider(emailProvider); logger.info('Email notification provider registered'); }
    }).catch(() => {});
    services.multiChannelNotifications = notificationService;
    logger.info('NotificationService initialized');
  } catch (err) {
    logger.warn(`NotificationService setup failed (non-critical): ${(err as Error).message}`);
  }

  // 11l. CodeMiner — mine repo contents from GitHub (needs GITHUB_TOKEN)
  let patternExtractor: PatternExtractor | undefined;
  if (config.scanner.githubToken) {
    const codeMiner = new CodeMiner(db, { githubToken: config.scanner.githubToken });
    patternExtractor = new PatternExtractor(db);
    orchestrator.setCodeMiner(codeMiner);
    services.codeMiner = codeMiner;
    services.patternExtractor = patternExtractor;
    void codeMiner.bootstrap();
    logger.info('CodeMiner activated (GITHUB_TOKEN set)');
  }

  // 11m. CodeGenerator — autonomous code generation (needs ANTHROPIC_API_KEY)
  if (process.env.ANTHROPIC_API_KEY) {
    const codeGenerator = new CodeGenerator(db, { brainName: 'brain', apiKey: process.env.ANTHROPIC_API_KEY });
    const contextBuilder = new ContextBuilder(
      orchestrator.knowledgeDistiller,
      orchestrator.journal,
      patternExtractor ?? null,
      services.signalScanner ?? null,
    );
    codeGenerator.setContextBuilder(contextBuilder);
    codeGenerator.setThoughtStream(thoughtStream);
    orchestrator.setCodeGenerator(codeGenerator);
    services.codeGenerator = codeGenerator;

    logger.info('CodeGenerator activated (ANTHROPIC_API_KEY set)');

    // Wire ContextBuilder with SelfScanner into SelfModificationEngine
    if (services.selfModificationEngine && services.selfScanner) {
      const selfmodCtx = new ContextBuilder(
        orchestrator.knowledgeDistiller,
        orchestrator.journal,
        patternExtractor ?? null,
        services.signalScanner ?? null,
      );
      selfmodCtx.setSelfScanner(services.selfScanner);
      services.selfModificationEngine.setContextBuilder(selfmodCtx);
    }
  }

  return {
    guardrailEngine,
    causalPlanner,
    researchRoadmap,
    creativeEngine,
    telegramBot,
    discordBot,
    patternExtractor,
    conversationMemory,
    browserAgent,
    brainBot,
  };
}
