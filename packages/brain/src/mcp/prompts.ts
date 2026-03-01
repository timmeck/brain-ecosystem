import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

type BrainCall = (method: string, params?: unknown) => Promise<unknown> | unknown;

/** Register MCP prompts using IPC client (for stdio MCP transport) */
export function registerPrompts(server: McpServer, ipc: IpcClient): void {
  registerPromptsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register MCP prompts using router directly (for HTTP MCP transport inside daemon) */
export function registerPromptsDirect(server: McpServer, router: IpcRouter): void {
  registerPromptsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerPromptsWithCaller(server: McpServer, call: BrainCall): void {

  // === Error Investigation Prompt ===
  server.prompt(
    'brain-investigate-error',
    'Investigate an error using Brain\'s knowledge. Returns context, similar errors, solutions, and prevention rules.',
    { error_output: z.string().describe('The error output to investigate') },
    async ({ error_output }) => {
      // Report the error first to get matches
      const report: AnyResult = await call('error.report', {
        project: 'default',
        errorOutput: error_output,
      });

      const sections: string[] = [];
      sections.push(`## Error Analysis\n`);
      sections.push(`Error #${report.errorId} (${report.isNew ? 'NEW' : 'SEEN BEFORE'})\n`);

      // Get suggestions if available
      if (report.suggestions?.suggestions?.length > 0) {
        sections.push(`\n## Solution Suggestions\n`);
        for (const s of report.suggestions.suggestions) {
          sections.push(`### [${s.category.toUpperCase()}] Solution #${s.solution.id} (${(s.score * 100).toFixed(0)}% confidence)`);
          sections.push(s.solution.description);
          if (s.solution.commands) sections.push(`\`\`\`\n${s.solution.commands}\n\`\`\``);
          if (s.solution.code_change) sections.push(`\`\`\`diff\n${s.solution.code_change}\n\`\`\``);
          sections.push(`_${s.reasoning}_\n`);
        }
        if (report.suggestions.autoApply) {
          sections.push(`\n**RECOMMENDED:** Solution #${report.suggestions.autoApply.solution.id} has high confidence and can be applied directly.\n`);
        }
      }

      // Get synapse context
      try {
        const context: AnyResult = await call('synapse.context', { errorId: report.errorId });
        if (context.preventionRules?.length) {
          sections.push(`\n## Prevention Rules\n`);
          sections.push(`${context.preventionRules.length} prevention rules are relevant to this error.`);
          sections.push(`Use \`brain_explain_learning\` to see rule details.\n`);
        }
        if (context.relevantModules?.length) {
          sections.push(`\n## Related Code Modules\n`);
          sections.push(`${context.relevantModules.length} code modules are connected to similar errors.\n`);
        }
      } catch {
        // Synapse context not available
      }

      // Check for similar errors
      if (report.matches?.length > 0) {
        sections.push(`\n## Similar Errors\n`);
        for (const m of report.matches.slice(0, 5)) {
          sections.push(`- Error #${m.errorId} (${(m.score * 100).toFixed(0)}% match)${m.isStrong ? ' **STRONG**' : ''}`);
        }
      }

      if (report.crossProjectMatches?.length > 0) {
        sections.push(`\n## Cross-Project Matches\n`);
        for (const m of report.crossProjectMatches.slice(0, 3)) {
          sections.push(`- Error #${m.errorId} from another project (${(m.score * 100).toFixed(0)}% match)`);
        }
      }

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: sections.join('\n') },
        }],
      };
    },
  );

  // === Before Code Change Prompt ===
  server.prompt(
    'brain-before-code-change',
    'Check Brain\'s knowledge BEFORE modifying code. Shows relevant errors, antipatterns, and learned rules for a file.',
    { file_path: z.string().describe('The file path about to be changed') },
    async ({ file_path }) => {
      const sections: string[] = [];
      sections.push(`## Brain Advisory: ${file_path}\n`);
      sections.push(`Before modifying this file, consider the following:\n`);

      // Check for errors related to this file
      try {
        const errors: AnyResult = await call('error.query', { search: file_path });
        if (errors?.length > 0) {
          const unresolved = errors.filter((e: AnyResult) => !e.resolved);
          sections.push(`### Known Errors (${errors.length} total, ${unresolved.length} unresolved)\n`);
          for (const e of errors.slice(0, 5)) {
            sections.push(`- **#${e.id}** [${e.type ?? 'Unknown'}] ${(e.message ?? '').slice(0, 100)}${e.resolved ? ' (resolved)' : ' **UNRESOLVED**'}`);
          }
          sections.push('');
        }
      } catch {
        // No errors found
      }

      // Check changelog for this file
      try {
        const changes: AnyResult = await call('changelog.query', { filePath: file_path, limit: 5 });
        if (changes?.length > 0) {
          sections.push(`### Recent Changes\n`);
          for (const c of changes) {
            sections.push(`- [${c.change_type}] ${c.summary}`);
            if (c.reason) sections.push(`  _Reason: ${c.reason}_`);
          }
          sections.push('');
        }
      } catch {
        // No changes found
      }

      // Check prevention rules
      try {
        const rules: AnyResult = await call('rule.list', {});
        if (rules?.length > 0) {
          sections.push(`### Active Prevention Rules\n`);
          sections.push(`Brain has ${rules.length} learned rules. Relevant ones will fire on errors.\n`);
        }
      } catch {
        // No rules
      }

      // Check decisions
      try {
        const decisions: AnyResult = await call('decision.query', { query: file_path, limit: 3 });
        if (decisions?.length > 0) {
          sections.push(`### Related Decisions\n`);
          for (const d of decisions) {
            sections.push(`- **${d.title}**: ${d.description.slice(0, 150)}`);
          }
          sections.push('');
        }
      } catch {
        // No decisions
      }

      if (sections.length <= 2) {
        sections.push(`No prior knowledge about this file. Proceed carefully and report any errors to Brain.\n`);
      }

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: sections.join('\n') },
        }],
      };
    },
  );

  // === Project Overview Prompt ===
  server.prompt(
    'brain-project-overview',
    'Get a comprehensive overview of what Brain knows about a project: health, patterns, fragile modules, and active tasks.',
    { project: z.string().optional().describe('Project name (optional)') },
    async ({ project }) => {
      const sections: string[] = [];
      sections.push(`## Brain Project Intelligence${project ? `: ${project}` : ''}\n`);

      // Analytics summary
      try {
        const summary: AnyResult = await call('analytics.summary', {});
        sections.push(`### Health Overview\n`);
        sections.push(`- **Errors:** ${summary.errors?.total ?? 0} total, ${summary.errors?.unresolved ?? 0} unresolved`);
        sections.push(`- **Solutions:** ${summary.solutions?.total ?? 0} recorded`);
        sections.push(`- **Rules:** ${summary.rules?.active ?? 0} active learned rules`);
        sections.push(`- **Code Modules:** ${summary.modules?.total ?? 0} indexed`);
        sections.push(`- **Insights:** ${summary.insights?.active ?? 0} active`);
        sections.push('');
      } catch {
        // No analytics
      }

      // Network stats
      try {
        const network: AnyResult = await call('synapse.stats', {});
        sections.push(`### Synapse Network\n`);
        sections.push(`- **${network.totalSynapses ?? 0}** connections between ${network.totalNodes ?? 0} nodes`);
        sections.push(`- Average weight: ${(network.avgWeight ?? 0).toFixed(3)}`);
        sections.push('');
      } catch {
        // No network
      }

      // Strongest synapses (fragile/hot modules)
      try {
        const synapses: AnyResult = await call('synapse.list', { limit: 10 });
        if (synapses?.length > 0) {
          sections.push(`### Strongest Connections (potential fragile points)\n`);
          for (const s of synapses.slice(0, 5)) {
            sections.push(`- ${s.sourceType}:${s.sourceId} ↔ ${s.targetType}:${s.targetId} (weight: ${s.weight?.toFixed(3) ?? '?'}, type: ${s.type})`);
          }
          sections.push('');
        }
      } catch {
        // No synapses
      }

      // Active tasks
      try {
        const tasks: AnyResult = await call('task.list', { status: 'in_progress', limit: 5 });
        if (tasks?.length > 0) {
          sections.push(`### Active Tasks\n`);
          for (const t of tasks) {
            sections.push(`- [P${t.priority}] ${t.title}`);
          }
          sections.push('');
        }
      } catch {
        // No tasks
      }

      // Recent insights
      try {
        const insights: AnyResult = await call('research.insights', { activeOnly: true, limit: 5 });
        if (insights?.length > 0) {
          sections.push(`### Recent Insights\n`);
          for (const i of insights) {
            sections.push(`- [${i.type}] ${i.title}: ${i.description?.slice(0, 120)}`);
          }
          sections.push('');
        }
      } catch {
        // No insights
      }

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: sections.join('\n') },
        }],
      };
    },
  );

  // === Solution Review Prompt ===
  server.prompt(
    'brain-review-solution',
    'Review a solution before applying it. Shows success history, related errors, and potential risks.',
    { solution_id: z.string().describe('The solution ID to review') },
    async ({ solution_id }) => {
      const solId = parseInt(solution_id, 10);
      const sections: string[] = [];

      try {
        const solution: AnyResult = await call('solution.query', { errorId: solId });
        // Also get the solution directly via efficiency
        const efficiency: AnyResult = await call('solution.efficiency', {});

        sections.push(`## Solution Review\n`);

        if (solution?.length > 0) {
          const sol = solution[0];
          sections.push(`### Solution #${sol.id}`);
          sections.push(`- **Description:** ${sol.description}`);
          if (sol.commands) sections.push(`- **Commands:** \`${sol.commands}\``);
          if (sol.code_change) sections.push(`- **Code Change:**\n\`\`\`diff\n${sol.code_change}\n\`\`\``);
          sections.push(`- **Source:** ${sol.source}`);
          sections.push(`- **Confidence:** ${(sol.confidence * 100).toFixed(0)}%`);
          sections.push(`- **Results:** ${sol.success_count} successes, ${sol.fail_count} failures`);
          sections.push('');
        }

        if (efficiency) {
          sections.push(`### Overall Solution Statistics\n`);
          sections.push(`- Average duration: ${efficiency.avgDurationMs?.toFixed(0) ?? 'N/A'}ms`);
          sections.push(`- Overall success rate: ${(efficiency.successRateOverall * 100).toFixed(0)}%`);
          sections.push(`- Total attempts: ${efficiency.totalAttempts}`);
        }
      } catch {
        sections.push(`Could not retrieve solution details. The solution may not exist.`);
      }

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: sections.join('\n') },
        }],
      };
    },
  );
}
