import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function browserCommand(): Command {
  const cmd = new Command('browser')
    .description('Browser Agent — LLM-steered autonomous browser');

  cmd.command('status')
    .description('Show browser agent status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('browser.status');

        console.log(header('Browser Agent', '\u{1F310}'));
        console.log(keyValue('Status', status.running ? c.green('running') : c.dim('idle')));
        console.log(keyValue('Tasks Completed', String(status.tasksCompleted ?? 0)));
        console.log(keyValue('Pages Open', String(status.pagesOpen ?? 0)));
        console.log(keyValue('Total Steps', String(status.totalSteps ?? 0)));
        console.log(divider());
      });
    });

  cmd.command('run <task>')
    .description('Start an autonomous browser task')
    .option('--id <taskId>', 'Custom task ID')
    .action(async (task, opts) => {
      await withIpc(async (client) => {
        const taskId = opts.id ?? `cli_${Date.now()}`;
        console.log(`  Starting browser task: ${c.cyan(task)}`);
        const result = await client.request('browser.run', { taskId, task });
        console.log(`  ${c.green('Task completed')}`);
        console.log(JSON.stringify(result, null, 2));
      }, 120_000); // longer timeout for browser tasks
    });

  cmd.command('shutdown')
    .description('Shut down the browser agent')
    .action(async () => {
      await withIpc(async (client) => {
        await client.request('browser.shutdown');
        console.log(`  ${c.green('Browser agent shut down')}`);
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
