import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir, getPipeName } from '../../utils/paths.js';
import { c, icons, header } from '../colors.js';

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Health check for Trading Brain')
    .action(async () => {
      console.log(header('Trading Brain Doctor', icons.gear));
      let issues = 0;

      // Check data dir
      const dataDir = getDataDir();
      if (fs.existsSync(dataDir)) {
        console.log(`  ${icons.ok}  Data dir exists: ${c.dim(dataDir)}`);
      } else {
        console.log(`  ${icons.warn}  Data dir missing: ${c.dim(dataDir)}`);
        issues++;
      }

      // Check DB
      const dbPath = path.join(dataDir, 'trading-brain.db');
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        console.log(`  ${icons.ok}  Database exists: ${c.dim(`${(stat.size / 1024).toFixed(0)} KB`)}`);
      } else {
        console.log(`  ${icons.warn}  Database not yet created ${c.dim('(will be created on first start)')}`);
      }

      // Check PID
      const pidPath = path.join(dataDir, 'trading-brain.pid');
      if (fs.existsSync(pidPath)) {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        try {
          process.kill(pid, 0);
          console.log(`  ${icons.ok}  Daemon running ${c.dim(`(PID ${pid})`)}`);
        } catch {
          console.log(`  ${icons.warn}  Stale PID file ${c.dim(`(PID ${pid} not running)`)}`);
          issues++;
        }
      } else {
        console.log(`  ${icons.warn}  Daemon not running`);
      }

      // Check pipe
      const pipeName = getPipeName();
      console.log(`  ${c.dim('IPC:')} ${pipeName}`);

      // Check ports
      console.log(`  ${c.dim('REST API:')} http://localhost:7779`);
      console.log(`  ${c.dim('MCP HTTP:')} http://localhost:7780`);

      console.log();
      if (issues === 0) {
        console.log(`  ${icons.ok}  ${c.success('All checks passed!')}`);
      } else {
        console.log(`  ${icons.warn}  ${c.warn(`${issues} issue(s) found`)}`);
      }
    });
}
