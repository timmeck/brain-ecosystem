import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrainCall = (method: string, params?: unknown) => Promise<unknown> | unknown;

function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function registerExperimentLedgerTools(server: McpServer, ipc: IpcClient): void {
  registerExperimentLedgerToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerExperimentLedgerToolsDirect(server: McpServer, router: IpcRouter): void {
  registerExperimentLedgerToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerExperimentLedgerToolsWithCaller(server: McpServer, call: BrainCall): void {
  server.tool(
    'brain_ledger_status',
    'Show experiment ledger status — active experiments, kept/reverted counts',
    {},
    async () => {
      const status = await call('ledger.status');
      return textResult(status);
    },
  );

  server.tool(
    'brain_ledger_start',
    'Start a controlled A/B experiment for a system change',
    {
      hypothesis: z.string().describe('What are we testing?'),
      variantA: z.string().describe('Variant A (baseline) description'),
      variantB: z.string().describe('Variant B (change) description'),
      targetEngine: z.string().describe('Target engine name'),
      metricKeys: z.array(z.string()).describe('Metrics to compare'),
      cyclesPerVariant: z.number().optional().describe('Cycles per variant (default: 20)'),
    },
    async (params) => {
      const result = await call('ledger.start', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_ledger_history',
    'Show experiment history — past experiments with decisions',
    {
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    async (params) => {
      const experiments = await call('ledger.history', params);
      return textResult(experiments);
    },
  );
}
