import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function roadmapCommand(): Command {
  const cmd = new Command('roadmap')
    .description('Research Roadmap — goal dependencies, multi-step research plans');

  cmd.command('list')
    .description('List all research roadmaps')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const roadmaps: any[] = await client.request('roadmap.list') as any[];

        if (!roadmaps?.length) {
          console.log(`  ${c.dim('No roadmaps yet.')}`);
          return;
        }

        console.log(header(`${roadmaps.length} Roadmap(s)`, '\u{1F5FA}\u{FE0F}'));
        for (const rm of roadmaps) {
          const statusColor = rm.status === 'completed' ? c.green : rm.status === 'active' ? c.cyan : c.dim;
          console.log(`  ${c.value(`#${rm.id}`)} ${rm.title}  ${statusColor(rm.status)}`);
        }
        console.log(divider());
      });
    });

  cmd.command('show')
    .description('Show progress for a roadmap')
    .argument('<id>', 'Roadmap ID')
    .action(async (id) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const progress: any = await client.request('roadmap.progress', { roadmapId: parseInt(id, 10) });

        console.log(header(`Roadmap #${id} Progress`, '\u{1F4CA}'));
        console.log(keyValue('Title', progress.title ?? '-'));
        console.log(keyValue('Status', progress.status ?? '-'));
        const pct = progress.completionPct ?? progress.completion ?? 0;
        const pctColor = pct > 80 ? c.green : pct > 40 ? c.orange : c.red;
        console.log(keyValue('Completion', pctColor(`${pct.toFixed(1)}%`)));
        console.log(keyValue('Total Goals', String(progress.totalGoals ?? 0)));
        console.log(keyValue('Achieved', String(progress.achievedGoals ?? 0)));
        console.log(keyValue('Blocked', String(progress.blockedGoals ?? 0)));
        console.log(divider());
      });
    });

  cmd.command('ready')
    .description('Show goals that are ready to work on (all dependencies met)')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const goals: any[] = await client.request('roadmap.ready') as any[];

        if (!goals?.length) {
          console.log(`  ${c.dim('No goals ready — all blocked or completed.')}`);
          return;
        }

        console.log(header(`${goals.length} Ready Goal(s)`, '\u{2705}'));
        for (const g of goals) {
          console.log(`  ${c.value(`#${g.id}`)} ${g.title ?? g.description ?? '-'}`);
        }
        console.log(divider());
      });
    });

  cmd.command('create')
    .description('Create a new research roadmap')
    .argument('<title>', 'Roadmap title')
    .argument('<goalId>', 'Final goal ID')
    .action(async (title, goalId) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('roadmap.create', { title, finalGoalId: parseInt(goalId, 10) });
        console.log(`  ${c.green('Roadmap created')} — ID: ${c.value(String(result.id ?? result.roadmapId ?? '?'))}`);
      });
    });

  // Default action: list
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'list')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
