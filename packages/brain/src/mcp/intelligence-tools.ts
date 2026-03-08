import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';

type BrainCall = (method: string, params?: unknown) => Promise<unknown> | unknown;

function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

/** Register intelligence tools using IPC client (for stdio MCP transport) */
export function registerIntelligenceTools(server: McpServer, ipc: IpcClient): void {
  registerIntelligenceToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register intelligence tools using router directly (for HTTP MCP transport inside daemon) */
export function registerIntelligenceToolsDirect(server: McpServer, router: IpcRouter): void {
  registerIntelligenceToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerIntelligenceToolsWithCaller(server: McpServer, call: BrainCall): void {
  // ── RAG Pipeline ────────────────────────────────────────────
  server.tool(
    'brain_rag_search',
    'Search Brain knowledge base using vector similarity (RAG). Searches across insights, memories, principles, errors, solutions, rules.',
    {
      query: z.string().describe('Search query text'),
      collections: z.array(z.string()).optional().describe('Filter by collections: insights, memories, principles, errors, solutions, rules'),
      limit: z.number().optional().describe('Max results (default: 10)'),
      threshold: z.number().optional().describe('Min similarity 0-1 (default: 0.3)'),
    },
    async (params) => {
      const result = await call('rag.search', params);
      return textResult(result);
    },
  );

  // ── Knowledge Graph ─────────────────────────────────────────
  server.tool(
    'brain_kg_query',
    'Query the Brain knowledge graph for facts (subject-predicate-object triples)',
    {
      subject: z.string().optional().describe('Filter by subject'),
      predicate: z.string().optional().describe('Filter by predicate (e.g., causes, solves, requires)'),
      object: z.string().optional().describe('Filter by object'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const result = await call('kg.query', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_kg_add_fact',
    'Add a fact to the Brain knowledge graph (subject-predicate-object triple)',
    {
      subject: z.string().describe('The subject entity'),
      predicate: z.string().describe('The relationship (e.g., causes, solves, requires, improves, prevents)'),
      object: z.string().describe('The object entity'),
      context: z.string().optional().describe('Context for this fact'),
      confidence: z.number().optional().describe('Confidence 0-1 (default: 0.5)'),
    },
    async (params) => {
      const result = await call('kg.addFact', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_kg_infer',
    'Infer transitive relationships in the knowledge graph (A→B→C)',
    {
      subject: z.string().describe('Starting subject'),
      predicate: z.string().describe('Relationship to trace'),
      maxDepth: z.number().optional().describe('Max inference depth (default: 3)'),
    },
    async (params) => {
      const result = await call('kg.infer', params);
      return textResult(result);
    },
  );

  // ── Semantic Compression ────────────────────────────────────
  server.tool(
    'brain_compress_knowledge',
    'Compress similar knowledge items in a collection into meta-insights',
    {
      collection: z.string().describe('Collection to compress (e.g., insights, memories)'),
      threshold: z.number().optional().describe('Similarity threshold for clustering (default: 0.85)'),
    },
    async (params) => {
      const result = await call('compression.compress', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_compression_stats',
    'Get compression statistics for knowledge base',
    {},
    async () => {
      const result = await call('compression.stats');
      return textResult(result);
    },
  );

  // ── Feedback Learning ───────────────────────────────────────
  server.tool(
    'brain_feedback',
    'Record feedback on a Brain knowledge item (positive, negative, or correction)',
    {
      type: z.string().describe('Target type (e.g., solution, insight, rule)'),
      targetId: z.number().describe('ID of the target item'),
      signal: z.enum(['positive', 'negative', 'correction']).describe('Feedback signal'),
      detail: z.string().optional().describe('Additional detail or correction text'),
    },
    async (params) => {
      const result = await call('feedback.record', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_feedback_stats',
    'Get feedback statistics across all knowledge types',
    {},
    async () => {
      const result = await call('feedback.stats');
      return textResult(result);
    },
  );

  // ── Tool Learning ───────────────────────────────────────────
  server.tool(
    'brain_tool_stats',
    'Get usage statistics for MCP tools (frequency, success rate, avg duration)',
    {
      tool: z.string().optional().describe('Specific tool name (omit for all tools)'),
    },
    async (params) => {
      const result = await call('toolTracker.stats', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_tool_recommend',
    'Get tool recommendations for current context',
    {
      context: z.string().describe('Current context/problem description'),
    },
    async (params) => {
      const result = await call('toolTracker.recommend', params);
      return textResult(result);
    },
  );

  // ── Proactive Suggestions ───────────────────────────────────
  server.tool(
    'brain_suggestions',
    'Get proactive improvement suggestions from Brain analysis',
    {
      limit: z.number().optional().describe('Max suggestions (default: 5)'),
    },
    async (params) => {
      const result = await call('proactive.suggestions', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_dismiss_suggestion',
    'Dismiss a proactive suggestion',
    {
      id: z.number().describe('Suggestion ID to dismiss'),
    },
    async (params) => {
      const result = await call('proactive.dismiss', params);
      return textResult(result);
    },
  );

  // ── User Profile ────────────────────────────────────────────
  server.tool(
    'brain_user_profile',
    'Get the inferred user profile (skill levels, work patterns, preferences)',
    {},
    async () => {
      const result = await call('userModel.profile');
      return textResult(result);
    },
  );

  server.tool(
    'brain_user_strengths',
    'Get user skill strengths and growth areas',
    {},
    async () => {
      const result = await call('userModel.status');
      return textResult(result);
    },
  );

  // ── Code Health ─────────────────────────────────────────────
  server.tool(
    'brain_code_health',
    'Scan a project for code health metrics (complexity, test coverage, tech debt)',
    {
      projectPath: z.string().describe('Path to project root'),
    },
    async (params) => {
      const result = await call('codeHealth.scan', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_code_health_trends',
    'Get code health trend data for a project',
    {
      projectPath: z.string().describe('Path to project root'),
      limit: z.number().optional().describe('Number of scans to compare (default: 10)'),
    },
    async (params) => {
      const result = await call('codeHealth.trends', params);
      return textResult(result);
    },
  );

  // ── Teaching Protocol ───────────────────────────────────────
  server.tool(
    'brain_teach',
    'Teach a lesson to another brain',
    {
      targetBrain: z.string().describe('Target brain name (e.g., trading-brain, marketing-brain)'),
      domain: z.string().describe('Knowledge domain'),
      principle: z.string().describe('The principle/lesson to teach'),
      evidence: z.string().optional().describe('Supporting evidence'),
    },
    async (params) => {
      const result = await call('teaching.teach', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_request_lesson',
    'Request a lesson from another brain',
    {
      fromBrain: z.string().describe('Source brain name'),
      topic: z.string().describe('Topic to learn about'),
    },
    async (params) => {
      const result = await call('teaching.requestLesson', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_curriculum',
    'View the teaching curriculum (strongest teachable principles)',
    {},
    async () => {
      const result = await call('teaching.curriculum');
      return textResult(result);
    },
  );

  // ── Self-Improvement Desires ─────────────────────────────────
  server.tool(
    'brain_desires',
    'Get Brain\'s self-improvement desires and wishes — what Brain wants to learn, fix, or build',
    {},
    async () => {
      const result = await call('desires.structured');
      return textResult(result);
    },
  );

  // ── Consensus Decisions ─────────────────────────────────────
  server.tool(
    'brain_propose_consensus',
    'Propose a decision for multi-brain consensus voting',
    {
      type: z.string().describe('Decision type (e.g., selfmod_approval, strategy_change, parameter_tune)'),
      description: z.string().describe('Description of the decision'),
      options: z.array(z.string()).describe('Available options to vote on'),
      context: z.string().optional().describe('Additional context'),
    },
    async (params) => {
      const result = await call('consensus.propose', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_consensus_history',
    'View consensus voting history',
    {
      status: z.string().optional().describe('Filter by status: open, resolved, timeout'),
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    async (params) => {
      const result = await call('consensus.history', params);
      return textResult(result);
    },
  );

  // ── Active Learning ─────────────────────────────────────────
  server.tool(
    'brain_knowledge_gaps',
    'List identified knowledge gaps with closing strategies',
    {
      limit: z.number().optional().describe('Max gaps (default: 10)'),
    },
    async (params) => {
      const result = await call('activeLearning.gaps', params);
      return textResult(result);
    },
  );

  server.tool(
    'brain_learning_plan',
    'Get the learning plan for a specific knowledge gap',
    {
      gapId: z.number().describe('Gap ID to plan for'),
    },
    async (params) => {
      const result = await call('activeLearning.plan', params);
      return textResult(result);
    },
  );
}
