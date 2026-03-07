import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  decomposing: '🔍',
  gathering: '📥',
  hypothesizing: '💡',
  analyzing: '🔬',
  synthesizing: '📝',
  complete: '✅',
  failed: '❌',
  cancelled: '🚫',
};

export function missionsCommand(): Command {
  const cmd = new Command('missions')
    .description('Research missions — autonomous topic research');

  cmd.command('create')
    .description('Create a new research mission')
    .argument('<topic>', 'Research topic')
    .option('-d, --depth <depth>', 'Research depth: quick, standard, deep', 'standard')
    .action(async (topic: string, opts: { depth: string }) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mission: any = await client.request('mission.create', {
          topic,
          depth: opts.depth,
        });
        console.log(header('Mission Created', '🚀'));
        console.log(keyValue('ID', String(mission.id)));
        console.log(keyValue('Topic', mission.topic));
        console.log(keyValue('Depth', mission.depth));
        console.log(keyValue('Status', mission.status));
        console.log(`\n  ${c.dim('Mission is running in background. Check progress with:')} ${c.cyan(`brain missions report ${mission.id}`)}`);
        console.log(divider());
      });
    });

  cmd.command('list')
    .description('List research missions')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .action(async (opts: { status?: string; limit: string }) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const missions: any[] = await client.request('mission.list', {
          status: opts.status,
          limit: parseInt(opts.limit, 10),
        }) as Record<string, unknown>[];

        if (!missions?.length) {
          console.log(`  ${c.dim('No missions found.')}`);
          return;
        }

        console.log(header(`${missions.length} Missions`, '🔬'));
        for (const m of missions) {
          const icon = STATUS_ICONS[m.status] ?? '•';
          const sources = m.source_count > 0 ? c.dim(` (${m.source_count} sources)`) : '';
          console.log(`  ${icon} ${c.cyan(`#${m.id}`)} ${c.value(m.topic)} ${c.dim(`[${m.status}]`)}${sources}`);
        }
        console.log(divider());
      });
    });

  cmd.command('report')
    .description('View mission report')
    .argument('<id>', 'Mission ID')
    .action(async (id: string) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const report: any = await client.request('mission.report', { id: parseInt(id, 10) });

        if (!report) {
          console.log(`  ${c.dim('Mission not found.')}`);
          return;
        }

        const icon = STATUS_ICONS[report.mission.status] ?? '•';
        console.log(header(`Mission #${report.mission.id}: ${report.mission.topic}`, icon));
        console.log(keyValue('Status', report.mission.status));
        console.log(keyValue('Depth', report.mission.depth));
        console.log(keyValue('Sources', String(report.mission.source_count)));
        console.log(keyValue('Created', report.mission.created_at));
        if (report.mission.completed_at) {
          console.log(keyValue('Completed', report.mission.completed_at));
        }

        if (report.phases?.length) {
          console.log(`\n  ${c.cyan('Phases:')}`);
          for (const phase of report.phases) {
            const pIcon = phase.status === 'complete' ? '✅' : phase.status === 'failed' ? '❌' : '⏳';
            console.log(`    ${pIcon} ${phase.phase} ${c.dim(`[${phase.status}]`)}`);
          }
        }

        if (report.mission.report) {
          console.log(`\n${c.cyan('─── Report ───────────────────────────────────────')}\n`);
          console.log(report.mission.report);
        } else if (report.mission.error) {
          console.log(`\n  ${c.red('Error:')} ${report.mission.error}`);
        } else {
          console.log(`\n  ${c.dim('Report not yet available — mission still running.')}`);
        }

        console.log(divider());
      });
    });

  cmd.command('cancel')
    .description('Cancel a running mission')
    .argument('<id>', 'Mission ID')
    .action(async (id: string) => {
      await withIpc(async (client) => {
        await client.request('mission.cancel', { id: parseInt(id, 10) });
        console.log(`  ✅ Mission #${id} cancelled.`);
      });
    });

  return cmd;
}
