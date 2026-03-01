// ── Types ──────────────────────────────────────────────────
export type { IpcMessage } from './types/ipc.types.js';

// ── Utils ──────────────────────────────────────────────────
export { sha256 } from './utils/hash.js';
export { createLogger, getLogger, resetLogger } from './utils/logger.js';
export type { LoggerOptions } from './utils/logger.js';
export { normalizePath, getDataDir, getPipeName } from './utils/paths.js';
export { TypedEventBus } from './utils/events.js';

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

// ── Cross-Brain ────────────────────────────────────────────
export { CrossBrainClient } from './cross-brain/client.js';
export type { BrainPeer } from './cross-brain/client.js';
export { CrossBrainNotifier } from './cross-brain/notifications.js';
export type { CrossBrainEvent } from './cross-brain/notifications.js';
export { CrossBrainSubscriptionManager } from './cross-brain/subscription.js';
export type { EventSubscription } from './cross-brain/subscription.js';
export { CrossBrainCorrelator } from './cross-brain/correlator.js';
export type { CorrelatorEvent, Correlation, EcosystemHealth, CorrelatorConfig } from './cross-brain/correlator.js';

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
export type { CausalEvent, CausalEdge, CausalPath, CausalAnalysis } from './causal/engine.js';

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

// ── Research Orchestrator ─────────────────────────────
export { ResearchOrchestrator } from './research/research-orchestrator.js';
export type { ResearchOrchestratorConfig } from './research/research-orchestrator.js';

// ── DataMiner ────────────────────────────────────────
export { DataMiner, runDataMinerMigration } from './research/data-miner.js';
export type { DataMinerAdapter, DataMinerEngines, DataMinerState, MineResult, MinedObservation, MinedCausalEvent, MinedMetric, MinedHypothesisObservation, MinedCrossDomainEvent } from './research/data-miner.js';
export { BrainDataMinerAdapter, TradingDataMinerAdapter, MarketingDataMinerAdapter } from './research/adapters/index.js';
