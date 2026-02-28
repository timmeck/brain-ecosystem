import { normalizePath, getDataDir as coreGetDataDir, getPipeName as coreGetPipeName } from '@timmeck/brain-core';

export { normalizePath };

export function getDataDir(): string {
  return coreGetDataDir('BRAIN_DATA_DIR', '.brain');
}

export function getPipeName(name: string = 'brain'): string {
  return coreGetPipeName(name);
}
