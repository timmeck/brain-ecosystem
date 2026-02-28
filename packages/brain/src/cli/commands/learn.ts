import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function learnCommand(): Command {
  return new Command('learn')
    .description('Trigger a learning cycle manually (pattern extraction + rule generation)')
    .action(async () => {
      await withIpc(async (client) => {
        console.log(`${icons.brain}  ${c.info('Running learning cycle...')}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('learning.run', {});

        console.log(header('Learning Cycle Complete', icons.bolt));
        console.log(keyValue('New patterns', result.newPatterns ?? 0));
        console.log(keyValue('Updated rules', result.updatedRules ?? 0));
        console.log(keyValue('Pruned rules', result.prunedRules ?? 0));
        console.log(keyValue('New anti-patterns', result.newAntipatterns ?? 0));
        console.log(keyValue('Duration', `${result.duration ?? 0}ms`));
        console.log(`\n${divider()}`);
      });
    });
}
