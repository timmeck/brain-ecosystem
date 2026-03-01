import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ContextBuilder } from './context-builder.js';
import type { ResearchJournal } from '../research/journal.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type {
  CodeGeneratorConfig, GenerationRequest, GenerationResult,
  GenerationRecord, GenerationStatus, CodeGeneratorSummary,
} from './types.js';

// ── Migration ────────────────────────────────────────────

export function runCodeGeneratorMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'generating',
      context_summary TEXT DEFAULT '',
      principles_used INTEGER DEFAULT 0,
      anti_patterns_used INTEGER DEFAULT 0,
      patterns_used INTEGER DEFAULT 0,
      generated_code TEXT,
      generated_explanation TEXT,
      target_file TEXT,
      language TEXT DEFAULT 'typescript',
      validation_passed INTEGER,
      validation_errors TEXT,
      review_notes TEXT,
      tokens_used INTEGER DEFAULT 0,
      generation_time_ms INTEGER DEFAULT 0,
      model_used TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      reviewed_at TEXT
    );
  `);
}

// ── CodeGenerator ────────────────────────────────────────

export class CodeGenerator {
  private db: Database.Database;
  private brainName: string;
  private apiKey: string | null;
  private model: string;
  private maxTokens: number;
  private maxPerHour: number;
  private contextBuilder: ContextBuilder | null = null;
  private journal: ResearchJournal | null = null;
  private knowledgeDistiller: KnowledgeDistiller | null = null;
  private thoughtStream: ThoughtStream | null = null;
  private recentGenerations: number[] = [];
  private log = getLogger();

  constructor(db: Database.Database, config: CodeGeneratorConfig) {
    this.db = db;
    this.brainName = config.brainName;
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens ?? 4096;
    this.maxPerHour = config.maxPerHour ?? 10;
    runCodeGeneratorMigration(db);
  }

  setContextBuilder(builder: ContextBuilder): void { this.contextBuilder = builder; }
  setJournal(journal: ResearchJournal): void { this.journal = journal; }
  setKnowledgeDistiller(distiller: KnowledgeDistiller): void { this.knowledgeDistiller = distiller; }
  setThoughtStream(stream: ThoughtStream): void { this.thoughtStream = stream; }

  /** Generate code using Claude API with brain knowledge as context. */
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured — CodeGenerator requires an API key');
    }

    // Rate limiting
    this.cleanupRateLimit();
    if (this.recentGenerations.length >= this.maxPerHour) {
      throw new Error(`Rate limit exceeded: max ${this.maxPerHour} generations per hour`);
    }

    const ts = this.thoughtStream;
    ts?.emit('code_generator', 'analyzing', `Generating code: ${request.task.substring(0, 80)}...`);

    const startTime = Date.now();

    // Build context from brain knowledge
    let contextSummary = '';
    let principlesUsed = 0;
    let antiPatternsUsed = 0;
    let patternsUsed = 0;
    let systemPrompt = request.task;

    if (this.contextBuilder) {
      const ctx = this.contextBuilder.build(request);
      systemPrompt = ctx.systemPrompt;
      principlesUsed = ctx.principlesUsed;
      antiPatternsUsed = ctx.antiPatternsUsed;
      patternsUsed = ctx.patternsUsed;
      contextSummary = `${principlesUsed} principles, ${antiPatternsUsed} anti-patterns, ${patternsUsed} patterns, ~${ctx.totalTokensEstimate} tokens`;
    }

    // Insert initial record
    const insertResult = this.db.prepare(`
      INSERT INTO code_generations (task, trigger, status, context_summary, principles_used, anti_patterns_used, patterns_used, target_file, language, model_used)
      VALUES (?, ?, 'generating', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.task,
      request.trigger ?? 'manual',
      contextSummary,
      principlesUsed,
      antiPatternsUsed,
      patternsUsed,
      request.target_file ?? null,
      request.language ?? 'typescript',
      this.model,
    );
    const id = Number(insertResult.lastInsertRowid);

    try {
      // Call Claude API
      ts?.emit('code_generator', 'analyzing', `Calling Claude API (${this.model})...`);
      const { code, explanation, tokensUsed } = await this.callClaudeApi(systemPrompt, request.task);

      const generationTime = Date.now() - startTime;

      // Update record with results
      this.db.prepare(`
        UPDATE code_generations
        SET status = 'generated', generated_code = ?, generated_explanation = ?,
            tokens_used = ?, generation_time_ms = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(code, explanation, tokensUsed, generationTime, id);

      this.recentGenerations.push(Date.now());

      ts?.emit('code_generator', 'discovering', `Code generated (${tokensUsed} tokens, ${generationTime}ms)`, 'notable');

      // Journal the generation
      this.journal?.recordDiscovery(
        `Code generated: ${request.task.substring(0, 60)}`,
        `CodeGenerator produced ${code?.length ?? 0} chars of ${request.language ?? 'typescript'} code. ${contextSummary}`,
        { id, trigger: request.trigger, tokensUsed, generationTime },
        'notable',
      );

      return this.get(id)!;
    } catch (err) {
      const generationTime = Date.now() - startTime;
      this.db.prepare(`
        UPDATE code_generations
        SET status = 'failed', generated_explanation = ?, generation_time_ms = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run((err as Error).message, generationTime, id);

      ts?.emit('code_generator', 'analyzing', `Generation failed: ${(err as Error).message}`);
      this.log.error(`[code-generator] Generation failed: ${(err as Error).message}`);

      return this.get(id)!;
    }
  }

  /** Approve a generated code. */
  approve(id: number, notes?: string): GenerationRecord | null {
    this.db.prepare(`
      UPDATE code_generations SET status = 'approved', review_notes = ?, reviewed_at = datetime('now')
      WHERE id = ? AND status IN ('generated', 'pending_review')
    `).run(notes ?? null, id);

    const record = this.getRecord(id);
    if (record && record.status === 'approved') {
      this.journal?.recordDiscovery(
        `Code approved: ${record.task.substring(0, 60)}`,
        `Generation #${id} approved.${notes ? ` Notes: ${notes}` : ''}`,
        { id, task: record.task },
        'notable',
      );
      this.thoughtStream?.emit('code_generator', 'discovering', `Code #${id} approved`, 'notable');
    }
    return record;
  }

  /** Reject a generated code. */
  reject(id: number, notes?: string): GenerationRecord | null {
    this.db.prepare(`
      UPDATE code_generations SET status = 'rejected', review_notes = ?, reviewed_at = datetime('now')
      WHERE id = ? AND status IN ('generated', 'pending_review')
    `).run(notes ?? null, id);

    const record = this.getRecord(id);
    if (record && record.status === 'rejected') {
      this.journal?.recordExperiment(
        `Code rejected: ${record.task.substring(0, 60)}`,
        'rejected',
        { id, task: record.task, notes },
        false,
      );
    }
    return record;
  }

  /** Get a generation by ID. */
  get(id: number): GenerationResult | null {
    return this.db.prepare('SELECT * FROM code_generations WHERE id = ?').get(id) as GenerationResult | null;
  }

  /** Get a generation record with review fields. */
  getRecord(id: number): GenerationRecord | null {
    return this.db.prepare('SELECT * FROM code_generations WHERE id = ?').get(id) as GenerationRecord | null;
  }

  /** List generations with optional filters. */
  list(status?: GenerationStatus, limit = 20): GenerationResult[] {
    if (status) {
      return this.db.prepare('SELECT * FROM code_generations WHERE status = ? ORDER BY id DESC LIMIT ?').all(status, limit) as GenerationResult[];
    }
    return this.db.prepare('SELECT * FROM code_generations ORDER BY id DESC LIMIT ?').all(limit) as GenerationResult[];
  }

  /** Get summary stats. */
  getSummary(): CodeGeneratorSummary {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM code_generations').get() as { c: number }).c;

    const byStatusRows = this.db.prepare('SELECT status, COUNT(*) as c FROM code_generations GROUP BY status').all() as Array<{ status: string; c: number }>;
    const byStatus: Record<string, number> = {};
    for (const r of byStatusRows) byStatus[r.status] = r.c;

    const byTriggerRows = this.db.prepare('SELECT trigger, COUNT(*) as c FROM code_generations GROUP BY trigger').all() as Array<{ trigger: string; c: number }>;
    const byTrigger: Record<string, number> = {};
    for (const r of byTriggerRows) byTrigger[r.trigger] = r.c;

    const tokens = (this.db.prepare('SELECT COALESCE(SUM(tokens_used), 0) as t FROM code_generations').get() as { t: number }).t;
    const avgTime = (this.db.prepare('SELECT COALESCE(AVG(generation_time_ms), 0) as a FROM code_generations WHERE status != \'generating\'').get() as { a: number }).a;

    const approved = (byStatus['approved'] ?? 0);
    const rejected = (byStatus['rejected'] ?? 0);
    const reviewed = approved + rejected;

    const last = this.db.prepare('SELECT MAX(created_at) as t FROM code_generations').get() as { t: string | null };

    return {
      total_generations: total,
      by_status: byStatus as Record<GenerationStatus, number>,
      by_trigger: byTrigger,
      total_tokens_used: tokens,
      avg_generation_time_ms: Math.round(avgTime),
      approval_rate: reviewed > 0 ? approved / reviewed : 0,
      last_generation_at: last.t,
    };
  }

  // ── Private ──────────────────────────────────────────────

  private async callClaudeApi(systemPrompt: string, userMessage: string): Promise<{ code: string | null; explanation: string | null; tokensUsed: number }> {
    // Use raw fetch to Anthropic API — avoids @anthropic-ai/sdk dependency
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err.substring(0, 200)}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content
      ?.filter(block => block.type === 'text')
      .map(block => block.text ?? '')
      .join('\n') ?? '';

    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

    // Parse code block from response
    const codeMatch = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : text;
    const explanation = text.replace(/```(?:\w+)?\n[\s\S]*?```/g, '').trim() || null;

    return { code, explanation, tokensUsed };
  }

  private cleanupRateLimit(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    this.recentGenerations = this.recentGenerations.filter(t => t > oneHourAgo);
  }
}
