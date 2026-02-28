import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider, progressBar } from '../colors.js';

export function synapsesCommand(): Command {
  return new Command('synapses')
    .description('Show strongest synapse connections in the network')
    .option('-l, --limit <n>', 'Max synapses to show', '20')
    .option('-t, --type <type>', 'Filter by connection type')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const synapses = await client.request('synapse.list', {
          limit: parseInt(opts.limit, 10),
          type: opts.type,
        }) as any[];

        console.log(header('Synapse Network', icons.brain));
        console.log();

        if (!synapses || synapses.length === 0) {
          console.log(`  ${c.dim('No synapses found. Synapses form as Brain learns from errors and solutions.')}`);
          return;
        }

        for (const syn of synapses) {
          const weight = syn.weight.toFixed(3);
          const bar = progressBar(syn.weight, 1.0);
          console.log(`  ${bar} ${c.value(weight)}  ${c.cyan(syn.sourceType)}:${syn.sourceId} ${c.dim('\u2192')} ${c.cyan(syn.targetType)}:${syn.targetId}`);
          if (syn.type) {
            console.log(`    ${c.dim('Type:')} ${syn.type}  ${c.dim('Last active:')} ${syn.lastActivated?.split('T')[0] || 'unknown'}`);
          }
        }

        console.log();
        console.log(divider());
      });
    });
}
