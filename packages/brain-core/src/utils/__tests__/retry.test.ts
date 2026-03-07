import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../retry.js';

describe('retryWithBackoff', () => {
  it('should return result on first success', async () => {
    const result = await retryWithBackoff(async () => 42);
    expect(result).toBe(42);
  });

  it('should retry on failure and succeed eventually', async () => {
    let attempt = 0;
    const result = await retryWithBackoff(async () => {
      attempt++;
      if (attempt < 3) throw new Error('fail');
      return 'ok';
    }, { maxAttempts: 3, baseDelay: 10 });
    expect(result).toBe('ok');
    expect(attempt).toBe(3);
  });

  it('should throw after maxAttempts exhausted', async () => {
    await expect(retryWithBackoff(async () => {
      throw new Error('always fails');
    }, { maxAttempts: 2, baseDelay: 10 })).rejects.toThrow('always fails');
  });

  it('should respect retryOn predicate', async () => {
    let attempt = 0;
    await expect(retryWithBackoff(async () => {
      attempt++;
      throw new Error('non-retryable');
    }, {
      maxAttempts: 3,
      baseDelay: 10,
      retryOn: () => false,
    })).rejects.toThrow('non-retryable');
    expect(attempt).toBe(1); // Should not retry
  });

  it('should call onRetry callback before each retry', async () => {
    const onRetry = vi.fn();
    let attempt = 0;
    await retryWithBackoff(async () => {
      attempt++;
      if (attempt < 3) throw new Error(`fail-${attempt}`);
      return 'done';
    }, { maxAttempts: 3, baseDelay: 10, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]![0]).toBe(1); // attempt number
    expect(onRetry.mock.calls[0]![1]).toBeInstanceOf(Error);
  });

  it('should cap delay at maxDelay', async () => {
    const onRetry = vi.fn();
    let attempt = 0;
    await expect(retryWithBackoff(async () => {
      attempt++;
      throw new Error('fail');
    }, {
      maxAttempts: 4,
      baseDelay: 100,
      maxDelay: 150,
      backoffFactor: 10,
      jitter: false,
      onRetry,
    })).rejects.toThrow('fail');
    // Third retry delay should be capped at 150
    const thirdDelay = onRetry.mock.calls[2]![2] as number;
    expect(thirdDelay).toBe(150);
  });

  it('should apply jitter when enabled', async () => {
    const delays: number[] = [];
    const onRetry = vi.fn((_a, _e, d) => delays.push(d));
    await expect(retryWithBackoff(async () => {
      throw new Error('fail');
    }, { maxAttempts: 3, baseDelay: 1000, jitter: true, onRetry })).rejects.toThrow();
    // With jitter, delay should be between 50-100% of base
    expect(delays[0]).toBeGreaterThanOrEqual(500);
    expect(delays[0]).toBeLessThanOrEqual(1000);
  });

  it('should handle non-Error throws', async () => {
    await expect(retryWithBackoff(async () => {
      throw 'string error';
    }, { maxAttempts: 1 })).rejects.toThrow('string error');
  });

  it('should default to 3 attempts', async () => {
    let attempt = 0;
    await expect(retryWithBackoff(async () => {
      attempt++;
      throw new Error('fail');
    }, { baseDelay: 10 })).rejects.toThrow();
    expect(attempt).toBe(3);
  });
});
