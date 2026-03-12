/**
 * Command Center Dashboard setup — extracted from BrainCore.start() section 11f.
 * Pure extraction, no logic changes.
 */
import { CommandCenterServer } from '@timmeck/brain-core';
import type { CrossBrainClient, CrossBrainCorrelator, EcosystemService, WatchdogService, PluginRegistry, BorgSyncEngine, ThoughtStream, EmotionalModel } from '@timmeck/brain-core';
import type { Services } from '../ipc/router.js';
import { renderMarkdown } from '../cli/commands/report.js';

export interface DashboardDeps {
  services: Services;
  crossBrain: CrossBrainClient;
  ecosystemService: EcosystemService;
  correlator: CrossBrainCorrelator;
  watchdog: WatchdogService;
  pluginRegistry: PluginRegistry;
  borgSync: BorgSyncEngine;
  thoughtStream: ThoughtStream;
  debateEngine: { getStatus(): unknown; listDebates(limit: number): unknown[]; getChallengeHistory(limit: number): unknown[]; getMostVulnerable(limit: number): unknown[] } | null;
}

export function createCommandCenter(deps: DashboardDeps): CommandCenterServer {
  const { services, crossBrain, ecosystemService, correlator, watchdog, pluginRegistry, borgSync, thoughtStream, debateEngine } = deps;

  return new CommandCenterServer({
    port: 7790,
    selfName: 'brain',
    crossBrain,
    ecosystemService,
    correlator,
    watchdog,
    pluginRegistry,
    borgSync,
    thoughtStream,
    getLLMStats: () => services.llmService?.getStats() ?? null,
    getLLMHistory: (hours: number) => services.llmService?.getUsageHistory(hours) ?? [],
    getErrors: () => {
      const errors = services.error?.query({ limit: 20 }) ?? [];
      const summary = services.analytics?.getSummary() ?? null;
      return { errors, summary };
    },
    getSelfModStatus: () => services.selfModificationEngine?.getStatus() ?? null,
    getSelfModHistory: (limit = 10) => services.selfModificationEngine?.getHistory(limit) ?? [],
    selfmodApprove: (id: number) => services.selfModificationEngine?.approveModification(id),
    selfmodReject: (id: number, notes?: string) => services.selfModificationEngine?.rejectModification(id, notes),
    getMissions: () => services.missionEngine?.getStatus() ?? null,
    getMissionList: (status?: string, limit = 20) => services.missionEngine?.listMissions(status as never, limit) ?? [],
    getKnowledgeStats: () => {
      const timeSeries = services.analytics?.getTimeSeries(undefined, 30) ?? [];
      const summary = services.analytics?.getSummary();
      const kgFacts = services.knowledgeGraph?.getStatus()?.totalFacts ?? 0;
      const selfModStatus = services.selfModificationEngine?.getStatus();
      return {
        totals: {
          principles: kgFacts + (summary?.rules?.active ?? 0),
          hypotheses: summary?.insights?.active ?? 0,
          experiments: (selfModStatus?.totalModifications ?? 0) + (summary?.antipatterns?.total ?? 0),
          solutions: (summary?.solutions?.total ?? 0) + (selfModStatus?.byStatus?.['applied'] ?? 0),
        },
        timeSeries,
      };
    },
    getRepoAbsorberStatus: () => services.repoAbsorber?.getStatus() ?? null,
    getRepoAbsorberHistory: (limit = 10) => services.repoAbsorber?.getHistory(limit) ?? [],
    toggleAutonomousResearch: (enabled) => {
      if (enabled) {
        services.autonomousResearchLoop?.updateConfig({ enabled: true });
        services.autonomousResearchLoop?.start();
      } else {
        services.autonomousResearchLoop?.updateConfig({ enabled: false });
        services.autonomousResearchLoop?.stop();
      }
    },
    getIntelligenceStats: () => ({
      rag: services.ragEngine?.getStatus() ?? null,
      ragIndexer: services.ragIndexer?.getStatus() ?? null,
      kg: services.knowledgeGraph?.getStatus() ?? null,
      contradictionResolver: services.contradictionResolver?.getStatus() ?? null,
      feedback: services.feedbackEngine?.getStats() ?? null,
      toolStats: services.toolTracker?.getToolStats() ?? [],
      proactive: services.proactiveEngine?.getStatus() ?? null,
      userModel: services.userModel?.getStatus() ?? null,
      userProfile: services.userModel?.getProfile() ?? null,
      goals: services.goalEngine ? (() => {
        const status = services.goalEngine.getStatus();
        const activeGoals = services.goalEngine.listGoals('active');
        const progressList = activeGoals.map(g => ({
          ...g,
          progress: services.goalEngine!.getProgress(g.id!),
        }));
        return { ...status, progressList };
      })() : null,
      recommender: services.featureRecommender ? {
        ...services.featureRecommender.getStatus(),
        wishlist: services.featureRecommender.getWishlist()
          .filter(w => w.status !== 'satisfied' && w.status !== 'dismissed'),
        connections: services.featureRecommender.getConnections(),
      } : null,
      checkpoints: services.checkpointManager?.getStatus() ?? null,
      traces: services.traceCollector?.getStatus() ?? null,
      benchmark: services.benchmarkSuite?.getStatus() ?? null,
      trainer: services.agentTrainer?.getStatus() ?? null,
      toolScoping: services.toolScopeManager?.getStatus() ?? null,
      marketplace: services.pluginMarketplace?.getStatus() ?? null,
      sandbox: services.codeSandbox?.getStatus() ?? null,
      autonomousResearch: services.autonomousResearchLoop?.getStatus() ?? null,
    }),
    getEmotionalStatus: () => {
      const mood = (services.emotionalModel as EmotionalModel)?.getMood?.();
      return mood ?? { mood: 'reflective', score: 0.5, valence: 0, arousal: 0, dimensions: {} };
    },
    getGuardrailHealth: () => services.guardrailEngine?.checkHealth() ?? null,
    getRoadmaps: () => services.researchRoadmap?.listRoadmaps() ?? [],
    getCreativeInsights: () => services.creativeEngine?.getInsights(20) ?? [],
    getActionBridgeStatus: () => services.actionBridge?.getStatus() ?? null,
    getContentForgeStatus: () => services.contentForge?.getStatus() ?? null,
    getStrategyForgeStatus: () => services.strategyForge?.getStatus() ?? null,
    getSignalRouterStatus: () => services.signalRouter?.getStatus() ?? null,
    getDesires: () => services.orchestrator?.getDesires() ?? [],
    getTeachingStatus: () => services.teachingProtocol?.getStatus() ?? null,
    getTeachingHistory: (limit = 20) => services.teachingProtocol?.getHistory(undefined, limit) ?? [],
    getCalibrationStatus: () => services.predictionEngine?.getCalibration() ?? null,
    getGovernanceStatus: () => {
      const registry = services.engineRegistry?.getStatus() ?? null;
      const loops = services.loopDetector?.getStatus() ?? null;
      const actions = services.governanceLayer?.getStatus() ?? null;
      const budgets = services.tokenBudgetTracker?.getStatus() ?? [];
      const cycleRates = services.cycleOutcomeTracker?.getRates(0) ?? null;
      return { registry, loops, actions, budgets, cycleRates, engineCount: registry?.totalEngines ?? 0, loopCount: loops?.activeDetections ?? 0, actionCount: actions?.activeActions ?? 0 };
    },
    chatMessage: async (sessionId: string, content: string) => services.chatEngine?.processMessage(sessionId, content) ?? null,
    chatHistory: (sessionId: string) => services.chatEngine?.getHistory(sessionId) ?? [],
    chatStatus: () => services.chatEngine?.getStatus() ?? null,
    getDebateStatus: () => debateEngine?.getStatus() ?? null,
    getDebateList: (limit = 10) => debateEngine?.listDebates(limit) ?? [],
    getChallengeHistory: (limit = 20) => debateEngine?.getChallengeHistory(limit) ?? [],
    getChallengeVulnerable: (limit = 5) => debateEngine?.getMostVulnerable(limit) ?? [],
    getReport: async () => {
      const safe = <T>(fn: () => T): T | null => { try { return fn(); } catch { return null; } };
      const analytics = safe(() => services.analytics?.getSummary() ?? null);
      const desires = safe(() => services.orchestrator?.getDesires() ?? []);
      const suggestions = safe(() => services.orchestrator?.generateSelfImprovementSuggestions() ?? []);
      const pending = safe(() => services.selfModificationEngine?.getPending() ?? []);
      const hypothesisSummary = safe(() => services.hypothesis?.getSummary() ?? null);
      const confirmedHypotheses = safe(() => services.hypothesis?.list('confirmed') ?? []);
      const milestones = safe(() => services.journal?.getMilestones() ?? []);
      const journalEntries = safe(() => services.journal?.getEntries() ?? []);
      const predictSummary = safe(() => services.predictionEngine?.getSummary() ?? null);
      const predictAccuracy = safe(() => services.predictionEngine?.getAccuracy() ?? null);
      const transferStatus = safe(() => services.transferEngine?.getStatus() ?? null);
      const transferHistory: null = null; // TransferEngine has no getHistory — use status only
      const borgStatus = safe(() => deps.borgSync?.getStatus() ?? null);
      const experimentStatus = safe(() => services.autoExperimentEngine?.getStatus() ?? null);
      const governanceStatus = safe(() => {
        const registry = services.engineRegistry?.getStatus() ?? null;
        const loops = services.loopDetector?.getStatus() ?? null;
        const actions = services.governanceLayer?.getStatus() ?? null;
        return { registry, loops, actions, activeEngines: registry?.totalEngines ?? 0, throttled: actions?.activeActions ?? 0, isolated: 0 };
      });
      return renderMarkdown({
        analytics, desires, suggestions, pending,
        hypothesisSummary, confirmedHypotheses,
        milestones, journalEntries,
        predictSummary, predictAccuracy,
        transferStatus, transferHistory, borgStatus,
        experimentStatus, governanceStatus,
      });
    },
    getProgressStats: () => ({
      healthScore: services.analytics?.computeHealthScore() ?? 0,
      cycleRates: services.cycleOutcomeTracker?.getRates(0) ?? null,
      cycleHistory: services.cycleOutcomeTracker?.getRateHistory(30) ?? [],
      knowledge: {
        summary: services.knowledgeDistiller?.getSummary() ?? null,
        evolution: services.knowledgeDistiller?.getEvolution(undefined, 10) ?? [],
      },
      hypotheses: {
        summary: services.hypothesis?.getSummary() ?? null,
        survival: services.hypothesis?.getSurvivalMetrics() ?? null,
      },
      predictions: services.predictionEngine?.getSummary() ?? null,
      goals: services.goalEngine?.getStatus() ?? null,
      memory: services.conversationMemory?.getStatus() ?? null,
      tableSizes: services.retentionEngine?.getTableSizes() ?? [],
      milestones: services.journal?.getMilestones(5) ?? [],
      journalSummary: services.journal?.getSummary() ?? null,
    }),
    triggerAction: async (action: string) => {
      switch (action) {
        case 'learning-cycle':
          services.learning?.runCycle();
          return { triggered: true };
        case 'health-check':
          return services.analytics?.getSummary() ?? {};
        default:
          return { triggered: false, message: `Unknown action: ${action}` };
      }
    },
  });
}
