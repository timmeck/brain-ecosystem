import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function networkCommand(): Command {
  return new Command('network')
    .description('Explore the synapse network')
    .option('--node <type:id>', 'Node to explore (e.g., error:42)')
    .option('-l, --limit <n>', 'Max synapses to show', '20')
    .action(async (opts) => {
      await withIpc(async (client) => {
        if (opts.node) {
          const [nodeType, nodeIdStr] = opts.node.split(':');
          const nodeId = parseInt(nodeIdStr, 10);

          if (!nodeType || isNaN(nodeId)) {
            console.error(c.error('Invalid node format. Use: --node error:42'));
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const related: any = await client.request('synapse.related', {
            nodeType,
            nodeId,
            maxDepth: 2,
          });

          if (!related?.length) {
            console.log(`${c.dim('No connections found for')} ${c.cyan(`${nodeType}:${nodeId}`)}`);
            return;
          }

          console.log(header(`Connections from ${nodeType}:${nodeId}`, icons.synapse));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const r of related as any[]) {
            const weight = (r.activation ?? r.weight ?? 0);
            const weightColor = weight >= 0.7 ? c.green : weight >= 0.3 ? c.orange : c.dim;
            console.log(`  ${c.cyan(icons.arrow)} ${c.value(`${r.nodeType}:${r.nodeId}`)} ${c.label('weight:')} ${weightColor(weight.toFixed(3))}`);
          }
        } else {
          // Show general network stats
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stats: any = await client.request('synapse.stats', {});
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const overview: any = await client.request('analytics.network', {
            limit: parseInt(opts.limit, 10),
          });

          console.log(header('Synapse Network', icons.synapse));
          console.log(keyValue('Total synapses', stats.totalSynapses ?? 0));
          console.log(keyValue('Average weight', (stats.avgWeight ?? 0).toFixed(3)));
          console.log();

          if (overview?.strongestSynapses?.length) {
            console.log(`  ${c.purple.bold('Strongest connections:')}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const s of overview.strongestSynapses as any[]) {
              const weight = (s.weight ?? 0);
              const weightColor = weight >= 0.7 ? c.green : weight >= 0.3 ? c.orange : c.dim;
              console.log(`  ${c.dim(s.source)} ${c.cyan(icons.arrow)} ${c.dim(s.target)} ${c.label(`[${s.type}]`)} ${weightColor(weight.toFixed(3))}`);
            }
          }
        }
        console.log(`\n${divider()}`);
      });
    });
}
