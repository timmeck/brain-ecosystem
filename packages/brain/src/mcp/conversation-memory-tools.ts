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

export function registerConversationMemoryTools(server: McpServer, ipc: IpcClient): void {
  registerConversationMemoryToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerConversationMemoryToolsDirect(server: McpServer, router: IpcRouter): void {
  registerConversationMemoryToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerConversationMemoryToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_remember',
    'Store something in long-term conversation memory. Use for important facts, decisions, preferences, or context that should persist across sessions.',
    {
      content: z.string().describe('The content to remember'),
      category: z.enum(['fact', 'decision', 'preference', 'context', 'code', 'error', 'insight']).optional().describe('Memory category (default: context)'),
      importance: z.number().min(1).max(10).optional().describe('Importance score 1-10 (default: 5)'),
      tags: z.array(z.string()).optional().describe('Tags for organization'),
    },
    async (params) => {
      const result: AnyResult = await call('convo.remember', params);
      return textResult(`Remembered (ID: ${result.id}, importance: ${result.importance})`);
    },
  );

  server.tool(
    'brain_recall',
    'Semantically search long-term conversation memory. Returns memories ranked by relevance using RAG + FTS5.',
    {
      query: z.string().describe('What to search for'),
      limit: z.number().optional().describe('Max results (default: 10)'),
      category: z.string().optional().describe('Filter by category'),
    },
    async (params) => {
      const memories: AnyResult[] = await call('convo.recall', params) as AnyResult[];
      if (!memories?.length) return textResult('No matching memories found.');

      const lines = ['# Recalled Memories', ''];
      for (const m of memories) {
        const age = m.created_at ? ` (${m.created_at.substring(0, 10)})` : '';
        lines.push(`**[${m.category ?? 'context'}]** ${m.content.substring(0, 200)}${age}`);
        if (m.tags?.length) lines.push(`  Tags: ${m.tags.join(', ')}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_memory_context',
    'Build a context summary from conversation memory for LLM consumption. Aggregates important recent memories.',
    {
      maxTokens: z.number().optional().describe('Approximate max tokens for context (default: 2000)'),
    },
    async (params) => {
      const context: AnyResult = await call('convo.context', params);
      return textResult(typeof context === 'string' ? context : JSON.stringify(context, null, 2));
    },
  );

  server.tool(
    'brain_memory_search',
    'Full-text search in conversation memory using FTS5.',
    {
      query: z.string().describe('Search query (supports FTS5 syntax)'),
    },
    async (params) => {
      const results: AnyResult[] = await call('convo.search', params) as AnyResult[];
      if (!results?.length) return textResult('No results found.');

      const lines = [`# ${results.length} Search Results`, ''];
      for (const r of results) {
        lines.push(`- **${r.category ?? 'context'}**: ${r.content.substring(0, 150)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_memory_important',
    'Retrieve the most important memories, sorted by importance score.',
    {
      limit: z.number().optional().describe('Max results (default: 10)'),
      minImportance: z.number().optional().describe('Minimum importance threshold (default: 7)'),
    },
    async (params) => {
      const memories: AnyResult[] = await call('convo.important', params) as AnyResult[];
      if (!memories?.length) return textResult('No important memories found.');

      const lines = [`# ${memories.length} Important Memories`, ''];
      for (const m of memories) {
        lines.push(`- [${m.importance}/10] **${m.category ?? 'context'}**: ${m.content.substring(0, 150)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_memory_status',
    'Get conversation memory statistics: total memories, categories, storage info.',
    {},
    async () => {
      const status: AnyResult = await call('convo.status');
      return textResult(status);
    },
  );
}
