import { randomUUID } from 'node:crypto';
import type { Thought, ThoughtType, ThoughtSignificance, ConsciousnessStatus, EngineActivity } from './types.js';

// ── ThoughtStream ───────────────────────────────────────

type ThoughtListener = (thought: Thought) => void;

export class ThoughtStream {
  private buffer: Thought[] = [];
  private maxThoughts: number;
  private listeners: Set<ThoughtListener> = new Set();
  private startTime = Date.now();
  private totalEmitted = 0;

  constructor(maxThoughts = 500) {
    this.maxThoughts = maxThoughts;
  }

  /** Emit a thought into the stream. */
  emit(
    engine: string,
    type: ThoughtType,
    content: string,
    significance: ThoughtSignificance = 'routine',
    data?: unknown,
  ): Thought {
    const thought: Thought = {
      id: randomUUID(),
      timestamp: Date.now(),
      engine,
      type,
      content,
      significance,
      data,
    };

    this.buffer.push(thought);
    this.totalEmitted++;

    // Circular buffer: trim from front when over limit
    if (this.buffer.length > this.maxThoughts) {
      this.buffer.splice(0, this.buffer.length - this.maxThoughts);
    }

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(thought);
      } catch {
        // Don't let listener errors break the stream
      }
    }

    return thought;
  }

  /** Register a listener for new thoughts (used by SSE). */
  onThought(callback: ThoughtListener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Get the most recent N thoughts. */
  getRecent(limit = 50): Thought[] {
    const start = Math.max(0, this.buffer.length - limit);
    return this.buffer.slice(start).reverse();
  }

  /** Get thoughts filtered by engine. */
  getByEngine(engine: string, limit = 50): Thought[] {
    const filtered = this.buffer.filter(t => t.engine === engine);
    const start = Math.max(0, filtered.length - limit);
    return filtered.slice(start).reverse();
  }

  /** Get stats about the thought stream. */
  getStats(): ConsciousnessStatus {
    const perEngine: Record<string, number> = {};
    const perType: Record<string, number> = {};
    const perSignificance: Record<string, number> = {};
    const lastActiveByEngine: Record<string, number> = {};

    for (const t of this.buffer) {
      perEngine[t.engine] = (perEngine[t.engine] ?? 0) + 1;
      perType[t.type] = (perType[t.type] ?? 0) + 1;
      perSignificance[t.significance] = (perSignificance[t.significance] ?? 0) + 1;

      const prev = lastActiveByEngine[t.engine] ?? 0;
      if (t.timestamp > prev) lastActiveByEngine[t.engine] = t.timestamp;
    }

    // Active = had a thought in the last 60 seconds
    const now = Date.now();
    const activeEngines = Object.entries(lastActiveByEngine)
      .filter(([, ts]) => now - ts < 60_000)
      .map(([engine]) => engine);

    return {
      totalThoughts: this.totalEmitted,
      thoughtsPerEngine: perEngine,
      thoughtsPerType: perType,
      thoughtsPerSignificance: perSignificance,
      activeEngines,
      uptime: now - this.startTime,
    };
  }

  /** Get engine activity list for the status panel. */
  getEngineActivity(): EngineActivity[] {
    const engines = new Map<string, { total: number; discoveries: number; breakthroughs: number; lastActive: number }>();

    for (const t of this.buffer) {
      const entry = engines.get(t.engine) ?? { total: 0, discoveries: 0, breakthroughs: 0, lastActive: 0 };
      entry.total++;
      if (t.type === 'discovering') entry.discoveries++;
      if (t.significance === 'breakthrough') entry.breakthroughs++;
      if (t.timestamp > entry.lastActive) entry.lastActive = t.timestamp;
      engines.set(t.engine, entry);
    }

    const now = Date.now();
    return Array.from(engines.entries()).map(([engine, data]) => ({
      engine,
      status: (now - data.lastActive < 10_000 ? 'active' : now - data.lastActive < 300_000 ? 'idle' : 'sleeping') as EngineActivity['status'],
      lastActive: data.lastActive || null,
      metrics: {
        totalThoughts: data.total,
        discoveries: data.discoveries,
        breakthroughs: data.breakthroughs,
      },
    }));
  }

  /** Register an engine so it appears in getEngineActivity() even before it emits thoughts. */
  registerEngine(name: string): void {
    this.emit(name, 'perceiving', `Engine "${name}" registered`, 'routine');
  }

  /** Clear the buffer. */
  clear(): void {
    this.buffer = [];
    this.totalEmitted = 0;
  }

  /** Get listener count (for monitoring). */
  getListenerCount(): number {
    return this.listeners.size;
  }
}
