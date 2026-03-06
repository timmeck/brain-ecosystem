import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pluginsCommand } from '../plugins.js';

// Mock ipc-helper
vi.mock('../../ipc-helper.js', () => ({
  withIpc: vi.fn(async (fn) => {
    const mockClient = {
      request: vi.fn().mockImplementation((method: string) => {
        if (method === 'plugin.list') {
          return [
            { name: 'hello-brain', version: '1.0.0', description: 'Example plugin', enabled: true, loadedAt: '2026-03-06T12:00:00Z', error: null },
            { name: 'weather-brain', version: '0.2.0', description: 'Weather data', enabled: true, loadedAt: '2026-03-06T12:00:00Z', error: null },
          ];
        }
        if (method === 'plugin.routes') {
          return [
            { plugin: 'hello-brain', method: 'stats' },
            { plugin: 'weather-brain', method: 'forecast' },
          ];
        }
        if (method === 'plugin.tools') {
          return [
            { plugin: 'hello-brain', name: 'greet', description: 'Say hello' },
          ];
        }
        return null;
      }),
    };
    return fn(mockClient);
  }),
}));

describe('pluginsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('creates a valid commander command', () => {
    const cmd = pluginsCommand();
    expect(cmd.name()).toBe('plugins');
    expect(cmd.commands.length).toBeGreaterThanOrEqual(3);
  });

  it('has list, routes, tools subcommands', () => {
    const cmd = pluginsCommand();
    expect(cmd.commands.find(c => c.name() === 'list')).toBeDefined();
    expect(cmd.commands.find(c => c.name() === 'routes')).toBeDefined();
    expect(cmd.commands.find(c => c.name() === 'tools')).toBeDefined();
  });

  it('list command shows plugin information', async () => {
    const cmd = pluginsCommand();
    const listCmd = cmd.commands.find(c => c.name() === 'list')!;
    await listCmd.parseAsync([], { from: 'user' });

    const { withIpc } = await import('../../ipc-helper.js');
    expect(withIpc).toHaveBeenCalledTimes(1);
  });

  it('routes command shows plugin routes', async () => {
    const cmd = pluginsCommand();
    const routesCmd = cmd.commands.find(c => c.name() === 'routes')!;
    await routesCmd.parseAsync([], { from: 'user' });

    const { withIpc } = await import('../../ipc-helper.js');
    expect(withIpc).toHaveBeenCalledTimes(1);
  });

  it('tools command shows plugin tools', async () => {
    const cmd = pluginsCommand();
    const toolsCmd = cmd.commands.find(c => c.name() === 'tools')!;
    await toolsCmd.parseAsync([], { from: 'user' });

    const { withIpc } = await import('../../ipc-helper.js');
    expect(withIpc).toHaveBeenCalledTimes(1);
  });
});
