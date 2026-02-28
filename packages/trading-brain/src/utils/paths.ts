import { normalizePath, getDataDir as coreGetDataDir, getPipeName as coreGetPipeName } from '@timmeck/brain-core';

export { normalizePath };

export function getDataDir(): string {
  return coreGetDataDir('TRADING_BRAIN_DATA_DIR', '.trading-brain');
}

export function getPipeName(name: string = 'trading-brain'): string {
  return coreGetPipeName(name);
}
