import { Command } from 'commander';
import fs from 'node:fs';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function exportCommand(): Command {
  return new Command('export')
    .description('Export all brain data as JSON')
    .option('-o, --output <file>', 'Output file path', 'trading-brain-export.json')
    .action(async (opts) => {
      await withIpc(async (client) => {
        const summary = await client.request('analytics.summary', {});
        const rules = await client.request('rule.list', {});
        const chains = await client.request('chain.list', { limit: 100 });
        const insights = await client.request('insight.list', { limit: 100 });
        const network = await client.request('synapse.stats', {});
        const calibration = await client.request('calibration.get', {});

        const data = { summary, rules, chains, insights, network, calibration, exportedAt: new Date().toISOString() };
        fs.writeFileSync(opts.output, JSON.stringify(data, null, 2));
        console.log(`${icons.ok}  ${c.success(`Exported to ${opts.output}`)}`);
      });
    });
}
