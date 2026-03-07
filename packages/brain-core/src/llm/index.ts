export { LLMService, runLLMServiceMigration } from './llm-service.js';
export type {
  LLMServiceConfig, LLMResponse, LLMUsageStats, PromptTemplate, ProviderInfo,
} from './llm-service.js';

export type {
  LLMProvider, LLMMessage, LLMCallOptions, LLMProviderResponse, RoutingTier,
} from './provider.js';
export { TaskRouter } from './provider.js';

export { AnthropicProvider } from './anthropic-provider.js';
export type { AnthropicProviderConfig } from './anthropic-provider.js';

export { OllamaProvider } from './ollama-provider.js';
export type { OllamaProviderConfig, OllamaStatus, OllamaModelInfo, OllamaRunningModel } from './ollama-provider.js';

export { OllamaEmbeddingProvider } from './ollama-embedding.js';
export type { OllamaEmbeddingConfig } from './ollama-embedding.js';

// ── Structured Output ───────────────────────────────────
export { parseStructuredOutput, extractJson, validateJsonSchema, getBlocks, getTextContent, getToolCalls, hasReasoning } from './structured-output.js';
export type {
  ContentBlock, TextBlock, ReasoningBlock, ToolCallBlock, CitationBlock, JsonBlock,
  StructuredLLMResponse,
} from './structured-output.js';

// ── Middleware Pipeline ─────────────────────────────────
export { composeMiddleware, retryMiddleware, costTrackingMiddleware, createCostTracker, piiRedactionMiddleware, loggingMiddleware, contextSummarizationMiddleware } from './middleware.js';
export type {
  LLMMiddleware, LLMCallContext, NextFunction,
  RetryMiddlewareOptions, CostTracker, PiiRedactionOptions,
  LoggingMiddlewareOptions, LogEntry, ContextSummarizationOptions,
} from './middleware.js';
