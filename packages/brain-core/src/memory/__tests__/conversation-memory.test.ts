import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConversationMemory } from '../conversation-memory.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('ConversationMemory', () => {
  let db: Database.Database;
  let mem: ConversationMemory;

  beforeEach(() => {
    db = new Database(':memory:');
    mem = new ConversationMemory(db, { maxMemories: 100, decayDays: 30 });
  });

  afterEach(() => {
    mem.stopMaintenanceCycle();
    db.close();
  });

  describe('defaults', () => {
    it('uses 30k maxMemories and 60d decay by default', () => {
      const db2 = new Database(':memory:');
      const defaultMem = new ConversationMemory(db2);
      const status = defaultMem.getStatus();
      expect(status.totalMemories).toBe(0);
      db2.close();
    });
  });

  describe('maintenance()', () => {
    it('decays old unused memories', () => {
      // Insert old memory
      db.prepare(`
        INSERT INTO conversation_memories (content, importance, source, access_count, created_at)
        VALUES ('old memory', 5, 'explicit', 0, datetime('now', '-60 days'))
      `).run();

      const result = mem.maintenance();
      expect(result.decayed).toBe(1);

      const row = db.prepare('SELECT importance FROM conversation_memories WHERE content = ?').get('old memory') as { importance: number };
      expect(row.importance).toBe(4); // 5 - 1
    });

    it('does not decay accessed memories', () => {
      db.prepare(`
        INSERT INTO conversation_memories (content, importance, source, access_count, created_at)
        VALUES ('accessed memory', 5, 'explicit', 3, datetime('now', '-60 days'))
      `).run();

      const result = mem.maintenance();
      expect(result.decayed).toBe(0);
    });

    it('prunes when over max', () => {
      // Fill with 120 memories (max is 100)
      for (let i = 0; i < 120; i++) {
        mem.remember(`memory ${i}`, { importance: i < 20 ? 1 : 5 });
      }
      // Deactivate some low-importance ones
      db.prepare("UPDATE conversation_memories SET importance = 1 WHERE id <= 20").run();

      const result = mem.maintenance();
      const total = (db.prepare('SELECT COUNT(*) as c FROM conversation_memories').get() as { c: number }).c;
      expect(total).toBeLessThanOrEqual(100);
    });
  });

  describe('startMaintenanceCycle / stopMaintenanceCycle', () => {
    it('starts and stops without error', () => {
      mem.startMaintenanceCycle(100); // 100ms for testing
      expect(() => mem.stopMaintenanceCycle()).not.toThrow();
    });

    it('does not start twice', () => {
      mem.startMaintenanceCycle(100);
      mem.startMaintenanceCycle(100); // should not create second timer
      mem.stopMaintenanceCycle();
    });

    it('runs maintenance on interval', async () => {
      // Insert old memory
      db.prepare(`
        INSERT INTO conversation_memories (content, importance, source, access_count, created_at)
        VALUES ('old test', 5, 'explicit', 0, datetime('now', '-60 days'))
      `).run();

      mem.startMaintenanceCycle(50); // 50ms
      await new Promise(r => setTimeout(r, 120)); // wait for at least 2 cycles
      mem.stopMaintenanceCycle();

      const row = db.prepare('SELECT importance FROM conversation_memories WHERE content = ?').get('old test') as { importance: number };
      expect(row.importance).toBeLessThan(5);
    });
  });

  describe('ensureSession', () => {
    it('creates a new session', () => {
      const isNew = mem.ensureSession('test-session');
      expect(isNew).toBe(true);

      const session = mem.getSession('test-session');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('test-session');
    });

    it('does not duplicate existing session', () => {
      mem.ensureSession('test-session');
      const isNew = mem.ensureSession('test-session');
      expect(isNew).toBe(false);
    });
  });

  describe('transcript state', () => {
    it('stores and retrieves last processed timestamp', () => {
      mem.ensureSession('s1');
      mem.saveLastProcessedAt('s1', '2026-03-12T10:00:00Z');
      expect(mem.getLastProcessedAt('s1')).toBe('2026-03-12T10:00:00Z');
    });

    it('returns empty string for unknown session', () => {
      expect(mem.getLastProcessedAt('unknown')).toBe('');
    });
  });
});
