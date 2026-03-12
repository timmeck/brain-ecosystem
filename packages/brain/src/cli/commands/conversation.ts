import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function conversationCommand(): Command {
  const cmd = new Command('conversation')
    .description('Conversation Memory — long-term session memory');

  cmd.command('status')
    .description('Show conversation memory statistics')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('convo.status');

        console.log(header('Conversation Memory', '\u{1F9E0}'));
        console.log(keyValue('Total Memories', String(status.totalMemories ?? 0)));
        console.log(keyValue('Active', String(status.activeMemories ?? 0)));
        console.log(keyValue('Sessions', String(status.totalSessions ?? 0)));
        const cats = status.byCategory ?? {};
        const catStr = Object.keys(cats).length ? Object.entries(cats).map(([k, v]) => `${k}: ${v}`).join(', ') : c.dim('none');
        console.log(keyValue('Categories', catStr));
        const recent = status.recentMemories ?? [];
        if (recent.length) {
          console.log(keyValue('Newest', recent[0].content?.substring(0, 80) ?? c.dim('none')));
        }
        console.log(divider());
      });
    });

  cmd.command('search <query>')
    .description('Full-text search in conversation memory')
    .option('-n, --limit <n>', 'Max results', '10')
    .action(async (query, opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = await client.request('convo.search', { query }) as any[];

        if (!results?.length) {
          console.log(`  ${c.dim('No results found.')}`);
          return;
        }

        console.log(header(`${results.length} Results`, '\u{1F50D}'));
        for (const r of results.slice(0, parseInt(opts.limit, 10))) {
          const mem = r.memory ?? r;
          const cat = c.cyan(`[${mem.category ?? 'context'}]`);
          console.log(`  ${cat} ${(mem.content ?? '').substring(0, 120)}`);
        }
        console.log(divider());
      });
    });

  cmd.command('important')
    .description('Show most important memories')
    .option('-n, --limit <n>', 'Max results', '10')
    .option('--min <score>', 'Min importance', '7')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const memories: any[] = await client.request('convo.important', {
          limit: parseInt(opts.limit, 10),
          minImportance: parseInt(opts.min, 10),
        }) as any[];

        if (!memories?.length) {
          console.log(`  ${c.dim('No important memories found.')}`);
          return;
        }

        console.log(header(`${memories.length} Important Memories`, '\u{2B50}'));
        for (const m of memories) {
          const score = c.value(`[${m.importance}/10]`);
          const cat = c.cyan(`[${m.category ?? 'context'}]`);
          console.log(`  ${score} ${cat} ${(m.content ?? '').substring(0, 100)}`);
        }
        console.log(divider());
      });
    });

  cmd.command('context')
    .description('Build context summary for LLM')
    .action(async () => {
      await withIpc(async (client) => {
        const context = await client.request('convo.context');
        console.log(header('Context Summary', '\u{1F4CB}'));
        console.log(typeof context === 'string' ? context : JSON.stringify(context, null, 2));
        console.log(divider());
      });
    });

  cmd.command('maintenance')
    .description('Run memory cleanup and optimization')
    .action(async () => {
      await withIpc(async (client) => {
        const result = await client.request('convo.maintenance');
        console.log(`  ${c.green('Maintenance completed')}`);
        console.log(JSON.stringify(result, null, 2));
      });
    });

  // Default action: status
  cmd.action(async () => {
    await cmd.commands.find(c => c.name() === 'status')!.parseAsync([], { from: 'user' });
  });

  return cmd;
}
