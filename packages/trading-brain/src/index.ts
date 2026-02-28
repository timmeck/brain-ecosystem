#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './cli/commands/start.js';
import { stopCommand } from './cli/commands/stop.js';
import { statusCommand } from './cli/commands/status.js';
import { queryCommand } from './cli/commands/query.js';
import { insightsCommand } from './cli/commands/insights.js';
import { rulesCommand } from './cli/commands/rules.js';
import { networkCommand } from './cli/commands/network.js';
import { exportCommand } from './cli/commands/export.js';
import { importCommand } from './cli/commands/import.js';
import { configCommand } from './cli/commands/config.js';
import { doctorCommand } from './cli/commands/doctor.js';
import { dashboardCommand } from './cli/commands/dashboard.js';
import { peersCommand } from './cli/commands/peers.js';
import { setupCommand } from './cli/commands/setup.js';
import { checkForUpdate, getCurrentVersion } from './cli/update-check.js';

const program = new Command();

program
  .name('trading')
  .description('Trading Brain — Adaptive Trading Intelligence & Signal Learning System')
  .version(getCurrentVersion());

program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(queryCommand());
program.addCommand(insightsCommand());
program.addCommand(rulesCommand());
program.addCommand(networkCommand());
program.addCommand(exportCommand());
program.addCommand(importCommand());
program.addCommand(configCommand());
program.addCommand(doctorCommand());
program.addCommand(dashboardCommand());
program.addCommand(peersCommand());
program.addCommand(setupCommand());

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
    const { TradingCore } = await import('./trading-core.js');
    const core = new TradingCore();
    core.start(opts.config);
  });

program.parse();

// Non-blocking update check after command finishes
checkForUpdate();
