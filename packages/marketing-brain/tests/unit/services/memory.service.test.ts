import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from '../../../src/services/memory.service.js';
import type { MemoryRepository } from '../../../src/db/repositories/memory.repository.js';
import type { SessionRepository } from '../../../src/db/repositories/session.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(),
  }),
}));

function makeMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, content: 'Test memory', category: 'fact', key: null,
    importance: 5, source: 'user', tags: null, active: 1,
    session_id: null, superseded_by: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, session_id: 'test-uuid-123', goals: null, summary: null,
    outcome: null, started_at: '2026-01-01T00:00:00.000Z', ended_at: null,
    ...overrides,
  };
}

describe('MemoryService', () => {
  let service: MemoryService;
  let memoryRepo: Record<string, ReturnType<typeof vi.fn>>;
  let sessionRepo: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    memoryRepo = {
      create: vi.fn(), getById: vi.fn(), findByKey: vi.fn(),
      findByCategory: vi.fn(), findActive: vi.fn(), search: vi.fn(),
      supersede: vi.fn(), deactivate: vi.fn(), expireOld: vi.fn(),
      update: vi.fn(), findBySession: vi.fn(), upsertByKey: vi.fn(),
      countActive: vi.fn(), countByCategory: vi.fn(),
    };
    sessionRepo = {
      create: vi.fn(), getById: vi.fn(), findBySessionId: vi.fn(),
      findRecent: vi.fn(), update: vi.fn(), search: vi.fn(),
      countAll: vi.fn(), findLast: vi.fn(), findByProject: vi.fn(),
    };
    synapseManager = {
      strengthen: vi.fn(), weaken: vi.fn(), activate: vi.fn(),
    };
    service = new MemoryService(
      memoryRepo as unknown as MemoryRepository,
      sessionRepo as unknown as SessionRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  // --- remember ---

  describe('remember', () => {
    it('creates a new memory without key', () => {
      memoryRepo.create.mockReturnValue(42);

      const result = service.remember({ content: 'Test memory', category: 'fact' });

      expect(result).toEqual({ memoryId: 42 });
      expect(memoryRepo.create).toHaveBeenCalledOnce();
    });

    it('upserts memory with key', () => {
      memoryRepo.upsertByKey.mockReturnValue({ memoryId: 10 });

      const result = service.remember({
        content: 'Updated preference', category: 'preference', key: 'theme',
      });

      expect(result).toEqual({ memoryId: 10 });
      expect(memoryRepo.upsertByKey).toHaveBeenCalledOnce();
    });

    it('returns superseded id when key upsert replaces existing', () => {
      memoryRepo.upsertByKey.mockReturnValue({ memoryId: 11, superseded: 5 });

      const result = service.remember({
        content: 'New value', category: 'preference', key: 'theme',
      });

      expect(result).toEqual({ memoryId: 11, superseded: 5 });
    });
  });

  // --- recall ---

  describe('recall', () => {
    it('searches memories by query', () => {
      const memories = [makeMemory({ id: 1 }), makeMemory({ id: 2 })];
      memoryRepo.search.mockReturnValue(memories);

      const result = service.recall({ query: 'test' });

      expect(result).toEqual(memories);
      expect(memoryRepo.search).toHaveBeenCalledWith('test', 10);
    });

    it('filters by category', () => {
      const memories = [
        makeMemory({ id: 1, category: 'goal' }),
        makeMemory({ id: 2, category: 'fact' }),
      ];
      memoryRepo.search.mockReturnValue(memories);

      const result = service.recall({ query: 'test', category: 'goal' });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('goal');
    });

    it('falls back to findActive on FTS error', () => {
      memoryRepo.search.mockImplementation(() => { throw new Error('FTS error'); });
      memoryRepo.findActive.mockReturnValue([makeMemory()]);

      const result = service.recall({ query: 'test' });

      expect(result).toHaveLength(1);
      expect(memoryRepo.findActive).toHaveBeenCalled();
    });

    it('respects limit parameter', () => {
      memoryRepo.search.mockReturnValue([]);
      service.recall({ query: 'test', limit: 5 });
      expect(memoryRepo.search).toHaveBeenCalledWith('test', 5);
    });
  });

  // --- forget ---

  describe('forget', () => {
    it('deactivates a memory', () => {
      service.forget(42);
      expect(memoryRepo.deactivate).toHaveBeenCalledWith(42);
    });
  });

  // --- sessions ---

  describe('startSession', () => {
    it('creates a new session', () => {
      sessionRepo.findBySessionId.mockReturnValue(null);
      sessionRepo.create.mockReturnValue(5);

      const result = service.startSession({});

      expect(result.sessionId).toBe(5);
      expect(result.dbSessionId).toBeDefined();
      expect(sessionRepo.create).toHaveBeenCalledOnce();
    });

    it('returns existing session if already started', () => {
      const session = makeSession({ id: 3, session_id: 'existing-uuid' });
      sessionRepo.findBySessionId.mockReturnValue(session);

      const result = service.startSession({ sessionId: 'existing-uuid' });

      expect(result).toEqual({ sessionId: 3, dbSessionId: 'existing-uuid' });
      expect(sessionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    it('updates session with summary and outcome', () => {
      memoryRepo.findBySession.mockReturnValue([]);

      service.endSession({
        sessionId: 1, summary: 'Completed analysis', outcome: 'completed',
      });

      expect(sessionRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({
        summary: 'Completed analysis',
        outcome: 'completed',
      }));
    });

    it('wires synapse connections for session memories', () => {
      memoryRepo.findBySession.mockReturnValue([
        makeMemory({ id: 10 }),
        makeMemory({ id: 20 }),
      ]);

      service.endSession({ sessionId: 1, summary: 'Done' });

      expect(synapseManager.strengthen).toHaveBeenCalledTimes(2);
      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'session', id: 1 },
        { type: 'memory', id: 10 },
        'remembers',
      );
      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'session', id: 1 },
        { type: 'memory', id: 20 },
        'remembers',
      );
    });

    it('defaults outcome to completed', () => {
      memoryRepo.findBySession.mockReturnValue([]);
      service.endSession({ sessionId: 1, summary: 'Done' });

      expect(sessionRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({
        outcome: 'completed',
      }));
    });
  });

  describe('getSessionHistory', () => {
    it('returns recent sessions', () => {
      const sessions = [makeSession({ id: 1 }), makeSession({ id: 2 })];
      sessionRepo.findRecent.mockReturnValue(sessions);

      const result = service.getSessionHistory(10);

      expect(result).toEqual(sessions);
      expect(sessionRepo.findRecent).toHaveBeenCalledWith(10);
    });

    it('defaults to 20 sessions', () => {
      sessionRepo.findRecent.mockReturnValue([]);
      service.getSessionHistory();
      expect(sessionRepo.findRecent).toHaveBeenCalledWith(20);
    });
  });

  // --- stats ---

  describe('getStats', () => {
    it('returns memory and session stats', () => {
      memoryRepo.countActive.mockReturnValue(15);
      memoryRepo.countByCategory.mockReturnValue({ fact: 10, goal: 5 });
      sessionRepo.countAll.mockReturnValue(3);
      sessionRepo.findLast.mockReturnValue(makeSession());

      const stats = service.getStats();

      expect(stats.active).toBe(15);
      expect(stats.sessions).toBe(3);
      expect(stats.lastSession).toBeDefined();
    });

    it('handles no last session', () => {
      memoryRepo.countActive.mockReturnValue(0);
      memoryRepo.countByCategory.mockReturnValue({});
      sessionRepo.countAll.mockReturnValue(0);
      sessionRepo.findLast.mockReturnValue(null);

      const stats = service.getStats();

      expect(stats.active).toBe(0);
      expect(stats.lastSession).toBeUndefined();
    });
  });

  // --- category helpers ---

  describe('category helpers', () => {
    it('getPreferences returns preference memories', () => {
      memoryRepo.findByCategory.mockReturnValue([makeMemory({ category: 'preference' })]);
      const result = service.getPreferences();
      expect(memoryRepo.findByCategory).toHaveBeenCalledWith('preference');
      expect(result).toHaveLength(1);
    });

    it('getGoals returns goal memories', () => {
      memoryRepo.findByCategory.mockReturnValue([makeMemory({ category: 'goal' })]);
      const result = service.getGoals();
      expect(memoryRepo.findByCategory).toHaveBeenCalledWith('goal');
      expect(result).toHaveLength(1);
    });

    it('getLessons returns lesson memories', () => {
      memoryRepo.findByCategory.mockReturnValue([makeMemory({ category: 'lesson' })]);
      const result = service.getLessons();
      expect(memoryRepo.findByCategory).toHaveBeenCalledWith('lesson');
      expect(result).toHaveLength(1);
    });
  });

  // --- maintenance ---

  describe('expireOldMemories', () => {
    it('delegates to repository', () => {
      memoryRepo.expireOld.mockReturnValue(3);
      const result = service.expireOldMemories();
      expect(result).toBe(3);
    });
  });
});
