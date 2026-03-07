import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ToolScopeManager } from '../../../src/tool-scoping/scope-manager.js';
import type { ToolScope } from '../../../src/tool-scoping/scope-manager.js';

describe('ToolScopeManager', () => {
  let db: Database.Database;
  let manager: ToolScopeManager;

  beforeEach(() => {
    db = new Database(':memory:');
    manager = new ToolScopeManager(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Scope Registration ────────────────────────────────

  it('registers and retrieves a scope', () => {
    manager.registerScope({
      name: 'research',
      tools: ['search', 'query'],
      phase: 'gathering',
      description: 'Research tools',
    });

    const scope = manager.getScope('research');
    expect(scope).not.toBeNull();
    expect(scope!.name).toBe('research');
    expect(scope!.tools).toEqual(['search', 'query']);
    expect(scope!.phase).toBe('gathering');
  });

  it('registers multiple scopes', () => {
    const count = manager.registerScopes([
      { name: 'a', tools: ['t1'], phase: 'p1' },
      { name: 'b', tools: ['t2'], phase: 'p2' },
      { name: 'c', tools: ['t3'] },
    ]);
    expect(count).toBe(3);
    expect(manager.listScopes()).toHaveLength(3);
  });

  it('removes a scope', () => {
    manager.registerScope({ name: 'temp', tools: ['x'], phase: 'p1' });
    expect(manager.removeScope('temp')).toBe(true);
    expect(manager.getScope('temp')).toBeNull();
    expect(manager.removeScope('nonexistent')).toBe(false);
  });

  it('persists scopes to DB and reloads', () => {
    manager.registerScope({ name: 'persist-test', tools: ['a', 'b'], phase: 'test' });

    // Create new manager from same DB — should load persisted scopes
    const manager2 = new ToolScopeManager(db);
    const scope = manager2.getScope('persist-test');
    expect(scope).not.toBeNull();
    expect(scope!.tools).toEqual(['a', 'b']);
  });

  it('overwrites scope with same name', () => {
    manager.registerScope({ name: 'dup', tools: ['old'], phase: 'p1' });
    manager.registerScope({ name: 'dup', tools: ['new'], phase: 'p2' });
    const scope = manager.getScope('dup');
    expect(scope!.tools).toEqual(['new']);
    expect(scope!.phase).toBe('p2');
  });

  // ── Tool Availability ─────────────────────────────────

  it('returns tools for matching phase', () => {
    manager.registerScope({ name: 'research', tools: ['search', 'query'], phase: 'gathering' });
    manager.registerScope({ name: 'analysis', tools: ['infer', 'reason'], phase: 'analyzing' });

    const gathering = manager.getAvailableTools({ phase: 'gathering' });
    expect(gathering).toContain('search');
    expect(gathering).toContain('query');
    expect(gathering).not.toContain('infer');
  });

  it('includes global scopes (no phase) in all phases', () => {
    manager.registerScope({ name: 'global', tools: ['status', 'help'], phase: null });
    manager.registerScope({ name: 'research', tools: ['search'], phase: 'gathering' });

    const tools = manager.getAvailableTools({ phase: 'gathering' });
    expect(tools).toContain('status');
    expect(tools).toContain('help');
    expect(tools).toContain('search');
  });

  it('returns empty for unknown phase with only phase-specific scopes', () => {
    manager.registerScope({ name: 'research', tools: ['search'], phase: 'gathering' });
    const tools = manager.getAvailableTools({ phase: 'unknown-phase' });
    expect(tools).toHaveLength(0);
  });

  it('deduplicates tools across scopes', () => {
    manager.registerScope({ name: 'a', tools: ['search', 'query'], phase: 'p1' });
    manager.registerScope({ name: 'b', tools: ['query', 'infer'], phase: 'p1' });

    const tools = manager.getAvailableTools({ phase: 'p1' });
    expect(tools.filter(t => t === 'query')).toHaveLength(1);
    expect(tools).toHaveLength(3);
  });

  // ── Tool Check ────────────────────────────────────────

  it('allows tool in scope', () => {
    manager.registerScope({ name: 'research', tools: ['search'], phase: 'gathering' });

    const result = manager.checkTool('search', { phase: 'gathering' });
    expect(result.allowed).toBe(true);
    expect(result.scope).toBe('research');
  });

  it('blocks tool not in scope', () => {
    manager.registerScope({ name: 'research', tools: ['search'], phase: 'gathering' });

    const result = manager.checkTool('execute_trade', { phase: 'gathering' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in any scope');
  });

  it('allows all tools when no scopes defined for phase', () => {
    // No scopes registered at all
    const result = manager.checkTool('anything', { phase: 'whatever' });
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('no scopes defined');
  });

  it('logs checks to DB', () => {
    manager.registerScope({ name: 'research', tools: ['search'], phase: 'gathering' });

    manager.checkTool('search', { phase: 'gathering', workflowId: 'wf-1' });
    manager.checkTool('trade', { phase: 'gathering', workflowId: 'wf-1' });

    const history = manager.getCheckHistory(10);
    expect(history).toHaveLength(2);
    expect(history[0].allowed).toBe(false); // trade blocked (most recent first)
    expect(history[1].allowed).toBe(true);  // search allowed
  });

  // ── Tools by Scope ────────────────────────────────────

  it('groups tools by scope', () => {
    manager.registerScope({ name: 'global', tools: ['status'], phase: null, priority: 100 });
    manager.registerScope({ name: 'research', tools: ['search', 'query'], phase: 'gathering', priority: 10 });

    const grouped = manager.getToolsByScope('gathering');
    expect(grouped).toHaveLength(2);
    expect(grouped[0].scope).toBe('global'); // higher priority first
    expect(grouped[1].scope).toBe('research');
  });

  // ── Default Presets ───────────────────────────────────

  it('registers default presets', () => {
    manager.registerDefaults();

    const scopes = manager.listScopes();
    expect(scopes.length).toBeGreaterThanOrEqual(7);

    // Check global scope exists
    const global = manager.getScope('global-always');
    expect(global).not.toBeNull();
    expect(global!.tools).toContain('status');

    // Check gathering phase works
    const gathering = manager.getAvailableTools({ phase: 'gathering' });
    expect(gathering).toContain('status'); // from global
    expect(gathering).toContain('search'); // from research-gathering
  });

  // ── Top Blocked ───────────────────────────────────────

  it('tracks blocked tools', () => {
    manager.registerScope({ name: 'limited', tools: ['search'], phase: 'p1' });

    manager.checkTool('trade', { phase: 'p1' });
    manager.checkTool('trade', { phase: 'p1' });
    manager.checkTool('deploy', { phase: 'p1' });

    const blocked = manager.getTopBlocked();
    expect(blocked).toHaveLength(2);
    expect(blocked[0].tool).toBe('trade');
    expect(blocked[0].count).toBe(2);
  });

  // ── Priority ──────────────────────────────────────────

  it('lists scopes sorted by priority', () => {
    manager.registerScope({ name: 'low', tools: ['a'], priority: 1 });
    manager.registerScope({ name: 'high', tools: ['b'], priority: 100 });
    manager.registerScope({ name: 'mid', tools: ['c'], priority: 50 });

    const scopes = manager.listScopes();
    expect(scopes[0].name).toBe('high');
    expect(scopes[1].name).toBe('mid');
    expect(scopes[2].name).toBe('low');
  });

  // ── Status ──────────────────────────────────────────

  it('reports correct status', () => {
    manager.registerScope({ name: 'a', tools: ['t1', 't2'], phase: 'p1' });
    manager.registerScope({ name: 'b', tools: ['t3'], phase: 'p2' });

    manager.checkTool('t1', { phase: 'p1' });
    manager.checkTool('blocked', { phase: 'p1' });

    const status = manager.getStatus();
    expect(status.totalScopes).toBe(2);
    expect(status.totalToolMappings).toBe(3);
    expect(status.totalChecks).toBe(2);
    expect(status.totalBlocked).toBe(1);
    expect(status.blockRate).toBe(0.5);
  });

  it('returns default status on empty manager', () => {
    const status = manager.getStatus();
    expect(status.totalScopes).toBe(0);
    expect(status.totalToolMappings).toBe(0);
    expect(status.totalChecks).toBe(0);
  });
});
