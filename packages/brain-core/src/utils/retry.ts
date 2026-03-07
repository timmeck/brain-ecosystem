// ── Generic Retry with Exponential Backoff ────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before the first retry. Default: 1000 */
  baseDelay?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelay?: number;
  /** Multiplier for each subsequent delay. Default: 2 */
  backoffFactor?: number;
  /** Add random jitter to avoid thundering herd. Default: true */
  jitter?: boolean;
  /** Optional predicate — only retry if this returns true. Default: always retry */
  retryOn?: (error: Error) => boolean;
  /** Callback fired before each retry (for logging/metrics). */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

/**
 * Retry an async operation with exponential backoff + jitter.
 *
 * ```ts
 * const data = await retryWithBackoff(() => fetchData(url), { maxAttempts: 5 });
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 30_000;
  const backoffFactor = options?.backoffFactor ?? 2;
  const jitter = options?.jitter ?? true;
  const retryOn = options?.retryOn;
  const onRetry = options?.onRetry;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Last attempt — don't wait, just throw
      if (attempt >= maxAttempts) break;

      // Check if this error is retryable
      if (retryOn && !retryOn(lastError)) break;

      // Calculate delay: base * factor^(attempt-1), capped at maxDelay
      let delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5); // 50-100% of calculated delay
      }

      onRetry?.(attempt, lastError, delay);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
