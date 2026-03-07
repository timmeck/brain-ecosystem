import { getLogger } from '../utils/logger.js';

// Re-use the same shape but with numeric timestamp for fast comparison
export interface CorrelatorEvent {
  source: string;
  event: string;
  data: unknown;
  timestamp: number; // epoch ms
}

export interface Correlation {
  id: string; // e.g., "brain:error:reported↔trading-brain:trade:outcome"
  sourceA: string; // brain name
  eventA: string; // event type
  sourceB: string;
  eventB: string;
  type: string; // human label: "error-trade-loss", "error-trade-win", etc.
  strength: number; // 0-1, based on frequency
  count: number; // how many times seen
  lastSeen: number; // epoch ms
}

export interface EcosystemHealth {
  score: number; // 0-100
  status: 'healthy' | 'degraded' | 'critical';
  activeBrains: number;
  totalEvents: number;
  correlations: number;
  recentErrors: number; // errors in last 5min
  recentTradeLosses: number; // trade losses in last 5min
  alerts: string[]; // human-readable alerts
}

export interface CorrelatorConfig {
  maxEvents?: number; // default 1000
  windowMs?: number; // correlation window, default 5 min
  decayFactor?: number; // strength decay per hour, default 0.95
}

const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_DECAY_FACTOR = 0.95;
const ACTIVE_BRAIN_THRESHOLD_MS = 60 * 1000; // 60 seconds
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * CrossBrainCorrelator — detects temporal correlations between events
 * from different brains in the ecosystem.
 */
export class CrossBrainCorrelator {
  private logger = getLogger();
  private events: CorrelatorEvent[] = [];
  private correlations: Map<string, Correlation> = new Map();
  private brainLastSeen: Map<string, number> = new Map();

  private maxEvents: number;
  private windowMs: number;
  private decayFactor: number;

  constructor(config?: CorrelatorConfig) {
    this.maxEvents = config?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.windowMs = config?.windowMs ?? DEFAULT_WINDOW_MS;
    this.decayFactor = config?.decayFactor ?? DEFAULT_DECAY_FACTOR;
  }

  /**
   * Record an event from a brain. Adds to the circular buffer and
   * runs correlation detection against recent events from OTHER brains.
   */
  recordEvent(source: string, event: string, data: unknown): void {
    const now = Date.now();

    const correlatorEvent: CorrelatorEvent = {
      source,
      event,
      data,
      timestamp: now,
    };

    // Circular buffer: splice oldest when over capacity
    if (this.events.length >= this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents + 1);
    }

    this.events.push(correlatorEvent);
    this.brainLastSeen.set(source, now);

    this.logger.debug(`Correlator recorded event: ${source}/${event}`);

    this.detectCorrelations();
  }

  /**
   * Look at the last event added. Find events from other brains within
   * the correlation window. For each match, create or update a Correlation.
   */
  private detectCorrelations(): void {
    if (this.events.length < 2) return;

    const latest = this.events[this.events.length - 1];
    const windowStart = latest.timestamp - this.windowMs;

    for (let i = this.events.length - 2; i >= 0; i--) {
      const other = this.events[i];

      // Stop scanning once we're outside the window
      if (other.timestamp < windowStart) break;

      // Only correlate events from different brains
      if (other.source === latest.source) continue;

      const type = this.classifyCorrelation(latest, other);
      const id = this.buildCorrelationId(latest, other);

      const existing = this.correlations.get(id);
      if (existing) {
        existing.count += 1;
        existing.strength = Math.min(1, existing.count / 10);
        existing.lastSeen = latest.timestamp;
        existing.type = type; // update type in case data changed
      } else {
        // Determine stable ordering (alphabetical by descriptor)
        const descA = `${latest.source}:${latest.event}`;
        const descB = `${other.source}:${other.event}`;
        const [first] = [descA, descB].sort();
        const isSwapped = first !== descA;

        const correlation: Correlation = {
          id,
          sourceA: isSwapped ? other.source : latest.source,
          eventA: isSwapped ? other.event : latest.event,
          sourceB: isSwapped ? latest.source : other.source,
          eventB: isSwapped ? latest.event : other.event,
          type,
          strength: Math.min(1, 1 / 10), // first occurrence
          count: 1,
          lastSeen: latest.timestamp,
        };

        this.correlations.set(id, correlation);
        this.logger.debug(
          `New correlation detected: ${id} (type: ${type})`,
        );
      }
    }
  }

  /**
   * Classify the correlation type based on the two events.
   * Order-independent: checks both directions.
   */
  private classifyCorrelation(
    a: CorrelatorEvent,
    b: CorrelatorEvent,
  ): string {
    // Check both orderings for error + trade correlation
    const errorEvent = [a, b].find((e) => e.event === 'error:reported');
    const tradeEvent = [a, b].find((e) => e.event === 'trade:outcome');

    if (errorEvent && tradeEvent) {
      const tradeData = tradeEvent.data as Record<string, unknown> | null;
      if (tradeData && tradeData.win === false) {
        return 'error-trade-loss';
      }
      if (tradeData && tradeData.win === true) {
        return 'error-trade-win';
      }
    }

    // Error + publish correlation (order-independent)
    const hasError = [a, b].some((e) => e.event === 'error:reported');
    const hasPublish = [a, b].some((e) => e.event === 'post:published');

    if (hasError && hasPublish) {
      return 'publish-during-errors';
    }

    // Insight from one brain + anything from another
    const hasInsight = [a, b].some((e) => e.event === 'insight:created');

    if (hasInsight) {
      return 'cross-brain-insight';
    }

    return 'temporal-co-occurrence';
  }

  /**
   * Build a stable correlation ID by sorting the two event descriptors
   * alphabetically. This ensures the same pair always produces the same ID
   * regardless of arrival order.
   */
  private buildCorrelationId(
    a: CorrelatorEvent,
    b: CorrelatorEvent,
  ): string {
    const descA = `${a.source}:${a.event}`;
    const descB = `${b.source}:${b.event}`;
    const sorted = [descA, descB].sort();
    return `${sorted[0]}\u2194${sorted[1]}`; // ↔ character
  }

  /**
   * Return correlations sorted by strength (descending).
   * Optionally filter by minimum strength.
   */
  getCorrelations(minStrength?: number): Correlation[] {
    const all = Array.from(this.correlations.values());

    const filtered =
      minStrength !== undefined
        ? all.filter((c) => c.strength >= minStrength)
        : all;

    return filtered.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Return the most recent events from the buffer.
   */
  getTimeline(limit: number = 50): CorrelatorEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Compute ecosystem health based on recent events and correlations.
   */
  getHealth(): EcosystemHealth {
    const now = Date.now();
    const fiveMinAgo = now - FIVE_MINUTES_MS;

    // Count recent errors
    const recentErrors = this.events.filter(
      (e) => e.event === 'error:reported' && e.timestamp >= fiveMinAgo,
    ).length;

    // Count recent trade losses
    const recentTradeLosses = this.events.filter((e) => {
      if (e.event !== 'trade:outcome' || e.timestamp < fiveMinAgo) return false;
      const d = e.data as Record<string, unknown> | null;
      return d && d.win === false;
    }).length;

    // Count error-trade-loss correlations seen in last 5 min
    const recentLossCorrelations = Array.from(
      this.correlations.values(),
    ).filter(
      (c) => c.type === 'error-trade-loss' && c.lastSeen >= fiveMinAgo,
    ).length;

    // Active brains
    const activeBrains = this.getActiveBrains();

    // Calculate score
    let score = 100;
    score -= recentErrors * 10;
    score -= recentLossCorrelations * 15;
    score += activeBrains.length * 5;

    // Clamp to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine status
    let status: 'healthy' | 'degraded' | 'critical';
    if (score >= 70) {
      status = 'healthy';
    } else if (score >= 40) {
      status = 'degraded';
    } else {
      status = 'critical';
    }

    // Generate alerts
    const alerts: string[] = [];

    if (recentErrors > 0) {
      alerts.push(
        `${recentErrors} error(s) reported in the last 5 minutes`,
      );
    }

    if (recentLossCorrelations > 0) {
      alerts.push(
        `${recentLossCorrelations} error-trade-loss correlation(s) detected recently`,
      );
    }

    // Alert on strong concerning correlations
    for (const c of this.correlations.values()) {
      if (
        c.strength >= 0.5 &&
        c.lastSeen >= fiveMinAgo &&
        (c.type === 'error-trade-loss' || c.type === 'publish-during-errors')
      ) {
        alerts.push(
          `Strong ${c.type} correlation between ${c.sourceA} and ${c.sourceB} (strength: ${c.strength.toFixed(2)}, seen ${c.count} times)`,
        );
      }
    }

    if (activeBrains.length === 0) {
      alerts.push('No active brains detected in the last 60 seconds');
    }

    return {
      score,
      status,
      activeBrains: activeBrains.length,
      totalEvents: this.events.length,
      correlations: this.correlations.size,
      recentErrors,
      recentTradeLosses,
      alerts,
    };
  }

  /**
   * Return brain names that have sent an event in the last 60 seconds.
   */
  getActiveBrains(): string[] {
    const now = Date.now();
    const threshold = now - ACTIVE_BRAIN_THRESHOLD_MS;
    const active: string[] = [];

    for (const [brain, lastSeen] of this.brainLastSeen) {
      if (lastSeen >= threshold) {
        active.push(brain);
      }
    }

    return active;
  }

  /**
   * Return the total number of events currently in the buffer.
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Reset all state: events, correlations, and brain tracking.
   */
  clear(): void {
    this.events = [];
    this.correlations.clear();
    this.brainLastSeen.clear();
    this.logger.debug('Correlator state cleared');
  }
}
