import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, header, keyValue, divider } from '../colors.js';

export function autonomousCommand(): Command {
  const cmd = new Command('autonomous')
    .description('Autonomous Web Research — self-directed research loop');

  cmd.command('status')
    .description('Show autonomous research status')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = await client.request('research.autonomous.status');

        console.log(header('Autonomous Research', '\u{1F50D}'));
        console.log(keyValue('Enabled', status.enabled ? c.green('yes') : c.dim('no')));
        console.log(keyValue('Running', status.running ? c.green('yes') : c.dim('no')));
        console.log(keyValue('Cycles Completed', String(status.cyclesCompleted ?? 0)));
        console.log(keyValue('Missions Today', `${status.missionsLaunchedToday ?? 0}/${status.maxMissionsPerDay ?? 5}`));
        if (status.lastTopic) {
          console.log(keyValue('Last Topic', status.lastTopic));
        }
        if (status.nextCycleAt) {
          const mins = Math.max(0, Math.round((status.nextCycleAt - Date.now()) / 60_000));
          console.log(keyValue('Next Cycle', `${mins}min`));
        }
        if (status.recentTopics?.length > 0) {
          console.log(divider());
          console.log(c.heading('Recent Topics:'));
          for (const t of status.recentTopics.slice(0, 5)) {
            console.log(`  ${c.dim('•')} ${t}`);
          }
        }
        console.log(divider());
      });
    });

  cmd.command('enable')
    .description('Enable autonomous research')
    .action(async () => {
      await withIpc(async (client) => {
        await client.request('research.autonomous.enable');
        console.log(c.green('Autonomous research enabled'));
      });
    });

  cmd.command('disable')
    .description('Disable autonomous research')
    .action(async () => {
      await withIpc(async (client) => {
        await client.request('research.autonomous.disable');
        console.log(c.warn('Autonomous research disabled'));
      });
    });

  cmd.command('cycle')
    .description('Trigger one autonomous research cycle manually')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('research.autonomous.cycle');
        if (result.action === 'mission_launched') {
          console.log(c.green(`Mission launched: "${result.topic}" (ID: ${result.missionId})`));
        } else {
          console.log(c.dim(`${result.action}: ${result.reason ?? 'no details'}`));
        }
      });
    });

  cmd.command('config')
    .description('Show or update autonomous research config')
    .option('--max-missions <n>', 'Max missions per day')
    .option('--cooldown <min>', 'Cooldown between cycles (minutes)')
    .option('--depth <depth>', 'Mission depth: quick|standard|deep')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // If options passed, update config
        const updates: Record<string, unknown> = {};
        if (opts.maxMissions) updates.maxMissionsPerDay = parseInt(opts.maxMissions, 10);
        if (opts.cooldown) updates.cycleCooldownMs = parseInt(opts.cooldown, 10) * 60_000;
        if (opts.depth) updates.missionDepth = opts.depth;

        if (Object.keys(updates).length > 0) {
          await client.request('research.autonomous.update', updates);
          console.log(c.green('Config updated'));
        }

        // Show current config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = await client.request('research.autonomous.config');
        console.log(header('Autonomous Research Config', '\u{2699}\u{FE0F}'));
        console.log(keyValue('Max Missions/Day', String(config.maxMissionsPerDay)));
        console.log(keyValue('Cooldown', `${Math.round(config.cycleCooldownMs / 60_000)}min`));
        console.log(keyValue('Min Gap Score', String(config.minGapScore)));
        console.log(keyValue('Min Desire Priority', String(config.minDesirePriority)));
        console.log(keyValue('Mission Depth', config.missionDepth));
        console.log(keyValue('Enabled', config.enabled ? c.green('yes') : c.dim('no')));
        console.log(divider());
      });
    });

  return cmd;
}
