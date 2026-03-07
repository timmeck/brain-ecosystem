import { Command } from 'commander';
import path from 'node:path';
import { c, header, divider } from '../colors.js';
import { WindowsServiceManager } from '@timmeck/brain-core';

const BRAINS = [
  {
    name: 'brain',
    displayName: 'Brain Ecosystem — Brain',
    description: 'Error memory, code intelligence & autonomous research daemon',
  },
  {
    name: 'trading-brain',
    displayName: 'Brain Ecosystem — Trading Brain',
    description: 'Adaptive trading intelligence with signal learning daemon',
  },
  {
    name: 'marketing-brain',
    displayName: 'Brain Ecosystem — Marketing Brain',
    description: 'Content strategy & social engagement daemon',
  },
];

function getEntryPoint(name: string): string {
  // Resolve from brain-core package location up to packages dir
  const packagesDir = path.resolve(import.meta.dirname, '..', '..', '..', '..');
  return path.join(packagesDir, name, 'dist', 'index.js');
}

export function serviceCommand(): Command {
  const cmd = new Command('service')
    .description('Windows service management (install/uninstall/status)');

  cmd.command('install')
    .description('Install all brains as Windows services')
    .action(() => {
      const manager = new WindowsServiceManager();
      if (!manager.isAvailable()) {
        console.log(`  ${c.red('\u2717')} Windows service management is only available on Windows.`);
        return;
      }

      console.log(header('Installing Windows Services', '\u{1F3ED}'));
      for (const brain of BRAINS) {
        const entryPoint = getEntryPoint(brain.name);
        const ok = manager.install({
          name: brain.name,
          displayName: brain.displayName,
          description: brain.description,
          entryPoint,
          args: ['daemon'],
        });
        if (ok) {
          console.log(`  ${c.green('\u2713')} ${c.cyan(brain.name)} installed`);
        } else {
          console.log(`  ${c.red('\u2717')} ${c.cyan(brain.name)} failed to install`);
        }
      }
      console.log(`\n  ${c.dim('Start services with:')} ${c.cyan('sc start BrainEcosystem_brain')}`);
      console.log(divider());
    });

  cmd.command('uninstall')
    .description('Uninstall all brain Windows services')
    .action(() => {
      const manager = new WindowsServiceManager();
      if (!manager.isAvailable()) {
        console.log(`  ${c.red('\u2717')} Windows service management is only available on Windows.`);
        return;
      }

      console.log(header('Uninstalling Windows Services', '\u{1F3ED}'));
      for (const brain of BRAINS) {
        const ok = manager.uninstall(brain.name);
        if (ok) {
          console.log(`  ${c.green('\u2713')} ${c.cyan(brain.name)} uninstalled`);
        } else {
          console.log(`  ${c.red('\u2717')} ${c.cyan(brain.name)} failed to uninstall`);
        }
      }
      console.log(divider());
    });

  cmd.command('status')
    .description('Show Windows service status for all brains')
    .action(() => {
      const manager = new WindowsServiceManager();
      if (!manager.isAvailable()) {
        console.log(`  ${c.red('\u2717')} Windows service management is only available on Windows.`);
        return;
      }

      console.log(header('Windows Service Status', '\u{1F3ED}'));
      const statuses = manager.queryAll();
      for (const s of statuses) {
        const stateColor = s.state === 'running' ? c.green : s.state === 'stopped' ? c.red : c.orange;
        const installed = s.installed ? c.green('installed') : c.dim('not installed');
        console.log(`  ${c.cyan(s.name.padEnd(20))} ${stateColor(s.state.padEnd(12))} ${installed}`);
      }
      console.log(divider());
    });

  // Default action: show status
  cmd.action(() => {
    cmd.commands.find(c => c.name() === 'status')!.parse([], { from: 'user' });
  });

  return cmd;
}
