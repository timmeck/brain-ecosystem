import { IpcClient } from '@timmeck/brain-core';
import { getPipeName } from '../utils/paths.js';
import { c, icons } from './colors.js';

export async function withIpc<T>(fn: (client: IpcClient) => Promise<T>, timeoutMs = 5000): Promise<T> {
  const client = new IpcClient(getPipeName(), timeoutMs);
  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      console.error(`${icons.error}  ${c.error('Brain daemon is not running.')} Start it with: ${c.cyan('brain start')}`);
    } else if (err instanceof Error && err.message.includes('ECONNREFUSED')) {
      console.error(`${icons.error}  ${c.error('Brain daemon is not responding.')} Try: ${c.cyan('brain stop && brain start')}`);
    } else {
      console.error(`${icons.error}  ${c.error(err instanceof Error ? err.message : String(err))}`);
    }
    process.exit(1);
  } finally {
    client.disconnect();
  }
}
