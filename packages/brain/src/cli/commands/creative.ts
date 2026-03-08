import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function creativeCommand(): Command {
  const cmd = new Command('creative')
    .description('Creative Engine — cross-domain idea generation, analogies, speculative insights');

  cmd.command('status')
    .description('Show creative engine status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('creative.status');

        console.log(header('Creative Engine Status', '\u{1F4A1}'));
        console.log(keyValue('Total Insights', String(status.totalInsights ?? 0)));
        console.log(keyValue('Pending', String(status.pendingInsights ?? status.pending ?? 0)));
        console.log(keyValue('Converted', String(status.convertedInsights ?? status.converted ?? 0)));
        console.log(keyValue('Avg Novelty', c.value((status.avgNovelty ?? 0).toFixed(2))));
        console.log(divider());
      });
    });

  cmd.command('insights')
    .description('Show recent creative insights')
    .option('-n, --limit <n>', 'Number of insights', '10')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insights: any[] = await client.request('creative.insights', { limit: parseInt(opts.limit, 10) }) as any[];

        if (!insights?.length) {
          console.log(`  ${c.dim('No creative insights yet.')}`);
          return;
        }

        console.log(header(`${insights.length} Creative Insight(s)`, '\u{2728}'));
        for (const ins of insights) {
          const novelty = ins.noveltyScore ?? ins.novelty ?? 0;
          const plaus = ins.plausibility ?? 0;
          const nColor = novelty > 0.7 ? c.green : novelty > 0.4 ? c.orange : c.dim;
          console.log(`  ${c.value(`#${ins.id}`)} ${ins.title ?? ins.description?.slice(0, 80) ?? '-'}`);
          console.log(`    ${c.dim('novelty:')} ${nColor(novelty.toFixed(2))}  ${c.dim('plausibility:')} ${plaus.toFixed(2)}  ${c.dim('status:')} ${ins.status ?? '-'}`);
        }
        console.log(divider());
      });
    });

  cmd.command('pollinate')
    .description('Trigger cross-pollination between knowledge domains')
    .action(async () => {
      await withIpc(async (client) => {
        const result = await client.request('creative.crossPollinate');
        console.log(`  ${c.green('Cross-pollination complete')}`);
        console.log(`  ${c.dim(JSON.stringify(result, null, 2))}`);
      });
    });

  cmd.command('analogies')
    .description('Find analogies for a concept')
    .argument('<concept>', 'The concept to find analogies for')
    .action(async (concept) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analogies: any = await client.request('creative.analogies', { concept });

        console.log(header(`Analogies for "${concept}"`, '\u{1F50D}'));
        const items = Array.isArray(analogies) ? analogies : analogies?.analogies ?? [];
        if (!items.length) {
          console.log(`  ${c.dim('No analogies found.')}`);
        } else {
          for (const a of items) {
            const text = typeof a === 'string' ? a : (a.description ?? a.analogy ?? JSON.stringify(a));
            console.log(`  ${c.cyan('\u{2022}')} ${text}`);
          }
        }
        console.log(divider());
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
