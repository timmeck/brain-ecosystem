import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function rulesCommand(): Command {
  return new Command('rules')
    .description('Show learned marketing rules')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules: any[] = await client.request('rule.list') as any[];

        if (rules.length === 0) {
          console.log(`${c.dim('No rules learned yet. Track more posts to generate rules!')}`);
          return;
        }

        for (const rule of rules) {
          const conf = (rule.confidence * 100).toFixed(0);
          console.log(`  ${icons.rule}  ${c.value(rule.pattern)}`);
          console.log(`     ${c.dim(rule.recommendation)}`);
          console.log(`     ${c.dim(`confidence: ${conf}% | triggers: ${rule.trigger_count} | success: ${rule.success_count}`)}`);
          console.log();
        }
      });
    });
}
