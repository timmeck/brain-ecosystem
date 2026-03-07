import { describe, it, expect, vi } from 'vitest';
import {
  composeMiddleware,
  retryMiddleware,
  costTrackingMiddleware,
  createCostTracker,
  piiRedactionMiddleware,
  loggingMiddleware,
  contextSummarizationMiddleware,
} from '../../../src/llm/middleware.js';
import type { LLMCallContext, LLMMiddleware, NextFunction } from '../../../src/llm/middleware.js';
import type { LLMResponse } from '../../../src/llm/llm-service.js';

// ── Helpers ────────────────────────────────────────────────

function makeCtx(overrides: Partial<LLMCallContext> = {}): LLMCallContext {
  return {
    template: 'custom',
    userMessage: 'test message',
    options: {},
    metadata: {},
    startedAt: Date.now(),
    ...overrides,
  };
}

function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    text: 'response text',
    tokensUsed: 150,
    inputTokens: 100,
    outputTokens: 50,
    cached: false,
    model: 'claude-sonnet-4-20250514',
    durationMs: 500,
    provider: 'anthropic',
    ...overrides,
  };
}

function makeHandler(response: LLMResponse | null = makeResponse()): NextFunction {
  return vi.fn(async () => response);
}

// ── composeMiddleware ──────────────────────────────────────

describe('composeMiddleware', () => {
  it('returns handler directly when no middlewares', () => {
    const handler = makeHandler();
    const composed = composeMiddleware([], handler);
    expect(composed).toBe(handler);
  });

  it('executes single middleware', async () => {
    const handler = makeHandler();
    const mw: LLMMiddleware = async (ctx, next) => {
      ctx.metadata['touched'] = true;
      return next(ctx);
    };
    const composed = composeMiddleware([mw], handler);
    const ctx = makeCtx();
    await composed(ctx);
    expect(ctx.metadata['touched']).toBe(true);
    expect(handler).toHaveBeenCalled();
  });

  it('executes middlewares in order (first = outermost)', async () => {
    const order: number[] = [];
    const mw1: LLMMiddleware = async (ctx, next) => { order.push(1); const r = await next(ctx); order.push(4); return r; };
    const mw2: LLMMiddleware = async (ctx, next) => { order.push(2); const r = await next(ctx); order.push(3); return r; };
    const handler: NextFunction = async () => { order.push(99); return makeResponse(); };

    const composed = composeMiddleware([mw1, mw2], handler);
    await composed(makeCtx());
    expect(order).toEqual([1, 2, 99, 3, 4]);
  });

  it('short-circuits when middleware returns without calling next', async () => {
    const handler = makeHandler();
    const blocker: LLMMiddleware = async () => null;
    const composed = composeMiddleware([blocker], handler);
    const result = await composed(makeCtx());
    expect(result).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ── retryMiddleware ────────────────────────────────────────

describe('retryMiddleware', () => {
  it('retries on null response', async () => {
    let callCount = 0;
    const handler: NextFunction = async () => {
      callCount++;
      if (callCount < 3) return null;
      return makeResponse();
    };

    const mw = retryMiddleware({ maxAttempts: 3, baseDelay: 10, maxDelay: 50 });
    const composed = composeMiddleware([mw], handler);
    const result = await composed(makeCtx());
    expect(result).not.toBeNull();
    expect(callCount).toBe(3);
  });

  it('returns null after max attempts exhausted', async () => {
    const handler: NextFunction = async () => null;
    const mw = retryMiddleware({ maxAttempts: 2, baseDelay: 10, maxDelay: 50 });
    const composed = composeMiddleware([mw], handler);
    const result = await composed(makeCtx());
    expect(result).toBeNull();
  });

  it('calls onRetry callback', async () => {
    const retries: number[] = [];
    let calls = 0;
    const handler: NextFunction = async () => {
      calls++;
      if (calls < 2) return null;
      return makeResponse();
    };

    const mw = retryMiddleware({
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 50,
      onRetry: (attempt) => retries.push(attempt),
    });
    const composed = composeMiddleware([mw], handler);
    await composed(makeCtx());
    expect(retries.length).toBeGreaterThanOrEqual(1);
  });
});

// ── costTrackingMiddleware ─────────────────────────────────

describe('costTrackingMiddleware', () => {
  it('tracks cost for successful calls', async () => {
    const tracker = createCostTracker();
    const handler = makeHandler();
    const mw = costTrackingMiddleware(tracker);
    const composed = composeMiddleware([mw], handler);

    await composed(makeCtx({ template: 'summarize' }));

    expect(tracker.callCount).toBe(1);
    expect(tracker.totalCost).toBeGreaterThan(0);
    expect(tracker.costPerTemplate['summarize']).toBeGreaterThan(0);
  });

  it('does not track cost for null responses', async () => {
    const tracker = createCostTracker();
    const handler = makeHandler(null);
    const mw = costTrackingMiddleware(tracker);
    const composed = composeMiddleware([mw], handler);

    await composed(makeCtx());

    expect(tracker.callCount).toBe(0);
    expect(tracker.totalCost).toBe(0);
  });

  it('accumulates costs over multiple calls', async () => {
    const tracker = createCostTracker();
    const handler = makeHandler();
    const mw = costTrackingMiddleware(tracker);
    const composed = composeMiddleware([mw], handler);

    await composed(makeCtx());
    await composed(makeCtx());
    await composed(makeCtx());

    expect(tracker.callCount).toBe(3);
    expect(tracker.totalCost).toBeGreaterThan(0);
  });
});

// ── piiRedactionMiddleware ─────────────────────────────────

describe('piiRedactionMiddleware', () => {
  it('redacts email addresses', async () => {
    const handler = makeHandler();
    const mw = piiRedactionMiddleware();
    const composed = composeMiddleware([mw], handler);

    const ctx = makeCtx({ userMessage: 'Contact me at john@example.com please' });
    await composed(ctx);

    expect(ctx.userMessage).toContain('[EMAIL]');
    expect(ctx.userMessage).not.toContain('john@example.com');
    expect(ctx.metadata['piiRedacted']).toBe(true);
  });

  it('redacts phone numbers', async () => {
    const handler = makeHandler();
    const mw = piiRedactionMiddleware();
    const composed = composeMiddleware([mw], handler);

    const ctx = makeCtx({ userMessage: 'Call me at 555-123-4567' });
    await composed(ctx);

    expect(ctx.userMessage).toContain('[PHONE]');
  });

  it('redacts API keys', async () => {
    const handler = makeHandler();
    const mw = piiRedactionMiddleware();
    const composed = composeMiddleware([mw], handler);

    const ctx = makeCtx({ userMessage: 'My key is sk-ant1234567890abcdefghij' });
    await composed(ctx);

    expect(ctx.userMessage).toContain('[API_KEY]');
  });

  it('does not modify clean messages', async () => {
    const handler = makeHandler();
    const mw = piiRedactionMiddleware();
    const composed = composeMiddleware([mw], handler);

    const ctx = makeCtx({ userMessage: 'Just a normal message' });
    await composed(ctx);

    expect(ctx.userMessage).toBe('Just a normal message');
    expect(ctx.metadata['piiRedacted']).toBeUndefined();
  });

  it('supports custom redaction function', async () => {
    const handler = makeHandler();
    const mw = piiRedactionMiddleware({
      redact: (text) => text.replace(/secret/gi, '[REDACTED]'),
    });
    const composed = composeMiddleware([mw], handler);

    const ctx = makeCtx({ userMessage: 'This is a secret message' });
    await composed(ctx);

    expect(ctx.userMessage).toBe('This is a [REDACTED] message');
  });
});

// ── loggingMiddleware ──────────────────────────────────────

describe('loggingMiddleware', () => {
  it('logs successful calls via onLog', async () => {
    const logs: unknown[] = [];
    const handler = makeHandler();
    const mw = loggingMiddleware({ onLog: (entry) => logs.push(entry) });
    const composed = composeMiddleware([mw], handler);

    await composed(makeCtx({ template: 'explain' }));

    expect(logs).toHaveLength(1);
    const entry = logs[0] as Record<string, unknown>;
    expect(entry['template']).toBe('explain');
    expect(entry['success']).toBe(true);
    expect(entry['provider']).toBe('anthropic');
  });

  it('logs failed calls with error', async () => {
    const logs: unknown[] = [];
    const handler: NextFunction = async () => { throw new Error('Provider down'); };
    const mw = loggingMiddleware({ onLog: (entry) => logs.push(entry) });
    const composed = composeMiddleware([mw], handler);

    await expect(composed(makeCtx())).rejects.toThrow('Provider down');
    expect(logs).toHaveLength(1);
    const entry = logs[0] as Record<string, unknown>;
    expect(entry['success']).toBe(false);
    expect(entry['error']).toBe('Provider down');
  });

  it('includes prompt when configured', async () => {
    const logs: unknown[] = [];
    const handler = makeHandler();
    const mw = loggingMiddleware({ onLog: (entry) => logs.push(entry), includePrompt: true });
    const composed = composeMiddleware([mw], handler);

    await composed(makeCtx({ userMessage: 'Short prompt' }));

    const entry = logs[0] as Record<string, unknown>;
    expect(entry['prompt']).toBe('Short prompt');
  });

  it('truncates long prompts', async () => {
    const logs: unknown[] = [];
    const handler = makeHandler();
    const mw = loggingMiddleware({ onLog: (entry) => logs.push(entry), includePrompt: true, maxPromptLength: 10 });
    const composed = composeMiddleware([mw], handler);

    await composed(makeCtx({ userMessage: 'This is a very long prompt that should be truncated' }));

    const entry = logs[0] as Record<string, unknown>;
    expect((entry['prompt'] as string).length).toBeLessThan(20);
    expect((entry['prompt'] as string)).toContain('...');
  });
});

// ── contextSummarizationMiddleware ─────────────────────────

describe('contextSummarizationMiddleware', () => {
  it('truncates overly long context', async () => {
    const handler = makeHandler();
    const mw = contextSummarizationMiddleware({ maxLength: 100, compressionRatio: 0.5 });
    const composed = composeMiddleware([mw], handler);

    const longMessage = 'A'.repeat(200);
    const ctx = makeCtx({ userMessage: longMessage });
    await composed(ctx);

    expect(ctx.userMessage.length).toBeLessThan(200);
    expect(ctx.userMessage).toContain('truncated');
    expect(ctx.metadata['contextTruncated']).toBe(true);
  });

  it('does not truncate short context', async () => {
    const handler = makeHandler();
    const mw = contextSummarizationMiddleware({ maxLength: 1000 });
    const composed = composeMiddleware([mw], handler);

    const ctx = makeCtx({ userMessage: 'Short message' });
    await composed(ctx);

    expect(ctx.userMessage).toBe('Short message');
    expect(ctx.metadata['contextTruncated']).toBeUndefined();
  });
});

// ── Integration: multiple middlewares ──────────────────────

describe('middleware integration', () => {
  it('composes PII redaction + cost tracking + logging', async () => {
    const tracker = createCostTracker();
    const logs: unknown[] = [];

    const handler = makeHandler();
    const composed = composeMiddleware(
      [
        piiRedactionMiddleware(),
        costTrackingMiddleware(tracker),
        loggingMiddleware({ onLog: (e) => logs.push(e) }),
      ],
      handler,
    );

    const ctx = makeCtx({ userMessage: 'Email: user@test.com' });
    await composed(ctx);

    // PII was redacted
    expect(ctx.userMessage).toContain('[EMAIL]');
    // Cost was tracked
    expect(tracker.callCount).toBe(1);
    // Log was written
    expect(logs).toHaveLength(1);
  });
});
