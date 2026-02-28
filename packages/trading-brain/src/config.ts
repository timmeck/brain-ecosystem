import path from 'node:path';
import type { TradingBrainConfig } from './types/config.types.js';
import { getDataDir, getPipeName } from './utils/paths.js';
import { loadConfigFile } from '@timmeck/brain-core';

const defaults: TradingBrainConfig = {
  dataDir: getDataDir(),
  dbPath: path.join(getDataDir(), 'trading-brain.db'),
  ipc: {
    pipeName: getPipeName(),
    timeout: 5000,
  },
  api: {
    port: 7779,
    enabled: true,
  },
  mcpHttp: {
    port: 7780,
    enabled: true,
  },
  calibration: {
    learningRate: 0.15,
    weakenPenalty: 0.7,
    decayHalfLifeDays: 14,
    patternExtractionInterval: 50,
    patternMinSamples: 10,
    patternWilsonThreshold: 0.5,
    wilsonZ: 1.96,
    spreadingActivationDecay: 0.6,
    spreadingActivationThreshold: 0.05,
    minActivationsForWeight: 3,
    minOutcomesForWeights: 5,
  },
  learning: {
    intervalMs: 900_000, // 15 minutes
    fingerprintSimilarityThreshold: 0.7,
    chainMinLength: 3,
    maxChains: 100,
  },
  research: {
    intervalMs: 3_600_000, // 1 hour
    initialDelayMs: 300_000, // 5 minutes
    trendWindowDays: 7,
    minTrades: 20,
    maxInsights: 50,
  },
  log: {
    level: 'info',
    file: path.join(getDataDir(), 'trading-brain.log'),
    maxSize: 10 * 1024 * 1024,
    maxFiles: 3,
  },
};

function applyEnvOverrides(config: TradingBrainConfig): void {
  if (process.env['TRADING_BRAIN_DATA_DIR']) {
    config.dataDir = process.env['TRADING_BRAIN_DATA_DIR'];
    config.dbPath = path.join(config.dataDir, 'trading-brain.db');
    config.log.file = path.join(config.dataDir, 'trading-brain.log');
  }
  if (process.env['TRADING_BRAIN_DB_PATH']) config.dbPath = process.env['TRADING_BRAIN_DB_PATH'];
  if (process.env['TRADING_BRAIN_LOG_LEVEL']) config.log.level = process.env['TRADING_BRAIN_LOG_LEVEL'];
  if (process.env['TRADING_BRAIN_PIPE_NAME']) config.ipc.pipeName = process.env['TRADING_BRAIN_PIPE_NAME'];
  if (process.env['TRADING_BRAIN_API_PORT']) config.api.port = Number(process.env['TRADING_BRAIN_API_PORT']);
  if (process.env['TRADING_BRAIN_API_ENABLED']) config.api.enabled = process.env['TRADING_BRAIN_API_ENABLED'] !== 'false';
  if (process.env['TRADING_BRAIN_API_KEY']) config.api.apiKey = process.env['TRADING_BRAIN_API_KEY'];
  if (process.env['TRADING_BRAIN_MCP_HTTP_PORT']) config.mcpHttp.port = Number(process.env['TRADING_BRAIN_MCP_HTTP_PORT']);
  if (process.env['TRADING_BRAIN_MCP_HTTP_ENABLED']) config.mcpHttp.enabled = process.env['TRADING_BRAIN_MCP_HTTP_ENABLED'] !== 'false';
}

export function loadConfig(configPath?: string): TradingBrainConfig {
  const config = loadConfigFile(
    defaults,
    configPath,
    path.join(getDataDir(), 'config.json'),
  );
  applyEnvOverrides(config);
  return config;
}
