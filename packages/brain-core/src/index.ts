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
