import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseResearchEngine } from '../base-engine.js';

class TestResearchEngine extends BaseResearchEngine {
  cycleCount = 0;
  runCycle(): { count: number } {
    this.cycleCount++;
    return { count: this.cycleCount };
  }
}

describe('BaseResearchEngine', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should run without initial delay when not configured', () => {
    const engine = new TestResearchEngine({ intervalMs: 1000 });
    engine.start();
    vi.advanceTimersByTime(1000);
    expect(engine.cycleCount).toBe(1);
    engine.stop();
  });

  it('should delay first cycle when initialDelayMs is set', () => {
    const engine = new TestResearchEngine({ intervalMs: 1000, initialDelayMs: 5000 });
    engine.start();
    vi.advanceTimersByTime(4999);
    expect(engine.cycleCount).toBe(0);
    vi.advanceTimersByTime(1); // 5000ms total
    expect(engine.cycleCount).toBe(1); // First cycle from delay
    vi.advanceTimersByTime(1000);
    expect(engine.cycleCount).toBe(2); // Second from interval
    engine.stop();
  });

  it('should clean up both timers on stop', () => {
    const engine = new TestResearchEngine({ intervalMs: 1000, initialDelayMs: 5000 });
    engine.start();
    engine.stop();
    vi.advanceTimersByTime(10000);
    expect(engine.cycleCount).toBe(0);
  });

  it('should handle errors in runCycle gracefully', () => {
    class FailingEngine extends BaseResearchEngine {
      runCycle(): void { throw new Error('boom'); }
    }
    const engine = new FailingEngine({ intervalMs: 100 });
    engine.start();
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    engine.stop();
  });

  it('should be safe to call stop before delay fires', () => {
    const engine = new TestResearchEngine({ intervalMs: 1000, initialDelayMs: 5000 });
    engine.start();
    vi.advanceTimersByTime(2000);
    engine.stop();
    vi.advanceTimersByTime(10000);
    expect(engine.cycleCount).toBe(0);
  });
});
