import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function insightsCommand(): Command {
  return new Command('insights')
    .description('Show current marketing insights')
    .option('-t, --type <type>', 'Filter by type (trend, gap, synergy, template, optimization)')
    .option('-l, --limit <n>', 'Max results', '10')
    .action(async (opts) => {
      await withIpc(async (client) => {
        let insights: unknown[];
        if (opts.type) {
          insights = await client.request('insight.byType', { type: opts.type, limit: Number(opts.limit) }) as unknown[];
        } else {
          insights = await client.request('insight.list', { limit: Number(opts.limit) }) as unknown[];
        }

        if ((insights as unknown[]).length === 0) {
          console.log(`${c.dim('No active insights. Start tracking posts to generate insights!')}`);
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const insight of insights as any[]) {
          const typeIcon = insight.type === 'trend' ? '📈'
            : insight.type === 'gap' ? '🕳️'
            : insight.type === 'synergy' ? '🔄'
            : insight.type === 'template' ? icons.template
            : insight.type === 'optimization' ? '⚡'
            : icons.insight;

          const priority = insight.priority >= 7 ? c.red(`[P${insight.priority}]`)
            : insight.priority >= 4 ? c.orange(`[P${insight.priority}]`)
            : c.dim(`[P${insight.priority}]`);

          console.log(`  ${typeIcon}  ${priority} ${c.value(insight.title)}`);
          console.log(`     ${c.dim(insight.description)}`);
          console.log(`     ${c.dim(`confidence: ${(insight.confidence * 100).toFixed(0)}%`)}`);
          console.log();
        }
      });
    });
}
