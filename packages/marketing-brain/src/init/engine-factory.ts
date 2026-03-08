/**
 * Intelligence engines factory — extracted from MarketingCore.start() (Sessions 55-76).
 * Pure extraction, no logic changes. Split into 6 independent try-catch groups.
 */
import type Database from 'better-sqlite3';
import type { Services } from '../ipc/router.js';
import { getLogger } from '../utils/logger.js';
import {
  RAGEngine, RAGIndexer, KnowledgeGraphEngine, FactExtractor,
  SemanticCompressor, FeedbackEngine, ToolTracker, ToolPatternAnalyzer,
  ProactiveEngine, UserModel,
  GuardrailEngine, CausalPlanner, CausalGraph,
  GoalEngine, ResearchRoadmap, runRoadmapMigration,
  CreativeEngine, runCreativeMigration,
  ActionBridgeEngine, runActionBridgeMigration,
  createContentHandler, createCreativeSeedHandler, createAdjustParameterHandler,
  AutoPublisher, ContentForge, runContentForgeMigration,
  CodeForge, runCodeForgeMigration,
  StrategyForge, runStrategyForgeMigration,
  CrossBrainSignalRouter, runSignalRouterMigration,
  FeedbackRouter, runFeedbackRouterMigration,
} from '@timmeck/brain-core';
import type { CrossBrainNotifier } from '@timmeck/brain-core';

export interface IntelligenceDeps {
  db: Database.Database;
  services: Services;
  notifier: CrossBrainNotifier | null;
}

export function createIntelligenceEngines(deps: IntelligenceDeps): void {
  const { db, services, notifier } = deps;
  const logger = getLogger();

  // Group 1: RAG + KG + Compressor
  let ragEngine: RAGEngine | null = null;
  let knowledgeGraph: KnowledgeGraphEngine | null = null;
  try {
    ragEngine = new RAGEngine(db, { brainName: 'marketing-brain' });
    const ragIndexer = new RAGIndexer(db);
    ragIndexer.setRAGEngine(ragEngine);
    services.ragEngine = ragEngine;
    services.ragIndexer = ragIndexer;

    knowledgeGraph = new KnowledgeGraphEngine(db, { brainName: 'marketing-brain' });
    const factExtractor = new FactExtractor(db, { brainName: 'marketing-brain' });
    services.knowledgeGraph = knowledgeGraph;
    services.factExtractor = factExtractor;

    const semanticCompressor = new SemanticCompressor(db, { brainName: 'marketing-brain' });
    semanticCompressor.setRAGEngine(ragEngine);
    services.semanticCompressor = semanticCompressor;

    logger.info('Intelligence Group 1 active (RAG, KG, Compressor)');
  } catch (err) {
    logger.warn(`Intelligence Group 1 failed (RAG/KG/Compressor): ${(err as Error).message}`);
  }

  // Group 2: Feedback + ToolTracker + Proactive + UserModel
  try {
    const feedbackEngine = new FeedbackEngine(db, { brainName: 'marketing-brain' });
    services.feedbackEngine = feedbackEngine;

    const toolTracker = new ToolTracker(db, { brainName: 'marketing-brain' });
    const toolPatternAnalyzer = new ToolPatternAnalyzer(db);
    services.toolTracker = toolTracker;
    services.toolPatternAnalyzer = toolPatternAnalyzer;

    const proactiveEngine = new ProactiveEngine(db, { brainName: 'marketing-brain' });
    services.proactiveEngine = proactiveEngine;

    const userModel = new UserModel(db, { brainName: 'marketing-brain' });
    services.userModel = userModel;

    logger.info('Intelligence Group 2 active (Feedback, ToolTracker, Proactive, UserModel)');
  } catch (err) {
    logger.warn(`Intelligence Group 2 failed (Feedback/Tools/UserModel): ${(err as Error).message}`);
  }

  // Group 3: Guardrails + Causal + Goals + Roadmap + Creative
  let goalEngine: GoalEngine | null = null;
  try {
    const guardrailEngine = new GuardrailEngine(db, { brainName: 'marketing-brain' });
    services.guardrailEngine = guardrailEngine;

    const causalGraph = new CausalGraph(db);
    const causalPlanner = new CausalPlanner(causalGraph);
    services.causalPlanner = causalPlanner;

    goalEngine = new GoalEngine(db, { brainName: 'marketing-brain' });
    services.goalEngine = goalEngine;
    runRoadmapMigration(db);
    const researchRoadmap = new ResearchRoadmap(db, goalEngine);
    services.researchRoadmap = researchRoadmap;

    runCreativeMigration(db);
    const creativeEngine = new CreativeEngine(db, { brainName: 'marketing-brain' });
    services.creativeEngine = creativeEngine;

    logger.info('Intelligence Group 3 active (Guardrails, Causal, Goals, Roadmap, Creative)');
  } catch (err) {
    logger.warn(`Intelligence Group 3 failed (Guardrails/Goals/Creative): ${(err as Error).message}`);
  }

  // Group 4: ActionBridge + ContentForge + CodeForge + StrategyForge
  let actionBridge: ActionBridgeEngine | null = null;
  let contentForge: ContentForge | null = null;
  try {
    runActionBridgeMigration(db);
    actionBridge = new ActionBridgeEngine(db, { brainName: 'marketing-brain' });
    services.actionBridge = actionBridge;

    runContentForgeMigration(db);
    contentForge = new ContentForge(db, { brainName: 'marketing-brain' });
    contentForge.setActionBridge(actionBridge);
    if (services.socialService) {
      const social = services.socialService;
      contentForge.setSocialService({ post: async (platform: string, content: string) => { const result = await social.publish(platform, { text: content }); return { id: result.postId ?? 'unknown' }; } });
    }
    services.contentForge = contentForge;

    actionBridge.registerHandler('publish_content', createContentHandler({
      publishNow: (pieceId: number) => contentForge!.publishNow(pieceId),
      getPiece: (id: number) => contentForge!.getPiece(id),
    }));
    logger.info('Registered publish_content handler → ContentForge');

    // Register creative_seed handler → CreativeEngine.crossPollinate()
    if (services.creativeEngine) {
      const creative = services.creativeEngine;
      actionBridge.registerHandler('creative_seed', createCreativeSeedHandler({
        pollinate: (_topic, _domains) => {
          const insights = creative.crossPollinate();
          return {
            ideas: insights.map(i => ({ title: i.insight ?? 'untitled', score: i.noveltyScore ?? 0.5 })),
          };
        },
      }));
      logger.info('Registered creative_seed handler → CreativeEngine');
    }

    const autoPublisher = new AutoPublisher(contentForge);
    autoPublisher.start();
    services.autoPublisher = autoPublisher;

    runCodeForgeMigration(db);
    const codeForge = new CodeForge(db, { brainName: 'marketing-brain' });
    codeForge.setActionBridge(actionBridge);
    if (services.guardrailEngine) codeForge.setGuardrailEngine(services.guardrailEngine);
    services.codeForge = codeForge;

    runStrategyForgeMigration(db);
    const strategyForge = new StrategyForge(db, { brainName: 'marketing-brain' });
    strategyForge.setActionBridge(actionBridge);
    services.strategyForge = strategyForge;

    logger.info('Intelligence Group 4 active (ActionBridge, ContentForge, CodeForge, StrategyForge)');
  } catch (err) {
    logger.warn(`Intelligence Group 4 failed (ActionBridge/Forges): ${(err as Error).message}`);
  }

  // Group 5: SignalRouter
  try {
    runSignalRouterMigration(db);
    const signalRouter = new CrossBrainSignalRouter(db, 'marketing-brain');
    if (notifier) signalRouter.setNotifier(notifier);

    // On trade signal → generate content from trend
    signalRouter.onSignal('trade_signal', (signal) => {
      const symbol = (signal.payload.symbol as string) ?? 'unknown';
      const direction = (signal.payload.direction as string) ?? 'neutral';
      if (contentForge) {
        contentForge.generateFromTrend({ name: symbol, description: `${direction} signal from trading-brain`, category: 'crypto' });
      }
      logger.info(`[signal-router] Generated content from trade signal: ${symbol} ${direction}`);
    });

    // On research_insight → generate content from insight
    signalRouter.onSignal('research_insight', (signal) => {
      const topic = (signal.payload.topic as string) ?? 'unknown';
      if (contentForge) {
        contentForge.generateFromTrend({ name: topic, description: `Research insight from ${signal.sourceBrain}: ${signal.payload.summary ?? ''}`, category: 'research' });
      }
      logger.info(`[signal-router] Generated content from research insight: ${topic}`);
    });

    services.signalRouter = signalRouter;
    logger.info('Intelligence Group 5 active (SignalRouter)');
  } catch (err) {
    logger.warn(`Intelligence Group 5 failed (SignalRouter): ${(err as Error).message}`);
  }

  // Group 6: FeedbackRouter
  try {
    runFeedbackRouterMigration(db);
    const feedbackRouter = new FeedbackRouter(db);
    if (actionBridge) {
      feedbackRouter.setActionHandler(async (action) => {
        actionBridge!.propose({
          source: 'feedback-router' as const,
          type: (action.type === 'creative_seed' ? 'creative_seed' : 'adjust_parameter') as 'adjust_parameter',
          title: `Feedback: ${action.type} from ${action.source}`,
          payload: action.payload,
          confidence: action.confidence,
        });
      });
    }
    // AB test winners
    if (services.abTest) {
      const abTestService = services.abTest;
      feedbackRouter.addSource({
        name: 'ab-test',
        fetch: () => {
          const completed = abTestService.listByStatus('completed', 10);
          return completed.map((test) => {
            const result = abTestService.getStatus(test.id);
            return {
              source: 'ab-test',
              type: 'ab_winner' as const,
              data: { winner: result.winner, metric: test.metric, testId: test.id },
              confidence: result.significance ?? 0,
            };
          });
        },
      });
    }
    // Competitor insights
    if (services.competitor) {
      const competitorService = services.competitor;
      feedbackRouter.addSource({
        name: 'competitor',
        fetch: () => {
          const comps = competitorService.listCompetitors();
          return comps.slice(0, 5).map((c) => {
            const comparison = competitorService.compareWithSelf(c.id);
            return {
              source: 'competitor',
              type: 'competitor_insight' as const,
              data: { verdict: comparison.verdict, competitorId: c.id },
              confidence: 0.6,
            };
          });
        },
      });
    }
    services.feedbackRouter = feedbackRouter;
    logger.info('Intelligence Group 6 active (FeedbackRouter)');
  } catch (err) {
    logger.warn(`Intelligence Group 6 failed (FeedbackRouter): ${(err as Error).message}`);
  }
}
