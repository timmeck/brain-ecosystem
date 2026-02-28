import crypto from 'node:crypto';
import type { MemoryRepository } from '../db/repositories/memory.repository.js';
import type { SessionRepository } from '../db/repositories/session.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type {
  MemoryRecord, SessionRecord,
  RememberInput, RecallInput, StartSessionInput, EndSessionInput,
} from '../types/memory.types.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export class MemoryService {
  private logger = getLogger();

  constructor(
    private memoryRepo: MemoryRepository,
    private sessionRepo: SessionRepository,
    private synapseManager: SynapseManager,
  ) {}

  // ── Core Memory Methods ──

  remember(input: RememberInput): { memoryId: number; superseded?: number } {
    const bus = getEventBus();

    // Key-based upsert or plain create
    let result: { memoryId: number; superseded?: number };
    if (input.key) {
      result = this.memoryRepo.upsertByKey(
        input.key, input.content, input.category,
        input.importance ?? 5, input.source ?? 'explicit', input.tags,
      );
    } else {
      const memoryId = this.memoryRepo.create({
        session_id: input.sessionId ?? null,
        category: input.category,
        key: null,
        content: input.content,
        importance: input.importance ?? 5,
        source: input.source ?? 'explicit',
        tags: input.tags ? JSON.stringify(input.tags) : null,
        expires_at: input.expiresAt ?? null,
        superseded_by: null,
        active: 1,
      });
      result = { memoryId };
    }

    bus.emit('memory:created', { memoryId: result.memoryId, category: input.category });

    if (result.superseded) {
      bus.emit('memory:superseded', { oldId: result.superseded, newId: result.memoryId });
    }

    this.logger.info(`Memory #${result.memoryId} stored (${input.category})${result.superseded ? ` superseding #${result.superseded}` : ''}`);
    return result;
  }

  recall(input: RecallInput): MemoryRecord[] {
    // FTS search
    let results: MemoryRecord[];
    try {
      results = this.memoryRepo.search(input.query, input.limit ?? 10);
    } catch {
      // FTS match syntax can fail — fall back to active memories
      results = this.memoryRepo.findActive(undefined, input.limit ?? 10);
    }

    // Filter by category if specified
    if (input.category) {
      results = results.filter(m => m.category === input.category);
    }

    // Filter active only (default true)
    if (input.activeOnly !== false) {
      results = results.filter(m => m.active === 1);
    }

    return results;
  }

  forget(memoryId: number): void {
    this.memoryRepo.deactivate(memoryId);
    this.logger.info(`Memory #${memoryId} deactivated`);
  }

  getPreferences(): MemoryRecord[] {
    return this.memoryRepo.findByCategory('preference');
  }

  getDecisions(): MemoryRecord[] {
    return this.memoryRepo.findByCategory('decision');
  }

  getGoals(): MemoryRecord[] {
    return this.memoryRepo.findByCategory('goal');
  }

  getLessons(): MemoryRecord[] {
    return this.memoryRepo.findByCategory('lesson');
  }

  // ── Session Methods ──

  startSession(input: StartSessionInput): { sessionId: number; dbSessionId: string } {
    const bus = getEventBus();
    const uuid = input.sessionId ?? crypto.randomUUID();

    // Check if session already exists
    const existing = this.sessionRepo.findBySessionId(uuid);
    if (existing) {
      return { sessionId: existing.id, dbSessionId: uuid };
    }

    const id = this.sessionRepo.create({
      session_id: uuid,
      started_at: new Date().toISOString(),
      ended_at: null,
      summary: null,
      goals: input.goals ? JSON.stringify(input.goals) : null,
      outcome: null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    bus.emit('session:started', { sessionId: id });
    this.logger.info(`Session #${id} started (${uuid})`);
    return { sessionId: id, dbSessionId: uuid };
  }

  endSession(input: EndSessionInput): void {
    const bus = getEventBus();

    this.sessionRepo.update(input.sessionId, {
      summary: input.summary,
      ended_at: new Date().toISOString(),
      outcome: input.outcome ?? 'completed',
    });

    bus.emit('session:ended', { sessionId: input.sessionId, summary: input.summary });
    this.logger.info(`Session #${input.sessionId} ended (${input.outcome ?? 'completed'})`);

    // Link memories from this session via synapses
    const memories = this.memoryRepo.findBySession(input.sessionId);
    for (const mem of memories) {
      this.synapseManager.strengthen(
        { type: 'session', id: input.sessionId },
        { type: 'memory', id: mem.id },
        'remembers',
      );
    }
  }

  getSessionHistory(limit?: number): SessionRecord[] {
    return this.sessionRepo.findRecent(limit ?? 20);
  }

  getCurrentSession(sessionUuid: string): SessionRecord | undefined {
    return this.sessionRepo.findBySessionId(sessionUuid);
  }

  // ── Stats ──

  getStats(): { active: number; byCategory: Record<string, number>; sessions: number; lastSession?: string } {
    const active = this.memoryRepo.countActive();
    const byCategory = this.memoryRepo.countByCategory();
    const sessions = this.sessionRepo.countAll();
    const last = this.sessionRepo.findLast();
    return {
      active,
      byCategory,
      sessions,
      lastSession: last?.started_at,
    };
  }

  // ── Maintenance ──

  expireOldMemories(): number {
    return this.memoryRepo.expireOld();
  }
}
