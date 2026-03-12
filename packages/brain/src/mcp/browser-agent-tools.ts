import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;
type BrainCall = (method: string, params?: unknown) => Promise<unknown> | unknown;

function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

export function registerBrowserAgentTools(server: McpServer, ipc: IpcClient): void {
  registerBrowserAgentToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerBrowserAgentToolsDirect(server: McpServer, router: IpcRouter): void {
  registerBrowserAgentToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerBrowserAgentToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_browser_run',
    'Start an autonomous browser task. The agent navigates, reads pages, fills forms, and extracts data using LLM-guided decisions.',
    {
      task: z.string().describe('Natural language description of what to do in the browser'),
      taskId: z.string().optional().describe('Custom task ID (auto-generated if omitted)'),
    },
    async (params) => {
      const taskId = params.taskId ?? `task_${Date.now()}`;
      const result: AnyResult = await call('browser.run', { taskId, task: params.task });
      return textResult(result);
    },
  );

  server.tool(
    'brain_browser_execute',
    'Execute a scripted sequence of browser actions (navigate, click, type, screenshot, etc.).',
    {
      taskId: z.string().optional().describe('Task ID for tracking'),
      actions: z.array(z.object({
        type: z.string().describe('Action type: navigate, click, type, screenshot, scroll, wait, extract'),
        selector: z.string().optional().describe('CSS selector for the target element'),
        value: z.string().optional().describe('Value for type/navigate actions'),
      })).describe('Ordered list of browser actions'),
    },
    async (params) => {
      const taskId = params.taskId ?? `exec_${Date.now()}`;
      const result: AnyResult = await call('browser.execute', { taskId, actions: params.actions });
      return textResult(result);
    },
  );

  server.tool(
    'brain_browser_status',
    'Get the current status of the browser agent (running tasks, pages open, etc.).',
    {},
    async () => {
      const status: AnyResult = await call('browser.status');
      return textResult(status);
    },
  );

  server.tool(
    'brain_browser_shutdown',
    'Gracefully shut down the browser agent, closing all pages and releasing resources.',
    {},
    async () => {
      await call('browser.shutdown');
      return textResult('Browser agent shut down successfully.');
    },
  );
}
