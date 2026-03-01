import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';

export interface McpServerOptions {
  /** MCP server name (e.g. 'brain', 'trading-brain') */
  name: string;
  /** MCP server version */
  version: string;
  /** Pipe name for IPC connection */
  pipeName?: string;
  /** Path to the CLI entry point for auto-starting the daemon */
  entryPoint: string;
  /** Register MCP tools on the server */
  registerTools: (server: McpServer, ipc: IpcClient) => void;
  /** Register MCP prompts on the server (optional) */
  registerPrompts?: (server: McpServer, ipc: IpcClient) => void;
  /** Callback when a tool is called — used for DataMiner/SelfObserver tracking */
  onToolCall?: (toolName: string, durationMs: number, success: boolean) => void;
}

function spawnDaemon(opts: McpServerOptions): void {
  const child = spawn(process.execPath, [
    '--import', 'tsx',
    opts.entryPoint, 'daemon',
  ], {
    detached: true,
    stdio: 'ignore',
    cwd: path.resolve(path.dirname(opts.entryPoint), '..'),
  });
  child.unref();
  process.stderr.write(`${opts.name}: Auto-started daemon (PID: ${child.pid})\n`);
}

async function connectWithRetry(ipc: IpcClient, retries: number, delayMs: number): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await ipc.connect();
      return;
    } catch {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error('Could not connect to daemon after retries');
}

export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const server = new McpServer({
    name: opts.name,
    version: opts.version,
  });

  const pipeName = opts.pipeName ?? getPipeName(opts.name);
  const ipc = new IpcClient(pipeName);

  try {
    await ipc.connect();
  } catch {
    process.stderr.write(`${opts.name}: Daemon not running, starting automatically...\n`);
    spawnDaemon(opts);
    try {
      await connectWithRetry(ipc, 10, 500);
    } catch {
      process.stderr.write(`${opts.name}: Could not connect to daemon after auto-start. Check logs.\n`);
      process.exit(1);
    }
  }

  // Wrap IPC client to track tool calls if onToolCall callback is provided
  if (opts.onToolCall) {
    const originalRequest = ipc.request.bind(ipc);
    const onToolCall = opts.onToolCall;
    ipc.request = (method: string, params?: unknown): Promise<unknown> => {
      const start = Date.now();
      let success = true;
      return originalRequest(method, params).then(
        (result) => { try { onToolCall(method, Date.now() - start, success); } catch { /* best effort */ } return result; },
        (err) => { success = false; try { onToolCall(method, Date.now() - start, success); } catch { /* best effort */ } throw err; },
      );
    };
  }

  opts.registerTools(server, ipc);
  opts.registerPrompts?.(server, ipc);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => {
    ipc.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    ipc.disconnect();
    process.exit(0);
  });
}
