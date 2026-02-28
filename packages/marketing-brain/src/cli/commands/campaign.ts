import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function campaignCommand(): Command {
  const cmd = new Command('campaign')
    .description('Manage campaigns');

  cmd.command('create')
    .description('Create a new campaign')
    .argument('<name>', 'Campaign name')
    .option('-b, --brand <brand>', 'Brand name')
    .option('-g, --goal <goal>', 'Campaign goal')
    .option('-p, --platform <platform>', 'Target platform')
    .action(async (name, opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('campaign.create', {
          name,
          brand: opts.brand,
          goal: opts.goal,
          platform: opts.platform,
        });
        console.log(`${icons.ok}  ${c.success('Campaign created!')} ${c.dim(`#${result.id}: ${result.name}`)}`);
      });
    });

  cmd.command('list')
    .description('List all campaigns')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const campaigns: any[] = await client.request('campaign.list') as any[];
        if (campaigns.length === 0) {
          console.log(`${c.dim('No campaigns yet.')}`);
          return;
        }
        for (const camp of campaigns) {
          console.log(`  ${icons.campaign}  ${c.value(`#${camp.id}`)} ${camp.name} ${c.dim(camp.brand ?? '')} ${c.dim(camp.status)}`);
        }
      });
    });

  cmd.command('stats')
    .description('Show campaign stats')
    .argument('<id>', 'Campaign ID')
    .action(async (id) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats: any = await client.request('campaign.stats', { id: Number(id) });
        if (!stats) {
          console.log(`${c.dim('Campaign not found.')}`);
          return;
        }
        console.log(`  ${icons.campaign}  ${c.value(stats.campaign.name)}`);
        console.log(`     Posts: ${c.value(stats.postCount)}`);
        console.log(`     Likes: ${c.value(stats.totalLikes)}`);
        console.log(`     Comments: ${c.value(stats.totalComments)}`);
        console.log(`     Shares: ${c.value(stats.totalShares)}`);
        console.log(`     Impressions: ${c.value(stats.totalImpressions)}`);
        console.log(`     Avg Engagement: ${c.green(stats.avgEngagement.toFixed(0))}`);
      });
    });

  return cmd;
}
