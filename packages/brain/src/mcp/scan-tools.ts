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

/** Register scan tools using IPC client (for stdio MCP transport) */
export function registerScanTools(server: McpServer, ipc: IpcClient): void {
  registerScanToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register scan tools using router directly (for HTTP MCP transport inside daemon) */
export function registerScanToolsDirect(server: McpServer, router: IpcRouter): void {
  registerScanToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerScanToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // Smart Project Import — Learn from real project history
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_scan_project',
    'Smart-scan a project directory: extracts errors + solutions from Git history (fix commits), log files, and build output. Makes Brain instantly knowledgeable about a project\'s error patterns.',
    {
      directory: z.string().describe('Absolute path to the project directory'),
      project: z.string().optional().describe('Project name (default: directory basename)'),
      git_depth: z.number().optional().describe('Number of git commits to scan (default: 200)'),
      skip_build: z.boolean().optional().describe('Skip running the build (default: false)'),
      skip_git: z.boolean().optional().describe('Skip git history scan (default: false)'),
      skip_logs: z.boolean().optional().describe('Skip log file scan (default: false)'),
    },
    async (params) => {
      const result: AnyResult = await call('scan.project', {
        directory: params.directory,
        project: params.project,
        options: {
          gitDepth: params.git_depth,
          skipBuild: params.skip_build,
          skipGit: params.skip_git,
          skipLogs: params.skip_logs,
        },
      });

      const lines = [
        `Smart Import Complete: ${result.project}`,
        `  Directory: ${result.directory}`,
        `  Duration: ${result.duration}ms`,
        '',
      ];

      if (result.git) {
        const g = result.git;
        lines.push('Git History:');
        lines.push(`  Commits scanned: ${g.commitsScanned}`);
        lines.push(`  Fix commits: ${g.fixCommits}`);
        lines.push(`  Errors created: ${g.errorsCreated}`);
        lines.push(`  Solutions created: ${g.solutionsCreated}`);
        lines.push(`  Duplicates skipped: ${g.duplicates}`);
        lines.push('');
      }

      if (result.logs) {
        const l = result.logs;
        lines.push('Log Files:');
        lines.push(`  Files scanned: ${l.filesScanned}`);
        lines.push(`  Errors created: ${l.errorsCreated}`);
        lines.push(`  Duplicates skipped: ${l.duplicates}`);
        lines.push('');
      }

      if (result.build && result.build.buildSystem !== 'unknown') {
        const b = result.build;
        lines.push(`Build (${b.buildSystem}):`);
        lines.push(`  Command: ${b.command}`);
        lines.push(`  Exit code: ${b.exitCode}`);
        lines.push(`  Errors created: ${b.errorsCreated}`);
        lines.push('');
      }

      const t = result.totals;
      lines.push('Totals:');
      lines.push(`  Errors: ${t.errors}`);
      lines.push(`  Solutions: ${t.solutions}`);
      lines.push(`  Duplicates: ${t.duplicates}`);

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_scan_status',
    'Get the result of the last project scan. Shows how many errors, solutions, and duplicates were found.',
    {},
    async () => {
      const result: AnyResult = await call('scan.status', {});
      if (!result) return textResult('No scan has been run yet.');
      return textResult(result);
    },
  );
}
