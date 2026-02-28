import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function exportCommand(): Command {
  return new Command('export')
    .description('Export Marketing Brain data')
    .option('--format <fmt>', 'Output format: json (default)', 'json')
    .action(async () => {
      await withIpc(async (client) => {
        process.stderr.write(`${icons.chart}  ${c.info('Exporting Marketing Brain data...')}\n`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary: any = await client.request('analytics.summary', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const top: any = await client.request('analytics.top', { limit: 50 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insights: any = await client.request('insight.list', { limit: 100 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules: any = await client.request('rule.list', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const strategies: any = await client.request('strategy.list', { limit: 100 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const network: any = await client.request('synapse.stats', {});

        const data = {
          exportedAt: new Date().toISOString(),
          summary,
          topPerformers: top,
          insights,
          rules,
          strategies,
          network,
        };

        console.log(JSON.stringify(data, null, 2));
        process.stderr.write(`${icons.ok}  ${c.success('Export complete.')}\n`);
      });
    });
}
