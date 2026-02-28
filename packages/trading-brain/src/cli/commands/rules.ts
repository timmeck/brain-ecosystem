import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header } from '../colors.js';

export function rulesCommand(): Command {
  return new Command('rules')
    .description('Show learned trading rules')
    .action(async () => {
      console.log(header('Learned Rules', icons.rule));

      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules: any = await client.request('rule.list', {});
        if (!rules?.length) {
          console.log(`  ${c.dim('No rules learned yet. Brain needs more trades.')}`);
          return;
        }
         
        for (const r of rules) {
          const conf = Math.round(r.confidence * 100);
          const wr = Math.round(r.win_rate * 100);
          const confColor = conf > 70 ? c.green : conf > 50 ? c.orange : c.red;
          console.log(`  ${confColor(`${conf}%`)} conf ${c.dim('|')} ${c.cyan(`${wr}%`)} WR ${c.dim('|')} n=${r.sample_count} ${c.dim('|')} ${c.value(r.pattern)}`);
        }
      });
    });
}
