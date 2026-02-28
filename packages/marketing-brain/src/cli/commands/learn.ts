import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function learnCommand(): Command {
  return new Command('learn')
    .description('Trigger a learning cycle manually (pattern extraction + rule generation)')
    .action(async () => {
      await withIpc(async (client) => {
        console.log(`${icons.bolt}  ${c.info('Running learning cycle...')}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('learning.run', {});

        console.log(header('Learning Cycle Complete', icons.bolt));
        console.log(keyValue('Rules created', result.rulesCreated ?? 0));
        console.log(keyValue('Rules updated', result.rulesUpdated ?? 0));
        console.log(keyValue('Strategies updated', result.strategiesUpdated ?? 0));
        console.log(keyValue('Synapses decayed', result.synapsesDecayed ?? 0));
        console.log(keyValue('Synapses pruned', result.synapsesPruned ?? 0));
        console.log(`\n${divider()}`);
      });
    });
}
