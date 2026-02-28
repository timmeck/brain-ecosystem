import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDataDir } from '../../utils/paths.js';
import { IpcClient } from '@timmeck/brain-core';
import { getPipeName } from '../../utils/paths.js';
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
    .description('Check Brain health: daemon, DB, MCP, hooks')
    .action(async () => {
      console.log(header('Brain Doctor', icons.brain));
      console.log();

      let allGood = true;

      // 1. Daemon running?
      const pidPath = path.join(getDataDir(), 'brain.pid');
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

      // 2. DB reachable? (only if daemon running)
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
      let mcpConfigured = false;
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.mcpServers?.brain || settings.mcpServers?.['brain-mcp']) {
          mcpConfigured = true;
          pass('MCP server configured');
        } else {
          fail('MCP server not configured', `edit ${settingsPath}`);
          allGood = false;
        }
      } catch {
        fail('MCP server not configured', 'settings.json not found');
        allGood = false;
      }

      // 4. Hook active?
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const hooks = settings.hooks;
        const hasPostToolUse = hooks?.PostToolUse?.some(
          (h: { command?: string; hooks?: Array<{ command?: string }> }) => {
            // Support both flat format (h.command) and nested format (h.hooks[].command)
            if (h.command?.includes('brain') || h.command?.includes('post-tool-use')) return true;
            return h.hooks?.some(
              (inner) => inner.command?.includes('brain') || inner.command?.includes('post-tool-use'),
            );
          },
        );
        if (hasPostToolUse) {
          pass('Auto-detect hook active');
        } else {
          fail('Auto-detect hook not configured', 'errors won\'t be tracked automatically');
          allGood = false;
        }
      } catch {
        fail('Auto-detect hook not configured');
        allGood = false;
      }

      // 5. DB file size
      const dbPath = path.join(getDataDir(), 'brain.db');
      try {
        const stat = fs.statSync(dbPath);
        pass('Database file', `${(stat.size / 1024 / 1024).toFixed(1)} MB at ${dbPath}`);
      } catch {
        fail('Database file not found');
        allGood = false;
      }

      console.log();
      if (allGood) {
        console.log(`  ${icons.ok}  ${c.success('All checks passed!')}`);
      } else {
        console.log(`  ${icons.warn}  ${c.warn('Some checks failed.')} Run ${c.cyan('brain start')} and check your MCP config.`);
      }
      console.log(`\n${divider()}`);
    });
}
