import { getLogger } from '../utils/logger.js';

export interface ResearchEngineConfig {
  intervalMs: number;
  initialDelayMs?: number;
}

/**
 * Abstract base class for research engines.
 * Supports optional initial delay before first cycle.
 * Handles timer lifecycle — subclasses implement runCycle().
 */
export abstract class BaseResearchEngine {
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected delayTimer: ReturnType<typeof setTimeout> | null = null;
  protected logger = getLogger();

  constructor(protected engineConfig: ResearchEngineConfig) {}

  start(): void {
    const delay = this.engineConfig.initialDelayMs;
    if (delay && delay > 0) {
      this.delayTimer = setTimeout(() => {
        this.safeRunCycle();
        this.timer = setInterval(() => this.safeRunCycle(), this.engineConfig.intervalMs);
      }, delay);
    } else {
      this.timer = setInterval(() => this.safeRunCycle(), this.engineConfig.intervalMs);
    }
  }

  stop(): void {
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private safeRunCycle(): void {
    try {
      this.runCycle();
    } catch (err) {
      this.logger.error('Research cycle error', { error: String(err) });
    }
  }

  abstract runCycle(): unknown;
}
