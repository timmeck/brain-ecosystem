export interface TradingBrainConfig {
  dataDir: string;
  dbPath: string;

  ipc: {
    pipeName: string;
    timeout: number;
  };

  api: {
    port: number;
    enabled: boolean;
    apiKey?: string;
  };

  mcpHttp: {
    port: number;
    enabled: boolean;
  };

  calibration: CalibrationConfig;
  learning: LearningConfig;
  research: ResearchConfig;

  log: {
    level: string;
    file: string;
    maxSize: number;
    maxFiles: number;
  };
}

export interface CalibrationConfig {
  learningRate: number;
  weakenPenalty: number;
  decayHalfLifeDays: number;
  patternExtractionInterval: number;
  patternMinSamples: number;
  patternWilsonThreshold: number;
  wilsonZ: number;
  spreadingActivationDecay: number;
  spreadingActivationThreshold: number;
  minActivationsForWeight: number;
  minOutcomesForWeights: number;
}

export interface LearningConfig {
  intervalMs: number;
  fingerprintSimilarityThreshold: number;
  chainMinLength: number;
  maxChains: number;
}

export interface ResearchConfig {
  intervalMs: number;
  initialDelayMs: number;
  trendWindowDays: number;
  minTrades: number;
  maxInsights: number;
}
