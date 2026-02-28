import { normalizePath, getDataDir as coreGetDataDir, getPipeName as coreGetPipeName } from '@timmeck/brain-core';

export { normalizePath };

export function getDataDir(): string {
  return coreGetDataDir('MARKETING_BRAIN_DATA_DIR', '.marketing-brain');
}

export function getPipeName(name: string = 'marketing-brain'): string {
  return coreGetPipeName(name);
}
