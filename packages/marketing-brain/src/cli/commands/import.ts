import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons } from '../colors.js';

export function importCommand(): Command {
  return new Command('import')
    .description('Import posts from a JSON file')
    .argument('<file>', 'JSON file with posts array')
    .action(async (file) => {
      const fs = await import('node:fs');
      const path = await import('node:path');

      const filePath = path.default.resolve(file);
      if (!fs.default.existsSync(filePath)) {
        console.error(`${icons.error}  ${c.error(`File not found: ${filePath}`)}`);
        process.exit(1);
      }

      const data = JSON.parse(fs.default.readFileSync(filePath, 'utf-8'));
      const posts = Array.isArray(data) ? data : data.posts;

      if (!Array.isArray(posts)) {
        console.error(`${icons.error}  ${c.error('Expected JSON array or { posts: [...] }')}`);
        process.exit(1);
      }

      await withIpc(async (client) => {
        let imported = 0;
        let skipped = 0;

        for (const post of posts) {
          try {
            // Create campaign if specified
            let campaignId: number | null = null;
            if (post.campaign) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const camp: any = await client.request('campaign.create', { name: post.campaign, brand: post.brand });
              campaignId = camp.id;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result: any = await client.request('post.report', {
              platform: post.platform,
              content: post.content,
              format: post.format ?? 'text',
              url: post.url ?? null,
              hashtags: post.hashtags ?? null,
              campaign_id: campaignId,
              status: post.status ?? 'published',
              published_at: post.published_at ?? null,
            });

            if (result.isNew) {
              imported++;

              // Import engagement if provided
              if (post.engagement) {
                await client.request('post.engagement', {
                  post_id: result.post.id,
                  ...post.engagement,
                });
              }

              // Import strategy if provided
              if (post.strategy) {
                await client.request('strategy.report', {
                  post_id: result.post.id,
                  description: post.strategy.description,
                  approach: post.strategy.approach,
                  outcome: post.strategy.outcome,
                });
              }
            } else {
              skipped++;
            }
          } catch (err) {
            console.error(`${icons.error}  ${c.error(`Failed: ${err instanceof Error ? err.message : err}`)}`);
          }
        }

        console.log(`${icons.ok}  ${c.success(`Import complete: ${imported} imported, ${skipped} skipped (duplicates)`)}`);
      });
    });
}
