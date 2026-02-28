import crypto from 'node:crypto';
import type { MemoryRepository } from '../db/repositories/memory.repository.js';
import type { SessionRepository } from '../db/repositories/session.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { EmbeddingEngine } from '../embeddings/engine.js';
import type {
  MemoryRecord, SessionRecord,
  RememberInput, RecallInput, StartSessionInput, EndSessionInput,
} from '../types/memory.types.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export class MemoryService {
  private embeddingEngine: EmbeddingEngine | null = null;
  private logger = getLogger();

  constructor(
    private memoryRepo: MemoryRepository,
    private sessionRepo: SessionRepository,
    private projectRepo: ProjectRepository,
    private synapseManager: SynapseManager,
  ) {}

  setEmbeddingEngine(engine: EmbeddingEngine): void {
    this.embeddingEngine = engine;
  }

  // ── Core Memory Methods ──

  remember(input: RememberInput & { project?: string }): { memoryId: number; superseded?: number } {
    const bus = getEventBus();

    // Resolve project name to ID if provided
    let projectId = input.projectId ?? null;
    if (!projectId && input.project) {
      const project = this.projectRepo.findByName(input.project);
      if (project) projectId = project.id;
    }

    // Key-based upsert or plain create
    let result: { memoryId: number; superseded?: number };
    if (input.key) {
      result = this.memoryRepo.upsertByKey(
        projectId, input.key, input.content, input.category,
        input.importance ?? 5, input.source ?? 'explicit', input.tags,
      );
    } else {
      const memoryId = this.memoryRepo.create({
        project_id: projectId,
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
        embedding: null,
      });
      result = { memoryId };
    }

    // Synapses
    if (projectId) {
      this.synapseManager.strengthen(
        { type: 'memory', id: result.memoryId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }
    if (input.sessionId) {
      this.synapseManager.strengthen(
        { type: 'session', id: input.sessionId },
        { type: 'memory', id: result.memoryId },
        'remembers',
      );
    }

    bus.emit('memory:created', { memoryId: result.memoryId, projectId, category: input.category });

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
      results = this.memoryRepo.findActive(input.projectId, input.limit ?? 10);
    }

    // Filter by category if specified
    if (input.category) {
      results = results.filter(m => m.category === input.category);
    }

    // Filter by project if specified
    if (input.projectId) {
      results = results.filter(m => m.project_id === input.projectId || m.project_id === null);
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

  getPreferences(projectId?: number): MemoryRecord[] {
    return this.memoryRepo.findByCategory('preference', projectId);
  }

  getDecisions(projectId?: number): MemoryRecord[] {
    return this.memoryRepo.findByCategory('decision', projectId);
  }

  getGoals(projectId?: number): MemoryRecord[] {
    return this.memoryRepo.findByCategory('goal', projectId);
  }

  getLessons(projectId?: number): MemoryRecord[] {
    return this.memoryRepo.findByCategory('lesson', projectId);
  }

  // ── Session Methods ──

  startSession(input: StartSessionInput & { project?: string }): { sessionId: number; dbSessionId: string } {
    const bus = getEventBus();
    const uuid = input.sessionId ?? crypto.randomUUID();

    // Resolve project
    let projectId = input.projectId ?? null;
    if (!projectId && input.project) {
      let project = this.projectRepo.findByName(input.project);
      if (!project) {
        // Auto-create project
        const id = this.projectRepo.create({ name: input.project, path: null, language: null, framework: null });
        project = this.projectRepo.getById(id);
      }
      if (project) projectId = project.id;
    }

    // Check if session already exists
    const existing = this.sessionRepo.findBySessionId(uuid);
    if (existing) {
      return { sessionId: existing.id, dbSessionId: uuid };
    }

    const id = this.sessionRepo.create({
      session_id: uuid,
      project_id: projectId,
      started_at: new Date().toISOString(),
      ended_at: null,
      summary: null,
      goals: input.goals ? JSON.stringify(input.goals) : null,
      outcome: null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      embedding: null,
    });

    if (projectId) {
      this.synapseManager.strengthen(
        { type: 'session', id },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }

    bus.emit('session:started', { sessionId: id, projectId });
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

    const session = this.sessionRepo.getById(input.sessionId);
    bus.emit('session:ended', { sessionId: input.sessionId, summary: input.summary });
    this.logger.info(`Session #${input.sessionId} ended (${input.outcome ?? 'completed'})`);

    // Link memories from this session
    if (session) {
      const memories = this.memoryRepo.findBySession(input.sessionId);
      for (const mem of memories) {
        this.synapseManager.strengthen(
          { type: 'session', id: input.sessionId },
          { type: 'memory', id: mem.id },
          'remembers',
        );
      }
    }
  }

  getSessionHistory(projectId?: number, limit?: number): SessionRecord[] {
    if (projectId) return this.sessionRepo.findByProject(projectId, limit ?? 20);
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
