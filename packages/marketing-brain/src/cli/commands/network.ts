import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function networkCommand(): Command {
  return new Command('network')
    .description('Explore the synapse network')
    .option('--node <type:id>', 'Node to explore (e.g., post:42)')
    .option('-l, --limit <n>', 'Max synapses to show', '20')
    .action(async (opts) => {
      await withIpc(async (client) => {
        if (opts.node) {
          const [nodeType, nodeIdStr] = opts.node.split(':');
          const nodeId = parseInt(nodeIdStr, 10);

          if (!nodeType || isNaN(nodeId)) {
            console.error(c.error('Invalid node format. Use: --node post:42'));
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
            const nodeType = r.node?.type ?? r.nodeType ?? '?';
            const nodeId = r.node?.id ?? r.nodeId ?? '?';
            console.log(`  ${c.cyan(icons.arrow)} ${c.value(`${nodeType}:${nodeId}`)} ${c.label('weight:')} ${weightColor(weight.toFixed(3))}`);
          }
        } else {
          // Show general network stats
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stats: any = await client.request('synapse.stats', {});
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const strongest: any = await client.request('synapse.strongest', {
            limit: parseInt(opts.limit, 10),
          });

          console.log(header('Synapse Network', icons.synapse));
          console.log(keyValue('Total synapses', stats.totalSynapses ?? 0));
          console.log(keyValue('Average weight', (stats.avgWeight ?? 0).toFixed(3)));
          console.log();

          if (strongest?.length) {
            console.log(`  ${c.purple.bold('Strongest connections:')}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const s of strongest as any[]) {
              const weight = (s.weight ?? 0);
              const weightColor = weight >= 0.7 ? c.green : weight >= 0.3 ? c.orange : c.dim;
              const src = `${s.source_type}:${s.source_id}`;
              const tgt = `${s.target_type}:${s.target_id}`;
              console.log(`  ${c.dim(src)} ${c.cyan(icons.arrow)} ${c.dim(tgt)} ${c.label(`[${s.synapse_type}]`)} ${weightColor(weight.toFixed(3))}`);
            }
          }
        }
        console.log(`\n${divider()}`);
      });
    });
}
