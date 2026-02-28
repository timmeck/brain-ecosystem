import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function suggestCommand(): Command {
  return new Command('suggest')
    .description('Get content suggestions for a topic')
    .argument('<topic>', 'Topic to get suggestions for')
    .option('-p, --platform <platform>', 'Target platform')
    .action(async (topic, opts) => {
      await withIpc(async (client) => {
        // Get matching strategies
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const strategies: any[] = await client.request('strategy.suggest', { query: topic, limit: 3 }) as any[];

        // Get matching templates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const templates: any[] = (opts.platform
          ? await client.request('template.byPlatform', { platform: opts.platform, limit: 3 })
          : await client.request('template.find', { query: topic, limit: 3 })) as any[];

        // Check rules
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ruleCheck: any = await client.request('rule.check', {
          content: topic,
          platform: opts.platform ?? 'any',
        });

        console.log(`  ${icons.insight}  ${c.heading(`Suggestions for: ${topic}`)}`);
        console.log();

        if (strategies.length > 0) {
          console.log(`  ${c.blue.bold('Strategies:')}`);
          for (const s of strategies) {
            console.log(`     ${icons.arrow} ${s.description} ${c.dim(`(${(s.confidence * 100).toFixed(0)}% confidence)`)}`);
          }
          console.log();
        }

        if (templates.length > 0) {
          console.log(`  ${c.purple.bold('Templates:')}`);
          for (const t of templates) {
            console.log(`     ${icons.arrow} ${t.name} ${c.dim(`(${t.platform ?? 'any'}, used ${t.use_count}x)`)}`);
          }
          console.log();
        }

        if (ruleCheck.recommendations?.length > 0) {
          console.log(`  ${c.orange.bold('Rules to consider:')}`);
          for (const r of ruleCheck.recommendations) {
            console.log(`     ${icons.arrow} ${r.suggestion}`);
          }
          console.log();
        }

        if (ruleCheck.violations?.length > 0) {
          console.log(`  ${c.red.bold('Warnings:')}`);
          for (const v of ruleCheck.violations) {
            console.log(`     ${icons.warn} ${v.reason}`);
          }
        }
      });
    });
}
