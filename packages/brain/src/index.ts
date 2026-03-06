#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

// Load .env from project root (monorepo) if it exists
const envPath = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '..', '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { Command } from 'commander';
import { startCommand } from './cli/commands/start.js';
import { stopCommand } from './cli/commands/stop.js';
import { statusCommand } from './cli/commands/status.js';
import { queryCommand } from './cli/commands/query.js';
import { modulesCommand } from './cli/commands/modules.js';
import { insightsCommand } from './cli/commands/insights.js';
import { networkCommand } from './cli/commands/network.js';
import { exportCommand } from './cli/commands/export.js';
import { importCommand } from './cli/commands/import.js';
import { dashboardCommand } from './cli/commands/dashboard.js';
import { learnCommand } from './cli/commands/learn.js';
import { configCommand } from './cli/commands/config.js';
import { projectsCommand } from './cli/commands/projects.js';
import { doctorCommand } from './cli/commands/doctor.js';
import { explainCommand } from './cli/commands/explain.js';
import { peersCommand } from './cli/commands/peers.js';
import { setupCommand } from './cli/commands/setup.js';
import { rulesCommand } from './cli/commands/rules.js';
import { synapsesCommand } from './cli/commands/synapses.js';
import { missionsCommand } from './cli/commands/missions.js';
import { watchdogCommand } from './cli/commands/watchdog.js';
import { serviceCommand } from './cli/commands/service.js';
import { getCurrentVersion } from './cli/update-check.js';

const program = new Command();

program
  .name('brain')
  .description('Brain — Adaptive Error Memory & Code Intelligence System')
  .version(getCurrentVersion());

program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(queryCommand());
program.addCommand(modulesCommand());
program.addCommand(insightsCommand());
program.addCommand(networkCommand());
program.addCommand(exportCommand());
program.addCommand(importCommand());
program.addCommand(dashboardCommand());
program.addCommand(learnCommand());
program.addCommand(configCommand());
program.addCommand(projectsCommand());
program.addCommand(doctorCommand());
program.addCommand(explainCommand());
program.addCommand(peersCommand());
program.addCommand(setupCommand());
program.addCommand(rulesCommand());
program.addCommand(synapsesCommand());
program.addCommand(missionsCommand());
program.addCommand(watchdogCommand());
program.addCommand(serviceCommand());

// Hidden command: run MCP server (called by Claude Code)
program
  .command('mcp-server')
  .description('Start MCP server (stdio transport, used by Claude Code)')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

// Hidden command: run daemon in foreground (called by start command)
program
  .command('daemon')
  .description('Run daemon in foreground')
  .option('-c, --config <path>', 'Config file path')
  .action(async (opts) => {
    const { BrainCore } = await import('./brain.js');
    const core = new BrainCore();
    core.start(opts.config);
  });

program.parse();
