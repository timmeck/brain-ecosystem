/**
 * Intelligence engines factory — extracted from TradingCore.start() (Sessions 55-76).
 * Pure extraction, no logic changes.
 */
import type Database from 'better-sqlite3';
import type { Services } from '../ipc/router.js';
import { PortfolioOptimizer } from '../paper/portfolio-optimizer.js';
import { getLogger } from '../utils/logger.js';
import {
  RAGEngine, RAGIndexer, KnowledgeGraphEngine, FactExtractor,
  SemanticCompressor, FeedbackEngine, ToolTracker, ToolPatternAnalyzer,
  ProactiveEngine, UserModel, CodeHealthMonitor,
  TeachingProtocol, Curriculum, ConsensusEngine, ActiveLearner, RepoAbsorber,
  GuardrailEngine, CausalPlanner, ResearchRoadmap, runRoadmapMigration,
  CreativeEngine, runCreativeMigration,
  ActionBridgeEngine, runActionBridgeMigration, createTradeHandler,
  ContentForge, runContentForgeMigration,
  CodeForge, runCodeForgeMigration,
  StrategyForge, runStrategyForgeMigration,
  CrossBrainSignalRouter, runSignalRouterMigration,
  StrategyMutator,
} from '@timmeck/brain-core';
import type {
  ResearchOrchestrator, AutonomousResearchScheduler, ThoughtStream,
  LLMService, GoalEngine, ParameterRegistry, CrossBrainNotifier,
} from '@timmeck/brain-core';
import type { PaperEngine } from '../paper/paper-engine.js';

export interface IntelligenceDeps {
  db: Database.Database;
  services: Services;
  orchestrator: ResearchOrchestrator;
  researchScheduler: AutonomousResearchScheduler;
  thoughtStream: ThoughtStream;
  llmService: LLMService;
  goalEngine: GoalEngine;
  parameterRegistry: ParameterRegistry;
  paperEngine: PaperEngine | null;
  notifier: CrossBrainNotifier | null;
}

export function createIntelligenceEngines(deps: IntelligenceDeps): void {
  const { db, services, orchestrator, researchScheduler, llmService, thoughtStream, goalEngine, parameterRegistry, notifier } = deps;
  const logger = getLogger();

  // ── Intelligence Upgrade (Sessions 55-65) ──
  const ragEngine = new RAGEngine(db, { brainName: 'trading-brain' });
  const ragIndexer = new RAGIndexer(db);
  ragIndexer.setRAGEngine(ragEngine);
  services.ragEngine = ragEngine;
  services.ragIndexer = ragIndexer;

  const knowledgeGraph = new KnowledgeGraphEngine(db, { brainName: 'trading-brain' });
  const factExtractor = new FactExtractor(db, { brainName: 'trading-brain' });
  services.knowledgeGraph = knowledgeGraph;
  services.factExtractor = factExtractor;

  const semanticCompressor = new SemanticCompressor(db, { brainName: 'trading-brain' });
  semanticCompressor.setRAGEngine(ragEngine);
  services.semanticCompressor = semanticCompressor;

  const feedbackEngine = new FeedbackEngine(db, { brainName: 'trading-brain' });
  services.feedbackEngine = feedbackEngine;

  const toolTracker = new ToolTracker(db, { brainName: 'trading-brain' });
  const toolPatternAnalyzer = new ToolPatternAnalyzer(db);
  services.toolTracker = toolTracker;
  services.toolPatternAnalyzer = toolPatternAnalyzer;

  const proactiveEngine = new ProactiveEngine(db, { brainName: 'trading-brain' });
  proactiveEngine.setThoughtStream(thoughtStream);
  services.proactiveEngine = proactiveEngine;

  const userModel = new UserModel(db, { brainName: 'trading-brain' });
  services.userModel = userModel;

  const codeHealthMonitor = new CodeHealthMonitor(db, { brainName: 'trading-brain' });
  codeHealthMonitor.setThoughtStream(thoughtStream);
  services.codeHealthMonitor = codeHealthMonitor;

  const teachingProtocol = new TeachingProtocol(db, { brainName: 'trading-brain' });
  if (notifier) teachingProtocol.setNotifier(notifier);
  services.teachingProtocol = teachingProtocol;
  const curriculum = new Curriculum(db);
  services.curriculum = curriculum;

  const consensusEngine = new ConsensusEngine(db, { brainName: 'trading-brain' });
  services.consensusEngine = consensusEngine;

  const activeLearner = new ActiveLearner(db, { brainName: 'trading-brain' });
  activeLearner.setThoughtStream(thoughtStream);
  services.activeLearner = activeLearner;

  const repoAbsorber = new RepoAbsorber(db);
  repoAbsorber.setThoughtStream(thoughtStream);
  repoAbsorber.setRAGEngine(ragEngine);
  repoAbsorber.setKnowledgeGraph(knowledgeGraph);
  services.repoAbsorber = repoAbsorber;

  // GuardrailEngine — self-protection: parameter bounds, circuit breaker, health checks
  const guardrailEngine = new GuardrailEngine(db, { brainName: 'trading-brain' });
  guardrailEngine.setParameterRegistry(parameterRegistry);
  if (goalEngine) guardrailEngine.setGoalEngine(goalEngine);
  guardrailEngine.setThoughtStream(thoughtStream);
  services.guardrailEngine = guardrailEngine;

  // CausalPlanner — root-cause diagnosis + intervention planning
  const causalPlanner = new CausalPlanner(researchScheduler.causalGraph);
  causalPlanner.setGoalEngine(goalEngine);
  services.causalPlanner = causalPlanner;

  // ResearchRoadmap — goal dependencies + multi-step research plans
  runRoadmapMigration(db);
  const researchRoadmap = new ResearchRoadmap(db, goalEngine);
  researchRoadmap.setThoughtStream(thoughtStream);
  services.researchRoadmap = researchRoadmap;

  // CreativeEngine — cross-domain idea generation
  runCreativeMigration(db);
  const creativeEngine = new CreativeEngine(db, { brainName: 'trading-brain' });
  creativeEngine.setKnowledgeDistiller(orchestrator.knowledgeDistiller);
  creativeEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
  if (llmService) creativeEngine.setLLMService(llmService);
  creativeEngine.setThoughtStream(thoughtStream);
  services.creativeEngine = creativeEngine;

  // ActionBridge — risk-assessed auto-execution
  runActionBridgeMigration(db);
  const actionBridge = new ActionBridgeEngine(db, { brainName: 'trading-brain' });
  services.actionBridge = actionBridge;

  // Register execute_trade handler → StrategyForge proposals trigger PaperEngine
  const paperEngineRef = deps.paperEngine;
  const paperServiceRef = services.paper;
  if (paperEngineRef) {
    actionBridge.registerHandler('execute_trade', createTradeHandler({
      runCycle: () => paperEngineRef.runCycle(),
      getPortfolio: paperServiceRef ? () => paperServiceRef.getPortfolio() : undefined,
    }));
    logger.info('Registered execute_trade handler → PaperEngine');
  }

  // ContentForge — autonomous content pipeline
  runContentForgeMigration(db);
  const contentForge = new ContentForge(db, { brainName: 'trading-brain' });
  if (llmService) contentForge.setLLMService(llmService);
  contentForge.setActionBridge(actionBridge);
  services.contentForge = contentForge;

  // CodeForge — pattern extraction & code generation
  runCodeForgeMigration(db);
  const codeForge = new CodeForge(db, { brainName: 'trading-brain' });
  codeForge.setActionBridge(actionBridge);
  if (guardrailEngine) codeForge.setGuardrailEngine(guardrailEngine);
  services.codeForge = codeForge;

  // StrategyForge — autonomous strategy creation & execution
  runStrategyForgeMigration(db);
  const strategyForge = new StrategyForge(db, { brainName: 'trading-brain' });
  strategyForge.setActionBridge(actionBridge);
  strategyForge.setKnowledgeDistiller(orchestrator.knowledgeDistiller);
  services.strategyForge = strategyForge;

  // Strategy Bootstrap Check — flag if positions exist but no strategies
  try {
    const activeStrategies = strategyForge.getStatus()?.active ?? 0;
    const openPositions = services.paper?.getStatus()?.openPositions ?? 0;
    if (openPositions > 0 && activeStrategies === 0) {
      logger.warn('[strategy-bootstrap] Paper positions exist but 0 active strategies — bootstrap needed');
    }
  } catch { /* best effort */ }

  // StrategyMutator — evolutionary strategy operations
  const strategyMutator = new StrategyMutator(db);
  services.strategyMutator = strategyMutator;

  // PortfolioOptimizer — dynamic position sizing + health checks
  const portfolioOptimizer = new PortfolioOptimizer(db);
  services.portfolioOptimizer = portfolioOptimizer;

  // Wire intelligence engines into orchestrator
  orchestrator.setFactExtractor(factExtractor);
  orchestrator.setKnowledgeGraph(knowledgeGraph);
  orchestrator.setSemanticCompressor(semanticCompressor);
  orchestrator.setProactiveEngine(proactiveEngine);
  orchestrator.setActiveLearner(activeLearner);
  orchestrator.setRAGIndexer(ragIndexer);
  orchestrator.setTeachingProtocol(teachingProtocol);
  orchestrator.setCodeHealthMonitor(codeHealthMonitor);
  orchestrator.setRepoAbsorber(repoAbsorber);
  orchestrator.setGuardrailEngine(guardrailEngine);
  orchestrator.setCausalPlanner(causalPlanner);
  orchestrator.setResearchRoadmap(researchRoadmap);
  orchestrator.setCreativeEngine(creativeEngine);
  orchestrator.setActionBridge(actionBridge);
  orchestrator.setContentForge(contentForge);
  orchestrator.setCodeForge(codeForge);
  orchestrator.setStrategyForge(strategyForge);

  // CrossBrainSignalRouter — bidirectional signal routing
  runSignalRouterMigration(db);
  const signalRouter = new CrossBrainSignalRouter(db, 'trading-brain');
  if (notifier) signalRouter.setNotifier(notifier);
  // Handle incoming engagement signals → log for correlation
  signalRouter.onSignal('engagement_signal', (signal) => {
    const topic = (signal.payload.topic as string) ?? 'unknown';
    logger.info(`[signal-router] Received engagement signal: ${topic} from ${signal.sourceBrain}`);
  });

  services.signalRouter = signalRouter;
  orchestrator.setSignalRouter(signalRouter);

  logger.info('Intelligence upgrade active (RAG, KG, Feedback, ToolTracker, UserModel, Proactive, CodeHealth, Teaching, Consensus, ActiveLearning, RepoAbsorber, Guardrails, CausalPlanner, Roadmap, Creative, ActionBridge, ContentForge, CodeForge, StrategyForge, SignalRouter)');
}
