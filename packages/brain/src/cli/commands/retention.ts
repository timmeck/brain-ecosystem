import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function retentionCommand(): Command {
  const cmd = new Command('retention')
    .description('DB Retention Policy — intelligent cleanup with protection rules');

  cmd.command('status')
    .description('Show retention status + last report summary')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('retention.status');

        console.log(header('Retention Policy', '\u{1F9F9}'));
        console.log(keyValue('Total Runs', String(status?.totalRuns ?? 0)));

        // Config
        const cfg = status?.config;
        if (cfg) {
          console.log(keyValue('RAG Vector TTL', `${cfg.ragVectorTTLDays}d`));
          console.log(keyValue('Memory TTL', `${cfg.memoryTTLDays}d (importance >= ${cfg.memoryProtectionImportance} protected)`));
          console.log(keyValue('Cluster TTL', `${cfg.clusterTTLDays}d`));
          console.log(keyValue('Insight TTL', `${cfg.insightTTLDays}d (archived only)`));
          console.log(keyValue('Batch Limit', String(cfg.batchLimit)));
        }

        // Last report summary
        const report = status?.lastReport;
        if (report) {
          console.log('');
          console.log(`  ${c.cyan('Last Run')} (${report.dryRun ? 'DRY-RUN' : 'LIVE'}) — ${report.timestamp}`);
          console.log(keyValue('  Rows Affected', String(report.totalRowsAffected)));
          console.log(keyValue('  Space Reclaimed', `~${report.estimatedSpaceMB} MB`));
          console.log(keyValue('  Duration', `${report.durationMs}ms`));
        } else {
          console.log(`\n  ${c.dim('No retention runs yet')}`);
        }
        console.log(divider());
      });
    });

  cmd.command('sizes')
    .description('Show DB table sizes')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sizes = (await client.request('retention.sizes')) as any[];

        console.log(header('Table Sizes', '\u{1F4CA}'));
        console.log(`  ${'Table'.padEnd(28)} ${'Rows'.padEnd(12)} ${'Est. Size'}`);
        console.log(`  ${'-'.repeat(28)} ${'-'.repeat(12)} ${'-'.repeat(12)}`);

        let totalMB = 0;
        for (const t of sizes ?? []) {
          const sizeStr = t.estimatedMB >= 100 ? c.red(`${t.estimatedMB} MB`)
            : t.estimatedMB >= 10 ? c.orange(`${t.estimatedMB} MB`)
            : c.green(`${t.estimatedMB} MB`);
          console.log(`  ${c.cyan(t.table.padEnd(28))} ${String(t.rowCount).padEnd(12)} ${sizeStr}`);
          totalMB += t.estimatedMB;
        }
        console.log(`  ${'-'.repeat(28)} ${'-'.repeat(12)} ${'-'.repeat(12)}`);
        console.log(`  ${'Total'.padEnd(28)} ${''.padEnd(12)} ${c.cyan(`~${totalMB.toFixed(1)} MB`)}`);
        console.log(divider());
      });
    });

  cmd.command('dry-run')
    .description('Simulate cleanup — shows what would be deleted without deleting')
    .action(async () => {
      await withIpc(async (client) => {
        console.log(`  ${c.cyan('Running dry-run...')}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const report: any = await client.request('retention.run', { dryRun: true });
        printReport(report);
      });
    });

  cmd.command('run')
    .description('Execute retention cleanup (requires --execute flag)')
    .option('--execute', 'Actually delete rows (without this flag, runs dry-run)')
    .action(async (opts) => {
      const dryRun = !opts.execute;
      await withIpc(async (client) => {
        if (dryRun) {
          console.log(`  ${c.orange('No --execute flag — running as dry-run')}`);
        } else {
          console.log(`  ${c.red('LIVE execution — deleting rows...')}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const report: any = await client.request('retention.run', { dryRun });
        printReport(report);
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printReport(report: any): void {
  const mode = report.dryRun ? 'DRY-RUN' : 'LIVE';
  console.log(header(`Retention Report (${mode})`, '\u{1F4CB}'));

  const tables = report.tables;
  console.log(`  ${'Table'.padEnd(28)} ${'Before'.padEnd(10)} ${'Affected'.padEnd(10)} ${'Protected'.padEnd(10)} ${'Est. MB'}`);
  console.log(`  ${'-'.repeat(28)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)}`);

  for (const [name, t] of Object.entries(tables) as [string, any][]) {
    const affColor = t.affected > 0 ? (report.dryRun ? c.orange : c.red) : c.green;
    console.log(`  ${c.cyan(name.padEnd(28))} ${String(t.before).padEnd(10)} ${affColor(String(t.affected).padEnd(10))} ${String(t.protected).padEnd(10)} ${t.estimatedMB}`);
  }

  console.log('');
  console.log(keyValue('Total Rows Affected', String(report.totalRowsAffected)));
  console.log(keyValue('Estimated Space', `~${report.estimatedSpaceMB} MB`));
  console.log(keyValue('Duration', `${report.durationMs}ms`));

  if (report.protectedRows) {
    const pr = report.protectedRows;
    const total = pr.byImportance + pr.byUseCount + pr.byReferences + pr.byConsolidation;
    if (total > 0) {
      console.log('');
      console.log(`  ${c.green('Protection Summary:')}`);
      if (pr.byImportance > 0) console.log(`    By importance: ${pr.byImportance}`);
      if (pr.byUseCount > 0)   console.log(`    By use_count:  ${pr.byUseCount}`);
      if (pr.byReferences > 0) console.log(`    By references: ${pr.byReferences}`);
      if (pr.byConsolidation > 0) console.log(`    By inferred:   ${pr.byConsolidation}`);
    }
  }
  console.log(divider());
}
