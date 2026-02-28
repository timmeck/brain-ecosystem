import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider } from '../colors.js';

export function queryCommand(): Command {
  return new Command('query')
    .description('Search posts, strategies, and insights')
    .argument('<search>', 'Search term')
    .option('-l, --limit <n>', 'Maximum results per category', '10')
    .option('--posts-only', 'Only search posts')
    .option('--strategies-only', 'Only search strategies')
    .option('--insights-only', 'Only search insights')
    .option('--page <n>', 'Page number (starting from 1)', '1')
    .action(async (search: string, opts) => {
      await withIpc(async (client) => {
        const limit = parseInt(opts.limit, 10);
        const page = parseInt(opts.page, 10) || 1;
        const offset = (page - 1) * limit;
        const searchAll = !opts.postsOnly && !opts.strategiesOnly && !opts.insightsOnly;
        let totalResults = 0;

        // --- Posts ---
        if (searchAll || opts.postsOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any = await client.request('post.search', {
            query: search,
            limit: limit + offset,
          });

          const posts = Array.isArray(results) ? results.slice(offset, offset + limit) : [];
          if (posts.length > 0) {
            totalResults += posts.length;
            console.log(header(`Posts matching "${search}"`, icons.post));

            for (const post of posts) {
              const platformTag = c.cyan(`[${post.platform}]`);
              const formatTag = c.purple(post.format ?? 'text');
              console.log(`  ${c.dim(`#${post.id}`)} ${platformTag} ${formatTag}`);
              console.log(`     ${c.dim((post.content ?? '').slice(0, 120))}`);
              if (post.hashtags) {
                console.log(`     ${c.orange(post.hashtags)}`);
              }
              console.log();
            }
          }
        }

        // --- Strategies ---
        if (searchAll || opts.strategiesOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const strategies: any = await client.request('strategy.suggest', {
            query: search,
            limit: limit + offset,
          });

          const strats = Array.isArray(strategies) ? strategies.slice(offset, offset + limit) : [];
          if (strats.length > 0) {
            totalResults += strats.length;
            console.log(header(`Strategies matching "${search}"`, icons.campaign));

            for (const strat of strats) {
              const confidence = strat.confidence ?? 0;
              const confColor = confidence >= 0.7 ? c.green : confidence >= 0.4 ? c.orange : c.dim;
              console.log(`  ${c.dim(`#${strat.id}`)} ${confColor(`[${(confidence * 100).toFixed(0)}%]`)} ${c.value(strat.description ?? '')}`);
              if (strat.approach) {
                console.log(`     ${c.label('Approach:')} ${c.dim(strat.approach.slice(0, 120))}`);
              }
              console.log();
            }
          }
        }

        // --- Insights ---
        if (searchAll || opts.insightsOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const insights: any = await client.request('insight.list', { limit: 100 });

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
          console.log(`\n${icons.insight}  ${c.dim(`No results found for "${search}".`)}`);
        } else {
          console.log(`  ${c.dim(`Page ${page} — showing ${totalResults} result(s). Use --page ${page + 1} for more.`)}`);
          console.log(divider());
        }
      });
    });
}
