import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, priorityBadge, divider } from '../colors.js';

const TYPE_ICONS: Record<string, string> = {
  trend: '📈',
  pattern: '🔄',
  gap: '⚠',
  synergy: '⚡',
  optimization: '🎯',
  template_candidate: '🎨',
  project_suggestion: '💡',
  warning: '🚨',
  suggestion: '💡',
};

export function insightsCommand(): Command {
  return new Command('insights')
    .description('Show research insights')
    .option('--type <type>', 'Filter by type: trend, pattern, gap, synergy, optimization, template_candidate, project_suggestion, warning')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insights: any = await client.request('research.insights', {
          type: opts.type,
          activeOnly: true,
          limit: parseInt(opts.limit, 10),
        });

        if (!insights?.length) {
          console.log(`${icons.insight}  ${c.dim('No active insights.')}`);
          return;
        }

        console.log(header(`${insights.length} Insights`, icons.insight));

        // Group by type
        const byType: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ins of insights as any[]) {
          byType[ins.type] = (byType[ins.type] || 0) + 1;
        }
        const typeSummary = Object.entries(byType)
          .sort((a, b) => b[1] - a[1])
          .map(([t, count]) => `${TYPE_ICONS[t] ?? '•'} ${c.cyan(t)} ${c.dim(`(${count})`)}`)
          .join('  ');
        console.log(`  ${typeSummary}\n`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ins of insights as any[]) {
          const typeIcon = TYPE_ICONS[ins.type] ?? '•';
          const pBadge = priorityBadge(ins.priority ?? 0);
          const typeTag = c.cyan(`[${ins.type}]`);

          console.log(`  ${typeIcon} ${typeTag} ${pBadge} ${c.value(ins.title)}`);
          if (ins.description) {
            console.log(`     ${c.dim(ins.description.slice(0, 150))}`);
          }
          console.log();
        }
        console.log(divider());
      });
    });
}
