import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function exportCommand(): Command {
  return new Command('export')
    .description('Export Brain data')
    .option('--format <fmt>', 'Output format: json (default)', 'json')
    .action(async () => {
      await withIpc(async (client) => {
        process.stderr.write(`${icons.gear}  ${c.info('Exporting Brain data...')}\n`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary: any = await client.request('analytics.summary', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const network: any = await client.request('analytics.network', { limit: 100 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insights: any = await client.request('research.insights', { activeOnly: true, limit: 100 });

        const data = {
          exportedAt: new Date().toISOString(),
          summary,
          network,
          insights,
        };

        console.log(JSON.stringify(data, null, 2));
        process.stderr.write(`${icons.ok}  ${c.success('Export complete.')}\n`);
      });
    });
}
