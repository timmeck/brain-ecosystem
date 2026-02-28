import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider, table } from '../colors.js';

export function projectsCommand(): Command {
  return new Command('projects')
    .description('List all imported projects with stats')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const projects = await client.request('project.list', {}) as any[];

        console.log(header('Projects', icons.module));

        if (projects.length === 0) {
          console.log(`\n  ${c.dim('No projects imported yet.')} Use ${c.cyan('brain import <dir>')} to get started.`);
          console.log(`\n${divider()}`);
          return;
        }

        console.log();

        const rows: string[][] = [
          [c.dim('  #'), c.dim('Name'), c.dim('Language'), c.dim('Modules'), c.dim('Path')],
        ];

        for (const p of projects) {
          rows.push([
            c.dimmer(`  ${p.id}`),
            c.value(p.name),
            p.language ? c.cyan(p.language) : c.dim('—'),
            c.green(String(p.moduleCount)),
            p.path ? c.dim(p.path) : c.dim('—'),
          ]);
        }

        console.log(table(rows, [5, 24, 14, 9, 40]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`\n  ${c.label('Total:')} ${c.value(String(projects.length))} projects, ${c.green(String(projects.reduce((s: number, p: any) => s + p.moduleCount, 0)))} modules`);
        console.log(`\n${divider()}`);
      });
    });
}
