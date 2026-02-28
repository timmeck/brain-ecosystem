import { getLogger } from '../utils/logger.js';

export interface LearningEngineConfig {
  intervalMs: number;
}

/**
 * Abstract base class for learning engines.
 * Handles timer lifecycle — subclasses implement runCycle().
 */
export abstract class BaseLearningEngine {
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected logger = getLogger();

  constructor(protected engineConfig: LearningEngineConfig) {}

  start(): void {
    this.timer = setInterval(() => {
      try {
        this.runCycle();
      } catch (err) {
        this.logger.error('Learning cycle error', { error: String(err) });
      }
    }, this.engineConfig.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  abstract runCycle(): unknown;
}
