import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ChatEngine, runChatMigration } from '../chat-engine.js';

describe('ChatEngine', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates and runs migration', () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const status = engine.getStatus();
    expect(status.sessions).toBe(0);
    expect(status.totalMessages).toBe(0);
  });

  it('processes a message and returns response', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const response = await engine.processMessage('session-1', 'Hallo');

    expect(response.role).toBe('assistant');
    expect(response.content).toBeTruthy();
    expect(response.sessionId).toBe('session-1');
  });

  it('stores messages in history', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    await engine.processMessage('session-1', 'Hallo');

    const history = engine.getHistory('session-1');
    expect(history).toHaveLength(2); // user + assistant
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  it('routes to IPC handler when route matches', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ balance: 10000, equity: 10500, positions: [] });

    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['paper.status', 'action.status']);

    const response = await engine.processMessage('session-1', 'Wie läuft das paper trading?');

    expect(handler).toHaveBeenCalledWith('paper.status', expect.any(Object));
    expect(response.content).toContain('10000');
    expect(response.toolCalls).toBeTruthy();
  });

  it('matches status route for generic status question', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ uptime: 3600 });

    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['status']);

    const response = await engine.processMessage('s1', 'Wie ist der Status?');
    expect(handler).toHaveBeenCalled();
  });

  it('returns fallback when no route matches', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    engine.setIpcHandler(vi.fn());

    const response = await engine.processMessage('s1', 'Was ist die Farbe des Himmels?');
    expect(response.content).toContain('konnte deine Frage nicht zuordnen');
  });

  it('handles IPC handler errors gracefully', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    engine.setIpcHandler(vi.fn().mockRejectedValue(new Error('DB locked')));
    engine.setAvailableRoutes(['status']);

    const response = await engine.processMessage('s1', 'Status bitte');
    expect(response.content).toContain('Fehler');
  });

  it('tracks multiple sessions', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    await engine.processMessage('session-a', 'Hallo');
    await engine.processMessage('session-b', 'Hi');

    const status = engine.getStatus();
    expect(status.sessions).toBe(2);
    expect(status.totalMessages).toBe(4); // 2 user + 2 assistant
  });

  it('getHistory respects session isolation', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    await engine.processMessage('session-a', 'A1');
    await engine.processMessage('session-b', 'B1');

    const historyA = engine.getHistory('session-a');
    expect(historyA).toHaveLength(2);
    expect(historyA[0].content).toBe('A1');

    const historyB = engine.getHistory('session-b');
    expect(historyB).toHaveLength(2);
    expect(historyB[0].content).toBe('B1');
  });

  it('matches routes for insight queries', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue([{ title: 'Test insight' }]);

    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['insight.list']);

    await engine.processMessage('s1', 'Zeig mir die Erkenntnisse');
    expect(handler).toHaveBeenCalledWith('insight.list', expect.any(Object));
  });

  it('matches routes for signal queries', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ totalSignals: 5 });

    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['signal.cross.status']);

    await engine.processMessage('s1', 'Cross-brain signal status');
    expect(handler).toHaveBeenCalledWith('signal.cross.status', expect.any(Object));
  });

  it('extracts limit param from message', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue([]);

    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['insight.list']);

    await engine.processMessage('s1', 'Zeig mir die letzten 5 insights');
    expect(handler).toHaveBeenCalledWith('insight.list', expect.objectContaining({ limit: 5 }));
  });

  it('migration is idempotent', () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    runChatMigration(db);
    const status = engine.getStatus();
    expect(status.sessions).toBe(0);
  });

  it('formats paper status result nicely', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    engine.setIpcHandler(vi.fn().mockResolvedValue({ balance: 9500.50, equity: 10200.75, positions: [{ symbol: 'BTC' }] }));
    engine.setAvailableRoutes(['paper.status']);

    const response = await engine.processMessage('s1', 'paper trading status');
    expect(response.content).toContain('9500.50');
    expect(response.content).toContain('1 Position');
  });

  it('handles null IPC result', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    engine.setIpcHandler(vi.fn().mockResolvedValue(null));
    engine.setAvailableRoutes(['status']);

    const response = await engine.processMessage('s1', 'Status');
    expect(response.content).toContain('Keine Daten');
  });

  // ── Extended keyword mapping tests (Session 105) ──

  it('routes error queries to error.query', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue([{ message: 'test error' }]);
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['error.query']);

    await engine.processMessage('s1', 'Zeig mir die Fehler');
    expect(handler).toHaveBeenCalledWith('error.query', expect.any(Object));
  });

  it('routes code queries to code.stats', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ modules: 5 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['code.stats']);

    await engine.processMessage('s1', 'Welche Module sind registriert?');
    expect(handler).toHaveBeenCalledWith('code.stats', expect.any(Object));
  });

  it('routes guardrail queries to guardrail.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ circuitBreaker: 'closed' });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['guardrail.status']);

    await engine.processMessage('s1', 'Wie ist der Guardrail-Status?');
    expect(handler).toHaveBeenCalledWith('guardrail.status', expect.any(Object));
  });

  it('routes goal queries to goal.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ activeGoals: 2 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['goal.status']);

    await engine.processMessage('s1', 'Was sind die aktuellen Ziele?');
    expect(handler).toHaveBeenCalledWith('goal.status', expect.any(Object));
  });

  it('routes creative queries to creative.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ ideas: 10 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['creative.status']);

    await engine.processMessage('s1', 'Kreative Ideen anzeigen');
    expect(handler).toHaveBeenCalledWith('creative.status', expect.any(Object));
  });

  it('routes LLM queries to llm.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ calls: 5, tokens: 50000 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['llm.status']);

    await engine.processMessage('s1', 'LLM Token-Verbrauch');
    expect(handler).toHaveBeenCalledWith('llm.status', expect.any(Object));
  });

  it('routes watchdog queries to watchdog.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ daemons: 3 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['watchdog.status']);

    await engine.processMessage('s1', 'Watchdog daemon status');
    expect(handler).toHaveBeenCalledWith('watchdog.status', expect.any(Object));
  });

  it('routes dream queries to dream.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ cycles: 42 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['dream.status']);

    await engine.processMessage('s1', 'Dream consolidation status');
    expect(handler).toHaveBeenCalledWith('dream.status', expect.any(Object));
  });

  it('routes prediction queries to prediction.status', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue({ accuracy: 0.7 });
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['prediction.status']);

    await engine.processMessage('s1', 'Vorhersage Genauigkeit');
    expect(handler).toHaveBeenCalledWith('prediction.status', expect.any(Object));
  });

  it('routes mission queries to mission.list', async () => {
    const engine = new ChatEngine(db, { brainName: 'test' });
    const handler = vi.fn().mockResolvedValue([]);
    engine.setIpcHandler(handler);
    engine.setAvailableRoutes(['mission.list']);

    await engine.processMessage('s1', 'Zeig mir die research missions');
    expect(handler).toHaveBeenCalledWith('mission.list', expect.any(Object));
  });
});
