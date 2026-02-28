import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header } from '../colors.js';

export function insightsCommand(): Command {
  return new Command('insights')
    .description('Show research insights')
    .option('-t, --type <type>', 'Filter by type (trend, gap, synergy, performance, regime_shift)')
    .option('-l, --limit <n>', 'Max results', '10')
    .action(async (opts) => {
      console.log(header('Research Insights', icons.insight));

      await withIpc(async (client) => {
        const method = opts.type ? 'insight.byType' : 'insight.list';
        const params = opts.type ? { type: opts.type } : { limit: Number(opts.limit) };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any = await client.request(method, params);
        if (!results?.length) {
          console.log(`  ${c.dim('No insights found.')}`);
          return;
        }
         
        for (const ins of results) {
          const sev = ins.severity === 'high' ? c.red(`[${ins.severity}]`) : ins.severity === 'medium' ? c.orange(`[${ins.severity}]`) : c.dim(`[${ins.severity}]`);
          console.log(`  ${sev} ${c.cyan(ins.type)} — ${c.value(ins.title)}`);
          console.log(`    ${c.dim(ins.description)}`);
        }
      });
    });
}
