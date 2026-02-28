import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider, progressBar } from '../colors.js';

export function rulesCommand(): Command {
  return new Command('rules')
    .description('List all active learned rules with confidence scores')
    .option('-l, --limit <n>', 'Max rules to show', '20')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules = await client.request('rule.list', {}) as any[];
        console.log(header('Learned Rules', icons.brain));
        console.log();

        if (!rules || rules.length === 0) {
          console.log(`  ${c.dim('No rules learned yet. Run "brain learn" to trigger a learning cycle.')}`);
          return;
        }

        const limit = parseInt(opts.limit, 10);
        const shown = rules.slice(0, limit);

        for (const rule of shown) {
          const conf = (rule.confidence * 100).toFixed(0);
          const bar = progressBar(rule.confidence, 1.0);
          const status = rule.confidence >= 0.8 ? c.green('HIGH') : rule.confidence >= 0.5 ? c.orange('MED') : c.red('LOW');
          console.log(`  ${c.cyan(`#${rule.id}`)}  ${bar} ${conf}% ${status}`);
          console.log(`    ${c.dim('Pattern:')} ${rule.pattern}`);
          console.log(`    ${c.dim('Action:')}  ${rule.action}`);
          if (rule.description) {
            console.log(`    ${c.dim('Info:')}    ${rule.description}`);
          }
          console.log(`    ${c.dim('Seen:')}    ${rule.occurrences}x  ${c.dim('Since:')} ${rule.created_at?.split('T')[0] || 'unknown'}`);
          console.log();
        }

        if (rules.length > limit) {
          console.log(`  ${c.dim(`... and ${rules.length - limit} more. Use --limit to see more.`)}`);
        }

        console.log(divider());
      });
    });
}
