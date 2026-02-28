import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
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
  console.log(`\n  ${c.cyan(`[${n}/6]`)} ${c.value(label)}`);
}

function resolveHookPath(): string {
  const platform = process.platform;
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim();
    const hookRelative = 'node_modules/@timmeck/brain/dist/hooks/post-tool-use.js';

    if (platform === 'win32') {
      return path.join(prefix, hookRelative);
    }
    // macOS/Linux: global prefix + lib/node_modules/...
    return path.join(prefix, 'lib', hookRelative);
  } catch {
    // Fallback: try to resolve from this package's location
    return path.resolve(import.meta.dirname, '../../hooks/post-tool-use.js');
  }
}

function buildHookCommand(hookPath: string): string {
  const normalized = hookPath.replace(/\\/g, '\\\\');
  return `node ${normalized}`;
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
    .description('One-command setup: configures MCP, hooks, and starts the daemon')
    .option('--no-daemon', 'Skip starting the daemon')
    .option('--no-hooks', 'Skip hook configuration')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (opts) => {
      console.log(header('Brain Setup Wizard', icons.brain));
      console.log();
      console.log(`  ${c.dim('Platform:')} ${c.value(process.platform)}  ${c.dim('Node:')} ${c.value(process.version)}  ${c.dim('Arch:')} ${c.value(process.arch)}`);

      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const dataDir = getDataDir();
      const hookPath = resolveHookPath();
      const hookCommand = buildHookCommand(hookPath);

      let settingsChanged = false;
      let allGood = true;

      // ── Step 1: Data Directory ──────────────────────────────
      step(1, 'Data Directory');
      if (fs.existsSync(dataDir)) {
        pass('Data directory exists', dataDir);
      } else if (opts.dryRun) {
        skip('Would create data directory', dataDir);
      } else {
        ensureDir(dataDir);
        pass('Created data directory', dataDir);
      }

      // ── Step 2: Claude Code settings.json ──────────────────
      step(2, 'MCP Server Configuration');
      const claudeDir = path.join(os.homedir(), '.claude');
      if (!opts.dryRun) {
        ensureDir(claudeDir);
      }

      const settings = readSettings(settingsPath) as Record<string, Record<string, unknown>>;

      // Check MCP server entry
      if (!settings.mcpServers) {
        settings.mcpServers = {};
      }

      const mcpServers = settings.mcpServers as Record<string, unknown>;
      if (mcpServers.brain) {
        pass('MCP server already configured');
      } else if (opts.dryRun) {
        skip('Would add MCP server entry', '"brain" → brain mcp-server');
      } else {
        mcpServers.brain = {
          command: 'brain',
          args: ['mcp-server'],
        };
        settingsChanged = true;
        pass('Added MCP server entry', '"brain" → brain mcp-server');
      }

      // ── Step 3: PostToolUse Hook ───────────────────────────
      step(3, 'Auto-Detect Hook');
      if (opts.hooks === false) {
        skip('Skipped hook configuration', '--no-hooks');
      } else {
        // Verify hook file exists
        const hookFileExists = fs.existsSync(hookPath);
        if (!hookFileExists) {
          // Try dist-relative path as fallback
          const fallbackPath = path.resolve(import.meta.dirname, '../../hooks/post-tool-use.js');
          if (fs.existsSync(fallbackPath)) {
            pass('Hook file found', fallbackPath);
          } else {
            fail('Hook file not found', `Expected at: ${hookPath}`);
            console.log(`    ${c.dim('Make sure @timmeck/brain is installed globally: npm install -g @timmeck/brain')}`);
            allGood = false;
          }
        } else {
          pass('Hook file found', hookPath);
        }

        if (!settings.hooks) {
          settings.hooks = {};
        }
        const hooks = settings.hooks as Record<string, unknown[]>;

        if (!hooks.PostToolUse) {
          hooks.PostToolUse = [];
        }

        const postToolUse = hooks.PostToolUse as Array<{
          matcher?: { tool_name?: string };
          hooks?: Array<{ command?: string }>;
          command?: string;
        }>;

        // Check if brain hook is already configured
        const hasBrainHook = postToolUse.some((h) => {
          if (h.command?.includes('brain') || h.command?.includes('post-tool-use')) return true;
          return h.hooks?.some(
            (inner) => inner.command?.includes('brain') || inner.command?.includes('post-tool-use'),
          );
        });

        if (hasBrainHook) {
          pass('Auto-detect hook already configured');
        } else if (opts.dryRun) {
          skip('Would add PostToolUse hook', hookCommand);
        } else {
          postToolUse.push({
            matcher: { tool_name: 'Bash' },
            hooks: [{ command: hookCommand }],
          });
          settingsChanged = true;
          pass('Added PostToolUse hook', 'auto-detects errors from Bash commands');
        }
      }

      // ── Step 4: Write settings.json ────────────────────────
      step(4, 'Save Configuration');
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

      // ── Step 5: Start Daemon ──────────────────────────────
      step(5, 'Start Daemon');
      if (opts.daemon === false) {
        skip('Skipped daemon start', '--no-daemon');
      } else if (opts.dryRun) {
        skip('Would start Brain daemon');
      } else {
        const pidPath = path.join(dataDir, 'brain.pid');
        let alreadyRunning = false;

        if (fs.existsSync(pidPath)) {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
          try {
            process.kill(pid, 0);
            alreadyRunning = true;
            pass('Daemon already running', `PID ${pid}`);
          } catch {
            // Stale PID file, remove it
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

            // Wait briefly for daemon to write PID file
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

      // ── Step 6: Doctor Checks ──────────────────────────────
      step(6, 'Health Check');
      if (opts.dryRun) {
        skip('Would run doctor checks');
      } else {
        // Quick health checks inline (subset of doctor)
        const dbPath = path.join(dataDir, 'brain.db');
        if (fs.existsSync(dbPath)) {
          const stat = fs.statSync(dbPath);
          pass('Database', `${(stat.size / 1024 / 1024).toFixed(1)} MB`);
        } else {
          skip('Database', 'will be created on first daemon start');
        }

        // Check daemon reachability
        const pidPath = path.join(dataDir, 'brain.pid');
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

      // ── Summary ─────────────────────────────────────────────
      console.log();
      if (opts.dryRun) {
        console.log(`  ${icons.brain}  ${c.cyan('Dry run complete.')} No changes were made.`);
      } else if (allGood) {
        console.log(`  ${icons.ok}  ${c.success('Brain is ready!')} All systems configured.`);
        console.log();
        console.log(`  ${c.dim('Next steps:')}`);
        console.log(`    ${c.dim('1.')} Restart Claude Code to load the MCP server`);
        console.log(`    ${c.dim('2.')} Run ${c.cyan('brain status')} to check Brain stats`);
        console.log(`    ${c.dim('3.')} Run ${c.cyan('brain doctor')} for a full health check`);
        console.log(`    ${c.dim('4.')} Import a project: ${c.cyan('brain import ./my-project')}`);
      } else {
        console.log(`  ${icons.warn}  ${c.warn('Setup completed with warnings.')} Check the items above.`);
        console.log(`    Run ${c.cyan('brain doctor')} for a detailed health check.`);
      }

      console.log(`\n${divider()}`);
    });
}
