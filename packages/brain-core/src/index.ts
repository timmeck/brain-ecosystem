// ── Types ──────────────────────────────────────────────────
export type { IpcMessage } from './types/ipc.types.js';

// ── Utils ──────────────────────────────────────────────────
export { sha256 } from './utils/hash.js';
export { createLogger, getLogger, resetLogger } from './utils/logger.js';
export type { LoggerOptions } from './utils/logger.js';
export { normalizePath, getDataDir, getPipeName } from './utils/paths.js';
export { TypedEventBus } from './utils/events.js';
export { retryWithBackoff } from './utils/retry.js';
export type { RetryOptions } from './utils/retry.js';
export { BatchQueue } from './utils/batch-queue.js';
export type { BatchQueueOptions } from './utils/batch-queue.js';

// ── DB ─────────────────────────────────────────────────────
export { createConnection } from './db/connection.js';

// ── IPC ────────────────────────────────────────────────────
export { encodeMessage, MessageDecoder } from './ipc/protocol.js';
export { IpcServer } from './ipc/server.js';
export type { IpcRouter } from './ipc/server.js';
export { IpcClient } from './ipc/client.js';
export { validateParams, withValidation } from './ipc/validation.js';
export type { ValidationOptions } from './ipc/validation.js';
export { IpcError, ValidationError, NotFoundError, TimeoutError, ServiceUnavailableError } from './ipc/errors.js';

// ── MCP ────────────────────────────────────────────────────
export { startMcpServer } from './mcp/server.js';
export type { McpServerOptions } from './mcp/server.js';
export { McpHttpServer } from './mcp/http-server.js';
export type { McpHttpServerOptions } from './mcp/http-server.js';

// ── CLI ────────────────────────────────────────────────────
export { c, baseIcons, header, keyValue, statusBadge, progressBar, divider, table, stripAnsi } from './cli/colors.js';

// ── API ────────────────────────────────────────────────────
export { BaseApiServer } from './api/server.js';
export type { ApiServerOptions, RouteDefinition } from './api/server.js';
export { RateLimiter, readBodyWithLimit, applySecurityHeaders } from './api/middleware.js';
export type { RateLimitConfig, SizeLimitConfig, SecurityHeadersConfig } from './api/middleware.js';

// ── Math ───────────────────────────────────────────────────
export { wilsonScore } from './math/wilson-score.js';
export { timeDecayFactor } from './math/time-decay.js';

// ── Config ─────────────────────────────────────────────────
export { deepMerge, loadConfigFile } from './config/loader.js';

// ── Synapses ──────────────────────────────────────────────
export type {
  NodeRef, SynapseRecord, ActivationResult, PathNode, SynapsePath,
  NetworkStats, HebbianConfig, DecayConfig, SynapseRepoInterface,
} from './synapses/types.js';
export type { SynapseManagerConfig } from './synapses/synapse-manager.js';
export { strengthen, weaken } from './synapses/hebbian.js';
export { decayAll } from './synapses/decay.js';
export { spreadingActivation } from './synapses/activation.js';
export { findPath } from './synapses/pathfinder.js';
export { BaseSynapseManager } from './synapses/synapse-manager.js';

// ── Engines ───────────────────────────────────────────────
export { BaseLearningEngine } from './learning/base-engine.js';
export type { LearningEngineConfig } from './learning/base-engine.js';
export { BaseResearchEngine } from './research/base-engine.js';
export type { ResearchEngineConfig } from './research/base-engine.js';

// ── Embeddings ──────────────────────────────────────────
export { BaseEmbeddingEngine } from './embeddings/engine.js';
export type { EmbeddingConfig } from './embeddings/engine.js';

// ── Memory ───────────────────────────────────────────────
export type {
  MemoryRecord, SessionRecord, MemoryCategory, MemorySource, SessionOutcome,
  RememberInput, RecallInput, StartSessionInput, EndSessionInput,
  MemoryRepoInterface, SessionRepoInterface,
  MemoryEngineConfig,
} from './memory/types.js';
export { BaseMemoryEngine } from './memory/base-memory-engine.js';

// ── Dashboard ────────────────────────────────────────────
export { DashboardServer } from './dashboard/server.js';
export type { DashboardServerOptions } from './dashboard/server.js';
export { createHubDashboard } from './dashboard/hub-server.js';
export type { HubDashboardOptions } from './dashboard/hub-server.js';
export { createResearchDashboard } from './dashboard/research-server.js';
export type { ResearchDashboardOptions } from './dashboard/research-server.js';
export { CommandCenterServer } from './dashboard/command-center-server.js';
export type { CommandCenterOptions } from './dashboard/command-center-server.js';

// ── Cross-Brain ────────────────────────────────────────────
export { CrossBrainClient } from './cross-brain/client.js';
export type { BrainPeer } from './cross-brain/client.js';
export { CrossBrainNotifier } from './cross-brain/notifications.js';
export type { CrossBrainEvent } from './cross-brain/notifications.js';
export { CrossBrainSubscriptionManager } from './cross-brain/subscription.js';
export type { EventSubscription } from './cross-brain/subscription.js';
export { CrossBrainCorrelator } from './cross-brain/correlator.js';
export type { CorrelatorEvent, Correlation, EcosystemHealth, CorrelatorConfig } from './cross-brain/correlator.js';
export { BorgSyncEngine } from './cross-brain/borg-sync-engine.js';
export type { BorgDataProvider } from './cross-brain/borg-sync-engine.js';
export { DEFAULT_BORG_CONFIG } from './cross-brain/borg-types.js';
export type { BorgConfig, SyncPacket, SyncItem, SyncHistoryEntry } from './cross-brain/borg-types.js';
export { CrossBrainSignalRouter, runSignalRouterMigration } from './cross-brain/signal-router.js';
export type { CrossBrainSignal, SignalHandler } from './cross-brain/signal-router.js';

// ── Watchdog ──────────────────────────────────────────────
export { WatchdogService, createDefaultWatchdogConfig } from './watchdog/watchdog-service.js';
export type { WatchdogConfig, DaemonConfig, DaemonStatus } from './watchdog/watchdog-service.js';
export { WindowsServiceManager } from './watchdog/windows-service.js';

// ── Plugin SDK ────────────────────────────────────────────
export { PluginRegistry } from './plugin/plugin-registry.js';
export type { BrainPlugin, PluginContext, PluginToolDefinition, PluginRouteDefinition, PluginManifest, PluginRecord } from './plugin/types.js';
export { PluginMarketplace, runMarketplaceMigration } from './plugin/plugin-marketplace.js';
export type { CatalogPlugin, PluginCatalog, PluginReview, InstallRecord, CompatibilityResult, MarketplaceStatus, PluginMarketplaceConfig } from './plugin/plugin-marketplace.js';

// ── Ecosystem ──────────────────────────────────────────────
export { EcosystemService } from './ecosystem/service.js';
export type { BrainStatus, EcosystemStatus, AggregatedAnalytics } from './ecosystem/service.js';

// ── Webhooks ──────────────────────────────────────────────
export { WebhookService, runWebhookMigration } from './webhooks/service.js';
export type { WebhookConfig, WebhookRecord, DeliveryRecord, WebhookDeliveryResult } from './webhooks/service.js';

// ── Export ────────────────────────────────────────────────
export { ExportService } from './export/service.js';
export type { ExportOptions, ExportResult } from './export/service.js';

// ── Backup ────────────────────────────────────────────────
export { BackupService } from './backup/service.js';
export type { BackupConfig, BackupRecord, RestoreResult } from './backup/service.js';

// ── Autonomous Research ──────────────────────────────────
export { AutonomousResearchScheduler, runResearchDiscoveryMigration } from './research/autonomous-scheduler.js';
export type { ResearchDiscovery, ResearchCycleReport, AutonomousResearchConfig } from './research/autonomous-scheduler.js';

// ── Meta-Learning ────────────────────────────────────────
export { MetaLearningEngine, runMetaLearningMigration } from './meta-learning/engine.js';
export type { HyperParameter, LearningSnapshot, ParameterRecommendation, MetaLearningStatus } from './meta-learning/engine.js';

// ── Causal Inference ─────────────────────────────────────
export { CausalGraph, runCausalMigration } from './causal/engine.js';
export type { CausalEvent, CausalEdge, CausalPath, CausalAnalysis, CausalIntervention, StrengthEvolution } from './causal/engine.js';

// ── Hypothesis Engine ────────────────────────────────────
export { HypothesisEngine, runHypothesisMigration } from './hypothesis/engine.js';
export type { Hypothesis, HypothesisStatus, HypothesisCondition, HypothesisTestResult, Observation } from './hypothesis/engine.js';

// ── Self-Observer ───────────────────────────────────────
export { SelfObserver, runSelfObserverMigration } from './research/self-observer.js';
export type { SelfObservation, SelfInsight, ImprovementSuggestion, SelfObserverConfig, ObservationCategory, InsightType } from './research/self-observer.js';

// ── Adaptive Strategy ──────────────────────────────────
export { AdaptiveStrategyEngine, runAdaptiveStrategyMigration } from './research/adaptive-strategy.js';
export type { StrategyAdaptation, StrategyStatus, StrategyDomain, AdaptiveStrategyConfig } from './research/adaptive-strategy.js';

// ── Experiment Engine ──────────────────────────────────
export { ExperimentEngine, runExperimentMigration } from './research/experiment-engine.js';
export type { Experiment, ExperimentConclusion, ExperimentProposal, ExperimentStatus, ExperimentEngineConfig } from './research/experiment-engine.js';

// ── Cross-Domain Engine ────────────────────────────────
export { CrossDomainEngine, runCrossDomainMigration } from './research/cross-domain-engine.js';
export type { CrossDomainCorrelation, CrossDomainEvent, CrossDomainConfig } from './research/cross-domain-engine.js';

// ── Counterfactual Engine ──────────────────────────────
export { CounterfactualEngine, runCounterfactualMigration } from './research/counterfactual-engine.js';
export type { CounterfactualQuery, CounterfactualResult, InterventionImpact, CounterfactualConfig } from './research/counterfactual-engine.js';

// ── Knowledge Distiller ────────────────────────────────
export { KnowledgeDistiller, runKnowledgeDistillerMigration } from './research/knowledge-distiller.js';
export type { Principle, AntiPattern, Strategy, KnowledgePackage, KnowledgeEvolution, KnowledgeDistillerConfig } from './research/knowledge-distiller.js';

// ── Research Agenda ────────────────────────────────────
export { ResearchAgendaEngine, runAgendaMigration } from './research/agenda-engine.js';
export type { ResearchAgendaItem, AgendaItemType, AgendaConfig } from './research/agenda-engine.js';

// ── Anomaly Detective ──────────────────────────────────
export { AnomalyDetective, runAnomalyDetectiveMigration } from './research/anomaly-detective.js';
export type { Anomaly, AnomalyType, AnomalySeverity, DriftReport, AnomalyDetectiveConfig } from './research/anomaly-detective.js';

// ── Research Journal ───────────────────────────────────
export { ResearchJournal, runJournalMigration } from './research/journal.js';
export type { JournalEntry, JournalEntryType, Significance, JournalSummary, JournalConfig } from './research/journal.js';

// ── Auto-Responder ──────────────────────────────────
export { AutoResponder, runAutoResponderMigration } from './research/auto-responder.js';
export type { AutoResponse, ResponseRule, ResponseAction, AutoResponderConfig, AutoResponderStatus } from './research/auto-responder.js';

// ── Research Orchestrator ─────────────────────────────
export { ResearchOrchestrator } from './research/research-orchestrator.js';
export type { ResearchOrchestratorConfig } from './research/research-orchestrator.js';

// ── DataMiner ────────────────────────────────────────
export { DataMiner, runDataMinerMigration } from './research/data-miner.js';
export type { DataMinerAdapter, DataMinerEngines, DataMinerState, MineResult, MinedObservation, MinedCausalEvent, MinedMetric, MinedHypothesisObservation, MinedCrossDomainEvent } from './research/data-miner.js';
export { BrainDataMinerAdapter, TradingDataMinerAdapter, MarketingDataMinerAdapter, ScannerDataMinerAdapter } from './research/adapters/index.js';

// ── Bootstrap ────────────────────────────────────────
export { BootstrapService, runBootstrapMigration } from './research/bootstrap-service.js';
export type { BootstrapConfig, BootstrapEngines, BootstrapState, BootstrapResult } from './research/bootstrap-service.js';

// ── Dream Mode ──────────────────────────────────────
export { DreamEngine, runDreamMigration } from './dream/index.js';
export { DreamConsolidator } from './dream/index.js';
export type { DreamEngineConfig, DreamCycleReport, DreamStatus, DreamHistoryEntry, DreamTrigger, MemoryReplayResult, SynapsePruneResult, MemoryCompressionResult, MemoryCluster, ImportanceDecayResult, DreamRetrospective, PruningEfficiency } from './dream/index.js';

// ── Consciousness ───────────────────────────────────
export { ThoughtStream, ConsciousnessServer } from './consciousness/index.js';
export type { ConsciousnessServerOptions, Thought, ThoughtType, ThoughtSignificance, ConsciousnessConfig, ConsciousnessStatus, EngineActivity } from './consciousness/index.js';

// ── Prediction Engine ──────────────────────────────
export { PredictionEngine, runPredictionMigration } from './prediction/index.js';
export { PredictionTracker } from './prediction/index.js';
export { holtWintersForecast, ewmaForecast, calibrateConfidence } from './prediction/index.js';
export type { PredictionDomain, PredictionStatus, PredictionEngineConfig, Prediction, PredictionAccuracy, PredictionSummary, ForecastResult, PredictionInput, MetricDataPoint, CalibrationBucket } from './prediction/index.js';

// ── CodeGen ──────────────────────────────────────────────
export { CodeMiner, runCodeMinerMigration } from './codegen/index.js';
export { PatternExtractor, runPatternExtractorMigration } from './codegen/index.js';
export { ContextBuilder } from './codegen/index.js';
export { CodeGenerator, runCodeGeneratorMigration } from './codegen/index.js';
export { CodegenServer } from './codegen/index.js';
export type { CodegenServerOptions } from './codegen/index.js';
export type {
  CodeMinerConfig, RepoContent, CodeMinerSummary,
  ExtractedPattern, DependencyPattern, TechStack, ProjectStructure, ReadmePattern,
  ContextBuilderConfig, BuiltContext,
  CodeGeneratorConfig, GenerationTrigger, GenerationStatus,
  GenerationRequest, GenerationResult, GenerationRecord, CodeGeneratorSummary,
} from './codegen/index.js';
export type { SelfImprovementProposal } from './codegen/index.js';
export { RepoAbsorber } from './codegen/index.js';
export type { AbsorbResult, RepoAbsorberStatus } from './codegen/index.js';
export { FeatureExtractor } from './codegen/index.js';
export type { ExtractedFeature, FeatureCategory, FeatureExtractionResult, FeatureSearchOptions, FeatureStats } from './codegen/index.js';
export { FeatureRecommender } from './codegen/index.js';
export type { FeatureWish, FeatureConnection, RecommendationResult, FeatureRecommenderStatus } from './codegen/index.js';

// ── Attention Engine ──────────────────────────────────
export { AttentionEngine } from './attention/index.js';
export type {
  AttentionEngineConfig, AttentionScore, AttentionStatus,
  WorkContext, ContextSwitch, FocusEntry, EngineWeight,
} from './attention/index.js';

// ── Transfer Engine ──────────────────────────────────
export { TransferEngine } from './transfer/index.js';
export type {
  TransferEngineConfig, Analogy, TransferRecord,
  CrossDomainRule, TransferStatus,
  CrossBrainDialogue, DialogueStats,
} from './transfer/index.js';

// ── Narrative Engine ──────────────────────────────────
export { NarrativeEngine } from './narrative/index.js';
export type {
  NarrativeEngineConfig, NarrativeEngineDataSources,
  Narrative, Contradiction, WeeklyDigest, DigestSection,
  ConfidenceReport, ConfidenceFactor, NarrativeAnswer,
} from './narrative/index.js';

// ── Emergence Engine ──────────────────────────────────
export { EmergenceEngine, runEmergenceMigration } from './emergence/index.js';
export type {
  EmergenceEngineConfig, EmergenceDataSources,
  EmergenceEvent, EmergenceType, ComplexityMetrics,
  NetworkSnapshot, EmergenceStatus,
} from './emergence/index.js';

// ── Curiosity Engine ──────────────────────────────────
export { CuriosityEngine, runCuriosityMigration } from './curiosity/index.js';
export type {
  CuriosityEngineConfig, CuriosityDataSources,
  KnowledgeGap, GapType, CuriosityQuestion, QuestionType,
  ExplorationRecord, BanditArm, BlindSpot, CuriosityStatus, ExplorationDecision,
} from './curiosity/index.js';

// ── Debate Engine ──────────────────────────────────────
export { DebateEngine, runDebateMigration } from './debate/index.js';
export type {
  DebateEngineConfig, DebateDataSources,
  Debate, DebateStatus, DebatePerspective, DebateArgument,
  DebateSynthesis, DebateConflict, DebateEngineStatus,
  PrincipleChallenge,
} from './debate/index.js';

// ── Meta-Cognition ──────────────────────────────────────
export { ParameterRegistry, runParameterRegistryMigration } from './metacognition/index.js';
export type { ParameterDefinition, ParameterChange, ParameterSnapshot, RegisteredParameter } from './metacognition/index.js';

export { MetaCognitionLayer, runMetaCognitionMigration } from './metacognition/index.js';
export type { EngineGrade, EngineMetric, EngineReportCard, FrequencyAdjustment, MetaCognitionStatus, MetaTrend, TrendDirection, LongTermAnalysis, SeasonalPattern } from './metacognition/index.js';

export { AutoExperimentEngine, runAutoExperimentMigration } from './metacognition/index.js';
export type { AutoExperiment, AutoExperimentStatus, ExperimentCandidate, AutoExperimentEngineStatus } from './metacognition/index.js';

export { SelfTestEngine, runSelfTestMigration } from './metacognition/index.js';
export type { SelfTest, UnderstandingReport, SelfTestStatus } from './metacognition/index.js';

export { TeachEngine, runTeachEngineMigration } from './metacognition/index.js';
export type { TeachingPackage, TeachEngineStatus } from './metacognition/index.js';

export { SimulationEngine, runSimulationMigration } from './metacognition/index.js';
export type { Simulation, SimulationOutcome, SimulationStatus } from './metacognition/index.js';

export { EvolutionEngine, runEvolutionMigration } from './metacognition/index.js';
export type { EvolutionConfig, Genome, Individual, Generation, LineageEntry, EvolutionDataSources, EvolutionStatus } from './metacognition/index.js';

// ── Memory Palace ──────────────────────────────────────
export { MemoryPalace, runMemoryPalaceMigration } from './memory-palace/index.js';
export type {
  MemoryPalaceConfig, MemoryPalaceDataSources,
  NodeType, RelationType, KnowledgeConnection, KnowledgeNode, KnowledgeEdge,
  KnowledgeMap, PathStep, MemoryPalaceStats, BuildResult, MemoryPalaceStatus,
} from './memory-palace/index.js';

// ── Goal Engine ──────────────────────────────────────────
export { GoalEngine, runGoalEngineMigration } from './goals/index.js';
export type {
  GoalEngineConfig, GoalEngineDataSources,
  GoalType, GoalStatus, GoalDirection, Goal, GoalProgress, GoalProgressReport,
  GoalForecast, GoalSuggestion, GoalEngineStatus,
} from './goals/index.js';

// ── Reasoning Engine ─────────────────────────────────────
export { ReasoningEngine, runReasoningMigration } from './reasoning/index.js';
export type {
  ReasoningEngineConfig, ReasoningDataSources,
  InferenceRule, InferenceStep, InferenceChain,
  AbductiveExplanation, TemporalStep, TemporalChain,
  CounterfactualResult as ReasoningCounterfactualResult, ReasoningStatus,
} from './reasoning/index.js';

// ── Emotional Model ─────────────────────────────────────
export { EmotionalModel, runEmotionalMigration } from './emotional/index.js';
export type {
  EmotionalModelConfig, EmotionalDataSources,
  EmotionDimension, MoodType, EmotionalDimensions,
  MoodResult, MoodInfluence, EmotionalHistoryEntry, EmotionalStatus,
} from './emotional/index.js';

// ── DataScout ──────────────────────────────────────────
export { DataScout, runDataScoutMigration, GitHubTrendingAdapter, NpmStatsAdapter, HackerNewsAdapter } from './research/data-scout.js';
export type { ScoutDiscovery, ScoutAdapter, DataScoutStatus } from './research/data-scout.js';
export { BraveSearchAdapter, JinaReaderAdapter } from './research/adapters/web-research-adapter.js';
export { PlaywrightAdapter } from './research/adapters/playwright-adapter.js';
export { FirecrawlAdapter } from './research/adapters/firecrawl-adapter.js';
export type { FirecrawlConfig } from './research/adapters/firecrawl-adapter.js';

// ── Research Missions ─────────────────────────────────
export { ResearchMissionEngine, runMissionMigration } from './missions/mission-engine.js';
export type { Mission, MissionPhase, MissionSource, MissionStatus, MissionDepth } from './missions/mission-engine.js';

// ── Unified Dashboard ──────────────────────────────────
export { UnifiedDashboardServer } from './unified/index.js';
export type { UnifiedDashboardOptions } from './unified/index.js';

// ── Self-Scanner ─────────────────────────────────────────
export { SelfScanner, runSelfScannerMigration } from './self-scanner/index.js';
export type {
  SelfScannerConfig, SourceFile, CodeEntity, EntityType,
  EntityFilter, ModuleMapEntry, SelfScanResult, SelfScannerStatus,
} from './self-scanner/index.js';

// ── Self-Modification ────────────────────────────────────
export { SelfModificationEngine, runSelfModificationMigration } from './self-modification/index.js';
export type {
  SelfModificationConfig, ModificationStatus, FileDiff,
  SelfModification, SelfModificationStatus, ProposalMeta,
} from './self-modification/index.js';

// ── Concept Abstraction ─────────────────────────────────
export { ConceptAbstraction, runConceptAbstractionMigration } from './concept-abstraction/index.js';
export type {
  ConceptAbstractionConfig, ConceptDataSources,
  AbstractConcept, ConceptMember, MemberType,
  ConceptHistoryEntry, ConceptHierarchy, ConceptStatus,
} from './concept-abstraction/index.js';

// ── Peer Network ────────────────────────────────────────
export { PeerNetwork } from './peer-network/index.js';
export type { PeerInfo, PeerNetworkConfig, PeerNetworkStatus } from './peer-network/index.js';

// ── LLM Service ──────────────────────────────────────────
export { LLMService, runLLMServiceMigration } from './llm/index.js';
export { TaskRouter, AnthropicProvider, OllamaProvider, OllamaEmbeddingProvider } from './llm/index.js';
export type {
  LLMServiceConfig, LLMResponse, LLMUsageStats, PromptTemplate, ProviderInfo,
  LLMProvider, LLMMessage, LLMCallOptions, LLMProviderResponse, LLMContentPart, RoutingTier,
  AnthropicProviderConfig, OllamaProviderConfig, OllamaStatus, OllamaModelInfo, OllamaRunningModel,
  OllamaEmbeddingConfig,
} from './llm/index.js';

// ── Structured Output ──────────────────────────────────────
export { parseStructuredOutput, extractJson, validateJsonSchema, getBlocks, getTextContent, getToolCalls, hasReasoning } from './llm/index.js';
export type {
  ContentBlock, TextBlock, ReasoningBlock, ToolCallBlock, CitationBlock, JsonBlock, ImageBlock,
  StructuredLLMResponse,
} from './llm/index.js';

// ── LLM Middleware Pipeline ────────────────────────────────
export { composeMiddleware, retryMiddleware, costTrackingMiddleware, createCostTracker, piiRedactionMiddleware, loggingMiddleware, contextSummarizationMiddleware } from './llm/index.js';
export type {
  LLMMiddleware, LLMCallContext, NextFunction,
  RetryMiddlewareOptions, CostTracker, PiiRedactionOptions,
  LoggingMiddlewareOptions, LogEntry, ContextSummarizationOptions,
} from './llm/index.js';

// ── Scanner ──────────────────────────────────────────────
export { SignalScanner, runScannerMigration } from './scanner/index.js';
export { GitHubCollector } from './scanner/index.js';
export { HnCollector } from './scanner/index.js';
export { CryptoCollector } from './scanner/index.js';
export { scoreRepo, classifyLevel, classifyWithHysteresis, classifyPhase, scoreCrypto } from './scanner/index.js';
export type {
  ScannerConfig, ScannedRepo, DailyStats, HnMention, CryptoToken,
  ScanResult, ScannerStatus, SignalLevel, RepoPhase, ScoreBreakdown,
  GitHubSearchResult, GitHubRepo, HnSearchResult, HnHit,
  CoinGeckoMarket, CoinGeckoTrending,
} from './scanner/index.js';

// TechRadar
export { TechRadarEngine, runTechRadarMigration, RepoWatcher, RelevanceScorer, DigestGenerator } from './techradar/index.js';
export type {
  TechRadarConfig, TechRadarEntry, TechRadarScanResult, TechRadarSource,
  TechRadarCategory, TechRadarRing, TechRadarAction,
  WatchedRepo, RepoRelease, DailyDigest, DigestEntry, DigestOpportunity, DigestActionItem,
} from './techradar/index.js';

// Notifications
export { NotificationService, runNotificationMigration, DiscordProvider, TelegramProvider, EmailProvider } from './notifications/index.js';
export type {
  NotificationProvider, Notification, NotificationResult, NotificationPriority,
  NotificationEvent, NotificationProviderStatus,
  DiscordProviderConfig, TelegramProviderConfig, EmailProviderConfig,
} from './notifications/index.js';

// ── RAG Pipeline ──────────────────────────────────────────────
export { RAGEngine, runRAGMigration } from './rag/index.js';
export type { RAGEngineConfig, RAGSearchOptions, RAGResult, RAGIndexStats, RAGStatus } from './rag/index.js';
export { RAGIndexer } from './rag/index.js';
export type { RAGIndexerConfig, IndexSource, IndexerStatus } from './rag/index.js';

// ── Knowledge Graph ──────────────────────────────────────────
export { KnowledgeGraphEngine, runKnowledgeGraphMigration } from './knowledge-graph/index.js';
export type { KnowledgeGraphConfig, KnowledgeFact, FactQuery, KnowledgeGraphStatus } from './knowledge-graph/index.js';
export { FactExtractor } from './knowledge-graph/index.js';
export type { ExtractedFact } from './knowledge-graph/index.js';
export { ContradictionResolver, runContradictionResolverMigration } from './knowledge-graph/index.js';
export type { ContradictionType, ResolutionStrategy, FactResolution, ContradictionResolverStatus } from './knowledge-graph/index.js';

// ── Semantic Compression ─────────────────────────────────────
export { SemanticCompressor, runSemanticCompressorMigration } from './research/semantic-compressor.js';
export type { SemanticCompressorConfig, CompressResult, CompressorStats } from './research/semantic-compressor.js';

// ── Feedback Engine ──────────────────────────────────────────
export { FeedbackEngine, runFeedbackMigration } from './feedback/index.js';
export type { FeedbackEngineConfig, FeedbackSignal, FeedbackStats, FeedbackRecord } from './feedback/index.js';
export { FeedbackRouter, runFeedbackRouterMigration } from './feedback/index.js';
export type { FeedbackSource, FeedbackItem, FeedbackAction, FeedbackRouterStatus } from './feedback/index.js';

// ── Tool Learning ────────────────────────────────────────────
export { ToolTracker, runToolTrackerMigration } from './tool-learning/index.js';
export type { ToolTrackerConfig, ToolStats, ToolRecommendation } from './tool-learning/index.js';
export { ToolPatternAnalyzer } from './tool-learning/index.js';
export type { ToolTransition } from './tool-learning/index.js';

// ── Proactive Suggestions ────────────────────────────────────
export { ProactiveEngine, runProactiveMigration } from './proactive/index.js';
export type { ProactiveEngineConfig, Suggestion, ProactiveStatus, ProactiveDataSources } from './proactive/index.js';

// ── User Model ───────────────────────────────────────────────
export { UserModel, runUserModelMigration } from './user-model/index.js';
export type { UserModelConfig, UserProfile, SkillLevel } from './user-model/index.js';
export { AdaptiveContext } from './user-model/index.js';
export type { DetailLevel } from './user-model/index.js';

// ── Code Health ──────────────────────────────────────────────
export { CodeHealthMonitor, runCodeHealthMigration } from './code-health/index.js';
export type { CodeHealthConfig, HealthScanResult, HealthTrend, CodeHealthStatus } from './code-health/index.js';

// ── Teaching Protocol ────────────────────────────────────────
export { TeachingProtocol, runTeachingMigration } from './teaching/index.js';
export type { TeachingConfig, Lesson, TeachingStatus } from './teaching/index.js';
export { Curriculum, runCurriculumMigration } from './teaching/index.js';
export type { CurriculumItem, CurriculumStatus } from './teaching/index.js';

// ── Consensus Engine ─────────────────────────────────────────
export { ConsensusEngine, runConsensusMigration } from './consensus/index.js';
export type { ConsensusConfig, Proposal, Vote, ConsensusResult, ConsensusStatus } from './consensus/index.js';

// ── Active Learning ──────────────────────────────────────────
export { ActiveLearner, runActiveLearningMigration } from './active-learning/index.js';
export type { ActiveLearnerConfig, LearningGap, LearningStrategy, ActiveLearnerStatus } from './active-learning/index.js';

// ── Checkpoint Manager ──────────────────────────────────────
export { CheckpointManager, runCheckpointMigration } from './checkpoint/index.js';
export type { Checkpoint, CheckpointSummary, CheckpointManagerStatus } from './checkpoint/index.js';

// ── Observability / Tracing ─────────────────────────────────
export { TraceCollector, runTraceMigration } from './observability/index.js';
export type { Trace, Span, TraceTree, TraceStats, TraceListOptions, TraceCollectorStatus } from './observability/index.js';

// ── Messaging (Bidirectional Bots) ──────────────────────────
export { MessageRouter, TelegramBot, DiscordBot } from './messaging/index.js';
export type {
  IncomingMessage, OutgoingResponse, MessageRouterConfig, MessageRouterStatus,
  TelegramBotConfig, TelegramBotStatus, DiscordBotConfig, DiscordBotStatus,
} from './messaging/index.js';

// ── Agent Training ──────────────────────────────────────────
export { BenchmarkSuite, runBenchmarkMigration } from './agent-training/index.js';
export type {
  EvalCase, EvalResult, BenchmarkReport, BenchmarkSuiteStatus,
  EvalFunction, ScoreFunction,
} from './agent-training/index.js';
export { AgentTrainer, runTrainerMigration } from './agent-training/index.js';
export type {
  TrainingConfig, EpochResult, TrainingReport, AgentTrainerStatus,
} from './agent-training/index.js';
export { SubAgent, runSubAgentMigration, SubAgentFactory } from './agent-training/index.js';
export type {
  SubAgentConfig, SubAgentTask, SubAgentStatus, SubAgentFactoryStatus,
} from './agent-training/index.js';

// ── Tool Scoping ────────────────────────────────────────────
export { ToolScopeManager, runToolScopingMigration } from './tool-scoping/index.js';
export type {
  ToolScope, WorkflowContext, ScopeCheckResult, ToolScopeManagerStatus,
} from './tool-scoping/index.js';

// ── Code Sandbox ────────────────────────────────────────────
export { CodeSandbox, runSandboxMigration } from './sandbox/index.js';
export type {
  SandboxLanguage, ExecutionRequest, ExecutionResult,
  CodeSandboxConfig, CodeSandboxStatus,
} from './sandbox/index.js';

// ── Guardrails ──────────────────────────────────────────────
export { GuardrailEngine, runGuardrailMigration } from './guardrails/index.js';
export type {
  GuardrailConfig, ValidationResult, RollbackResult,
  HealthWarning, HealthReport, GuardrailStatus,
} from './guardrails/index.js';

// ── Vision Tools ────────────────────────────────────────────
export { imageBlockFromFile, imageBlockFromBuffer, getVisionToolDefinitions, handleVisionTool } from './mcp/vision-tools.js';
export type { VisionToolDeps } from './mcp/vision-tools.js';

// ── Causal Planner ──────────────────────────────────────────
export { CausalPlanner } from './causal/causal-planner.js';
export type { CausalDiagnosis, Intervention, PredictedOutcome } from './causal/causal-planner.js';

// ── Research Roadmap ────────────────────────────────────────
export { ResearchRoadmap, runRoadmapMigration } from './goals/research-roadmap.js';
export type {
  Roadmap, GoalNode, GoalEdge, RoadmapDAG, RoadmapProgress,
} from './goals/research-roadmap.js';

// ── Creative Engine ─────────────────────────────────────────
export { CreativeEngine, runCreativeMigration } from './creative/index.js';
export type {
  CreativeInsight, Analogy as CreativeAnalogy, SpeculativeHypothesis,
  CreativeEngineConfig, CreativeEngineStatus,
} from './creative/index.js';

// ── Action Bridge ─────────────────────────────────────────
export { ActionBridgeEngine, runActionBridgeMigration, createTradeHandler, createContentHandler } from './action/index.js';
export type {
  ProposedAction, ActionOutcome,
  ActionBridgeConfig, ActionBridgeStatus,
  TradeActionPayload, TradeHandlerDeps, TradeHandlerResult,
  ContentHandlerDeps, ContentHandlerResult,
} from './action/index.js';

// ── Content Forge ─────────────────────────────────────────
export { ContentForge, runContentForgeMigration, AutoPublisher } from './content/index.js';
export type {
  ContentPiece, ContentEngagement,
  ContentForgeConfig, ContentForgeStatus,
  AutoPublisherConfig, AutoPublisherStats,
} from './content/index.js';

// ── Code Forge ────────────────────────────────────────────
export { CodeForge, runCodeForgeMigration } from './codegen/code-forge.js';
export type {
  CodeProduct, CodePattern,
  CodeForgeConfig, CodeForgeStatus,
} from './codegen/code-forge.js';

// ── Strategy Forge ────────────────────────────────────────
export { StrategyForge, runStrategyForgeMigration, StrategyMutator } from './strategy/index.js';
export type {
  Strategy as ForgeStrategy, StrategyRule, StrategyPerformance, BacktestResult,
  StrategyForgeConfig, StrategyForgeStatus, MutationConfig, MutationResult,
} from './strategy/index.js';

// ── Chat Engine ──────────────────────────────────────────
export { ChatEngine, runChatMigration } from './chat/index.js';
export type { ChatMessage, ChatEngineConfig, ChatEngineStatus } from './chat/index.js';
