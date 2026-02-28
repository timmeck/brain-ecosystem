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

/** Register tools using IPC client (for stdio MCP transport) */
export function registerTools(server: McpServer, ipc: IpcClient): void {
  registerToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register tools using router directly (for HTTP MCP transport inside daemon) */
export function registerToolsDirect(server: McpServer, router: IpcRouter): void {
  registerToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerToolsWithCaller(server: McpServer, call: BrainCall): void {

  // === Error Brain Tools ===

  server.tool(
    'brain_report_error',
    'Report an error that occurred. Brain stores it, matches against known errors, returns solutions if available.',
    {
      error_output: z.string().describe('The raw error output from the terminal'),
      command: z.string().optional().describe('The command that caused the error'),
      task_context: z.string().optional().describe('What was the user trying to accomplish'),
      working_directory: z.string().optional().describe('Working directory when error occurred'),
      project: z.string().optional().describe('Project name'),
    },
    async (params) => {
      const result: AnyResult = await call('error.report', {
        project: params.project ?? 'default',
        errorOutput: params.error_output,
        filePath: params.working_directory,
        taskContext: params.task_context,
        workingDirectory: params.working_directory,
        command: params.command,
      });
      let response = `Error #${result.errorId} recorded (${result.isNew ? 'new' : 'seen before'}).`;
      if (result.matches?.length > 0) {
        const best = result.matches[0];
        response += `\nSimilar error found (#${best.errorId}, ${Math.round(best.score * 100)}% match).`;
      }
      if (result.crossProjectMatches?.length > 0) {
        const best = result.crossProjectMatches[0];
        response += `\nCross-project match found (#${best.errorId}, ${Math.round(best.score * 100)}% match from another project).`;
      }
      return textResult(response);
    },
  );

  server.tool(
    'brain_query_error',
    'Search for similar errors and their solutions in the Brain database.',
    {
      query: z.string().describe('Error message or description to search for'),
      project_only: z.boolean().optional().describe('Only search in current project'),
    },
    async (params) => {
      const results: AnyResult = await call('error.query', {
        search: params.query,
      });
      if (!results?.length) return textResult('No matching errors found.');
      const lines = results.map((e: AnyResult) =>
        `#${e.id} [${e.errorType}] ${e.message?.slice(0, 120)}${e.resolved ? ' (resolved)' : ''}`
      );
      return textResult(`Found ${results.length} errors:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_report_solution',
    'Report a successful solution for an error. Brain will learn from this.',
    {
      error_id: z.number().describe('The error ID this solution fixes'),
      description: z.string().describe('What was done to fix the error'),
      commands: z.string().optional().describe('Commands used to fix'),
      code_change: z.string().optional().describe('Code changes or diff'),
    },
    async (params) => {
      const solutionId: AnyResult = await call('solution.report', {
        errorId: params.error_id,
        description: params.description,
        commands: params.commands,
        codeChange: params.code_change,
      });
      return textResult(`Solution #${solutionId} recorded for error #${params.error_id}. Brain will use this to help with similar errors in the future.`);
    },
  );

  server.tool(
    'brain_report_attempt',
    'Report a failed solution attempt. Brain learns what does NOT work.',
    {
      error_id: z.number().describe('The error ID'),
      solution_id: z.number().describe('The solution ID that was attempted'),
      description: z.string().optional().describe('What was tried'),
      output: z.string().optional().describe('Output of the failed attempt'),
    },
    async (params) => {
      await call('solution.rate', {
        errorId: params.error_id,
        solutionId: params.solution_id,
        success: false,
        output: params.output,
      });
      return textResult(`Failed attempt recorded for error #${params.error_id}. Brain will avoid suggesting this approach for similar errors.`);
    },
  );

  // === Code Brain Tools ===

  server.tool(
    'brain_find_reusable_code',
    'Search for reusable code modules from other projects. Use when starting new functionality.',
    {
      purpose: z.string().describe('What the code should do (e.g., "retry with backoff", "JWT authentication")'),
      language: z.string().optional().describe('Programming language'),
    },
    async (params) => {
      const results: AnyResult = await call('code.find', {
        query: params.purpose,
        language: params.language,
      });
      if (!results?.length) return textResult('No reusable code modules found.');
      const lines = results.map((m: AnyResult) =>
        `#${m.id} [${m.language}] ${m.name} — ${m.description ?? 'no description'} (reusability: ${m.reusabilityScore ?? '?'})`
      );
      return textResult(`Found ${results.length} modules:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_register_code',
    'Register a code module as reusable. Brain will analyze it and make it available to other projects.',
    {
      source_code: z.string().describe('The source code'),
      file_path: z.string().describe('File path relative to project root'),
      project: z.string().optional().describe('Project name'),
      name: z.string().optional().describe('Module name (optional - Brain auto-detects)'),
      language: z.string().optional().describe('Programming language'),
      description: z.string().optional().describe('What this code does'),
    },
    async (params) => {
      const result: AnyResult = await call('code.analyze', {
        project: params.project ?? 'default',
        name: params.name ?? params.file_path.split('/').pop() ?? 'unknown',
        filePath: params.file_path,
        language: params.language ?? detectLanguage(params.file_path),
        source: params.source_code,
        description: params.description,
      });
      return textResult(`Module #${result.moduleId} registered (${result.isNew ? 'new' : 'updated'}). Reusability score: ${result.reusabilityScore}.`);
    },
  );

  server.tool(
    'brain_check_code_similarity',
    'Check if similar code already exists in other projects before writing new code.',
    {
      source_code: z.string().describe('The code to check'),
      language: z.string().optional().describe('Programming language'),
      file_path: z.string().optional().describe('File path for context'),
    },
    async (params) => {
      const results: AnyResult = await call('code.similarity', {
        source: params.source_code,
        language: params.language ?? detectLanguage(params.file_path ?? ''),
      });
      if (!results?.length) return textResult('No similar code found. This appears to be unique.');
      const lines = results.map((m: AnyResult) =>
        `Module #${m.moduleId}: ${Math.round(m.score * 100)}% match (${m.matchType})`
      );
      return textResult(`Found ${results.length} similar modules:\n${lines.join('\n')}`);
    },
  );

  // === Synapse Network Tools ===

  server.tool(
    'brain_explore',
    'Explore what Brain knows about a topic. Uses spreading activation through the synapse network.',
    {
      node_type: z.string().describe('Type: error, solution, code_module, project'),
      node_id: z.number().describe('ID of the node to explore from'),
      max_depth: z.number().optional().describe('How many hops to follow (default: 3)'),
    },
    async (params) => {
      const context: AnyResult = await call('synapse.context', {
        errorId: params.node_id,
      });
      const sections: string[] = [];
      if (context.solutions?.length) sections.push(`Solutions: ${context.solutions.length} found`);
      if (context.relatedErrors?.length) sections.push(`Related errors: ${context.relatedErrors.length}`);
      if (context.relevantModules?.length) sections.push(`Relevant modules: ${context.relevantModules.length}`);
      if (context.preventionRules?.length) sections.push(`Prevention rules: ${context.preventionRules.length}`);
      if (context.insights?.length) sections.push(`Insights: ${context.insights.length}`);
      return textResult(sections.length ? sections.join('\n') : 'No connections found for this node.');
    },
  );

  server.tool(
    'brain_connections',
    'Find how two things are connected in Brain (e.g., how an error relates to a code module).',
    {
      from_type: z.string().describe('Source type: error, solution, code_module, project'),
      from_id: z.number().describe('Source ID'),
      to_type: z.string().describe('Target type'),
      to_id: z.number().describe('Target ID'),
    },
    async (params) => {
      const path: AnyResult = await call('synapse.path', params);
      if (!path) return textResult('No connection found between these nodes.');
      return textResult(path);
    },
  );

  // === Research Brain Tools ===

  server.tool(
    'brain_insights',
    'Get research insights: trends, gaps, synergies, template candidates, and project suggestions.',
    {
      type: z.string().optional().describe('Filter by type: trend, pattern, gap, synergy, optimization, template_candidate, project_suggestion, warning'),
      priority: z.string().optional().describe('Minimum priority: low, medium, high, critical'),
    },
    async (params) => {
      const insights: AnyResult = await call('research.insights', {
        type: params.type,
        activeOnly: true,
        limit: 20,
      });
      if (!insights?.length) return textResult('No active insights.');
      const lines = insights.map((i: AnyResult) =>
        `[${i.type}] ${i.title}: ${i.description?.slice(0, 150)}`
      );
      return textResult(`${insights.length} insights:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_rate_insight',
    'Rate an insight as useful or not useful. Helps Brain learn what insights matter.',
    {
      insight_id: z.number().describe('The insight ID to rate'),
      rating: z.number().describe('Rating: 1 (useful), 0 (neutral), -1 (not useful)'),
      comment: z.string().optional().describe('Optional feedback comment'),
    },
    async (params) => {
      const success: AnyResult = await call('insight.rate', {
        id: params.insight_id,
        rating: params.rating,
        comment: params.comment,
      });
      return textResult(success ? `Insight #${params.insight_id} rated.` : `Insight #${params.insight_id} not found.`);
    },
  );

  server.tool(
    'brain_suggest',
    'Ask Brain for suggestions: what to build next, what to improve, what patterns to extract.',
    {
      context: z.string().describe('Current context or question'),
    },
    async (params) => {
      const suggestions: AnyResult = await call('research.suggest', {
        context: params.context,
      });
      return textResult(suggestions);
    },
  );

  // === Status & Notifications ===

  server.tool(
    'brain_status',
    'Get current Brain status: errors, solutions, code modules, synapse network, insights.',
    {},
    async () => {
      const summary: AnyResult = await call('analytics.summary', {});
      const network: AnyResult = await call('synapse.stats', {});
      const lines = [
        `Errors: ${summary.errors?.total ?? 0} total, ${summary.errors?.unresolved ?? 0} unresolved`,
        `Solutions: ${summary.solutions?.total ?? 0}`,
        `Rules: ${summary.rules?.active ?? 0} active`,
        `Code modules: ${summary.modules?.total ?? 0}`,
        `Insights: ${summary.insights?.active ?? 0} active`,
        `Synapses: ${network.totalSynapses ?? 0} connections`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_notifications',
    'Get pending notifications (new solutions, recurring errors, research insights).',
    {},
    async () => {
      const notifications: AnyResult = await call('notification.list', {});
      if (!notifications?.length) return textResult('No pending notifications.');
      const lines = notifications.map((n: AnyResult) =>
        `[${n.type}] ${n.title}: ${n.message?.slice(0, 120)}`
      );
      return textResult(`${notifications.length} notifications:\n${lines.join('\n')}`);
    },
  );

  // === Memory Tools ===

  server.tool(
    'brain_remember',
    'Store a memory. Use for user preferences, decisions, context, facts, goals, or lessons. Key-based memories auto-supersede old values.',
    {
      content: z.string().describe('The memory content'),
      category: z.enum(['preference', 'decision', 'context', 'fact', 'goal', 'lesson']).describe('Memory category'),
      key: z.string().optional().describe('Unique key for upsert, e.g. "preferred_test_framework"'),
      importance: z.number().min(1).max(10).optional().describe('1-10, default 5'),
      tags: z.array(z.string()).optional().describe('Tags for organization'),
      project: z.string().optional().describe('Project name'),
    },
    async (params) => {
      const result: AnyResult = await call('memory.remember', {
        content: params.content,
        category: params.category,
        key: params.key,
        importance: params.importance ?? 5,
        tags: params.tags,
        project: params.project,
      });
      let response = `Memory #${result.memoryId} stored (${params.category}).`;
      if (result.superseded) {
        response += ` Superseded old memory #${result.superseded}.`;
      }
      return textResult(response);
    },
  );

  server.tool(
    'brain_recall',
    'Search memories. Use to recall preferences, past decisions, goals, lessons, or any stored context.',
    {
      query: z.string().describe('Natural language search'),
      category: z.enum(['preference', 'decision', 'context', 'fact', 'goal', 'lesson']).optional(),
      project: z.string().optional().describe('Project name'),
      limit: z.number().optional().describe('Max results, default 10'),
    },
    async (params) => {
      const results: AnyResult = await call('memory.recall', {
        query: params.query,
        category: params.category,
        limit: params.limit ?? 10,
      });
      if (!results?.length) return textResult('No matching memories found.');
      const lines = results.map((m: AnyResult) =>
        `#${m.id} [${m.category}]${m.key ? ` (${m.key})` : ''} ${m.content.slice(0, 150)}${m.importance > 5 ? ` (importance: ${m.importance})` : ''}`
      );
      return textResult(`Found ${results.length} memories:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_session_start',
    'Start a Brain session to track what happens in this conversation.',
    {
      goals: z.array(z.string()).optional().describe('Session goals'),
      project: z.string().optional().describe('Project name'),
    },
    async (params) => {
      const result: AnyResult = await call('session.start', {
        goals: params.goals,
        project: params.project,
      });
      return textResult(`Session #${result.sessionId} started (${result.dbSessionId}).`);
    },
  );

  server.tool(
    'brain_session_end',
    'End the current session with a summary of what was accomplished.',
    {
      session_id: z.number().describe('The session ID to end'),
      summary: z.string().describe('Summary of what was accomplished'),
      outcome: z.enum(['completed', 'paused', 'abandoned']).optional(),
    },
    async (params) => {
      await call('session.end', {
        sessionId: params.session_id,
        summary: params.summary,
        outcome: params.outcome ?? 'completed',
      });
      return textResult(`Session #${params.session_id} ended (${params.outcome ?? 'completed'}).`);
    },
  );

  server.tool(
    'brain_session_history',
    'Recall past sessions. Use when user asks "what was I working on?"',
    {
      project: z.string().optional().describe('Project name'),
      limit: z.number().optional().describe('Max results, default 10'),
    },
    async (params) => {
      const results: AnyResult = await call('session.history', {
        limit: params.limit ?? 10,
      });
      if (!results?.length) return textResult('No sessions found.');
      const lines = results.map((s: AnyResult) => {
        const goals = s.goals ? JSON.parse(s.goals) : [];
        return `#${s.id} [${s.outcome ?? 'active'}] ${s.started_at}${goals.length ? ` — Goals: ${goals.join(', ')}` : ''}${s.summary ? `\n  Summary: ${s.summary.slice(0, 150)}` : ''}`;
      });
      return textResult(`${results.length} sessions:\n${lines.join('\n')}`);
    },
  );

  // === Decision & Changelog Tools ===

  server.tool(
    'brain_record_decision',
    'Record an architecture/design decision with alternatives and rationale.',
    {
      title: z.string().describe('Decision title, e.g. "Use Vitest over Jest"'),
      description: z.string().describe('Full description and rationale'),
      alternatives: z.array(z.object({
        option: z.string(),
        pros: z.array(z.string()).optional(),
        cons: z.array(z.string()).optional(),
        rejected_reason: z.string().optional(),
      })).optional().describe('Alternatives considered'),
      category: z.enum(['architecture', 'technology', 'pattern', 'convention', 'dependency', 'process', 'other']).optional(),
      tags: z.array(z.string()).optional(),
      project: z.string().optional(),
    },
    async (params) => {
      const result: AnyResult = await call('decision.record', {
        title: params.title,
        description: params.description,
        alternatives: params.alternatives,
        category: params.category ?? 'architecture',
        tags: params.tags,
        project: params.project,
      });
      return textResult(`Decision #${result.decisionId} recorded: ${params.title}`);
    },
  );

  server.tool(
    'brain_query_decisions',
    'Search past decisions. Use when asked "why did we choose X?" or "what was decided about Y?"',
    {
      query: z.string().optional().describe('Natural language search'),
      category: z.enum(['architecture', 'technology', 'pattern', 'convention', 'dependency', 'process', 'other']).optional(),
      project: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => {
      const results: AnyResult = await call('decision.query', {
        query: params.query,
        category: params.category,
        limit: params.limit ?? 10,
      });
      if (!results?.length) return textResult('No matching decisions found.');
      const lines = results.map((d: AnyResult) =>
        `#${d.id} [${d.category}] ${d.title}: ${d.description.slice(0, 150)}`
      );
      return textResult(`Found ${results.length} decisions:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_record_change',
    'Record a semantic file change (what changed and why).',
    {
      file_path: z.string().describe('File path that changed'),
      change_type: z.enum(['created', 'modified', 'deleted', 'renamed', 'refactored']).describe('Type of change'),
      summary: z.string().describe('What changed'),
      reason: z.string().optional().describe('Why it changed'),
      diff_snippet: z.string().optional().describe('Key part of the diff'),
      related_error_id: z.number().optional().describe('Error this change fixes'),
      related_decision_id: z.number().optional().describe('Decision this implements'),
      commit_hash: z.string().optional(),
      project: z.string().optional(),
    },
    async (params) => {
      const result: AnyResult = await call('changelog.record', {
        filePath: params.file_path,
        changeType: params.change_type,
        summary: params.summary,
        reason: params.reason,
        diffSnippet: params.diff_snippet,
        relatedErrorId: params.related_error_id,
        relatedDecisionId: params.related_decision_id,
        commitHash: params.commit_hash,
        project: params.project,
      });
      return textResult(`Change #${result.changeId} recorded: ${params.change_type} ${params.file_path}`);
    },
  );

  server.tool(
    'brain_query_changes',
    'Search semantic changelog. Use for "what changed in file X?" or "what did we change recently?"',
    {
      query: z.string().optional().describe('Natural language search'),
      file_path: z.string().optional().describe('Filter by file path'),
      project: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => {
      const results: AnyResult = await call('changelog.query', {
        query: params.query,
        filePath: params.file_path,
        limit: params.limit ?? 20,
      });
      if (!results?.length) return textResult('No matching changes found.');
      const lines = results.map((c: AnyResult) =>
        `#${c.id} [${c.change_type}] ${c.file_path}: ${c.summary.slice(0, 120)}`
      );
      return textResult(`Found ${results.length} changes:\n${lines.join('\n')}`);
    },
  );

  // === Task/Goal Tracking Tools ===

  server.tool(
    'brain_add_task',
    'Add a task or goal. Use for tracking work items, todos, and objectives.',
    {
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Detailed description'),
      priority: z.number().min(1).max(10).optional().describe('1-10, default 5'),
      due_date: z.string().optional().describe('Due date (ISO format)'),
      tags: z.array(z.string()).optional(),
      parent_task_id: z.number().optional().describe('Parent task ID for subtasks'),
      blocked_by: z.array(z.number()).optional().describe('Task IDs that block this one'),
      project: z.string().optional(),
    },
    async (params) => {
      const result: AnyResult = await call('task.add', {
        title: params.title,
        description: params.description,
        priority: params.priority ?? 5,
        dueDate: params.due_date,
        tags: params.tags,
        parentTaskId: params.parent_task_id,
        blockedBy: params.blocked_by,
        project: params.project,
      });
      return textResult(`Task #${result.taskId} created: ${params.title}`);
    },
  );

  server.tool(
    'brain_update_task',
    'Update a task: change status, add notes, set priority.',
    {
      id: z.number().describe('Task ID'),
      status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled']).optional(),
      note: z.string().optional().describe('Add a note to the task'),
      priority: z.number().min(1).max(10).optional(),
      title: z.string().optional(),
    },
    async (params) => {
      const result: AnyResult = await call('task.update', {
        id: params.id,
        status: params.status,
        note: params.note,
        priority: params.priority,
        title: params.title,
      });
      if (!result) return textResult(`Task #${params.id} not found.`);
      return textResult(`Task #${params.id} updated: ${result.title} [${result.status}]`);
    },
  );

  server.tool(
    'brain_list_tasks',
    'List tasks. Filter by status, project, or parent task.',
    {
      status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled']).optional(),
      project: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => {
      const results: AnyResult = await call('task.list', {
        status: params.status,
        limit: params.limit ?? 20,
      });
      if (!results?.length) return textResult('No tasks found.');
      const lines = results.map((t: AnyResult) =>
        `#${t.id} [${t.status}] P${t.priority} ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}`
      );
      return textResult(`${results.length} tasks:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_task_context',
    'Get full context for a task: related memories, decisions, and changes.',
    {
      id: z.number().describe('Task ID'),
    },
    async (params) => {
      const result: AnyResult = await call('task.context', { id: params.id });
      if (!result?.task) return textResult(`Task #${params.id} not found.`);
      const sections = [
        `Task: ${result.task.title} [${result.task.status}]`,
        result.task.description ? `Description: ${result.task.description}` : null,
        result.subtasks?.length ? `Subtasks: ${result.subtasks.length}` : null,
        result.memories?.length ? `Related memories: ${result.memories.length}` : null,
        result.decisions?.length ? `Related decisions: ${result.decisions.length}` : null,
        result.changes?.length ? `Related changes: ${result.changes.length}` : null,
      ].filter(Boolean);
      return textResult(sections.join('\n'));
    },
  );

  // === Project Documentation Tools ===

  server.tool(
    'brain_index_project',
    'Scan and index project documentation (README, CLAUDE.md, package.json, tsconfig.json).',
    {
      project_path: z.string().describe('Absolute path to project root'),
      project: z.string().optional().describe('Project name'),
    },
    async (params) => {
      const result: AnyResult = await call('doc.index', {
        projectPath: params.project_path,
        project: params.project,
      });
      return textResult(`Indexed: ${result.indexed} new, ${result.updated} updated docs for project #${result.projectId}.`);
    },
  );

  server.tool(
    'brain_query_docs',
    'Search indexed project documentation.',
    {
      query: z.string().describe('Search query'),
      project: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => {
      const results: AnyResult = await call('doc.query', {
        query: params.query,
        limit: params.limit ?? 10,
      });
      if (!results?.length) return textResult('No matching docs found.');
      const lines = results.map((d: AnyResult) =>
        `[${d.doc_type}] ${d.file_path} (project #${d.project_id}): ${d.content.slice(0, 100)}...`
      );
      return textResult(`Found ${results.length} docs:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'brain_project_context',
    'Get full project context: docs, active tasks, recent decisions, and changes.',
    {
      project_id: z.number().describe('Project ID'),
    },
    async (params) => {
      const result: AnyResult = await call('doc.projectContext', {
        projectId: params.project_id,
      });
      const sections = [
        `Docs: ${result.docs?.length ?? 0} indexed`,
        `Active tasks: ${result.activeTasks?.length ?? 0}`,
        `Recent decisions: ${result.recentDecisions?.length ?? 0}`,
        `Recent changes: ${result.recentChanges?.length ?? 0}`,
      ];
      return textResult(sections.join('\n'));
    },
  );

  // === Learning Explainability Tools ===

  server.tool(
    'brain_explain_learning',
    'Show what Brain has learned — active rules with confidence scores, the errors that generated them, and their success rates.',
    {
      rule_id: z.number().optional().describe('Specific rule ID to explain in detail. Omit to see all active rules.'),
    },
    async (params) => {
      if (params.rule_id) {
        const result: AnyResult = await call('rule.explain', { ruleId: params.rule_id });
        const r = result.rule;
        const lines = [
          `Rule #${r.id}`,
          `  Pattern:     ${r.pattern}`,
          `  Action:      ${r.action}`,
          `  Confidence:  ${(r.confidence * 100).toFixed(0)}%`,
          `  Occurrences: ${r.occurrences}`,
          `  Description: ${r.description ?? 'none'}`,
          `  Created:     ${r.created_at}`,
          '',
        ];
        if (result.connections?.length) {
          lines.push(`Synapse Connections (${result.connections.length}):`);
          for (const c of result.connections) {
            lines.push(`  ${c.node.type}:${c.node.id} (activation: ${c.activation.toFixed(3)}, depth: ${c.depth})`);
          }
        } else {
          lines.push('No synapse connections found.');
        }
        return textResult(lines.join('\n'));
      } else {
        const rules: AnyResult = await call('rule.list', {});
        if (!rules?.length) return textResult('No active rules. Run "brain learn" to trigger a learning cycle.');
        const lines = rules.map((r: AnyResult) => {
          const conf = (r.confidence * 100).toFixed(0);
          return `#${r.id} [${conf}%] ${r.pattern} → ${r.action} (seen ${r.occurrences}x)${r.description ? ` — ${r.description}` : ''}`;
        });
        return textResult(`${rules.length} active rules:\n${lines.join('\n')}`);
      }
    },
  );

  server.tool(
    'brain_override_rule',
    'Override a learned rule — boost its confidence, suppress it, or delete it entirely. Provide a reason for the override.',
    {
      rule_id: z.number().describe('The rule ID to override'),
      action: z.enum(['boost', 'suppress', 'delete']).describe('boost: increase confidence, suppress: decrease confidence, delete: deactivate rule'),
      reason: z.string().optional().describe('Why this rule is being overridden'),
    },
    async (params) => {
      await call('rule.override', { ruleId: params.rule_id, action: params.action, reason: params.reason });
      return textResult(`Rule #${params.rule_id} ${params.action}ed. ${params.reason || ''}`);
    },
  );

  // === Cross-Brain Ecosystem Tools ===

  server.tool(
    'brain_ecosystem_status',
    'Get status of all brains in the ecosystem (brain, trading-brain, marketing-brain).',
    {},
    async () => {
      const result: AnyResult = await call('ecosystem.status', {});
      if (!result?.peers?.length) return textResult('No peer brains are currently running.');
      const lines = result.peers.map((p: AnyResult) =>
        `${p.name}: v${p.result?.version ?? '?'} (PID ${p.result?.pid ?? '?'}, uptime ${p.result?.uptime ?? '?'}s, ${p.result?.methods ?? '?'} methods)`
      );
      return textResult(`Ecosystem status:\n- brain (self): running\n${lines.map((l: string) => `- ${l}`).join('\n')}`);
    },
  );

  server.tool(
    'brain_query_peer',
    'Query another brain in the ecosystem. Call any method on trading-brain or marketing-brain.',
    {
      peer: z.string().describe('Peer brain name: trading-brain or marketing-brain'),
      method: z.string().describe('IPC method to call (e.g. analytics.summary, trade.recent)'),
      args: z.record(z.string(), z.unknown()).optional().describe('Method arguments as key-value pairs'),
    },
    async (params) => {
      const result = await call('ecosystem.queryPeer', {
        peer: params.peer,
        method: params.method,
        args: params.args ?? {},
      });
      return textResult(result);
    },
  );

  server.tool(
    'brain_error_trading_context',
    'Correlate an error with trading outcomes. Asks trading-brain for recent trades around the time of an error.',
    {
      error_id: z.number().describe('The error ID to correlate'),
      pair: z.string().optional().describe('Trading pair to filter (e.g. BTC/USDT)'),
    },
    async (params) => {
      const error: AnyResult = await call('error.get', { id: params.error_id });
      if (!error) return textResult(`Error #${params.error_id} not found.`);
      const trades: AnyResult = await call('ecosystem.queryPeer', {
        peer: 'trading-brain',
        method: params.pair ? 'trade.byPair' : 'trade.recent',
        args: params.pair ? { pair: params.pair } : { limit: 10 },
      });
      if (!trades) return textResult('Trading brain not available.');
      return textResult({ error: { id: error.id, type: error.errorType, message: error.message }, recentTrades: trades });
    },
  );
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    rb: 'ruby', sh: 'shell', bash: 'shell',
  };
  return map[ext] ?? ext;
}
