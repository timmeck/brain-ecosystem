import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

const STATUS_ICONS: Record<string, string> = {
  proposed: '\u{1F4DD}',
  generating: '\u{2699}\u{FE0F}',
  testing: '\u{1F9EA}',
  ready: '\u{2705}',
  approved: '\u{1F44D}',
  rejected: '\u{274C}',
  applied: '\u{1F680}',
  rolled_back: '\u{23EA}',
  failed: '\u{1F4A5}',
};

export function selfmodCommand(): Command {
  const cmd = new Command('selfmod')
    .description('Self-modification proposals — review, approve, reject');

  cmd.command('list')
    .description('List self-modification proposals')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .action(async (opts: { limit: string }) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mods: any[] = await client.request('selfmod.list', {
          limit: parseInt(opts.limit, 10),
        }) as Record<string, unknown>[];

        if (!mods?.length) {
          console.log(`  ${c.dim('No self-modifications found.')}`);
          return;
        }

        console.log(header(`${mods.length} Self-Modifications`, '\u{1F9EC}'));
        for (const m of mods) {
          const icon = STATUS_ICONS[m.status] ?? '\u{2753}';
          const risk = m.risk_level ? ` [${m.risk_level}]` : '';
          console.log(`  ${icon} ${c.value(`#${m.id}`)} ${m.title}${c.dim(risk)}`);
          console.log(`    ${c.dim(`Status: ${m.status} | Source: ${m.source_engine} | ${m.created_at}`)}`);
        }
        console.log(divider());
      });
    });

  cmd.command('pending')
    .description('Show pending proposals awaiting review')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mods: any[] = await client.request('selfmod.pending') as any[];

        if (!mods?.length) {
          console.log(`  ${c.dim('No pending proposals.')}`);
          return;
        }

        console.log(header(`${mods.length} Pending Proposals`, '\u{1F4CB}'));
        for (const m of mods) {
          const icon = STATUS_ICONS[m.status] ?? '\u{2753}';
          const risk = m.risk_level ? c.orange(` [${m.risk_level}]`) : '';
          console.log(`  ${icon} ${c.value(`#${m.id}`)} ${m.title}${risk}`);
          console.log(`    ${c.dim(m.problem_description.substring(0, 100))}`);
          if (m.target_files?.length > 0) {
            console.log(`    ${c.dim('Files:')} ${m.target_files.join(', ')}`);
          }
        }
        console.log(`\n  ${c.dim('Approve:')} ${c.cyan('brain selfmod approve <id>')}`);
        console.log(`  ${c.dim('Reject:')}  ${c.cyan('brain selfmod reject <id>')}`);
        console.log(divider());
      });
    });

  cmd.command('show')
    .description('Show details of a self-modification')
    .argument('<id>', 'Modification ID')
    .action(async (idStr: string) => {
      const id = parseInt(idStr, 10);
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m: any = await client.request('selfmod.get', { id });
        if (!m) {
          console.log(`  ${c.red('Modification not found.')}`);
          return;
        }

        console.log(header(`Self-Modification #${m.id}`, STATUS_ICONS[m.status] ?? '\u{2753}'));
        console.log(keyValue('Title', m.title));
        console.log(keyValue('Status', m.status));
        console.log(keyValue('Source', m.source_engine));
        console.log(keyValue('Created', m.created_at));
        if (m.risk_level) console.log(keyValue('Risk', m.risk_level));
        if (m.hypothesis) console.log(keyValue('Hypothesis', m.hypothesis));
        console.log(keyValue('Problem', m.problem_description));
        if (m.target_files?.length > 0) {
          console.log(keyValue('Files', m.target_files.join(', ')));
        }
        if (m.test_result !== 'pending') {
          console.log(keyValue('Test Result', m.test_result));
        }
        if (m.tokens_used > 0) {
          console.log(keyValue('Tokens', String(m.tokens_used)));
        }
        if (m.applied_at) {
          console.log(keyValue('Applied', m.applied_at));
        }
        console.log(divider());
      });
    });

  cmd.command('approve')
    .description('Approve and apply a self-modification (with git backup + tests)')
    .argument('<id>', 'Modification ID')
    .action(async (idStr: string) => {
      const id = parseInt(idStr, 10);
      await withIpc(async (client) => {
        console.log(`  ${c.dim('Approving and applying modification #' + id + '...')}`);
        console.log(`  ${c.dim('This will: git backup → write files → build → test → commit')}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('selfmod.approve', { id });
        console.log(header('Modification Applied', '\u{1F680}'));
        console.log(keyValue('ID', String(result.id)));
        console.log(keyValue('Title', result.title));
        console.log(keyValue('Status', result.status));
        if (result.applied_at) console.log(keyValue('Applied At', result.applied_at));
        console.log(divider());
      });
    });

  cmd.command('reject')
    .description('Reject a self-modification proposal')
    .argument('<id>', 'Modification ID')
    .option('-n, --notes <text>', 'Rejection reason')
    .action(async (idStr: string, opts: { notes?: string }) => {
      const id = parseInt(idStr, 10);
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('selfmod.reject', { id, notes: opts.notes });
        console.log(header('Modification Rejected', '\u{274C}'));
        console.log(keyValue('ID', String(result.id)));
        console.log(keyValue('Title', result.title));
        console.log(divider());
      });
    });

  cmd.command('status')
    .description('Self-modification engine status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('selfmod.status');
        console.log(header('SelfMod Status', '\u{1F9EC}'));
        console.log(keyValue('Total', String(status.totalModifications)));
        console.log(keyValue('Project Root', status.projectRoot ?? 'not set'));
        if (status.lastModification) {
          console.log(keyValue('Last', status.lastModification));
        }
        if (status.byStatus) {
          for (const [s, count] of Object.entries(status.byStatus)) {
            const icon = STATUS_ICONS[s] ?? '';
            console.log(`    ${icon} ${s}: ${count}`);
          }
        }
        console.log(divider());
      });
    });

  return cmd;
}
