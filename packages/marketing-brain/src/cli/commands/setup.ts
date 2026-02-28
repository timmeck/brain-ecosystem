import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDataDir } from '../../utils/paths.js';
import { c, icons, header, divider } from '../colors.js';

function pass(label: string, detail?: string): void {
  const extra = detail ? ` ${c.dim(detail)}` : '';
  console.log(`  ${c.green(icons.check)}  ${label}${extra}`);
}

function fail(label: string, detail?: string): void {
  const extra = detail ? ` ${c.dim(detail)}` : '';
  console.log(`  ${c.red(icons.cross)}  ${label}${extra}`);
}

function skip(label: string, detail?: string): void {
  const extra = detail ? ` ${c.dim(detail)}` : '';
  console.log(`  ${c.dim(icons.arrow)}  ${label}${extra}`);
}

function step(n: number, label: string): void {
  console.log(`\n  ${c.cyan(`[${n}/5]`)} ${c.value(label)}`);
}

function readSettings(settingsPath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function setupCommand(): Command {
  return new Command('setup')
    .description('One-command setup: configures MCP and starts the daemon')
    .option('--no-daemon', 'Skip starting the daemon')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (opts) => {
      console.log(header('Marketing Brain Setup', icons.megaphone));
      console.log();
      console.log(`  ${c.dim('Platform:')} ${c.value(process.platform)}  ${c.dim('Node:')} ${c.value(process.version)}  ${c.dim('Arch:')} ${c.value(process.arch)}`);

      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const dataDir = getDataDir();

      let settingsChanged = false;
      let allGood = true;

      // -- Step 1: Data Directory --
      step(1, 'Data Directory');
      if (fs.existsSync(dataDir)) {
        pass('Data directory exists', dataDir);
      } else if (opts.dryRun) {
        skip('Would create data directory', dataDir);
      } else {
        ensureDir(dataDir);
        pass('Created data directory', dataDir);
      }

      // -- Step 2: Claude Code settings.json --
      step(2, 'MCP Server Configuration');
      const claudeDir = path.join(os.homedir(), '.claude');
      if (!opts.dryRun) {
        ensureDir(claudeDir);
      }

      const settings = readSettings(settingsPath) as Record<string, Record<string, unknown>>;

      if (!settings.mcpServers) {
        settings.mcpServers = {};
      }

      const mcpServers = settings.mcpServers as Record<string, unknown>;
      if (mcpServers['marketing-brain']) {
        pass('MCP server already configured');
      } else if (opts.dryRun) {
        skip('Would add MCP server entry', '"marketing-brain" -> marketing mcp-server');
      } else {
        mcpServers['marketing-brain'] = {
          command: 'marketing',
          args: ['mcp-server'],
        };
        settingsChanged = true;
        pass('Added MCP server entry', '"marketing-brain" -> marketing mcp-server');
      }

      // -- Step 3: Save Configuration --
      step(3, 'Save Configuration');
      if (settingsChanged && !opts.dryRun) {
        try {
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
          pass('Saved settings.json', settingsPath);
        } catch (err) {
          fail('Failed to save settings.json', err instanceof Error ? err.message : String(err));
          allGood = false;
        }
      } else if (opts.dryRun && settingsChanged) {
        skip('Would save settings.json', settingsPath);
      } else {
        pass('No changes needed', 'settings.json already up to date');
      }

      // -- Step 4: Start Daemon --
      step(4, 'Start Daemon');
      if (opts.daemon === false) {
        skip('Skipped daemon start', '--no-daemon');
      } else if (opts.dryRun) {
        skip('Would start Marketing Brain daemon');
      } else {
        const pidPath = path.join(dataDir, 'marketing-brain.pid');
        let alreadyRunning = false;

        if (fs.existsSync(pidPath)) {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
          try {
            process.kill(pid, 0);
            alreadyRunning = true;
            pass('Daemon already running', `PID ${pid}`);
          } catch {
            fs.unlinkSync(pidPath);
          }
        }

        if (!alreadyRunning) {
          try {
            const { spawn } = await import('node:child_process');
            const entryPoint = path.resolve(import.meta.dirname, '../../index.js');
            const child = spawn(process.execPath, [entryPoint, 'daemon'], {
              detached: true,
              stdio: 'ignore',
            });
            child.unref();

            await new Promise((resolve) => setTimeout(resolve, 1500));

            if (fs.existsSync(pidPath)) {
              const pid = fs.readFileSync(pidPath, 'utf8').trim();
              pass('Daemon started', `PID ${pid}`);
            } else {
              pass('Daemon starting', 'may take a moment');
            }
          } catch (err) {
            fail('Failed to start daemon', err instanceof Error ? err.message : String(err));
            allGood = false;
          }
        }
      }

      // -- Step 5: Health Check --
      step(5, 'Health Check');
      if (opts.dryRun) {
        skip('Would run health checks');
      } else {
        const dbPath = path.join(dataDir, 'marketing-brain.db');
        if (fs.existsSync(dbPath)) {
          const stat = fs.statSync(dbPath);
          pass('Database', `${(stat.size / 1024 / 1024).toFixed(1)} MB`);
        } else {
          skip('Database', 'will be created on first daemon start');
        }

        const pidPath = path.join(dataDir, 'marketing-brain.pid');
        if (fs.existsSync(pidPath)) {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
          try {
            process.kill(pid, 0);
            pass('Daemon reachable', `PID ${pid}`);
          } catch {
            fail('Daemon not reachable');
            allGood = false;
          }
        }
      }

      // -- Summary --
      console.log();
      if (opts.dryRun) {
        console.log(`  ${icons.megaphone}  ${c.cyan('Dry run complete.')} No changes were made.`);
      } else if (allGood) {
        console.log(`  ${icons.ok}  ${c.success('Marketing Brain is ready!')} All systems configured.`);
        console.log();
        console.log(`  ${c.dim('Next steps:')}`);
        console.log(`    ${c.dim('1.')} Restart Claude Code to load the MCP server`);
        console.log(`    ${c.dim('2.')} Run ${c.cyan('marketing status')} to check stats`);
        console.log(`    ${c.dim('3.')} Run ${c.cyan('marketing doctor')} for a full health check`);
      } else {
        console.log(`  ${icons.warn}  ${c.warn('Setup completed with warnings.')} Check the items above.`);
        console.log(`    Run ${c.cyan('marketing doctor')} for a detailed health check.`);
      }

      console.log(`\n${divider()}`);
    });
}
