import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function botCommand(): Command {
  const cmd = new Command('bot')
    .description('Brain Bot — Discord/Telegram bridge');

  cmd.command('status')
    .description('Show bot status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('bot.status');

        console.log(header('Brain Bot', '\u{1F916}'));
        console.log(keyValue('Platform', c.value(status.platform ?? 'generic')));
        console.log(keyValue('Messages Processed', String(status.messagesProcessed ?? 0)));
        console.log(keyValue('Active Sessions', String(status.activeSessions ?? 0)));
        console.log(keyValue('IPC Connected', status.ipcConnected ? c.green('yes') : c.dim('no')));
        console.log(divider());
      });
    });

  cmd.command('commands')
    .description('List available bot slash commands')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const commands: any[] = await client.request('bot.commands') as any[];

        if (!commands?.length) {
          console.log(`  ${c.dim('No commands registered.')}`);
          return;
        }

        console.log(header(`${commands.length} Bot Commands`, '\u{2318}'));
        for (const cmd of commands) {
          console.log(`  ${c.cyan(`/${cmd.name}`)}  ${c.dim(cmd.description ?? '')}`);
        }
        console.log(divider());
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
