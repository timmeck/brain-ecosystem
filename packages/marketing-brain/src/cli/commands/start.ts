import { Command } from 'commander';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { c, icons } from '../colors.js';

const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BASE_BACKOFF_MS = 1000;

function spawnDaemon(entryPoint: string, args: string[]): ChildProcess {
  const child = spawn(process.execPath, [entryPoint, ...args], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child;
}

function startWatchdog(entryPoint: string, args: string[], pidPath: string): void {
  const restartTimes: number[] = [];

  function launch(): void {
    const child = spawnDaemon(entryPoint, args);
    console.log(`${icons.megaphone}  ${c.info('Marketing Brain daemon starting')} ${c.dim(`(PID: ${child.pid})`)}`);

    child.on('exit', (code) => {
      // Normal shutdown (code 0 or SIGTERM) — don't restart
      if (code === 0 || code === null) return;

      const now = Date.now();
      restartTimes.push(now);

      // Only count restarts within the window
      const recentRestarts = restartTimes.filter((t) => now - t < RESTART_WINDOW_MS);
      restartTimes.length = 0;
      restartTimes.push(...recentRestarts);

      if (recentRestarts.length > MAX_RESTARTS) {
        console.error(`${icons.error}  ${c.error(`Marketing Brain crashed ${MAX_RESTARTS} times in 5 minutes — giving up.`)}`);
        // Clean up stale PID file
        try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
        return;
      }

      const backoff = BASE_BACKOFF_MS * Math.pow(2, recentRestarts.length - 1);
      console.log(`${icons.warn}  ${c.warn(`Marketing Brain exited (code ${code}) — restarting in ${backoff / 1000}s...`)}`);

      setTimeout(launch, backoff);
    });
  }

  launch();

  // Wait briefly for PID file to appear
  setTimeout(() => {
    if (fs.existsSync(pidPath)) {
      console.log(`${icons.ok}  ${c.success('Marketing Brain daemon started successfully.')} ${c.dim('(watchdog active)')}`);
    } else {
      console.log(`${icons.clock}  ${c.warn('Daemon may still be starting.')} Check: ${c.cyan('marketing status')}`);
    }
  }, 1000);
}

export function startCommand(): Command {
  return new Command('start')
    .description('Start the Marketing Brain daemon')
    .option('-f, --foreground', 'Run in foreground (no detach)')
    .option('-c, --config <path>', 'Config file path')
    .action((opts) => {
      const pidPath = path.join(getDataDir(), 'marketing-brain.pid');

      if (fs.existsSync(pidPath)) {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        try {
          process.kill(pid, 0);
          console.log(`${icons.megaphone}  Marketing Brain daemon is ${c.green('already running')} ${c.dim(`(PID: ${pid})`)}`);
          return;
        } catch {
          fs.unlinkSync(pidPath);
        }
      }

      if (opts.foreground) {
        import('../../marketing-core.js').then(({ MarketingCore }) => {
          const core = new MarketingCore();
          core.start(opts.config);
        });
        return;
      }

      // Spawn detached daemon with watchdog
      const args = ['daemon'];
      if (opts.config) args.push('-c', opts.config);
      const entryPoint = path.resolve(import.meta.dirname, '../../index.js');

      startWatchdog(entryPoint, args, pidPath);
    });
}
