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

// ── Memory ───────────────────────────────────────────────
export type {
  MemoryRecord, SessionRecord, MemoryCategory, MemorySource, SessionOutcome,
  RememberInput, RecallInput, StartSessionInput, EndSessionInput,
  MemoryRepoInterface, SessionRepoInterface,
  MemoryEngineConfig,
} from './memory/types.js';
export { BaseMemoryEngine } from './memory/base-memory-engine.js';

// ── Cross-Brain ────────────────────────────────────────────
export { CrossBrainClient } from './cross-brain/client.js';
export type { BrainPeer } from './cross-brain/client.js';
export { CrossBrainNotifier } from './cross-brain/notifications.js';
export type { CrossBrainEvent } from './cross-brain/notifications.js';
