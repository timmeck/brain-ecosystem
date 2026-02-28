import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { c, icons } from '../colors.js';

export function stopCommand(): Command {
  return new Command('stop')
    .description('Stop the Brain daemon')
    .action(() => {
      const pidPath = path.join(getDataDir(), 'brain.pid');

      if (!fs.existsSync(pidPath)) {
        console.log(`${icons.brain}  ${c.dim('Brain daemon is not running (no PID file found).')}`);
        return;
      }

      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);

      try {
        process.kill(pid, 'SIGTERM');
        console.log(`${icons.brain}  ${c.success('Brain daemon stopped')} ${c.dim(`(PID: ${pid})`)}`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
          console.log(`${icons.brain}  ${c.dim('Brain daemon was not running (stale PID file removed).')}`);
        } else {
          console.error(`${icons.error}  ${c.error(`Failed to stop daemon: ${err}`)}`);
        }
      }

      // Clean up PID file
      try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
    });
}
