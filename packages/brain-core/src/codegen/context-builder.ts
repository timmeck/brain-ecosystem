import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { ResearchJournal } from '../research/journal.js';
import type { PatternExtractor } from './pattern-extractor.js';
import type { SignalScanner } from '../scanner/signal-scanner.js';
import type { ContextBuilderConfig, BuiltContext, GenerationRequest } from './types.js';

// ── ContextBuilder ───────────────────────────────────────

export class ContextBuilder {
  private knowledgeDistiller: KnowledgeDistiller | null;
  private journal: ResearchJournal | null;
  private patternExtractor: PatternExtractor | null;
  private signalScanner: SignalScanner | null;
  private config: Required<ContextBuilderConfig>;

  constructor(
    knowledgeDistiller?: KnowledgeDistiller | null,
    journal?: ResearchJournal | null,
    patternExtractor?: PatternExtractor | null,
    signalScanner?: SignalScanner | null,
    config: ContextBuilderConfig = {},
  ) {
    this.knowledgeDistiller = knowledgeDistiller ?? null;
    this.journal = journal ?? null;
    this.patternExtractor = patternExtractor ?? null;
    this.signalScanner = signalScanner ?? null;
    this.config = {
      maxPrinciples: config.maxPrinciples ?? 10,
      maxAntiPatterns: config.maxAntiPatterns ?? 5,
      maxStrategies: config.maxStrategies ?? 5,
      maxPatterns: config.maxPatterns ?? 10,
      maxJournalInsights: config.maxJournalInsights ?? 5,
      maxTrending: config.maxTrending ?? 5,
    };
  }

  /** Build the complete system prompt from brain knowledge. */
  build(request: GenerationRequest): BuiltContext {
    const sections: string[] = [];
    let principlesUsed = 0;
    let antiPatternsUsed = 0;
    let patternsUsed = 0;

    // Header
    sections.push('Du bist ein Code-Generator im Brain Ecosystem.');
    sections.push('Du hast Zugriff auf das gesammelte Wissen des Brains:\n');

    // 1. Principles from KnowledgeDistiller
    if (this.knowledgeDistiller) {
      const domain = request.knowledge_domains?.[0];
      const principles = this.knowledgeDistiller.getPrinciples(domain, this.config.maxPrinciples);
      if (principles.length > 0) {
        sections.push('## Bewährte Principles');
        for (const p of principles) {
          sections.push(`- ${p.statement} (confidence: ${p.confidence.toFixed(2)}, success: ${(p.success_rate * 100).toFixed(0)}%)`);
          principlesUsed++;
        }
        sections.push('');
      }

      // 2. Anti-Patterns
      const antiPatterns = this.knowledgeDistiller.getAntiPatterns(domain, this.config.maxAntiPatterns);
      if (antiPatterns.length > 0) {
        sections.push('## Anti-Patterns (vermeide!)');
        for (const ap of antiPatterns) {
          const alt = ap.alternative ? ` → Stattdessen: ${ap.alternative}` : '';
          sections.push(`- ${ap.statement} (failure: ${(ap.failure_rate * 100).toFixed(0)}%)${alt}`);
          antiPatternsUsed++;
        }
        sections.push('');
      }

      // 3. Strategies
      const pkg = this.knowledgeDistiller.getPackage(domain ?? 'general');
      if (pkg.strategies && pkg.strategies.length > 0) {
        sections.push('## Bewährte Strategien');
        for (const s of pkg.strategies.slice(0, this.config.maxStrategies)) {
          sections.push(`- ${s.description} (effectiveness: ${(s.effectiveness * 100).toFixed(0)}%)`);
        }
        sections.push('');
      }
    }

    // 4. Patterns from PatternExtractor
    if (this.patternExtractor && request.include_patterns !== false) {
      const deps = this.patternExtractor.getPatterns('dependency', this.config.maxPatterns);
      const stacks = this.patternExtractor.getPatterns('tech_stack', 5);

      if (deps.length > 0 || stacks.length > 0) {
        sections.push('## Beliebte Tech-Patterns (aus gescannten Repos)');
        if (deps.length > 0) {
          const depList = deps.map(d => {
            const data = JSON.parse(d.pattern_data) as { name: string; percentage: number };
            return `${data.name} (${data.percentage}%)`;
          }).join(', ');
          sections.push(`- Top Dependencies: ${depList}`);
          patternsUsed += deps.length;
        }
        if (stacks.length > 0) {
          const stackList = stacks.map(s => {
            const data = JSON.parse(s.pattern_data) as { stack: string; count: number };
            return `${data.stack} (${data.count}x)`;
          }).join(', ');
          sections.push(`- Häufigste Stacks: ${stackList}`);
          patternsUsed += stacks.length;
        }
        sections.push('');
      }
    }

    // 5. Journal insights
    if (this.journal) {
      const discoveries = this.journal.getEntries('discovery', this.config.maxJournalInsights);
      if (discoveries.length > 0) {
        sections.push('## Letzte Entdeckungen');
        for (const d of discoveries) {
          sections.push(`- ${d.title}: ${d.content.substring(0, 150)}`);
        }
        sections.push('');
      }
    }

    // 6. Scanner trends (optional)
    if (this.signalScanner && request.include_trends) {
      try {
        const trending = this.signalScanner.getTrending(this.config.maxTrending);
        if (trending.length > 0) {
          sections.push('## Trending Repos');
          for (const r of trending) {
            sections.push(`- ${r.full_name} (★${r.current_stars}, +${r.star_velocity_24h}/24h) — ${r.description?.substring(0, 80) ?? ''}`);
          }
          sections.push('');
        }
      } catch { /* scanner may not be available */ }
    }

    // 7. Task section
    sections.push('## Aufgabe');
    sections.push(request.task);
    if (request.context) {
      sections.push(`\nZusätzlicher Kontext: ${request.context}`);
    }
    if (request.target_file) {
      sections.push(`\nZieldatei: ${request.target_file}`);
    }

    // 8. Output instructions
    const lang = request.language ?? 'typescript';
    sections.push(`\nGeneriere den Code als ${lang === 'typescript' ? 'TypeScript ESM, nutze .js Extensions bei Imports' : lang}.`);
    sections.push('Antworte mit dem Code in einem ```code``` Block, gefolgt von einer kurzen Erklärung.');

    const systemPrompt = sections.join('\n');

    return {
      systemPrompt,
      principlesUsed,
      antiPatternsUsed,
      patternsUsed,
      totalTokensEstimate: Math.ceil(systemPrompt.length / 4),
    };
  }
}
