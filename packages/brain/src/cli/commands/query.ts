import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, statusBadge, divider } from '../colors.js';

export function queryCommand(): Command {
  return new Command('query')
    .description('Search errors, code modules, and insights')
    .argument('<search>', 'Search term')
    .option('-l, --limit <n>', 'Maximum results per category', '10')
    .option('--errors-only', 'Only search errors')
    .option('--modules-only', 'Only search code modules')
    .option('--insights-only', 'Only search insights')
    .option('--page <n>', 'Page number (starting from 1)', '1')
    .action(async (search: string, opts) => {
      await withIpc(async (client) => {
        const limit = parseInt(opts.limit, 10);
        const page = parseInt(opts.page, 10) || 1;
        const offset = (page - 1) * limit;
        const searchAll = !opts.errorsOnly && !opts.modulesOnly && !opts.insightsOnly;
        let totalResults = 0;

        // --- Errors ---
        if (searchAll || opts.errorsOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any = await client.request('error.query', {
            search,
            limit: limit + offset,
          });

          const errors = Array.isArray(results) ? results.slice(offset, offset + limit) : [];
          if (errors.length > 0) {
            totalResults += errors.length;
            console.log(header(`Errors matching "${search}"`, icons.error));

            for (const err of errors) {
              const badge = statusBadge(err.resolved ? 'resolved' : 'open');
              const typeTag = c.purple(err.errorType ?? 'unknown');
              console.log(`  ${c.dim(`#${err.id}`)} ${badge} ${typeTag}`);
              console.log(`     ${c.dim((err.message ?? '').slice(0, 120))}`);

              // Get solutions for this error
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const solutions: any = await client.request('solution.query', { error_id: err.id });
              if (solutions?.length > 0) {
                console.log(`     ${c.green(`${icons.check} ${solutions.length} solution(s)`)}`);
                for (const sol of solutions.slice(0, 3)) {
                  console.log(`       ${c.dim(icons.corner)} ${c.dim((sol.description ?? '').slice(0, 100))}`);
                }
              }
              console.log();
            }
          }
        }

        // --- Code Modules ---
        if (searchAll || opts.modulesOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modules: any = await client.request('code.find', {
            query: search,
            limit: limit + offset,
          });

          const mods = Array.isArray(modules) ? modules.slice(offset, offset + limit) : [];
          if (mods.length > 0) {
            totalResults += mods.length;
            console.log(header(`Modules matching "${search}"`, icons.module));

            for (const mod of mods) {
              const score = mod.reusability_score ?? mod.reusabilityScore ?? 0;
              const scoreColor = score >= 0.7 ? c.green : score >= 0.4 ? c.orange : c.red;
              console.log(`  ${c.dim(`#${mod.id}`)} ${c.cyan(`[${mod.language}]`)} ${c.value(mod.name)}`);
              console.log(`     ${c.label('File:')} ${c.dim(mod.file_path ?? mod.filePath)}  ${c.label('Score:')} ${scoreColor(typeof score === 'number' ? score.toFixed(2) : score)}`);
              if (mod.description) {
                console.log(`     ${c.dim(mod.description.slice(0, 120))}`);
              }
              console.log();
            }
          }
        }

        // --- Insights ---
        if (searchAll || opts.insightsOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const insights: any = await client.request('research.insights', {
            activeOnly: true,
            limit: 100,
          });

          // Client-side search since insights API may not support text search
          const allInsights = Array.isArray(insights) ? insights : [];
          const searchLower = search.toLowerCase();
          const matched = allInsights.filter((i: { title?: string; description?: string }) =>
            (i.title ?? '').toLowerCase().includes(searchLower) ||
            (i.description ?? '').toLowerCase().includes(searchLower)
          ).slice(offset, offset + limit);

          if (matched.length > 0) {
            totalResults += matched.length;
            console.log(header(`Insights matching "${search}"`, icons.insight));

            for (const ins of matched) {
              const typeTag = c.cyan(`[${ins.type}]`);
              console.log(`  ${typeTag} ${c.value(ins.title)}`);
              if (ins.description) {
                console.log(`     ${c.dim(ins.description.slice(0, 150))}`);
              }
              console.log();
            }
          }
        }

        if (totalResults === 0) {
          console.log(`\n${icons.search}  ${c.dim(`No results found for "${search}".`)}`);
        } else {
          console.log(`  ${c.dim(`Page ${page} — showing ${totalResults} result(s). Use --page ${page + 1} for more.`)}`);
          console.log(divider());
        }
      });
    });
}
