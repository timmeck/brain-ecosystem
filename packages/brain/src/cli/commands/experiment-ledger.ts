import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function experimentLedgerCommand(): Command {
  const cmd = new Command('ledger')
    .description('Experiment Ledger — controlled A/B testing for system changes');

  cmd.command('status')
    .description('Show experiment ledger status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('ledger.status');

        console.log(header('Experiment Ledger', '\u{1F9EA}'));
        console.log(keyValue('Total Experiments', String(status.total ?? 0)));
        console.log(keyValue('Kept', c.green(String(status.kept ?? 0))));
        console.log(keyValue('Reverted', c.orange(String(status.reverted ?? 0))));
        console.log(keyValue('Cancelled', c.dim(String(status.cancelled ?? 0))));

        if (status.active) {
          const a = status.active;
          console.log('');
          console.log(keyValue('Active', `#${a.id}: ${a.hypothesis}`));
          console.log(keyValue('Phase', a.status));
          console.log(keyValue('Cycle', `${a.current_cycle}/${a.cycles_per_variant * 2}`));
          console.log(keyValue('Engine', a.target_engine));
          console.log(keyValue('Metrics', a.metric_keys.join(', ')));
        } else {
          console.log(keyValue('Active', c.dim('none')));
        }
        console.log(divider());
      });
    });

  cmd.command('start')
    .description('Start a new A/B experiment')
    .requiredOption('--hypothesis <text>', 'What are we testing?')
    .requiredOption('--engine <name>', 'Target engine')
    .requiredOption('--metrics <keys>', 'Comma-separated metric keys')
    .option('--variant-a <text>', 'Variant A description', 'baseline')
    .option('--variant-b <text>', 'Variant B description', 'change')
    .option('--cycles <n>', 'Cycles per variant', '20')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('ledger.start', {
          hypothesis: opts.hypothesis,
          variantA: opts.variantA,
          variantB: opts.variantB,
          targetEngine: opts.engine,
          metricKeys: opts.metrics.split(',').map((k: string) => k.trim()),
          cyclesPerVariant: parseInt(opts.cycles, 10),
        });

        console.log(`  ${c.green('Experiment started')}: #${result.id}`);
        console.log(`  ${c.dim(result.hypothesis)}`);
      });
    });

  cmd.command('history')
    .description('Show experiment history')
    .option('-n, --limit <n>', 'Max results', '10')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const experiments: any[] = await client.request('ledger.history', {
          limit: parseInt(opts.limit, 10),
        }) as any[];

        if (!experiments?.length) {
          console.log(`  ${c.dim('No experiments yet.')}`);
          return;
        }

        console.log(header(`${experiments.length} Experiments`, '\u{1F4CA}'));
        for (const e of experiments) {
          const statusIcon = e.decision === 'keep' ? c.green('\u2713') : e.decision === 'revert' ? c.orange('\u21A9') : e.status === 'cancelled' ? c.dim('\u2717') : c.cyan('\u25B6');
          const decision = e.decision ? ` → ${e.decision}` : '';
          console.log(`  ${statusIcon} #${e.id} ${e.hypothesis.substring(0, 60)}${decision}`);
        }
        console.log(divider());
      });
    });

  cmd.command('decide <id> <decision>')
    .description('Decide on an experiment (keep/revert)')
    .option('--reason <text>', 'Reason for decision')
    .action(async (id, decision, opts) => {
      if (decision !== 'keep' && decision !== 'revert') {
        console.log(`  ${c.orange('Decision must be "keep" or "revert"')}`);
        return;
      }
      await withIpc(async (client) => {
        await client.request('ledger.decide', {
          id: parseInt(id, 10),
          decision,
          reason: opts.reason,
        });
        console.log(`  ${c.green('Decision recorded')}: ${decision}`);
      });
    });

  cmd.command('cancel <id>')
    .description('Cancel an active experiment')
    .option('--reason <text>', 'Reason for cancellation')
    .action(async (id, opts) => {
      await withIpc(async (client) => {
        await client.request('ledger.cancel', {
          id: parseInt(id, 10),
          reason: opts.reason,
        });
        console.log(`  ${c.orange('Experiment cancelled')}`);
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
