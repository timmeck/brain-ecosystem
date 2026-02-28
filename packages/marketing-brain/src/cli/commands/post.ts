import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function postCommand(): Command {
  return new Command('post')
    .description('Report a published post')
    .argument('<platform>', 'Platform (x, reddit, linkedin, bluesky)')
    .argument('[url]', 'Post URL')
    .option('-c, --content <text>', 'Post content/text')
    .option('-f, --format <format>', 'Post format (text, image, video, thread)', 'text')
    .option('--campaign <name>', 'Campaign name')
    .option('--hashtags <tags>', 'Hashtags (comma-separated)')
    .action(async (platform, url, opts) => {
      if (!opts.content && !url) {
        console.error(`${icons.error}  ${c.error('Provide either --content or a URL')}`);
        process.exit(1);
      }

      await withIpc(async (client) => {
        let campaignId: number | null = null;
        if (opts.campaign) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const campaign: any = await client.request('campaign.create', { name: opts.campaign });
          campaignId = campaign.id;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('post.report', {
          platform,
          content: opts.content ?? `Post at ${url}`,
          format: opts.format,
          url: url ?? null,
          hashtags: opts.hashtags ?? null,
          campaign_id: campaignId,
          status: 'published',
          published_at: new Date().toISOString(),
        });

        if (result.isNew) {
          console.log(`${icons.ok}  ${c.success('Post reported!')} ${c.dim(`#${result.post.id} on ${platform}`)}`);
        } else {
          console.log(`${icons.post}  ${c.info('Post already tracked')} ${c.dim(`#${result.post.id}`)}`);
        }
      });
    });
}
