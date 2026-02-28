import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { c, icons } from '../colors.js';

export function stopCommand(): Command {
  return new Command('stop')
    .description('Stop the Marketing Brain daemon')
    .action(() => {
      const pidPath = path.join(getDataDir(), 'marketing-brain.pid');

      if (!fs.existsSync(pidPath)) {
        console.log(`${icons.megaphone}  ${c.dim('Marketing Brain daemon is not running (no PID file found).')}`);
        return;
      }

      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);

      try {
        process.kill(pid, 'SIGTERM');
        console.log(`${icons.megaphone}  ${c.success('Marketing Brain daemon stopped')} ${c.dim(`(PID: ${pid})`)}`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
          console.log(`${icons.megaphone}  ${c.dim('Marketing Brain daemon was not running (stale PID file removed).')}`);
        } else {
          console.error(`${icons.error}  ${c.error(`Failed to stop daemon: ${err}`)}`);
        }
      }

      try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
    });
}
