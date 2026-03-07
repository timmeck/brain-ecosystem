/**
 * LLM Middleware Pipeline — Composable request/response processing
 *
 * Inspiriert von LangChain's callback system und Express middleware.
 * Jede Middleware kann den LLM-Call modifizieren, loggen, oder abbrechen.
 *
 * Usage:
 * ```typescript
 * llmService.use(loggingMiddleware());
 * llmService.use(retryMiddleware({ maxAttempts: 3 }));
 * llmService.use(costTrackingMiddleware(tracker));
 * ```
 */

import type { LLMResponse, PromptTemplate } from './llm-service.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface LLMCallContext {
  /** Template being used */
  template: PromptTemplate;
  /** User message / prompt content */
  userMessage: string;
  /** Call options */
  options: { maxTokens?: number; temperature?: number; provider?: string };
  /** Metadata bag — middlewares can attach arbitrary data */
  metadata: Record<string, unknown>;
  /** Timestamp when the call started */
  startedAt: number;
}

export type NextFunction = (ctx: LLMCallContext) => Promise<LLMResponse | null>;

/**
 * Middleware function signature.
 * Receives the call context and a `next` function to continue the chain.
 * Can modify context before calling next, modify response after, or short-circuit.
 */
export type LLMMiddleware = (ctx: LLMCallContext, next: NextFunction) => Promise<LLMResponse | null>;

// ── Compose ─────────────────────────────────────────────

/**
 * Compose multiple middlewares into a single middleware chain.
 * Middlewares execute in registration order (first registered = outermost).
 */
export function composeMiddleware(middlewares: LLMMiddleware[], handler: NextFunction): NextFunction {
  if (middlewares.length === 0) return handler;

  return middlewares.reduceRight<NextFunction>(
    (next, mw) => (ctx) => mw(ctx, next),
    handler,
  );
}

// ── Built-in Middlewares ────────────────────────────────

// ─── Retry Middleware ───────────────────────────────────

export interface RetryMiddlewareOptions {
  /** Max retry attempts. Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms. Default: 1000 */
  baseDelay?: number;
  /** Max delay in ms. Default: 30000 */
  maxDelay?: number;
  /** Only retry on these error types. Default: all errors */
  retryOn?: (error: Error) => boolean;
  /** Callback on each retry */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry middleware — automatic retry with exponential backoff.
 * Uses the shared retryWithBackoff utility.
 */
export function retryMiddleware(options: RetryMiddlewareOptions = {}): LLMMiddleware {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    retryOn,
    onRetry,
  } = options;

  return async (ctx, next) => {
    return retryWithBackoff(
      () => next(ctx).then(r => {
        if (r === null) throw new Error('LLM call returned null');
        return r;
      }),
      {
        maxAttempts,
        baseDelay,
        maxDelay,
        retryOn,
        onRetry: onRetry ? (attempt, error) => onRetry(attempt, error) : undefined,
      },
    ).catch(() => null);
  };
}

// ─── Cost Tracking Middleware ───────────────────────────

export interface CostTracker {
  totalCost: number;
  callCount: number;
  costPerTemplate: Record<string, number>;
}

/** Token pricing per model (USD per 1K tokens) */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-3-5-20241022': { input: 0.001, output: 0.005 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
};

function estimateCost(response: LLMResponse): number {
  const pricing = MODEL_PRICING[response.model] ?? { input: 0.003, output: 0.015 };
  return (response.inputTokens * pricing.input + response.outputTokens * pricing.output) / 1000;
}

/**
 * Cost tracking middleware — tracks per-call and aggregate costs.
 */
export function costTrackingMiddleware(tracker: CostTracker): LLMMiddleware {
  return async (ctx, next) => {
    const response = await next(ctx);
    if (response) {
      const cost = estimateCost(response);
      tracker.totalCost += cost;
      tracker.callCount++;
      tracker.costPerTemplate[ctx.template] = (tracker.costPerTemplate[ctx.template] ?? 0) + cost;
      ctx.metadata['cost'] = cost;
      ctx.metadata['totalCost'] = tracker.totalCost;
    }
    return response;
  };
}

/**
 * Create a fresh cost tracker instance.
 */
export function createCostTracker(): CostTracker {
  return { totalCost: 0, callCount: 0, costPerTemplate: {} };
}

// ─── PII Redaction Middleware ───────────────────────────

export interface PiiRedactionOptions {
  /** Patterns to redact. Default: email, phone, SSN, credit card */
  patterns?: Array<{ regex: RegExp; replacement: string }>;
  /** Custom redaction function */
  redact?: (text: string) => string;
}

const DEFAULT_PII_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // API keys (common patterns) — must come before phone to avoid partial matches
  { regex: /\bsk-[a-zA-Z0-9]{20,}\b/g, replacement: '[API_KEY]' },
  // Email addresses
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  // Credit card numbers
  { regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CARD]' },
  // SSN
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  // Phone numbers (various formats)
  { regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
];

/**
 * PII redaction middleware — strips sensitive data from prompts before sending to LLM.
 */
export function piiRedactionMiddleware(options: PiiRedactionOptions = {}): LLMMiddleware {
  const patterns = options.patterns ?? DEFAULT_PII_PATTERNS;
  const customRedact = options.redact;

  return async (ctx, next) => {
    let sanitized = ctx.userMessage;

    if (customRedact) {
      sanitized = customRedact(sanitized);
    } else {
      for (const p of patterns) {
        sanitized = sanitized.replace(p.regex, p.replacement);
      }
    }

    // Only modify if something changed
    if (sanitized !== ctx.userMessage) {
      ctx.metadata['piiRedacted'] = true;
      ctx.userMessage = sanitized;
    }

    return next(ctx);
  };
}

// ─── Logging Middleware ─────────────────────────────────

export interface LoggingMiddlewareOptions {
  /** Log level. Default: 'debug' */
  level?: 'debug' | 'info';
  /** Include full prompt in log. Default: false */
  includePrompt?: boolean;
  /** Max prompt length in log. Default: 200 */
  maxPromptLength?: number;
  /** Custom log handler (overrides default logger) */
  onLog?: (entry: LogEntry) => void;
}

export interface LogEntry {
  template: PromptTemplate;
  provider: string | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  success: boolean;
  error?: string;
  prompt?: string;
  metadata: Record<string, unknown>;
}

/**
 * Logging middleware — structured trace logging for every LLM call.
 */
export function loggingMiddleware(options: LoggingMiddlewareOptions = {}): LLMMiddleware {
  const {
    level = 'debug',
    includePrompt = false,
    maxPromptLength = 200,
    onLog,
  } = options;
  const log = getLogger();

  return async (ctx, next) => {
    const start = Date.now();
    let response: LLMResponse | null = null;
    let error: Error | null = null;

    try {
      response = await next(ctx);
      return response;
    } catch (e) {
      error = e as Error;
      throw e;
    } finally {
      const entry: LogEntry = {
        template: ctx.template,
        provider: response?.provider ?? null,
        durationMs: Date.now() - start,
        inputTokens: response?.inputTokens ?? 0,
        outputTokens: response?.outputTokens ?? 0,
        cached: response?.cached ?? false,
        success: response !== null && !error,
        error: error?.message,
        metadata: ctx.metadata,
      };

      if (includePrompt) {
        entry.prompt = ctx.userMessage.length > maxPromptLength
          ? ctx.userMessage.slice(0, maxPromptLength) + '...'
          : ctx.userMessage;
      }

      if (onLog) {
        onLog(entry);
      } else {
        const msg = `[LLM] ${ctx.template} via ${entry.provider ?? 'none'}: ${entry.inputTokens}+${entry.outputTokens} tokens, ${entry.durationMs}ms${entry.cached ? ' (cached)' : ''}${error ? ` ERROR: ${error.message}` : ''}`;
        if (level === 'info') {
          log.info(msg);
        } else {
          log.debug(msg);
        }
      }
    }
  };
}

// ─── Context Summarization Middleware ───────────────────

export interface ContextSummarizationOptions {
  /** Max character length before summarization kicks in. Default: 50000 */
  maxLength?: number;
  /** How aggressively to compress. Default: 0.5 (keep ~50%) */
  compressionRatio?: number;
}

/**
 * Context summarization middleware — truncates overly long prompts.
 * Simple heuristic: keeps the first and last portions when too long.
 */
export function contextSummarizationMiddleware(options: ContextSummarizationOptions = {}): LLMMiddleware {
  const { maxLength = 50000, compressionRatio = 0.5 } = options;

  return async (ctx, next) => {
    if (ctx.userMessage.length > maxLength) {
      const keepChars = Math.floor(maxLength * compressionRatio);
      const halfKeep = Math.floor(keepChars / 2);
      const truncated =
        ctx.userMessage.slice(0, halfKeep) +
        `\n\n[... ${ctx.userMessage.length - keepChars} characters truncated ...]\n\n` +
        ctx.userMessage.slice(-halfKeep);
      ctx.userMessage = truncated;
      ctx.metadata['contextTruncated'] = true;
      ctx.metadata['originalLength'] = ctx.userMessage.length;
    }
    return next(ctx);
  };
}
