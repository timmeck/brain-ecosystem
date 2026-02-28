#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './cli/commands/start.js';
import { stopCommand } from './cli/commands/stop.js';
import { statusCommand } from './cli/commands/status.js';
import { doctorCommand } from './cli/commands/doctor.js';
import { postCommand } from './cli/commands/post.js';
import { campaignCommand } from './cli/commands/campaign.js';
import { insightsCommand } from './cli/commands/insights.js';
import { rulesCommand } from './cli/commands/rules.js';
import { suggestCommand } from './cli/commands/suggest.js';
import { dashboardCommand } from './cli/commands/dashboard.js';
import { importCommand } from './cli/commands/import.js';
import { exportCommand } from './cli/commands/export.js';
import { learnCommand } from './cli/commands/learn.js';
import { networkCommand } from './cli/commands/network.js';
import { queryCommand } from './cli/commands/query.js';
import { configCommand } from './cli/commands/config.js';
import { peersCommand } from './cli/commands/peers.js';
import { setupCommand } from './cli/commands/setup.js';
import { checkForUpdate, getCurrentVersion } from './cli/update-check.js';

const program = new Command();

program
  .name('marketing')
  .description('Marketing Brain — Self-Learning Marketing Intelligence System')
  .version(getCurrentVersion());

program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(statusCommand());
program.addCommand(doctorCommand());
program.addCommand(postCommand());
program.addCommand(campaignCommand());
program.addCommand(insightsCommand());
program.addCommand(rulesCommand());
program.addCommand(suggestCommand());
program.addCommand(dashboardCommand());
program.addCommand(importCommand());
program.addCommand(exportCommand());
program.addCommand(learnCommand());
program.addCommand(networkCommand());
program.addCommand(queryCommand());
program.addCommand(configCommand());
program.addCommand(peersCommand());
program.addCommand(setupCommand());

// Hidden: MCP server (called by Claude Code)
program
  .command('mcp-server')
  .description('Start MCP server (stdio transport, used by Claude Code)')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

// Hidden: run daemon in foreground
program
  .command('daemon')
  .description('Run daemon in foreground')
  .option('-c, --config <path>', 'Config file path')
  .action(async (opts) => {
    const { MarketingCore } = await import('./marketing-core.js');
    const core = new MarketingCore();
    core.start(opts.config);
  });

program.parse();

// Non-blocking update check after command finishes
checkForUpdate();
