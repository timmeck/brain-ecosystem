import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../utils/paths.js';
import { c, icons, header, divider } from '../colors.js';

function getConfigPath(): string {
  return path.join(getDataDir(), 'config.json');
}

function readConfig(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {};
}

function writeConfig(config: Record<string, unknown>): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function deleteNestedValue(obj: Record<string, unknown>, keyPath: string): boolean {
  const parts = keyPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!current[part] || typeof current[part] !== 'object') return false;
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  if (last in current) {
    delete current[last];
    return true;
  }
  return false;
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
    try { return JSON.parse(value); } catch { /* fall through */ }
  }
  return value;
}

function printObject(obj: unknown, indent = 0): void {
  const pad = ' '.repeat(indent);
  if (obj === null || obj === undefined) {
    console.log(`${pad}${c.dim('(not set)')}`);
    return;
  }
  if (typeof obj !== 'object') {
    console.log(`${pad}${c.value(String(obj))}`);
    return;
  }
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      console.log(`${pad}${c.cyan(key + ':')}`);
      printObject(val, indent + 2);
    } else {
      const display = Array.isArray(val) ? JSON.stringify(val) : String(val);
      console.log(`${pad}${c.label(key + ':')} ${c.value(display)}`);
    }
  }
}

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('View and modify Marketing Brain configuration');

  cmd
    .command('show')
    .description('Show current configuration')
    .argument('[key]', 'Specific config key (e.g., learning.intervalMs)')
    .action((key?: string) => {
      const config = readConfig();

      if (key) {
        const value = getNestedValue(config, key);
        if (value === undefined) {
          console.log(`${c.dim(`Key "${key}" is not set in config overrides.`)}`);
        } else {
          console.log(`${c.label(key + ':')} ${c.value(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))}`);
        }
        return;
      }

      console.log(header('Marketing Brain Configuration', icons.chart));
      console.log(`  ${c.label('Config file:')} ${c.dim(getConfigPath())}\n`);

      if (Object.keys(config).length === 0) {
        console.log(`  ${c.dim('No custom overrides. Using defaults.')}`);
        console.log(`  ${c.dim('Set values with:')} ${c.cyan('marketing config set <key> <value>')}`);
      } else {
        printObject(config, 2);
      }
      console.log(`\n${divider()}`);
    });

  cmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Config key path (e.g., learning.intervalMs)')
    .argument('<value>', 'Value to set')
    .action((key: string, value: string) => {
      const config = readConfig();
      const parsed = parseValue(value);
      setNestedValue(config, key, parsed);
      writeConfig(config);

      console.log(`${icons.ok}  ${c.label(key)} ${c.dim(icons.arrow)} ${c.value(String(parsed))}`);
      console.log(`  ${c.dim('Restart the daemon for changes to take effect:')} ${c.cyan('marketing stop && marketing start')}`);
    });

  cmd
    .command('delete')
    .description('Remove a configuration override (revert to default)')
    .argument('<key>', 'Config key path to remove')
    .action((key: string) => {
      const config = readConfig();
      if (deleteNestedValue(config, key)) {
        writeConfig(config);
        console.log(`${icons.ok}  ${c.dim(`Removed "${key}" — will use default value.`)}`);
        console.log(`  ${c.dim('Restart the daemon for changes to take effect:')} ${c.cyan('marketing stop && marketing start')}`);
      } else {
        console.log(`${c.dim(`Key "${key}" not found in config overrides.`)}`);
      }
    });

  cmd
    .command('path')
    .description('Show the config file path')
    .action(() => {
      console.log(getConfigPath());
    });

  return cmd;
}
