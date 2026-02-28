import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';
import { c, icons } from './colors.js';

export async function withIpc<T>(fn: (client: IpcClient) => Promise<T>): Promise<T> {
  const client = new IpcClient(getPipeName(), 5000);
  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      console.error(`${icons.error}  ${c.error('Trading Brain daemon is not running.')} Start it with: ${c.cyan('trading start')}`);
    } else if (err instanceof Error && err.message.includes('ECONNREFUSED')) {
      console.error(`${icons.error}  ${c.error('Trading Brain daemon is not responding.')} Try: ${c.cyan('trading stop && trading start')}`);
    } else {
      console.error(`${icons.error}  ${c.error(err instanceof Error ? err.message : String(err))}`);
    }
    process.exit(1);
  } finally {
    client.disconnect();
  }
}
