import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, keyValue, divider } from '../colors.js';

export function intelligenceCommand(): Command {
  const cmd = new Command('intelligence')
    .description('Intelligence modules — RAG, Knowledge Graph, Feedback, Tools, User Model')
    .aliases(['intel', 'int']);

  // Default action: overview of all intelligence modules
  cmd.action(async () => {
    await withIpc(async (client) => {
      console.log(header('Intelligence Overview', '💡'));

      // RAG
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rag: any = await client.request('rag.status', {});
        console.log(`\n  ${c.cyan.bold('RAG Pipeline')}`);
        console.log(keyValue('  Total Vectors', String(rag.totalVectors?.toLocaleString() ?? 0)));
        if (rag.collections?.length) {
          for (const col of rag.collections) {
            console.log(`    ${c.dim('•')} ${col.collection}: ${c.green(String(col.count?.toLocaleString() ?? 0))}`);
          }
        }
        console.log(keyValue('  Last Indexed', rag.lastIndexedAt || 'never'));
      } catch { console.log(`  ${c.dim('RAG: not available')}`); }

      // Knowledge Graph
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kg: any = await client.request('kg.status', {});
        console.log(`\n  ${c.cyan.bold('Knowledge Graph')}`);
        console.log(keyValue('  Total Facts', String(kg.totalFacts?.toLocaleString() ?? 0)));
        console.log(keyValue('  Avg Confidence', `${((kg.avgConfidence ?? 0) * 100).toFixed(0)}%`));
        if (kg.predicateDistribution) {
          const preds = Object.entries(kg.predicateDistribution)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 5);
          for (const [pred, count] of preds) {
            console.log(`    ${c.dim('•')} ${pred}: ${c.green(String(count))}`);
          }
        }
      } catch { console.log(`  ${c.dim('KG: not available')}`); }

      // Feedback
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fb: any = await client.request('feedback.stats', {});
        console.log(`\n  ${c.cyan.bold('Feedback')}`);
        console.log(keyValue('  Total', String(fb.totalFeedback ?? 0)));
        console.log(`    ${c.green('+')} ${fb.positiveCount ?? 0}  ${c.red('−')} ${fb.negativeCount ?? 0}  ${c.orange('↻')} ${fb.correctionCount ?? 0}`);
        const reward = fb.avgRewardScore ?? 0;
        const color = reward > 0 ? c.green : reward < 0 ? c.red : c.dim;
        console.log(keyValue('  Avg Reward', color(reward.toFixed(2))));
      } catch { console.log(`  ${c.dim('Feedback: not available')}`); }

      // Tool Learning
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools = await client.request('toolLearning.stats', {}) as any[];
        if (Array.isArray(tools) && tools.length > 0) {
          console.log(`\n  ${c.cyan.bold('Tool Learning')} ${c.dim(`(${tools.length} tools tracked)`)}`);
          const top = tools.slice(0, 8);
          for (const t of top) {
            const rate = ((t.successRate ?? 0) * 100).toFixed(0);
            const rateColor = t.successRate >= 0.9 ? c.green : t.successRate >= 0.7 ? c.orange : c.red;
            console.log(`    ${c.dim('•')} ${t.tool}: ${t.totalUses}× ${rateColor(`${rate}%`)} ${c.dim(`(${Math.round(t.avgDuration ?? 0)}ms avg)`)}`);
          }
        }
      } catch { console.log(`  ${c.dim('Tool Learning: not available')}`); }

      // User Model
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const um: any = await client.request('userModel.status', {});
        console.log(`\n  ${c.cyan.bold('User Model')}`);
        console.log(keyValue('  Skill Domains', String(um.domains ?? 0)));
        console.log(keyValue('  Profile Keys', String(um.totalKeys ?? 0)));
        console.log(keyValue('  Last Updated', um.lastUpdated || 'never'));
      } catch { console.log(`  ${c.dim('User Model: not available')}`); }

      // Proactive
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pr: any = await client.request('proactive.status', {});
        console.log(`\n  ${c.cyan.bold('Proactive Suggestions')}`);
        console.log(keyValue('  Active', String(pr.activeSuggestions ?? 0)));
        console.log(keyValue('  Dismissed', String(pr.dismissedCount ?? 0)));
        console.log(keyValue('  Total', String(pr.totalSuggestions ?? 0)));
      } catch { console.log(`  ${c.dim('Proactive: not available')}`); }

      // RepoAbsorber
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ra: any = await client.request('repoAbsorber.status', {});
        console.log(`\n  ${c.cyan.bold('Code Assimilation')}`);
        console.log(keyValue('  Repos Absorbed', String(ra.totalAbsorbed ?? 0)));
        console.log(keyValue('  Queue', String(ra.queueSize ?? 0)));
        console.log(keyValue('  Last', ra.lastAbsorbed || 'none'));
      } catch { console.log(`  ${c.dim('RepoAbsorber: not available')}`); }

      console.log(divider());
    });
  });

  // Subcommand: rag search
  cmd.command('rag')
    .description('Search RAG vectors')
    .argument('<query>', 'Search query')
    .option('-c, --collection <col>', 'Filter by collection')
    .option('-l, --limit <n>', 'Max results', '5')
    .action(async (query: string, opts: { collection?: string; limit: string }) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any = await client.request('rag.search', {
          query,
          collections: opts.collection ? [opts.collection] : undefined,
          limit: parseInt(opts.limit, 10),
        });
        console.log(header(`RAG Search: "${query}"`, '🔍'));
        const items = results.results || results || [];
        if (!items.length) {
          console.log(`  ${c.dim('No results')}`);
        } else {
          for (const r of items) {
            const score = r.score?.toFixed(3) ?? '?';
            console.log(`\n  ${c.cyan(`[${r.collection}]`)} ${c.green(score)} ${c.dim(`#${r.sourceId}`)}`);
            const text = (r.text || '').slice(0, 200);
            console.log(`  ${text}${r.text?.length > 200 ? '...' : ''}`);
          }
        }
        console.log(divider());
      });
    });

  // Subcommand: knowledge graph query
  cmd.command('knowledge')
    .description('Query knowledge graph facts')
    .option('-s, --subject <s>', 'Filter by subject')
    .option('-p, --predicate <p>', 'Filter by predicate')
    .option('-o, --object <o>', 'Filter by object')
    .action(async (opts: { subject?: string; predicate?: string; object?: string }) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const facts = await client.request('kg.query', {
          subject: opts.subject,
          predicate: opts.predicate,
          object: opts.object,
        }) as any[];
        console.log(header('Knowledge Graph', '🕸️'));
        if (!facts.length) {
          console.log(`  ${c.dim('No matching facts')}`);
        } else {
          for (const f of facts.slice(0, 20)) {
            const conf = ((f.confidence ?? 0) * 100).toFixed(0);
            console.log(`  ${c.cyan(f.subject)} ${c.orange(`→ ${f.predicate} →`)} ${c.green(f.object)} ${c.dim(`(${conf}%)`)}`);
          }
          if (facts.length > 20) console.log(`  ${c.dim(`... and ${facts.length - 20} more`)}`);
        }
        console.log(divider());
      });
    });

  // Subcommand: absorb
  cmd.command('absorb')
    .description('Absorb next repo from queue')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const candidate: any = await client.request('repoAbsorber.candidate', {});
        if (!candidate) {
          console.log(`  ${c.dim('No repos in queue to absorb')}`);
          return;
        }
        console.log(`  ${c.cyan('Absorbing:')} ${candidate.name} ${c.dim(`(${candidate.source})`)}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('repoAbsorber.absorb', {});
        if (result) {
          console.log(header(`Absorbed: ${result.repo}`, '🧬'));
          console.log(keyValue('Files Scanned', String(result.filesScanned)));
          console.log(keyValue('Patterns Found', String(result.patternsFound)));
          console.log(keyValue('Facts Extracted', String(result.factsExtracted)));
          console.log(keyValue('RAG Vectors', String(result.ragVectorsAdded)));
          console.log(keyValue('Duration', `${(result.durationMs / 1000).toFixed(1)}s`));
        }
        console.log(divider());
      });
    });

  // Subcommand: llm
  cmd.command('llm')
    .description('LLM provider status and usage')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats: any = await client.request('llm.status', {});
        console.log(header('LLM Service', '🤖'));
        if (!stats) {
          console.log(`  ${c.dim('LLM Service not available')}`);
        } else {
          if (stats.providers) {
            for (const p of stats.providers) {
              const status = p.available ? c.green('●') : c.red('●');
              console.log(`  ${status} ${c.cyan(p.name)} ${c.dim(`(${p.type})`)}`);
              if (p.usage) {
                console.log(`    Calls: ${p.usage.totalCalls ?? 0}  Tokens: ${(p.usage.totalTokens ?? 0).toLocaleString()}  Cache: ${p.usage.cacheHits ?? 0} hits`);
              }
            }
          }
          if (stats.rateLimits) {
            console.log(`\n  ${c.cyan.bold('Rate Limits')}`);
            console.log(`    Calls/h: ${stats.rateLimits.callsThisHour ?? 0}/${stats.rateLimits.maxCallsPerHour ?? '∞'}`);
            console.log(`    Tokens/h: ${(stats.rateLimits.tokensThisHour ?? 0).toLocaleString()}/${(stats.rateLimits.maxTokensPerHour ?? 0).toLocaleString()}`);
          }
        }
        console.log(divider());
      });
    });

  return cmd;
}
