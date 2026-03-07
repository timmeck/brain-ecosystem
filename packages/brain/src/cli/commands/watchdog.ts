import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, divider } from '../colors.js';

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function statusIcon(running: boolean, healthy: boolean): string {
  if (!running) return c.red('STOPPED');
  if (healthy) return c.green('HEALTHY');
  return c.orange('UNHEALTHY');
}

export function watchdogCommand(): Command {
  const cmd = new Command('watchdog')
    .description('Watchdog — daemon monitoring and control');

  cmd.command('status')
    .description('Show status of all monitored daemons')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const daemons: any[] = await client.request('watchdog.status') as any[];

        if (!daemons?.length) {
          console.log(`  ${c.dim('No daemons configured.')}`);
          return;
        }

        console.log(header('Watchdog Status', '\u{1F6E1}'));
        for (const d of daemons) {
          const status = statusIcon(d.running, d.healthy);
          const uptime = d.uptime ? fmtUptime(d.uptime) : '-';
          console.log(`  ${c.cyan(d.name.padEnd(20))} ${status.padEnd(20)} PID: ${c.value(d.pid || '-')}  Uptime: ${c.value(uptime)}  Restarts: ${c.value(d.restarts || 0)}`);
          if (d.lastCrash) {
            console.log(`  ${''.padEnd(20)} ${c.dim(`Last crash: ${d.lastCrash}`)}`);
          }
        }

        const running = daemons.filter(d => d.running).length;
        const healthy = daemons.filter(d => d.running && d.healthy).length;
        console.log(`\n  ${c.dim(`${running}/${daemons.length} running, ${healthy}/${daemons.length} healthy`)}`);
        console.log(divider());
      });
    });

  cmd.command('restart')
    .description('Restart a specific daemon')
    .argument('<name>', 'Daemon name (brain, trading-brain, marketing-brain)')
    .action(async (name: string) => {
      await withIpc(async (client) => {
        const result = await client.request('watchdog.restart', { name });
        if (result) {
          console.log(`  ${c.green('\u2713')} Restart signal sent to ${c.cyan(name)}`);
        } else {
          console.log(`  ${c.red('\u2717')} Unknown daemon: ${c.cyan(name)}`);
        }
      });
    });

  // Default action: show status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
