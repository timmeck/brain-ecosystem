import { Command } from 'commander';
import { CrossBrainClient } from '@timmeck/brain-core';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function peersCommand(): Command {
  return new Command('peers')
    .description('Show status of peer brains in the ecosystem')
    .action(async () => {
      console.log(header('Brain Ecosystem', icons.synapse));

      const cross = new CrossBrainClient('marketing-brain');
      const peerNames = cross.getPeerNames();

      console.log(`  ${c.dim('Checking')} ${peerNames.length} ${c.dim('peers...')}\n`);

      const available = await cross.getAvailablePeers();
      const statuses = await cross.broadcast('status');

      for (const name of peerNames) {
        const isUp = available.includes(name);
        const status = statuses.find(s => s.name === name);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = status?.result as any;

        if (isUp && info) {
          console.log(`  ${icons.check} ${c.green.bold(name)} ${c.dim('— running')}`);
          console.log(keyValue('Version', info.version ?? '?', 6));
          console.log(keyValue('Uptime', `${info.uptime ?? 0}s`, 6));
          console.log(keyValue('PID', info.pid ?? '?', 6));
          console.log(keyValue('Methods', info.methods ?? '?', 6));
        } else if (isUp) {
          console.log(`  ${icons.check} ${c.green.bold(name)} ${c.dim('— running (no status)')}`);
        } else {
          console.log(`  ${icons.cross} ${c.dim(name)} ${c.red('— offline')}`);
        }
        console.log();
      }

      console.log(`  ${c.label('Self:')} ${c.blue.bold('marketing-brain')} ${c.dim('(this instance)')}`);
      console.log(`\n${divider()}`);
    });
}
