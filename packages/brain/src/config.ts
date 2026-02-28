import path from 'node:path';
import type { BrainConfig } from './types/config.types.js';
import { getDataDir, getPipeName } from './utils/paths.js';
import { loadConfigFile } from '@timmeck/brain-core';

const defaults: BrainConfig = {
  dataDir: getDataDir(),
  dbPath: path.join(getDataDir(), 'brain.db'),
  ipc: {
    pipeName: getPipeName(),
    timeout: 5000,
  },
  api: {
    port: 7777,
    enabled: true,
  },
  mcpHttp: {
    port: 7778,
    enabled: true,
  },
  embeddings: {
    enabled: true,
    modelName: 'Xenova/all-MiniLM-L6-v2',
    cacheDir: path.join(getDataDir(), 'models'),
    sweepIntervalMs: 300_000, // 5 minutes
    batchSize: 50,
  },
  learning: {
    intervalMs: 900_000,
    minOccurrences: 3,
    minSuccessRate: 0.70,
    minConfidence: 0.60,
    pruneThreshold: 0.20,
    maxRejectionRate: 0.50,
    decayHalfLifeDays: 30,
  },
  terminal: {
    staleTimeout: 300000, // 5 min
    maxConnected: 50,
  },
  matching: {
    fingerprintFields: ['type', 'message', 'file_path'],
    similarityThreshold: 0.8,
    maxResults: 10,
    crossProjectMatching: true,
    crossProjectWeight: 0.7,
  },
  code: {
    supportedLanguages: ['typescript', 'javascript', 'python', 'rust', 'go'],
    maxModuleSize: 50000,
    similarityThreshold: 0.75,
  },
  synapses: {
    initialWeight: 0.1,
    learningRate: 0.15,
    decayHalfLifeDays: 45,
    pruneThreshold: 0.05,
    decayAfterDays: 14,
    maxDepth: 3,
    minActivationWeight: 0.2,
  },
  research: {
    intervalMs: 3_600_000,
    initialDelayMs: 300_000,
    minDataPoints: 10,
    trendWindowDays: 7,
    gapMinOccurrences: 5,
    synergyMinWeight: 0.5,
    templateMinAdaptations: 3,
    insightExpiryDays: 30,
  },
  log: {
    level: 'info',
    file: path.join(getDataDir(), 'brain.log'),
    maxSize: 10 * 1024 * 1024,
    maxFiles: 3,
  },
  retention: {
    errorDays: 90,
    solutionDays: 365,
    insightDays: 30,
  },
};

function applyEnvOverrides(config: BrainConfig): void {
  if (process.env['BRAIN_DATA_DIR']) {
    config.dataDir = process.env['BRAIN_DATA_DIR'];
    config.dbPath = path.join(config.dataDir, 'brain.db');
    config.log.file = path.join(config.dataDir, 'brain.log');
  }
  if (process.env['BRAIN_DB_PATH']) config.dbPath = process.env['BRAIN_DB_PATH'];
  if (process.env['BRAIN_LOG_LEVEL']) config.log.level = process.env['BRAIN_LOG_LEVEL'];
  if (process.env['BRAIN_PIPE_NAME']) config.ipc.pipeName = process.env['BRAIN_PIPE_NAME'];
  if (process.env['BRAIN_API_PORT']) config.api.port = Number(process.env['BRAIN_API_PORT']);
  if (process.env['BRAIN_API_ENABLED']) config.api.enabled = process.env['BRAIN_API_ENABLED'] !== 'false';
  if (process.env['BRAIN_API_KEY']) config.api.apiKey = process.env['BRAIN_API_KEY'];
  if (process.env['BRAIN_MCP_HTTP_PORT']) config.mcpHttp.port = Number(process.env['BRAIN_MCP_HTTP_PORT']);
  if (process.env['BRAIN_MCP_HTTP_ENABLED']) config.mcpHttp.enabled = process.env['BRAIN_MCP_HTTP_ENABLED'] !== 'false';
  if (process.env['BRAIN_EMBEDDINGS_ENABLED']) config.embeddings.enabled = process.env['BRAIN_EMBEDDINGS_ENABLED'] !== 'false';
  if (process.env['BRAIN_EMBEDDINGS_MODEL']) config.embeddings.modelName = process.env['BRAIN_EMBEDDINGS_MODEL'];
}

export function loadConfig(configPath?: string): BrainConfig {
  const config = loadConfigFile(
    defaults,
    configPath,
    path.join(getDataDir(), 'config.json'),
  );
  applyEnvOverrides(config);
  return config;
}
