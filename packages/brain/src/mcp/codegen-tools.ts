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

/** Register codegen tools using IPC client (for stdio MCP transport) */
export function registerCodegenTools(server: McpServer, ipc: IpcClient): void {
  registerCodegenToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register codegen tools using router directly (for HTTP MCP transport inside daemon) */
export function registerCodegenToolsDirect(server: McpServer, router: IpcRouter): void {
  registerCodegenToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerCodegenToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // Code Generation — Brain generates code using Claude API + own knowledge
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_generate_code',
    'Generate code using Claude API with Brain\'s accumulated knowledge (Principles, Anti-Patterns, Patterns from 22k repos) as context. The generated code stays in DB for review — no auto-deploy. Requires ANTHROPIC_API_KEY.',
    {
      task: z.string().describe('What code to generate (e.g. "Rate Limiter Service mit Token Bucket")'),
      context: z.string().optional().describe('Additional context or requirements'),
      target_file: z.string().optional().describe('Target file path for the generated code'),
      language: z.string().optional().describe('Programming language (default: typescript)'),
      include_patterns: z.boolean().optional().describe('Include CodeMiner patterns in context (default: true)'),
      include_trends: z.boolean().optional().describe('Include trending repos in context (default: false)'),
    },
    async (params) => {
      const result: AnyResult = await call('codegen.generate', {
        task: params.task,
        context: params.context,
        target_file: params.target_file,
        language: params.language,
        include_patterns: params.include_patterns,
        include_trends: params.include_trends,
        trigger: 'manual',
      });

      const lines = [
        `Code Generation #${result.id}:`,
        `  Status: ${result.status}`,
        `  Task: ${result.task}`,
        `  Model: ${result.model_used}`,
        `  Tokens: ${result.tokens_used}`,
        `  Time: ${result.generation_time_ms}ms`,
        `  Context: ${result.context_summary}`,
      ];
      if (result.generated_code) {
        lines.push('', '--- Generated Code ---', '```', result.generated_code, '```');
      }
      if (result.generated_explanation) {
        lines.push('', '--- Explanation ---', result.generated_explanation);
      }
      if (result.status === 'generated') {
        lines.push('', 'Use brain_codegen_review to approve or reject this generation.');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_codegen_status',
    'Overview of all code generations: total count, status distribution, tokens used, approval rate.',
    {},
    async () => {
      const summary: AnyResult = await call('codegen.summary', {});
      const lines = [
        'CodeGenerator Status:',
        `  Total generations: ${summary.total_generations}`,
        `  Total tokens used: ${summary.total_tokens_used}`,
        `  Avg generation time: ${summary.avg_generation_time_ms}ms`,
        `  Approval rate: ${(summary.approval_rate * 100).toFixed(0)}%`,
        '',
        'By Status:',
      ];
      for (const [status, count] of Object.entries(summary.by_status ?? {})) {
        lines.push(`  ${status}: ${count}`);
      }
      if (summary.last_generation_at) {
        lines.push(`\nLast generation: ${summary.last_generation_at}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_codegen_review',
    'Approve or reject a code generation. Approved code gets journaled as discovery, rejected as failed experiment.',
    {
      id: z.number().describe('Generation ID to review'),
      action: z.enum(['approve', 'reject']).describe('Approve or reject'),
      notes: z.string().optional().describe('Review notes'),
    },
    async (params) => {
      const method = params.action === 'approve' ? 'codegen.approve' : 'codegen.reject';
      const result: AnyResult = await call(method, { id: params.id, notes: params.notes });
      if (!result) {
        return textResult(`Generation #${params.id} not found or not in reviewable state.`);
      }
      return textResult(`Generation #${params.id} ${params.action}d.${params.notes ? ` Notes: ${params.notes}` : ''}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // CodeMiner — Mine repo contents for pattern analysis
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_codeminer_status',
    'Show CodeMiner status: how many repos have been mined, content size, file breakdown.',
    {},
    async () => {
      const status: AnyResult = await call('codeminer.status', {});
      const lines = [
        'CodeMiner Status:',
        `  Repos mined: ${status.total_repos_mined}`,
        `  Total contents: ${status.total_contents}`,
        `  Total size: ${(status.total_size_bytes / 1024).toFixed(1)} KB`,
        `  Last mined: ${status.last_mined_at ?? 'never'}`,
        '',
        'By File Type:',
      ];
      for (const f of (status.by_file ?? [])) {
        lines.push(`  ${f.file_path}: ${f.count}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_codeminer_patterns',
    'Show extracted patterns from mined repos: top dependencies, tech stacks, project structures, README patterns. Use extract=true to re-analyze.',
    {
      type: z.enum(['dependency', 'tech_stack', 'structure', 'readme']).optional().describe('Pattern type to filter'),
      extract: z.boolean().optional().describe('Re-extract patterns from mined data (default: false, shows cached)'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const result: AnyResult = await call('codeminer.patterns', {
        type: params.type,
        extract: params.extract,
        limit: params.limit ?? 20,
      });

      // If extract=true, result is { dependencies, techStacks, structures, readmePatterns }
      if (params.extract && result.dependencies) {
        const lines = ['Extracted Patterns:'];
        lines.push(`\nTop Dependencies (${result.dependencies.length}):`);
        for (const d of result.dependencies) {
          lines.push(`  ${d.name}: ${d.count}x (${d.percentage}%)`);
        }
        lines.push(`\nTech Stacks (${result.techStacks.length}):`);
        for (const s of result.techStacks) {
          lines.push(`  ${s.stack}: ${s.count}x`);
        }
        lines.push(`\nProject Structures (${result.structures.length}):`);
        for (const s of result.structures) {
          lines.push(`  ${s.path}: ${s.count}x (${s.percentage}%)`);
        }
        lines.push(`\nREADME Patterns (${result.readmePatterns.length}):`);
        for (const r of result.readmePatterns) {
          lines.push(`  ${r.section}: ${r.count}x (${r.percentage}%)`);
        }
        return textResult(lines.join('\n'));
      }

      // Cached patterns
      if (Array.isArray(result) && result.length === 0) {
        return textResult('No patterns extracted yet. Use extract=true to analyze mined repos.');
      }

      const lines = [`Patterns (${Array.isArray(result) ? result.length : 0}):\n`];
      for (const p of (Array.isArray(result) ? result : [])) {
        lines.push(`[${p.pattern_type}] ${p.pattern_key} — ${p.frequency}x (confidence: ${p.confidence.toFixed(2)})`);
      }
      return textResult(lines.join('\n'));
    },
  );
}
