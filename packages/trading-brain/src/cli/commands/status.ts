import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';
import { getCurrentVersion } from '../update-check.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show Trading Brain daemon status')
    .action(async () => {
      const pidPath = path.join(getDataDir(), 'trading-brain.pid');

      if (!fs.existsSync(pidPath)) {
        console.log(`${icons.trade}  Trading Brain Daemon: ${c.red.bold('NOT RUNNING')}`);
        return;
      }

      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      let running = false;
      try { process.kill(pid, 0); running = true; } catch { /* not running */ }

      if (!running) {
        console.log(`${icons.trade}  Trading Brain Daemon: ${c.red.bold('NOT RUNNING')} ${c.dim('(stale PID file)')}`);
        return;
      }

      console.log(header(`Trading Brain Status v${getCurrentVersion()}`, icons.trade));
      console.log(`  ${c.green(`${icons.dot} RUNNING`)} ${c.dim(`(PID ${pid})`)}`);

       
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary: any = await client.request('analytics.summary', {});

        // Paper trading status
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let paperStatus: any = null;
        try {
          paperStatus = await client.request('paper.status', {});
        } catch { /* paper engine may not be available */ }

        const dbPath = path.join(getDataDir(), 'trading-brain.db');
        let dbSize = '?';
        try {
          const stat = fs.statSync(dbPath);
          dbSize = `${(stat.size / 1024 / 1024).toFixed(1)} MB`;
        } catch { /* ignore */ }

        console.log(keyValue('Database', `${dbPath} (${dbSize})`));
        console.log();

        // Paper Trading Section
        if (paperStatus?.enabled) {
          const bal = paperStatus.balance ?? 0;
          const eq = paperStatus.equity ?? 0;
          const startBal = paperStatus.startingBalance ?? 10000;
          const positions = paperStatus.openPositions ?? 0;
          const closedTrades = paperStatus.closedTrades ?? 0;
          const totalPnl = eq - startBal;
          const pnlColor = totalPnl >= 0 ? c.green : c.red;

          console.log(`  ${icons.trade}  ${c.green.bold('Paper Trading')}`);
          console.log(`     ${c.label('Balance:')}    $${bal.toFixed(2)} | Equity: $${eq.toFixed(2)}`);
          console.log(`     ${c.label('PnL:')}        ${pnlColor(`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${((totalPnl / startBal) * 100).toFixed(2)}%)`)}`);
          console.log(`     ${c.label('Positions:')}  ${c.value(positions)} open, ${c.value(closedTrades)} closed`);
          if (paperStatus.paused) {
            console.log(`     ${c.label('Status:')}     ${c.orange('PAUSED')}`);
          } else {
            console.log(`     ${c.label('Cycles:')}     ${c.value(paperStatus.cycleCount ?? 0)} | Last: ${c.dim(paperStatus.lastCycleAt ?? 'never')}`);
          }
          console.log();
        }

        console.log(`  ${icons.trade}  ${c.green.bold('Signal Learning')}`);
        console.log(`     ${c.label('Trades:')}     ${c.value(summary.trades?.total ?? 0)} total, ${c.cyan(`${summary.trades?.recentWinRate ?? 0}%`)} recent win-rate`);
        console.log(`     ${c.label('Rules:')}      ${c.green(summary.rules?.total ?? 0)} learned`);
        console.log();

        console.log(`  ${icons.synapse}  ${c.cyan.bold('Synapse Network')}`);
        console.log(`     ${c.label('Synapses:')}   ${c.value(summary.network?.synapses ?? 0)}`);
        console.log(`     ${c.label('Avg weight:')} ${c.value(summary.network?.avgWeight ?? 0)}`);
        console.log(`     ${c.label('Graph:')}      ${c.value(summary.network?.graphNodes ?? 0)} nodes, ${c.value(summary.network?.graphEdges ?? 0)} edges`);
        console.log();

        console.log(`  ${icons.insight}  ${c.orange.bold('Research')}`);
        console.log(`     ${c.label('Insights:')}   ${c.value(summary.insights?.total ?? 0)}`);
        console.log(`     ${c.label('Chains:')}     ${c.value(summary.chains?.total ?? 0)}`);
        console.log();

        console.log(`  ${icons.brain}  ${c.purple.bold('Memory')}`);
        console.log(`     ${c.label('Memories:')}   ${c.value(summary.memory?.active ?? 0)} active`);
        console.log(`     ${c.label('Sessions:')}   ${c.value(summary.memory?.sessions ?? 0)}`);
        const cats = summary.memory?.byCategory;
        if (cats && Object.keys(cats).length > 0) {
          const catStr = Object.entries(cats).map(([k, v]) => `${k}: ${v}`).join(', ');
          console.log(`     ${c.label('Categories:')} ${c.dim(catStr)}`);
        }

        console.log(`\n${divider()}`);
      });
    });
}
