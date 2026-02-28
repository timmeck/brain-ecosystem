import fs from 'node:fs';
import path from 'node:path';

/**
 * Deep-merge source into target. Recursively merges nested objects,
 * overwrites primitives and arrays.
 */
export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && target[key] && typeof target[key] === 'object') {
      deepMerge(target[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else if (val !== undefined) {
      target[key] = val;
    }
  }
}

/**
 * Load and parse a JSON config file, merging it into defaults.
 * If the file doesn't exist, returns the defaults unchanged.
 *
 * @param defaults The default config object (will be cloned)
 * @param configPath Explicit config file path, or undefined for auto-detect
 * @param defaultConfigPath Fallback path when configPath is not provided
 * @returns Merged config object
 */
export function loadConfigFile<T>(
  defaults: T,
  configPath?: string,
  defaultConfigPath?: string,
): T {
  const config = structuredClone(defaults);

  const filePath = configPath
    ? path.resolve(configPath)
    : defaultConfigPath;

  if (filePath && fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const fileConfig = JSON.parse(raw) as Partial<T>;
    deepMerge(config as unknown as Record<string, unknown>, fileConfig as unknown as Record<string, unknown>);
  }

  return config;
}
