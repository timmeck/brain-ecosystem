import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header } from '../colors.js';

export function queryCommand(): Command {
  return new Command('query')
    .description('Search trades and signals')
    .argument('<search>', 'Search query (fingerprint, pair, bot type)')
    .option('-l, --limit <n>', 'Max results', '20')
    .action(async (search, opts) => {
      console.log(header('Trade Search', icons.search));

      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any = await client.request('trade.query', { search, limit: Number(opts.limit) });
        if (!results?.length) {
          console.log(`  ${c.dim('No trades found.')}`);
          return;
        }
        console.log(`  ${c.info(`Found ${results.length} trades:`)}\n`);
         
        for (const t of results) {
          const badge = t.win ? c.green('WIN') : c.red('LOSS');
          console.log(`  #${t.id} [${badge}] ${c.cyan(t.pair)} ${c.dim(t.fingerprint)} ${t.profit_pct.toFixed(2)}%`);
        }
      });
    });
}
