import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show Marketing Brain daemon status')
    .action(async () => {
      const pidPath = path.join(getDataDir(), 'marketing-brain.pid');

      if (!fs.existsSync(pidPath)) {
        console.log(`${icons.megaphone}  Marketing Brain Daemon: ${c.red.bold('NOT RUNNING')}`);
        return;
      }

      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      let running = false;
      try {
        process.kill(pid, 0);
        running = true;
      } catch { /* not running */ }

      if (!running) {
        console.log(`${icons.megaphone}  Marketing Brain Daemon: ${c.red.bold('NOT RUNNING')} ${c.dim('(stale PID file)')}`);
        return;
      }

      console.log(header('Marketing Brain Status', icons.megaphone));
      console.log(`  ${c.green(`${icons.dot} RUNNING`)} ${c.dim(`(PID ${pid})`)}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary: any = await client.request('analytics.summary', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const network: any = await client.request('synapse.stats', {});

        const dbPath = path.join(getDataDir(), 'marketing-brain.db');
        let dbSize = '?';
        try {
          const stat = fs.statSync(dbPath);
          dbSize = `${(stat.size / 1024 / 1024).toFixed(1)} MB`;
        } catch { /* ignore */ }

        console.log(keyValue('Database', `${dbPath} (${dbSize})`));
        console.log();

        console.log(`  ${icons.post}  ${c.purple.bold('Content')}`);
        console.log(`     ${c.label('Posts:')}       ${c.value(summary.posts?.total ?? 0)} total`);
        console.log(`     ${c.label('Campaigns:')}   ${c.value(summary.campaigns?.total ?? 0)}`);
        console.log(`     ${c.label('Templates:')}   ${c.value(summary.templates?.total ?? 0)}`);
        console.log();

        console.log(`  ${icons.rule}  ${c.blue.bold('Learning')}`);
        console.log(`     ${c.label('Strategies:')}  ${c.value(summary.strategies?.total ?? 0)}`);
        console.log(`     ${c.label('Rules:')}       ${c.green(summary.rules?.active ?? 0)} active`);
        console.log();

        console.log(`  ${icons.synapse}  ${c.cyan.bold('Synapse Network')}`);
        console.log(`     ${c.label('Synapses:')}    ${c.value(network.totalSynapses ?? 0)}`);
        console.log(`     ${c.label('Avg weight:')}  ${c.value((network.avgWeight ?? 0).toFixed(2))}`);
        console.log();

        console.log(`  ${icons.insight}  ${c.orange.bold('Research')}`);
        console.log(`     ${c.label('Insights:')}    ${c.value(summary.insights?.active ?? 0)} active`);
        console.log();

        console.log(`  ${icons.brain}  ${c.purple.bold('Memory')}`);
        console.log(`     ${c.label('Memories:')}    ${c.value(summary.memory?.active ?? 0)} active`);
        console.log(`     ${c.label('Sessions:')}    ${c.value(summary.memory?.sessions ?? 0)}`);
        const cats = summary.memory?.byCategory;
        if (cats && Object.keys(cats).length > 0) {
          const catStr = Object.entries(cats).map(([k, v]: [string, unknown]) => `${k}: ${v}`).join(', ');
          console.log(`     ${c.label('Categories:')}  ${c.dim(catStr)}`);
        }

        console.log(`\n${divider()}`);
      });
    });
}
