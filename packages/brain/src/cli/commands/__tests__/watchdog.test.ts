import { describe, it, expect, vi, beforeEach } from 'vitest';
import { watchdogCommand } from '../watchdog.js';

// Mock ipc-helper
vi.mock('../../ipc-helper.js', () => ({
  withIpc: vi.fn(async (fn) => {
    const mockClient = {
      request: vi.fn().mockImplementation((method: string, params?: unknown) => {
        if (method === 'watchdog.status') {
          return [
            { name: 'brain', pid: 1234, running: true, healthy: true, uptime: 60000, restarts: 0, lastCrash: null },
            { name: 'trading-brain', pid: 5678, running: true, healthy: false, uptime: 30000, restarts: 1, lastCrash: '2026-03-06T12:00:00Z' },
            { name: 'marketing-brain', pid: null, running: false, healthy: false, uptime: null, restarts: 3, lastCrash: '2026-03-06T11:00:00Z' },
          ];
        }
        if (method === 'watchdog.restart') {
          const { name } = params as { name: string };
          return name === 'brain' || name === 'trading-brain' || name === 'marketing-brain';
        }
        return null;
      }),
    };
    return fn(mockClient);
  }),
}));

describe('watchdogCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('creates a valid commander command', () => {
    const cmd = watchdogCommand();
    expect(cmd.name()).toBe('watchdog');
    expect(cmd.commands.length).toBeGreaterThanOrEqual(2);
  });

  it('has status subcommand', () => {
    const cmd = watchdogCommand();
    const status = cmd.commands.find(c => c.name() === 'status');
    expect(status).toBeDefined();
  });

  it('has restart subcommand', () => {
    const cmd = watchdogCommand();
    const restart = cmd.commands.find(c => c.name() === 'restart');
    expect(restart).toBeDefined();
  });

  it('status command shows daemon information', async () => {
    const cmd = watchdogCommand();
    const statusCmd = cmd.commands.find(c => c.name() === 'status')!;
    await statusCmd.parseAsync([], { from: 'user' });

    const { withIpc } = await import('../../ipc-helper.js');
    expect(withIpc).toHaveBeenCalledTimes(1);
    // Check that console.log was called with output containing daemon names
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]).join('\n');
    expect(logs).toContain('brain');
  });

  it('restart command sends restart request', async () => {
    const cmd = watchdogCommand();
    const restartCmd = cmd.commands.find(c => c.name() === 'restart')!;
    await restartCmd.parseAsync(['brain'], { from: 'user' });

    const { withIpc } = await import('../../ipc-helper.js');
    expect(withIpc).toHaveBeenCalledTimes(1);
  });
});
