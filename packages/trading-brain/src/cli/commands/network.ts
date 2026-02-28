import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue } from '../colors.js';

export function networkCommand(): Command {
  return new Command('network')
    .description('Show synapse network overview')
    .option('-n, --node <id>', 'Explore from specific node')
    .action(async (opts) => {
      console.log(header('Synapse Network', icons.synapse));

      await withIpc(async (client) => {
        if (opts.node) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const activated: any = await client.request('synapse.explore', { query: opts.node });
          if (!activated?.length) {
            console.log(`  ${c.dim(`No node found matching "${opts.node}"`)}`);
            return;
          }
          console.log(`  ${c.info('Spreading Activation from:')} ${c.value(opts.node)}\n`);
           
          for (const node of activated.slice(0, 20)) {
            const bar = c.cyan('█'.repeat(Math.round(node.activation * 20)));
            console.log(`  ${bar} ${c.dim(node.type)} ${c.value(node.label)} ${c.dim(`(${node.activation.toFixed(3)})`)}`);
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stats: any = await client.request('synapse.stats', {});
          console.log(keyValue('Synapses', stats.totalSynapses));
          console.log(keyValue('Avg Weight', stats.avgWeight?.toFixed(3) ?? '0'));
          console.log(keyValue('Graph Nodes', stats.graphNodes));
          console.log(keyValue('Graph Edges', stats.graphEdges));
          if (stats.strongest?.length > 0) {
            console.log(`\n  ${c.cyan.bold('Strongest Synapses:')}`);
             
            for (const s of stats.strongest) {
              console.log(`    ${c.green(s.weight.toFixed(3))} ${c.dim(`(${s.activations}x)`)} ${c.value(s.id)}`);
            }
          }
        }
      });
    });
}
