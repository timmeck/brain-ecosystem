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

export function registerDebateTools(server: McpServer, ipc: IpcClient): void {
  registerDebateToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerDebateToolsDirect(server: McpServer, router: IpcRouter): void {
  registerDebateToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerDebateToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_debate_start',
    'Start a multi-perspective debate on a question. Brain generates its perspective from principles, hypotheses, journal, anomalies, and predictions.',
    { question: z.string().describe('The question to debate') },
    async (params) => {
      const debate: AnyResult = await call('debate.start', { question: params.question });
      const lines = [
        `# Debate #${debate.id}: ${debate.question}`,
        `Status: ${debate.status}`,
        '',
        '## Perspectives:',
      ];
      for (const p of debate.perspectives || []) {
        lines.push(`### ${p.brainName} (confidence: ${(p.confidence * 100).toFixed(0)}%)`);
        lines.push(p.position);
        if (p.arguments?.length > 0) {
          lines.push('**Arguments:**');
          for (const a of p.arguments.slice(0, 5)) {
            lines.push(`- [${a.source}] ${a.claim} (strength: ${(a.strength * 100).toFixed(0)}%)`);
          }
        }
        lines.push('');
      }
      lines.push(`*Add more perspectives from other brains, then call brain_debate_synthesize with debateId=${debate.id}*`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_debate_synthesize',
    'Synthesize a debate: compare all perspectives, detect conflicts, build weighted consensus, generate recommendations.',
    { debateId: z.number().describe('ID of the debate to synthesize') },
    async (params) => {
      const synthesis: AnyResult = await call('debate.synthesize', { debateId: params.debateId });
      if (!synthesis) return textResult('Debate not found or has no perspectives.');
      const lines = [
        '# Debate Synthesis',
        '',
        `**Participants:** ${synthesis.participantCount}`,
        `**Confidence:** ${(synthesis.confidence * 100).toFixed(0)}%`,
        '',
      ];
      if (synthesis.consensus) {
        lines.push('## Consensus');
        lines.push(synthesis.consensus);
        lines.push('');
      }
      if (synthesis.conflicts?.length > 0) {
        lines.push(`## Conflicts (${synthesis.conflicts.length})`);
        for (const c of synthesis.conflicts) {
          lines.push(`- **${c.perspectiveA}** vs **${c.perspectiveB}**: ${c.resolution}`);
          lines.push(`  A: ${c.claimA}`);
          lines.push(`  B: ${c.claimB}`);
          lines.push(`  → ${c.reason}`);
        }
        lines.push('');
      }
      lines.push('## Resolution');
      lines.push(synthesis.resolution);
      if (synthesis.recommendations?.length > 0) {
        lines.push('', '## Recommendations');
        for (const r of synthesis.recommendations) lines.push(`- ${r}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_debate_perspective',
    'Generate Brain\'s perspective on a question without starting a full debate. Useful for cross-brain debates.',
    { question: z.string().describe('The question to form a perspective on') },
    async (params) => {
      const p: AnyResult = await call('debate.perspective', { question: params.question });
      const lines = [
        `# ${p.brainName}'s Perspective`,
        `Confidence: ${(p.confidence * 100).toFixed(0)}% | Relevance: ${(p.relevance * 100).toFixed(0)}%`,
        '',
        `**Position:** ${p.position}`,
        '',
        '## Arguments:',
      ];
      for (const a of p.arguments || []) {
        lines.push(`- [${a.source}] ${a.claim} (strength: ${(a.strength * 100).toFixed(0)}%)`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_debate_history',
    'View past debates with their questions, perspectives, synthesis, and conflicts.',
    { limit: z.number().optional().describe('Max debates to show (default: 10)') },
    async (params) => {
      const debates: AnyResult[] = await call('debate.list', { limit: params.limit ?? 10 }) as AnyResult[];
      if (!debates?.length) return textResult('No debates yet. Start one with brain_debate_start.');
      const lines = [`# Debate History: ${debates.length} debates\n`];
      for (const d of debates) {
        lines.push(`## #${d.id}: ${d.question}`);
        lines.push(`Status: ${d.status} | Perspectives: ${d.perspectives?.length ?? 0} | ${d.created_at}`);
        if (d.synthesis) {
          lines.push(`Confidence: ${(d.synthesis.confidence * 100).toFixed(0)}% | Conflicts: ${d.synthesis.conflicts?.length ?? 0}`);
          if (d.synthesis.consensus) lines.push(`Consensus: ${d.synthesis.consensus.substring(0, 150)}...`);
        }
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  // ── Advocatus Diaboli: Principle Challenges ──────────

  server.tool(
    'brain_challenge_principle',
    'Challenge a principle by searching for contradicting evidence (Advocatus Diaboli). Returns resilience score and outcome (survived/weakened/disproved).',
    { statement: z.string().describe('The principle statement to challenge') },
    async (params) => {
      const c: AnyResult = await call('challenge.principle', { statement: params.statement });
      const lines = [
        `# Principle Challenge`,
        '',
        `**Statement:** ${c.principleStatement}`,
        `**Outcome:** ${c.outcome.toUpperCase()} (resilience: ${(c.resilienceScore * 100).toFixed(0)}%)`,
        '',
      ];
      if (c.supportingEvidence?.length > 0) {
        lines.push(`## Supporting Evidence (${c.supportingEvidence.length})`);
        for (const e of c.supportingEvidence.slice(0, 5)) lines.push(`- ${e}`);
        lines.push('');
      }
      if (c.contradictingEvidence?.length > 0) {
        lines.push(`## Contradicting Evidence (${c.contradictingEvidence.length})`);
        for (const e of c.contradictingEvidence.slice(0, 5)) lines.push(`- ${e}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_challenge_history',
    'View recent principle challenges with their outcomes and resilience scores.',
    { limit: z.number().optional().describe('Max challenges to show (default: 20)') },
    async (params) => {
      const challenges: AnyResult[] = await call('challenge.history', { limit: params.limit ?? 20 }) as AnyResult[];
      if (!challenges?.length) return textResult('No principle challenges yet. Use brain_challenge_principle to test a principle.');
      const lines = [`# Principle Challenges: ${challenges.length} entries\n`];
      for (const c of challenges) {
        const icon = c.outcome === 'survived' ? '\u2705' : c.outcome === 'weakened' ? '\u26A0\uFE0F' : '\u274C';
        lines.push(`${icon} **${c.outcome}** (${(c.resilienceScore * 100).toFixed(0)}%) — ${c.principleStatement.substring(0, 80)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_challenge_vulnerable',
    'Show principles with the lowest resilience scores — the most vulnerable beliefs.',
    { limit: z.number().optional().describe('Max principles to show (default: 5)') },
    async (params) => {
      const vulnerable: AnyResult[] = await call('challenge.vulnerable', { limit: params.limit ?? 5 }) as AnyResult[];
      if (!vulnerable?.length) return textResult('No vulnerable principles found. Run brain_challenge_principle first.');
      const lines = [`# Most Vulnerable Principles\n`];
      for (const c of vulnerable) {
        lines.push(`## ${c.principleStatement}`);
        lines.push(`Resilience: ${(c.resilienceScore * 100).toFixed(0)}% | Outcome: ${c.outcome} | ${c.challengedAt}`);
        lines.push(`Supporting: ${c.supportingEvidence?.length ?? 0} | Contradicting: ${c.contradictingEvidence?.length ?? 0}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );
}
