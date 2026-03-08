import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { SubAgentFactory } from '../sub-agent-factory.js';

describe('SubAgentFactory', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates a factory with no agents', () => {
    const factory = new SubAgentFactory(db);
    expect(factory.list()).toHaveLength(0);
    expect(factory.getStatus().totalAgents).toBe(0);
  });

  it('creates an agent with config', () => {
    const factory = new SubAgentFactory(db);
    const agent = factory.create({
      name: 'analyst',
      specialization: 'crypto',
      description: 'Crypto analyst',
      systemPrompt: 'Analyze crypto.',
      tools: ['market.data'],
    });
    expect(agent.config.name).toBe('analyst');
    expect(factory.list()).toHaveLength(1);
  });

  it('prevents duplicate agent names', () => {
    const factory = new SubAgentFactory(db);
    factory.create({ name: 'dup', specialization: 'x', description: '', systemPrompt: '', tools: [] });
    expect(() => factory.create({ name: 'dup', specialization: 'y', description: '', systemPrompt: '', tools: [] })).toThrow('already exists');
  });

  it('gets agent by name', () => {
    const factory = new SubAgentFactory(db);
    factory.create({ name: 'writer', specialization: 'content', description: '', systemPrompt: '', tools: [] });
    const agent = factory.get('writer');
    expect(agent).not.toBeNull();
    expect(agent!.config.specialization).toBe('content');
  });

  it('returns null for unknown agent', () => {
    const factory = new SubAgentFactory(db);
    expect(factory.get('nonexistent')).toBeNull();
  });

  it('removes an agent', () => {
    const factory = new SubAgentFactory(db);
    factory.create({ name: 'temp', specialization: 'x', description: '', systemPrompt: '', tools: [] });
    expect(factory.remove('temp')).toBe(true);
    expect(factory.list()).toHaveLength(0);
    expect(factory.remove('temp')).toBe(false);
  });

  it('creates agent from preset', () => {
    const factory = new SubAgentFactory(db);
    const agent = factory.createFromPreset('crypto-analyst');
    expect(agent.config.specialization).toBe('cryptocurrency');
    expect(agent.config.tools.length).toBeGreaterThan(0);
  });

  it('creates agent from preset with custom name', () => {
    const factory = new SubAgentFactory(db);
    const agent = factory.createFromPreset('content-writer', 'my-writer');
    expect(agent.config.name).toBe('my-writer');
    expect(agent.config.specialization).toBe('content');
  });

  it('throws for unknown preset', () => {
    const factory = new SubAgentFactory(db);
    expect(() => factory.createFromPreset('nonexistent')).toThrow('Unknown preset');
  });

  it('lists available presets', () => {
    const factory = new SubAgentFactory(db);
    const presets = factory.getPresets();
    expect(presets).toContain('crypto-analyst');
    expect(presets).toContain('content-writer');
    expect(presets).toContain('code-reviewer');
    expect(presets).toContain('research-agent');
  });

  it('sets executor on all agents', async () => {
    const factory = new SubAgentFactory(db);
    factory.setExecutor(async (input) => `echo: ${input}`);
    const agent = factory.create({ name: 'runner', specialization: 'x', description: '', systemPrompt: '', tools: [] });
    const task = await agent.execute('hello');
    expect(task.output).toBe('echo: hello');
  });

  it('persists agents across factory instances', () => {
    const factory1 = new SubAgentFactory(db);
    factory1.create({ name: 'persistent', specialization: 'db', description: 'test', systemPrompt: 'test', tools: ['a'] });

    const factory2 = new SubAgentFactory(db);
    expect(factory2.list()).toHaveLength(1);
    expect(factory2.get('persistent')!.config.specialization).toBe('db');
  });

  it('returns comprehensive status', async () => {
    const factory = new SubAgentFactory(db);
    factory.setExecutor(async () => 'done');
    const agent = factory.create({ name: 'a1', specialization: 'x', description: '', systemPrompt: '', tools: [] });
    await agent.execute('task');

    const status = factory.getStatus();
    expect(status.totalAgents).toBe(1);
    expect(status.agents[0].name).toBe('a1');
    expect(status.agents[0].completedTasks).toBe(1);
  });
});
