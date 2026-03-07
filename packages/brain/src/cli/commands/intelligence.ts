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
          if (result.featuresExtracted) console.log(keyValue('Features', String(result.featuresExtracted)));
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

  // Subcommand: features — search/extract/suggest useful features from absorbed repos
  const featuresCmd = cmd.command('features')
    .description('Search and extract useful features from absorbed repos')
    .option('-q, --query <text>', 'Search features by keyword')
    .option('-c, --category <cat>', 'Filter by category (utility_function, design_pattern, error_handling, ...)')
    .option('-r, --repo <repo>', 'Filter by repo name')
    .option('-m, --min <score>', 'Minimum usefulness score (0-1)', '0.4')
    .option('-l, --limit <n>', 'Max results', '15')
    .action(async (opts: { query?: string; category?: string; repo?: string; min: string; limit: string }) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const features = await client.request('features.search', {
          query: opts.query,
          category: opts.category,
          repo: opts.repo,
          minUsefulness: parseFloat(opts.min),
          limit: parseInt(opts.limit, 10),
        }) as any[];
        console.log(header('Extracted Features', '🧬'));
        if (!Array.isArray(features) || !features.length) {
          console.log(`  ${c.dim('No features found. Run "brain intel features extract" first.')}`);
        } else {
          for (const f of features) {
            const score = ((f.usefulness ?? 0) * 100).toFixed(0);
            const scoreColor = f.usefulness >= 0.7 ? c.green : f.usefulness >= 0.5 ? c.orange : c.dim;
            console.log(`\n  ${scoreColor(`${score}%`)} ${c.cyan.bold(f.name)} ${c.dim(`[${f.category}]`)}`);
            console.log(`  ${c.dim(`${f.repo} → ${f.filePath}`)}`);
            if (f.description) console.log(`  ${f.description}`);
            if (f.tags) {
              const tags = typeof f.tags === 'string' ? JSON.parse(f.tags) : f.tags;
              if (Array.isArray(tags) && tags.length) {
                console.log(`  ${tags.map((t: string) => c.blue(`#${t}`)).join(' ')}`);
              }
            }
            // Show first 3 lines of code
            const lines = (f.codeSnippet || '').split('\n').slice(0, 3);
            for (const line of lines) {
              console.log(`  ${c.dim('│')} ${c.dim(line.slice(0, 100))}`);
            }
          }
        }
        console.log(divider());
      });
    });

  // Sub-subcommand: extract features from absorbed repos
  featuresCmd.command('extract')
    .description('Extract features from absorbed repos (run after absorbing)')
    .option('-r, --repo <repo>', 'Only extract from specific repo')
    .action(async (opts: { repo?: string }) => {
      await withIpc(async (client) => {
        console.log(`  ${c.cyan('Extracting features...')} ${opts.repo ? `from ${opts.repo}` : '(all repos)'}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('features.extract', { repo: opts.repo });
        if (result) {
          console.log(header('Feature Extraction Complete', '🧬'));
          console.log(keyValue('Features Extracted', String(result.featuresExtracted)));
          console.log(keyValue('Duration', `${(result.durationMs / 1000).toFixed(1)}s`));
          if (result.categories) {
            console.log(`\n  ${c.cyan.bold('By Category:')}`);
            for (const [cat, count] of Object.entries(result.categories)) {
              console.log(`    ${c.dim('•')} ${cat}: ${c.green(String(count))}`);
            }
          }
        }
        console.log(divider());
      });
    });

  // Sub-subcommand: suggest features relevant to a context
  featuresCmd.command('suggest')
    .description('Suggest features that could help improve Brain')
    .argument('[context]', 'Optional context (e.g. "error handling", "caching")')
    .action(async (context?: string) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const features = await client.request('features.suggest', { context }) as any[];
        console.log(header('Feature Suggestions', '💡'));
        if (!Array.isArray(features) || !features.length) {
          console.log(`  ${c.dim('No suggestions. Extract features first.')}`);
        } else {
          for (const f of features) {
            const score = ((f.usefulness ?? 0) * 100).toFixed(0);
            console.log(`\n  ${c.green(`${score}%`)} ${c.cyan.bold(f.name)} ${c.dim(`[${f.category}]`)}`);
            console.log(`  ${c.dim(f.repo)} ${f.description || ''}`);
            if (f.applicability) console.log(`  ${c.orange('→')} ${f.applicability}`);
          }
        }
        console.log(divider());
      });
    });

  // Sub-subcommand: stats
  featuresCmd.command('stats')
    .description('Feature extraction statistics')
    .action(async () => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats: any = await client.request('features.stats', {});
        console.log(header('Feature Stats', '📊'));
        console.log(keyValue('Total Features', String(stats.totalFeatures ?? 0)));
        console.log(keyValue('Avg Usefulness', `${((stats.avgUsefulness ?? 0) * 100).toFixed(0)}%`));
        if (stats.byCategory) {
          console.log(`\n  ${c.cyan.bold('By Category:')}`);
          for (const [cat, count] of Object.entries(stats.byCategory)) {
            console.log(`    ${c.dim('•')} ${cat}: ${c.green(String(count))}`);
          }
        }
        if (stats.byRepo) {
          console.log(`\n  ${c.cyan.bold('By Repo:')}`);
          for (const [repo, count] of Object.entries(stats.byRepo)) {
            console.log(`    ${c.dim('•')} ${repo}: ${c.green(String(count))}`);
          }
        }
        console.log(divider());
      });
    });

  featuresCmd.command('wishlist')
    .description('Show Brain\'s feature wishlist — what it needs')
    .option('-s, --status <status>', 'Filter by status (open/matched/adopted/dismissed)')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wishes = await client.request('recommender.wishlist', { status: opts.status }) as any[];
        console.log(header('Feature Wishlist', '🎯'));
        if (!wishes.length) {
          console.log(`  ${c.dim('No wishes yet. Run a recommendation cycle first.')}`);
        }
        for (const w of wishes) {
          const statusColor = w.status === 'matched' ? c.green : w.status === 'adopted' ? c.cyan : w.status === 'dismissed' ? c.dim : c.orange;
          console.log(`  ${statusColor(`[${w.status}]`)} ${c.value.bold(w.need)} ${c.dim(`(priority: ${(w.priority * 100).toFixed(0)}%)`)}`);
          console.log(`    ${c.dim(w.reason)}`);
          if (w.matchedFeatureName) {
            console.log(`    ${c.green('→')} Matched: ${c.cyan(w.matchedFeatureName)} ${c.dim(`(${(w.matchScore * 100).toFixed(0)}% match)`)}`);
          }
        }
        console.log(divider());
      });
    });

  featuresCmd.command('connections')
    .description('Show feature connections — what goes well together')
    .option('-f, --feature <id>', 'Show connections for a specific feature ID')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conns = await client.request('recommender.connections', { featureId: opts.feature ? Number(opts.feature) : undefined }) as any[];
        console.log(header('Feature Connections', '🔗'));
        if (!conns.length) {
          console.log(`  ${c.dim('No connections yet. Absorb some repos and run a cycle.')}`);
        }
        for (const conn of conns) {
          const relColor = conn.relationship === 'prerequisite' ? c.orange : conn.relationship === 'enhances' ? c.green : c.cyan;
          console.log(`  ${c.value(conn.nameA)} ${relColor(`─${conn.relationship}→`)} ${c.value(conn.nameB)} ${c.dim(`(${(conn.strength * 100).toFixed(0)}%)`)}`);
          console.log(`    ${c.dim(conn.reason)}`);
        }
        console.log(divider());
      });
    });

  featuresCmd.command('cycle')
    .description('Run a feature recommendation cycle now')
    .action(async () => {
      await withIpc(async (client) => {
        console.log(`  ${c.dim('Running recommendation cycle...')}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await client.request('recommender.cycle', {});
        console.log(header('Recommendation Cycle', '🔄'));
        console.log(keyValue('Wishes Created', String(result.wishesCreated ?? 0)));
        console.log(keyValue('Matches Found', String(result.matchesFound ?? 0)));
        console.log(keyValue('Connections', String(result.connectionsFound ?? 0)));
        console.log(keyValue('Duration', `${result.durationMs ?? 0}ms`));
        console.log(divider());
      });
    });

  return cmd;
}
