import { Command } from 'commander';
import fs from 'node:fs';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function importCommand(): Command {
  return new Command('import')
    .description('Import trades from JSON file')
    .argument('<file>', 'JSON file to import')
    .action(async (file) => {
      if (!fs.existsSync(file)) {
        console.error(`${icons.error}  ${c.error(`File not found: ${file}`)}`);
        process.exit(1);
      }

      const raw = fs.readFileSync(file, 'utf-8');
      const data = JSON.parse(raw);

      if (!Array.isArray(data)) {
        console.error(`${icons.error}  ${c.error('Expected JSON array of trade objects.')}`);
        process.exit(1);
      }

      await withIpc(async (client) => {
        let imported = 0;
        for (const trade of data) {
          try {
            await client.request('trade.recordOutcome', {
              signals: trade.signals ?? {},
              regime: trade.regime,
              profitPct: trade.profitPct ?? trade.profit_pct ?? 0,
              win: trade.win ?? false,
              botType: trade.botType ?? trade.bot_type ?? 'unknown',
              pair: trade.pair ?? 'unknown',
            });
            imported++;
          } catch (err) {
            console.error(`${icons.warn}  ${c.warn(`Failed to import trade: ${err}`)}`);
          }
        }
        console.log(`${icons.ok}  ${c.success(`Imported ${imported}/${data.length} trades`)}`);
      });
    });
}
