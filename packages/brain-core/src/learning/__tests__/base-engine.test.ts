import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLearningEngine } from '../base-engine.js';

class TestLearningEngine extends BaseLearningEngine {
  cycleCount = 0;
  runCycle(): { count: number } {
    this.cycleCount++;
    return { count: this.cycleCount };
  }
}

describe('BaseLearningEngine', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should run cycles at the configured interval', () => {
    const engine = new TestLearningEngine({ intervalMs: 1000 });
    engine.start();
    expect(engine.cycleCount).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(engine.cycleCount).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(engine.cycleCount).toBe(3);
    engine.stop();
  });

  it('should stop the timer', () => {
    const engine = new TestLearningEngine({ intervalMs: 500 });
    engine.start();
    vi.advanceTimersByTime(500);
    expect(engine.cycleCount).toBe(1);
    engine.stop();
    vi.advanceTimersByTime(2000);
    expect(engine.cycleCount).toBe(1);
  });

  it('should handle errors in runCycle gracefully', () => {
    class FailingEngine extends BaseLearningEngine {
      runCycle(): void { throw new Error('boom'); }
    }
    const engine = new FailingEngine({ intervalMs: 100 });
    engine.start();
    // Should not throw
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    engine.stop();
  });

  it('should be safe to call stop multiple times', () => {
    const engine = new TestLearningEngine({ intervalMs: 1000 });
    engine.start();
    engine.stop();
    engine.stop(); // No error
  });
});
