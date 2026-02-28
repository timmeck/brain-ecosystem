import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDataDir, getPipeName } from '../../utils/paths.js';
import { IpcClient } from '../../ipc/client.js';
import { c, icons, header, divider } from '../colors.js';

function pass(label: string, detail?: string): void {
  const extra = detail ? ` ${c.dim(detail)}` : '';
  console.log(`  ${c.green(icons.check)}  ${label}${extra}`);
}

function fail(label: string, detail?: string): void {
  const extra = detail ? ` ${c.dim(detail)}` : '';
  console.log(`  ${c.red(icons.cross)}  ${label}${extra}`);
}

export function doctorCommand(): Command {
  return new Command('doctor')
    .description('Check Marketing Brain health')
    .action(async () => {
      console.log(header('Marketing Brain Doctor', icons.megaphone));
      console.log();

      let allGood = true;

      // 1. Daemon running?
      const pidPath = path.join(getDataDir(), 'marketing-brain.pid');
      let daemonRunning = false;
      if (fs.existsSync(pidPath)) {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        try {
          process.kill(pid, 0);
          daemonRunning = true;
          pass('Daemon running', `PID ${pid}`);
        } catch {
          fail('Daemon not running', 'stale PID file');
          allGood = false;
        }
      } else {
        fail('Daemon not running', 'no PID file');
        allGood = false;
      }

      // 2. DB reachable?
      if (daemonRunning) {
        const client = new IpcClient(getPipeName(), 3000);
        try {
          await client.connect();
          await client.request('analytics.summary', {});
          pass('Database reachable');
        } catch {
          fail('Database not reachable');
          allGood = false;
        } finally {
          client.disconnect();
        }
      } else {
        fail('Database not reachable', 'daemon not running');
        allGood = false;
      }

      // 3. MCP configured?
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.mcpServers?.['marketing-brain']) {
          pass('MCP server configured');
        } else {
          fail('MCP server not configured', `add "marketing-brain" to ${settingsPath}`);
          allGood = false;
        }
      } catch {
        fail('MCP server not configured', 'settings.json not found');
        allGood = false;
      }

      // 4. DB file exists?
      const dbPath = path.join(getDataDir(), 'marketing-brain.db');
      try {
        const stat = fs.statSync(dbPath);
        pass('Database file', `${(stat.size / 1024 / 1024).toFixed(1)} MB at ${dbPath}`);
      } catch {
        fail('Database file not found');
        allGood = false;
      }

      // 5. Data dir writable?
      const dataDir = getDataDir();
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        const testFile = path.join(dataDir, '.write-test');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);
        pass('Data directory writable', dataDir);
      } catch {
        fail('Data directory not writable', dataDir);
        allGood = false;
      }

      console.log();
      if (allGood) {
        console.log(`  ${icons.ok}  ${c.success('All checks passed!')}`);
      } else {
        console.log(`  ${icons.warn}  ${c.warn('Some checks failed.')} Run ${c.cyan('marketing start')} first.`);
      }
      console.log(`\n${divider()}`);
    });
}
