import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { loadConfig } from '../../config.js';
import { c, icons, header } from '../colors.js';

export function configCommand(): Command {
  const cmd = new Command('config').description('Manage configuration');

  cmd.command('show')
    .description('Show current configuration')
    .action(() => {
      console.log(header('Configuration', icons.gear));
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
    });

  cmd.command('set')
    .description('Set a config value')
    .argument('<key>', 'Config key (dot notation, e.g. api.port)')
    .argument('<value>', 'Config value')
    .action((key, value) => {
      const configPath = path.join(getDataDir(), 'config.json');
      let config: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      const parts = key.split('.');
      let obj = config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]!] || typeof obj[parts[i]!] !== 'object') {
          obj[parts[i]!] = {};
        }
        obj = obj[parts[i]!] as Record<string, unknown>;
      }

      // Auto-convert numbers and booleans
      let parsed: unknown = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else if (!isNaN(Number(value))) parsed = Number(value);

      obj[parts[parts.length - 1]!] = parsed;

      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`${icons.ok}  ${c.success(`Set ${key} = ${value}`)}`);
    });

  cmd.command('delete')
    .description('Delete a config key (revert to default)')
    .argument('<key>', 'Config key to delete')
    .action((key) => {
      const configPath = path.join(getDataDir(), 'config.json');
      if (!fs.existsSync(configPath)) {
        console.log(`${c.dim('No config file found.')}`);
        return;
      }

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const parts = key.split('.');
      let obj = config;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]!]) return;
        obj = obj[parts[i]!];
      }
      delete obj[parts[parts.length - 1]!];

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`${icons.ok}  ${c.success(`Deleted ${key} (reverted to default)`)}`);
    });

  return cmd;
}
