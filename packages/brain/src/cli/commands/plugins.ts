import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function pluginsCommand(): Command {
  const cmd = new Command('plugins')
    .description('Plugin management — list, inspect community plugins');

  cmd.command('list')
    .description('List loaded plugins')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plugins: any[] = await client.request('plugin.list') as any[];

        if (!plugins?.length) {
          console.log(`  ${c.dim('No plugins loaded.')}`);
          console.log(`  ${c.dim('Place plugins in ~/.brain/plugins/ and restart.')}`);
          return;
        }

        console.log(header(`${plugins.length} Plugins`, '\u{1F9E9}'));
        for (const p of plugins) {
          const status = p.enabled ? c.green('loaded') : c.red('disabled');
          console.log(`  ${c.cyan(p.name.padEnd(25))} v${c.value(p.version)}  ${status}`);
          if (p.description) {
            console.log(`  ${''.padEnd(25)} ${c.dim(p.description)}`);
          }
          if (p.error) {
            console.log(`  ${''.padEnd(25)} ${c.red(`Error: ${p.error}`)}`);
          }
        }
        console.log(divider());
      });
    });

  cmd.command('routes')
    .description('List plugin IPC routes')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const routes: any[] = await client.request('plugin.routes') as any[];

        if (!routes?.length) {
          console.log(`  ${c.dim('No plugin routes registered.')}`);
          return;
        }

        console.log(header(`${routes.length} Plugin Routes`, '\u{1F517}'));
        for (const r of routes) {
          console.log(`  ${c.cyan(r.plugin.padEnd(20))} ${c.value(r.method)}`);
        }
        console.log(divider());
      });
    });

  cmd.command('tools')
    .description('List plugin MCP tools')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools: any[] = await client.request('plugin.tools') as any[];

        if (!tools?.length) {
          console.log(`  ${c.dim('No plugin tools registered.')}`);
          return;
        }

        console.log(header(`${tools.length} Plugin Tools`, '\u{1F527}'));
        for (const t of tools) {
          console.log(`  ${c.cyan(t.plugin.padEnd(20))} ${c.value(t.name)}`);
          if (t.description) {
            console.log(`  ${''.padEnd(20)} ${c.dim(t.description)}`);
          }
        }
        console.log(divider());
      });
    });

  // Default action: list
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'list')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
