import path from 'node:path';
import os from 'node:os';

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Get the data directory for a brain instance.
 * @param envVar - Environment variable name (e.g. 'BRAIN_DATA_DIR')
 * @param defaultDir - Default directory name in home (e.g. '.brain')
 */
export function getDataDir(envVar: string = 'BRAIN_DATA_DIR', defaultDir: string = '.brain'): string {
  const envDirValue = process.env[envVar];
  if (envDirValue) return path.resolve(envDirValue);
  return path.join(os.homedir(), defaultDir);
}

export function getPipeName(name: string = 'brain'): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${name}`;
  }
  return path.join(os.tmpdir(), `${name}.sock`);
}
