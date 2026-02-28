import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider } from '../colors.js';

export function modulesCommand(): Command {
  return new Command('modules')
    .description('List registered code modules')
    .option('--language <lang>', 'Filter by language')
    .option('-l, --limit <n>', 'Maximum results')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modules: any = await client.request('code.modules', {
          language: opts.language,
          limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
        });

        if (!modules?.length) {
          console.log(`${icons.module}  ${c.dim('No code modules registered.')}`);
          return;
        }

        console.log(header(`${modules.length} Code Modules`, icons.module));

        // Group by language
        const byLang: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const mod of modules as any[]) {
          byLang[mod.language] = (byLang[mod.language] || 0) + 1;
        }
        const langSummary = Object.entries(byLang)
          .sort((a, b) => b[1] - a[1])
          .map(([lang, count]) => `${c.cyan(lang)} ${c.dim(`(${count})`)}`)
          .join('  ');
        console.log(`  ${langSummary}\n`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const mod of modules as any[]) {
          const score = mod.reusabilityScore ?? mod.reusability_score ?? 0;
          const scoreColor = score >= 0.7 ? c.green : score >= 0.4 ? c.orange : c.red;
          const langTag = c.cyan(`[${mod.language}]`);

          console.log(`  ${c.dim(`#${mod.id}`)} ${langTag} ${c.value(mod.name)}`);
          if (mod.description) {
            console.log(`     ${c.dim(mod.description.slice(0, 120))}`);
          }
          console.log(`     ${c.label('File:')} ${c.dim(mod.filePath ?? mod.file_path)}  ${c.label('Score:')} ${scoreColor(typeof score === 'number' ? score.toFixed(2) : score)}`);
          console.log();
        }
        console.log(divider());
      });
    });
}
