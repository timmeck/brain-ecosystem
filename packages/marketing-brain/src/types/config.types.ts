export interface IpcConfig {
  pipeName: string;
  timeout: number;
}

export interface LearningConfig {
  intervalMs: number;
  minOccurrences: number;
  minConfidence: number;
  pruneThreshold: number;
  decayHalfLifeDays: number;
}

export interface SynapsesConfig {
  initialWeight: number;
  learningRate: number;
  decayHalfLifeDays: number;
  pruneThreshold: number;
  decayAfterDays: number;
  maxDepth: number;
  minActivationWeight: number;
}

export interface ResearchConfig {
  intervalMs: number;
  initialDelayMs: number;
  minDataPoints: number;
  trendWindowDays: number;
  insightExpiryDays: number;
}

export interface MatchingConfig {
  similarityThreshold: number;
  maxResults: number;
}

export interface ApiConfig {
  port: number;
  enabled: boolean;
  apiKey?: string;
}

export interface McpHttpConfig {
  port: number;
  enabled: boolean;
}

export interface DashboardConfig {
  port: number;
  enabled: boolean;
}

export interface LogConfig {
  level: string;
  file: string;
  maxSize: number;
  maxFiles: number;
}

export interface RetentionConfig {
  postDays: number;
  strategyDays: number;
  insightDays: number;
}

export interface MarketingBrainConfig {
  dataDir: string;
  dbPath: string;
  ipc: IpcConfig;
  api: ApiConfig;
  mcpHttp: McpHttpConfig;
  dashboard: DashboardConfig;
  learning: LearningConfig;
  matching: MatchingConfig;
  synapses: SynapsesConfig;
  research: ResearchConfig;
  log: LogConfig;
  retention: RetentionConfig;
}
