import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ConversationMemory } from '../../../src/memory/conversation-memory.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('ConversationMemory', () => {
  let db: Database.Database;
  let mem: ConversationMemory;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    mem = new ConversationMemory(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Construction ────────────────────────────────────────

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);
    expect(names).toContain('conversation_memories');
    expect(names).toContain('conversation_sessions');
  });

  // ── Remember ──────────────────────────────────────────

  it('should store a memory and return ID', () => {
    const id = mem.remember('Brain uses SQLite for persistence');
    expect(id).toBeGreaterThan(0);
  });

  it('should store with category and tags', () => {
    const id = mem.remember('Always use vitest for testing', {
      category: 'preference',
      key: 'test_framework',
      importance: 8,
      tags: ['testing', 'tooling'],
    });

    const found = mem.getByKey('test_framework');
    expect(found).not.toBeNull();
    expect(found!.content).toBe('Always use vitest for testing');
    expect(found!.category).toBe('preference');
    expect(found!.importance).toBe(8);
    expect(found!.tags).toEqual(['testing', 'tooling']);
  });

  it('should update existing memory when key matches', () => {
    mem.remember('Port 7777 for REST API', { key: 'brain_port', importance: 5 });
    mem.remember('Port 7777 for REST API (updated)', { key: 'brain_port', importance: 8 });

    const found = mem.getByKey('brain_port');
    expect(found!.content).toBe('Port 7777 for REST API (updated)');
    expect(found!.importance).toBe(8);  // Max of old and new
  });

  it('should store with session ID', () => {
    mem.remember('We fixed the IPC timeout bug', {
      category: 'context',
      sessionId: 'session-123',
      tags: ['bugfix', 'ipc'],
    });

    const recent = mem.getRecentContext(5);
    expect(recent[0]!.sessionId).toBe('session-123');
  });

  // ── Recall (text search) ──────────────────────────────

  it('should find memories by text search', () => {
    mem.remember('Monorepo with brain-core, brain, trading-brain, marketing-brain', { key: 'architecture' });
    mem.remember('SQLite with WAL mode for all databases', { key: 'database' });
    mem.remember('Playwright for web scraping and browser automation', { key: 'playwright' });

    const results = mem.searchText('SQLite database');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.memory.content).toContain('SQLite');
  });

  it('should find memories by keyword in content', () => {
    mem.remember('OpenBrowser uses LLM-driven feedback loops for autonomous browsing');
    mem.remember('BrowserAgent has StallDetector for loop prevention');

    const results = mem.searchText('browser autonomous');
    expect(results.length).toBeGreaterThan(0);
  });

  // ── Category Retrieval ────────────────────────────────

  it('should retrieve by category', () => {
    mem.remember('Use TypeScript strict mode', { category: 'preference', importance: 7 });
    mem.remember('Chose SQLite over PostgreSQL', { category: 'decision', importance: 8 });
    mem.remember('Build 60+ engines ecosystem', { category: 'goal', importance: 9 });

    const decisions = mem.getByCategory('decision');
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.content).toContain('SQLite');

    const goals = mem.getByCategory('goal');
    expect(goals.length).toBe(1);
  });

  // ── Important Memories ────────────────────────────────

  it('should get important memories', () => {
    mem.remember('Minor detail', { importance: 2 });
    mem.remember('Critical architecture decision', { importance: 9 });
    mem.remember('Medium fact', { importance: 5 });

    const important = mem.getImportant(10, 7);
    expect(important.length).toBe(1);
    expect(important[0]!.content).toContain('Critical');
  });

  // ── Context Building ──────────────────────────────────

  it('should build context summary', () => {
    mem.remember('Use Commander.js for CLI', { category: 'decision', importance: 7 });
    mem.remember('German comments in code', { category: 'preference', importance: 6 });
    mem.remember('Reach 5000 tests', { category: 'goal', importance: 8 });
    mem.remember('Empty catch blocks should log', { category: 'lesson', importance: 7 });

    const context = mem.buildContext();
    expect(context).toContain('Key Decisions');
    expect(context).toContain('Preferences');
    expect(context).toContain('Active Goals');
    expect(context).toContain('Lessons Learned');
    expect(context).toContain('Commander.js');
  });

  // ── Sessions ──────────────────────────────────────────

  it('should start and end a session', () => {
    mem.startSession('sess-abc', ['Fix IPC bug', 'Add BrowserAgent']);
    mem.remember('Fixed IPC timeout by cleaning knowledge_connections', { sessionId: 'sess-abc' });
    mem.endSession('sess-abc', 'Fixed IPC, added BrowserAgent with LLM loop');

    const session = mem.getSession('sess-abc');
    expect(session).not.toBeNull();
    expect(session!.summary).toContain('BrowserAgent');
    expect(session!.goals).toEqual(['Fix IPC bug', 'Add BrowserAgent']);
    expect(session!.memoriesCreated).toBeGreaterThanOrEqual(1);
  });

  // ── Forget ────────────────────────────────────────────

  it('should soft-delete a memory', () => {
    const id = mem.remember('Temporary info', { importance: 2 });
    mem.forget(id);

    const found = mem.getByKey('Temporary info');
    expect(found).toBeNull();
  });

  // ── Update ────────────────────────────────────────────

  it('should update memory content', () => {
    const id = mem.remember('Brain has 4000 tests', { key: 'test_count' });
    mem.update(id, 'Brain has 4239 tests', 9);

    const found = mem.getByKey('test_count');
    expect(found!.content).toBe('Brain has 4239 tests');
    expect(found!.importance).toBe(9);
  });

  // ── Access Tracking ───────────────────────────────────

  it('should track access count on recall', () => {
    mem.remember('Frequently accessed fact', { key: 'popular' });

    // Access multiple times
    mem.getByKey('popular');
    mem.getByKey('popular');
    mem.getByKey('popular');

    const found = mem.getByKey('popular');
    expect(found!.accessCount).toBeGreaterThanOrEqual(3);
  });

  // ── Maintenance ───────────────────────────────────────

  it('should run maintenance without errors', () => {
    mem.remember('Old memory', { importance: 1 });
    mem.remember('Important memory', { importance: 9 });

    const result = mem.maintenance();
    expect(result.decayed).toBeGreaterThanOrEqual(0);
    expect(result.pruned).toBeGreaterThanOrEqual(0);
  });

  // ── Status ────────────────────────────────────────────

  it('should report accurate status', () => {
    mem.remember('Test 1', { category: 'context' });
    mem.remember('Test 2', { category: 'decision' });
    mem.remember('Test 3', { category: 'preference' });
    mem.startSession('sess-1');

    const status = mem.getStatus();
    expect(status.totalMemories).toBe(3);
    expect(status.activeMemories).toBe(3);
    expect(status.totalSessions).toBe(1);
    expect(status.byCategory['context']).toBe(1);
    expect(status.byCategory['decision']).toBe(1);
    expect(status.recentMemories.length).toBe(3);
  });

  // ── RAG Integration ───────────────────────────────────

  it('should index in RAG when adapter set', () => {
    const mockRAG = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRAG);

    mem.remember('Test memory for RAG', { key: 'rag_test' });
    expect(mockRAG.index).toHaveBeenCalledWith(
      'conversation_memory',
      expect.any(Number),
      'Test memory for RAG',
      expect.objectContaining({ category: 'context', key: 'rag_test' }),
    );
  });

  it('should use RAG for semantic recall', async () => {
    const id = mem.remember('Brain uses 60+ engines in monorepo architecture');

    const mockRAG = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([{ sourceId: id, similarity: 0.85 }]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRAG);

    const results = await mem.recall('how many engines does brain have');
    expect(mockRAG.search).toHaveBeenCalledWith(
      'how many engines does brain have',
      expect.objectContaining({ collections: ['conversation_memory'] }),
    );
    expect(results.length).toBe(1);
    expect(results[0]!.memory.content).toContain('60+ engines');
    expect(results[0]!.relevance).toBe(0.85);
  });

  it('should fall back to FTS when RAG fails', async () => {
    mem.remember('Monorepo with brain-core shared library');

    const mockRAG = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockRejectedValue(new Error('embedding model not loaded')),
      remove: vi.fn(),
    };
    mem.setRAG(mockRAG);

    const results = await mem.recall('monorepo brain');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.memory.content).toContain('Monorepo');
  });

  // ── Journal Integration ───────────────────────────────

  it('should record in journal for high-importance memories', () => {
    const mockJournal = {
      recordDiscovery: vi.fn(),
    };
    mem.setJournal(mockJournal);

    // Low importance → no journal entry
    mem.remember('Minor detail', { importance: 3 });
    expect(mockJournal.recordDiscovery).not.toHaveBeenCalled();

    // High importance → journal entry
    mem.remember('Critical decision: switched to Ollama', { importance: 8, key: 'ollama_switch' });
    expect(mockJournal.recordDiscovery).toHaveBeenCalledWith(
      expect.stringContaining('ollama_switch'),
      expect.stringContaining('switched to Ollama'),
      expect.objectContaining({ category: 'context' }),
      'routine',
    );
  });

  // ── Knowledge Graph Integration ───────────────────────

  it('should add facts to knowledge graph for keyed memories', () => {
    const mockKG = {
      addFact: vi.fn(),
    };
    mem.setKnowledgeGraph(mockKG);

    mem.remember('Brain REST API runs on port 7777', { key: 'api_port', importance: 7 });
    expect(mockKG.addFact).toHaveBeenCalledWith(
      'brain', 'remembers_context', 'api_port',
      expect.stringContaining('port 7777'),
      expect.any(Number),
      'conversation',
    );
  });

  // ── Edge Cases ────────────────────────────────────────

  it('should handle empty search gracefully', () => {
    const results = mem.searchText('');
    expect(results).toEqual([]);
  });

  it('should handle special characters in search', () => {
    mem.remember('Error: [object Object] in report');
    const results = mem.searchText('object Object');
    expect(results.length).toBeGreaterThanOrEqual(0); // Should not throw
  });
});
