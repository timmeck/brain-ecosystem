import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { SubAgent, runSubAgentMigration } from '../sub-agent.js';
import type { SubAgentConfig } from '../sub-agent.js';

describe('SubAgent', () => {
  let db: Database.Database;
  const config: SubAgentConfig = {
    name: 'test-agent',
    specialization: 'testing',
    description: 'Test agent',
    systemPrompt: 'You are a test agent.',
    tools: ['tool1', 'tool2'],
  };

  beforeEach(() => {
    db = new Database(':memory:');
    runSubAgentMigration(db);
    // Insert agent row
    db.prepare(`INSERT INTO sub_agents (name, specialization, description, system_prompt, tools, max_concurrent, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`).run(
      config.name, config.specialization, config.description, config.systemPrompt, JSON.stringify(config.tools), Date.now(),
    );
  });

  afterEach(() => { db.close(); });

  it('creates a sub-agent with config', () => {
    const agent = new SubAgent(db, 1, config);
    expect(agent.id).toBe(1);
    expect(agent.config.name).toBe('test-agent');
    expect(agent.config.specialization).toBe('testing');
  });

  it('submits a task', () => {
    const agent = new SubAgent(db, 1, config);
    const taskId = agent.submit('analyze something');
    expect(taskId).toMatch(/^task-/);
  });

  it('lists tasks after submission', () => {
    const agent = new SubAgent(db, 1, config);
    agent.submit('task 1');
    agent.submit('task 2');
    const tasks = agent.getTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].status).toBe('pending');
  });

  it('executes a task with executor', async () => {
    const agent = new SubAgent(db, 1, config);
    agent.setExecutor(async (input) => `Result: ${input}`);
    const task = await agent.execute('analyze BTC');
    expect(task.status).toBe('completed');
    expect(task.output).toBe('Result: analyze BTC');
  });

  it('handles executor failure', async () => {
    const agent = new SubAgent(db, 1, config);
    agent.setExecutor(async () => { throw new Error('LLM timeout'); });
    const task = await agent.execute('fail me');
    expect(task.status).toBe('failed');
    expect(task.error).toBe('LLM timeout');
  });

  it('throws if no executor set', async () => {
    const agent = new SubAgent(db, 1, config);
    agent.submit('task');
    await expect(agent.run('nonexistent')).rejects.toThrow('No executor set');
  });

  it('returns status with counts', async () => {
    const agent = new SubAgent(db, 1, config);
    agent.setExecutor(async (input) => `done: ${input}`);
    await agent.execute('task 1');
    await agent.execute('task 2');

    const status = agent.getStatus();
    expect(status.name).toBe('test-agent');
    expect(status.totalTasks).toBe(2);
    expect(status.completedTasks).toBe(2);
    expect(status.failedTasks).toBe(0);
    expect(status.lastRunAt).toBeTruthy();
  });

  it('tracks mixed task outcomes in status', async () => {
    const agent = new SubAgent(db, 1, config);
    let callCount = 0;
    agent.setExecutor(async () => {
      callCount++;
      if (callCount === 2) throw new Error('fail');
      return 'ok';
    });
    await agent.execute('task 1');
    await agent.execute('task 2');

    const status = agent.getStatus();
    expect(status.completedTasks).toBe(1);
    expect(status.failedTasks).toBe(1);
  });

  it('passes system prompt and tools to executor', async () => {
    const agent = new SubAgent(db, 1, config);
    const executor = vi.fn().mockResolvedValue('result');
    agent.setExecutor(executor);
    await agent.execute('input text');

    expect(executor).toHaveBeenCalledWith('input text', 'You are a test agent.', ['tool1', 'tool2']);
  });

  it('migration is idempotent', () => {
    runSubAgentMigration(db);
    runSubAgentMigration(db);
    const agent = new SubAgent(db, 1, config);
    expect(agent.getTasks()).toHaveLength(0);
  });
});
