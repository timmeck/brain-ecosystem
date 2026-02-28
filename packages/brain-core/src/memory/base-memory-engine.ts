import { getLogger } from '../utils/logger.js';
import type { MemoryEngineConfig } from './types.js';

/**
 * Abstract base class for memory engines.
 * Handles timer lifecycle for periodic memory maintenance:
 * - Expiry checks (deactivate expired memories)
 * - Consolidation (merge similar memories)
 * - Importance decay (reduce importance of never-recalled memories)
 *
 * Subclasses implement runCycle().
 */
export abstract class BaseMemoryEngine {
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected logger = getLogger();

  constructor(protected config: MemoryEngineConfig) {}

  start(): void {
    this.timer = setInterval(() => {
      try {
        this.runCycle();
      } catch (err) {
        this.logger.error('Memory engine cycle error', { error: String(err) });
      }
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  abstract runCycle(): unknown;
}
