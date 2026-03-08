import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getLogger } from '../utils/logger.js';
import type { ContextBuilder } from '../codegen/context-builder.js';
import type { SelfScanner } from '../self-scanner/self-scanner.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { CodeSandbox } from '../sandbox/code-sandbox.js';

// ── Types ────────────────────────────────────────────────

export interface SelfModificationConfig {
  brainName: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  maxPerHour?: number;
  maxChangedLines?: number;
  projectRoot?: string;
}

/** Structured proposal metadata for experiment tracking. */
export interface ProposalMeta {
  hypothesis?: string;
  risk_level?: 'low' | 'medium' | 'high';
  expected_impact?: Array<{ metric: string; direction: 'increase' | 'decrease' | 'no_regression'; target: string }>;
  acceptance_criteria?: string[];
  reason_code?: string;
  metrics_before?: Record<string, number>;
  metrics_after?: Record<string, number>;
  /** Reference code snippet from absorbed repos — included in generation prompt as inspiration. */
  referenceCode?: string;
}

export type ModificationStatus =
  | 'proposed'
  | 'generating'
  | 'testing'
  | 'ready'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'rolled_back'
  | 'failed';

export interface FileDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
}

export interface SelfModification {
  id: number;
  title: string;
  problem_description: string;
  source_engine: string;
  target_files: string[];
  generated_diff: FileDiff[] | null;
  test_result: 'pending' | 'passed' | 'failed';
  test_output: string | null;
  status: ModificationStatus;
  applied_at: string | null;
  rollback_data: FileDiff[] | null;
  tokens_used: number;
  model_used: string;
  generation_time_ms: number;
  created_at: string;
  // Experiment ledger fields
  hypothesis: string | null;
  risk_level: string | null;
  expected_impact: ProposalMeta['expected_impact'] | null;
  acceptance_criteria: string[] | null;
  reason_code: string | null;
  metrics_before: Record<string, number> | null;
  metrics_after: Record<string, number> | null;
}

export interface SelfModificationStatus {
  brainName: string;
  totalModifications: number;
  byStatus: Record<string, number>;
  lastModification: string | null;
  projectRoot: string | null;
}

// ── Path Guards ──────────────────────────────────────────

const PATH_WHITELIST = /^packages\/[^/]+\/src\/.+\.ts$/;
const PATH_BLACKLIST = [
  'node_modules/',
  'dist/',
  '.test.ts',
  '.spec.ts',
  'package.json',
  'tsconfig.json',
  'migrations/',
  '.d.ts',
];

/** Core-module paths protected from self-modification (GuardrailEngine). */
const PROTECTED_CORE_PATHS = [
  'src/ipc/',
  'src/llm/provider.ts',
  'src/llm/middleware.ts',
  'src/guardrails/',
  'src/db/',
];

function isPathAllowed(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (!PATH_WHITELIST.test(normalized)) return false;
  if (PATH_BLACKLIST.some(b => normalized.includes(b))) return false;
  // Reject core-module paths (guardrail protection)
  if (PROTECTED_CORE_PATHS.some(p => normalized.includes(p))) return false;
  return true;
}

// ── Migration ────────────────────────────────────────────

export function runSelfModificationMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS self_modifications (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      title              TEXT NOT NULL,
      problem_description TEXT NOT NULL,
      source_engine      TEXT NOT NULL DEFAULT 'orchestrator',
      target_files       TEXT NOT NULL DEFAULT '[]',
      generated_diff     TEXT,
      test_result        TEXT NOT NULL DEFAULT 'pending',
      test_output        TEXT,
      status             TEXT NOT NULL DEFAULT 'proposed',
      applied_at         TEXT,
      rollback_data      TEXT,
      tokens_used        INTEGER DEFAULT 0,
      model_used         TEXT DEFAULT '',
      generation_time_ms INTEGER DEFAULT 0,
      created_at         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_selfmod_status ON self_modifications(status);
  `);

  // Experiment ledger columns (safe ADD COLUMN — no-op if they already exist)
  const ledgerColumns = [
    ['hypothesis', 'TEXT'],
    ['risk_level', 'TEXT'],
    ['expected_impact', 'TEXT'],
    ['acceptance_criteria', 'TEXT'],
    ['reason_code', 'TEXT'],
    ['metrics_before', 'TEXT'],
    ['metrics_after', 'TEXT'],
  ] as const;

  for (const [col, type] of ledgerColumns) {
    try {
      db.exec(`ALTER TABLE self_modifications ADD COLUMN ${col} ${type}`);
    } catch {
      // Column already exists — expected on subsequent runs
    }
  }
}

// ── SelfModificationEngine ───────────────────────────────

export class SelfModificationEngine {
  private readonly db: Database.Database;
  private readonly config: Required<SelfModificationConfig>;
  private readonly log = getLogger();
  private contextBuilder: ContextBuilder | null = null;
  private selfScanner: SelfScanner | null = null;
  private ts: ThoughtStream | null = null;
  private sandbox: CodeSandbox | null = null;

  // Rate limiting
  private recentGenerations: number[] = [];
  // Ephemeral reference code snippets (not persisted in DB)
  private referenceCodeMap = new Map<number, string>();

  // Prepared statements
  private readonly stmtInsert: Database.Statement;
  private readonly stmtUpdate: Database.Statement;
  private readonly stmtGet: Database.Statement;
  private readonly stmtGetPending: Database.Statement;
  private readonly stmtGetHistory: Database.Statement;
  private readonly stmtCountByStatus: Database.Statement;
  private readonly stmtCountTotal: Database.Statement;
  private readonly stmtLastModification: Database.Statement;
  private readonly stmtGetByStatus: Database.Statement;

  constructor(db: Database.Database, config: SelfModificationConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '',
      model: config.model ?? 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens ?? 4096,
      maxPerHour: config.maxPerHour ?? 3,
      maxChangedLines: config.maxChangedLines ?? 200,
      projectRoot: config.projectRoot ?? '',
    };

    runSelfModificationMigration(db);

    // Crash recovery: if any modification is stuck in 'testing', restore rollback
    this.recoverFromCrash();

    this.stmtInsert = db.prepare(`
      INSERT INTO self_modifications (title, problem_description, source_engine, target_files, status)
      VALUES (?, ?, ?, ?, 'proposed')
    `);
    this.stmtUpdate = db.prepare(`
      UPDATE self_modifications
      SET generated_diff = ?, test_result = ?, test_output = ?, status = ?,
          applied_at = ?, rollback_data = ?, tokens_used = ?, model_used = ?, generation_time_ms = ?
      WHERE id = ?
    `);
    this.stmtGet = db.prepare('SELECT * FROM self_modifications WHERE id = ?');
    this.stmtGetPending = db.prepare("SELECT * FROM self_modifications WHERE status IN ('ready', 'proposed') ORDER BY id DESC");
    this.stmtGetHistory = db.prepare('SELECT * FROM self_modifications ORDER BY id DESC LIMIT ?');
    this.stmtCountByStatus = db.prepare('SELECT status, COUNT(*) as count FROM self_modifications GROUP BY status');
    this.stmtCountTotal = db.prepare('SELECT COUNT(*) as count FROM self_modifications');
    this.stmtLastModification = db.prepare('SELECT created_at FROM self_modifications ORDER BY id DESC LIMIT 1');
    this.stmtGetByStatus = db.prepare('SELECT * FROM self_modifications WHERE status = ? ORDER BY id DESC LIMIT ?');
  }

  setContextBuilder(cb: ContextBuilder): void { this.contextBuilder = cb; }
  setSelfScanner(scanner: SelfScanner): void { this.selfScanner = scanner; }
  setThoughtStream(ts: ThoughtStream): void { this.ts = ts; }
  setSandbox(sandbox: CodeSandbox): void { this.sandbox = sandbox; }

  /** Propose a new self-modification with optional structured metadata. */
  proposeModification(title: string, problem: string, targetFiles: string[], sourceEngine = 'orchestrator', meta?: ProposalMeta): SelfModification {
    // Validate paths
    for (const f of targetFiles) {
      if (!isPathAllowed(f)) {
        throw new Error(`Path not allowed: ${f} — only packages/*/src/**/*.ts is allowed`);
      }
    }

    const result = this.stmtInsert.run(title, problem, sourceEngine, JSON.stringify(targetFiles));
    const id = result.lastInsertRowid as number;

    // Store structured proposal metadata if provided
    if (meta) {
      this.updateProposalMeta(id, meta);
      if (meta.referenceCode) {
        this.referenceCodeMap.set(id, meta.referenceCode);
      }
    }

    this.log.info(`[self-mod] Proposed modification #${id}: ${title}${meta?.risk_level ? ` [risk: ${meta.risk_level}]` : ''}`);
    this.ts?.emit('self-modification', 'analyzing', `Proposed: ${title}`, 'notable');

    return this.getModification(id)!;
  }

  /** Generate code changes via Claude API. */
  async generateCode(modificationId: number): Promise<SelfModification> {
    const mod = this.getModification(modificationId);
    if (!mod) throw new Error(`Modification #${modificationId} not found`);
    if (mod.status !== 'proposed') throw new Error(`Modification #${modificationId} is not in 'proposed' state (current: ${mod.status})`);

    // Rate limit
    if (!this.checkRateLimit()) {
      this.updateModification(modificationId, { status: 'failed', test_output: `Rate limit exceeded: max ${this.config.maxPerHour} generations per hour` });
      throw new Error(`Rate limit exceeded: max ${this.config.maxPerHour} generations per hour`);
    }

    if (!this.config.apiKey) {
      this.updateModification(modificationId, { status: 'failed', test_output: 'ANTHROPIC_API_KEY not set' });
      throw new Error('ANTHROPIC_API_KEY not set');
    }

    // Update status
    this.updateModification(modificationId, { status: 'generating' });
    this.ts?.emit('self-modification', 'analyzing', `Generating code for: ${mod.title}`, 'notable');

    const startTime = Date.now();

    try {
      // Build system prompt
      let systemPrompt = '';
      if (this.contextBuilder) {
        const ctx = this.contextBuilder.build({
          task: mod.problem_description,
          trigger: 'improvement_suggestion',
          language: 'typescript',
        });
        systemPrompt = ctx.systemPrompt;
      }

      // Add architecture summary from SelfScanner
      if (this.selfScanner) {
        const archSummary = this.selfScanner.getArchitectureSummary();
        if (archSummary) {
          systemPrompt += '\n\n## Own Codebase (Architecture Overview)\n' + archSummary;
        }
      }

      // Add target file contents
      const fileContents: string[] = [];
      for (const targetFile of mod.target_files) {
        let content: string | null = null;
        if (this.selfScanner) {
          content = this.selfScanner.getFileContent(targetFile);
        }
        if (!content && this.config.projectRoot) {
          const fullPath = path.resolve(this.config.projectRoot, targetFile);
          try { content = fs.readFileSync(fullPath, 'utf-8'); } catch { /* file not found */ }
        }
        if (content) {
          const truncated = content.length > 8000 ? content.substring(0, 8000) + '\n// ... (truncated)' : content;
          fileContents.push(`### FILE: ${targetFile}\n\`\`\`typescript\n${truncated}\n\`\`\``);
        }
      }

      if (fileContents.length > 0) {
        systemPrompt += '\n\n## Current Source Code of Target Files\n' + fileContents.join('\n\n');
      }

      // Add reference implementation from absorbed repos if available
      const refCode = this.referenceCodeMap.get(modificationId);
      if (refCode) {
        systemPrompt += '\n\n## Reference Implementation (from absorbed repos)\n' +
          'The following code snippet shows a similar implementation that scored well:\n' +
          '```\n' + refCode + '\n```\n' +
          "Adapt this approach to fit Brain's architecture.";
        this.referenceCodeMap.delete(modificationId); // Clean up after use
      }

      // User message
      const userMessage = [
        `## Task: ${mod.title}`,
        '',
        mod.problem_description,
        '',
        '## Instructions',
        '- Modify ONLY the specified files',
        '- Keep changes minimal and focused',
        `- Maximum ${this.config.maxChangedLines} changed lines`,
        '- Keep all existing imports and exports',
        '- Use TypeScript ESM with .js extensions',
        '',
        '## Output-Format',
        'Output the COMPLETE new file content for each changed file:',
        '',
        '### FILE: <relative-path>',
        '```typescript',
        '<complete new file content>',
        '```',
        '',
        'Do NOT output just diffs, but the complete new content of each file.',
      ].join('\n');

      // Claude API call (raw fetch, same pattern as CodeGenerator)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errText}`);
      }

      const result = await response.json() as {
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = result.content.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
      const tokensUsed = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
      const generationTimeMs = Date.now() - startTime;

      // Parse response: extract file blocks
      const diffs = this.parseGeneratedFiles(text, mod.target_files);

      // Fail if no files were extracted — Claude didn't produce usable output
      if (diffs.length === 0) {
        const preview = text.replace(/\r\n/g, '\n').substring(0, 1500);
        this.updateModification(modificationId, {
          status: 'failed',
          generated_diff: '[]',
          test_result: 'failed',
          test_output: `No parseable file blocks in API response (${tokensUsed} tokens used). Expected "### FILE: <path>" blocks.\n\nResponse preview:\n${preview}`,
          tokens_used: tokensUsed,
          model_used: this.config.model,
          generation_time_ms: generationTimeMs,
        });
        throw new Error(`No parseable file blocks found in Claude response for modification #${modificationId}`);
      }

      // Validate line count
      let totalChangedLines = 0;
      for (const diff of diffs) {
        const oldLines = diff.oldContent.split('\n').length;
        const newLines = diff.newContent.split('\n').length;
        totalChangedLines += Math.abs(newLines - oldLines) + Math.min(oldLines, newLines);
      }

      if (totalChangedLines > this.config.maxChangedLines) {
        this.updateModification(modificationId, {
          status: 'failed',
          generated_diff: JSON.stringify(diffs),
          test_result: 'failed',
          test_output: `Too many changed lines: ${totalChangedLines} > ${this.config.maxChangedLines}`,
          tokens_used: tokensUsed,
          model_used: this.config.model,
          generation_time_ms: generationTimeMs,
        });
        throw new Error(`Generated too many changed lines: ${totalChangedLines}`);
      }

      this.updateModification(modificationId, {
        generated_diff: JSON.stringify(diffs),
        tokens_used: tokensUsed,
        model_used: this.config.model,
        generation_time_ms: generationTimeMs,
        status: 'proposed', // back to proposed, needs testing
      });

      this.recentGenerations.push(Date.now());
      this.log.info(`[self-mod] Generated code for #${modificationId} (${tokensUsed} tokens, ${generationTimeMs}ms, ${diffs.length} files)`);
      this.ts?.emit('self-modification', 'discovering', `Code generated for: ${mod.title}`, 'notable');

      return this.getModification(modificationId)!;
    } catch (err) {
      const errMsg = (err as Error).message;
      this.updateModification(modificationId, {
        status: 'failed',
        test_result: 'failed',
        test_output: `Generation failed: ${errMsg}`,
        generation_time_ms: Date.now() - startTime,
      });
      this.log.error(`[self-mod] Generation failed for #${modificationId}: ${errMsg}`);
      throw err;
    }
  }

  /** Test a modification by writing files, building, running tests, then restoring. */
  async testModification(modificationId: number): Promise<SelfModification> {
    const mod = this.getModification(modificationId);
    if (!mod) throw new Error(`Modification #${modificationId} not found`);
    if (!mod.generated_diff || mod.generated_diff.length === 0) {
      throw new Error(`Modification #${modificationId} has no generated code`);
    }
    this.updateModification(modificationId, { status: 'testing' });
    this.ts?.emit('self-modification', 'analyzing', `Testing: ${mod.title}`, 'notable');

    // 0. Sandbox pre-validation (if available) — validate syntax before touching real files
    if (this.sandbox) {
      let sandboxOutput = '';
      for (const diff of mod.generated_diff) {
        try {
          const result = await this.sandbox.execute({
            code: diff.newContent,
            language: 'typescript',
            timeoutMs: 10_000,
            name: `selfmod-validate-${modificationId}`,
          });
          sandboxOutput += `[sandbox:${diff.filePath}] exit=${result.exitCode} ${result.stderr ? `stderr: ${result.stderr.slice(0, 200)}` : 'OK'}\n`;
          if (result.exitCode !== 0 && !result.timedOut) {
            // Sandbox detected a problem — skip npm test
            this.updateModification(modificationId, {
              status: 'failed',
              test_result: 'failed',
              test_output: `=== SANDBOX VALIDATION FAILED ===\n${sandboxOutput}\n${result.stderr ?? result.stdout ?? ''}`,
            });
            this.log.warn(`[self-mod] Sandbox validation failed for #${modificationId}: ${diff.filePath}`);
            return this.getModification(modificationId)!;
          }
        } catch (sandboxErr) {
          sandboxOutput += `[sandbox:${diff.filePath}] error: ${(sandboxErr as Error).message}\n`;
          this.updateModification(modificationId, {
            status: 'failed',
            test_result: 'failed',
            test_output: `=== SANDBOX ERROR ===\n${sandboxOutput}`,
          });
          this.log.warn(`[self-mod] Sandbox error for #${modificationId}: ${(sandboxErr as Error).message}`);
          return this.getModification(modificationId)!;
        }
      }
      this.log.info(`[self-mod] Sandbox validation passed for #${modificationId}`);
    }

    if (!this.config.projectRoot) {
      throw new Error('projectRoot not configured');
    }

    const rollbackData: FileDiff[] = [];

    try {
      // 1. Save originals + write new files
      for (const diff of mod.generated_diff) {
        const fullPath = path.resolve(this.config.projectRoot, diff.filePath);
        let originalContent = '';
        try { originalContent = fs.readFileSync(fullPath, 'utf-8'); } catch { /* new file */ }
        rollbackData.push({ filePath: diff.filePath, oldContent: originalContent, newContent: diff.newContent });
        fs.writeFileSync(fullPath, diff.newContent, 'utf-8');
      }

      // Store rollback data
      this.updateModification(modificationId, { rollback_data: JSON.stringify(rollbackData) });

      // 2. Build
      let testOutput = '';
      try {
        const buildOutput = execSync('npm run build', {
          cwd: this.config.projectRoot,
          timeout: 60_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        testOutput += `=== BUILD ===\n${buildOutput}\n`;
      } catch (err) {
        const buildErr = (err as { stderr?: string; stdout?: string });
        testOutput += `=== BUILD FAILED ===\n${buildErr.stderr ?? buildErr.stdout ?? 'Unknown build error'}\n`;
        this.restoreFiles(rollbackData);
        this.updateModification(modificationId, {
          status: 'failed',
          test_result: 'failed',
          test_output: testOutput,
        });
        this.log.warn(`[self-mod] Build failed for #${modificationId}`);
        return this.getModification(modificationId)!;
      }

      // 3. Test
      try {
        const testResult = execSync('npm test', {
          cwd: this.config.projectRoot,
          timeout: 120_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        testOutput += `=== TESTS ===\n${testResult}\n`;
      } catch (err) {
        const testErr = (err as { stderr?: string; stdout?: string });
        testOutput += `=== TESTS FAILED ===\n${testErr.stderr ?? testErr.stdout ?? 'Unknown test error'}\n`;
        this.restoreFiles(rollbackData);
        this.updateModification(modificationId, {
          status: 'failed',
          test_result: 'failed',
          test_output: testOutput,
        });
        this.log.warn(`[self-mod] Tests failed for #${modificationId}`);
        return this.getModification(modificationId)!;
      }

      // 4. Restore files (test passed, but don't apply yet — wait for approval)
      this.restoreFiles(rollbackData);

      this.updateModification(modificationId, {
        status: 'ready',
        test_result: 'passed',
        test_output: testOutput,
      });

      this.log.info(`[self-mod] Tests passed for #${modificationId} — ready for approval`);
      this.ts?.emit('self-modification', 'discovering', `Self-modification ready for review: ${mod.title}`, 'breakthrough');

      return this.getModification(modificationId)!;
    } catch (err) {
      // Ensure files are restored on any unexpected error
      if (rollbackData.length > 0) this.restoreFiles(rollbackData);
      this.updateModification(modificationId, {
        status: 'failed',
        test_result: 'failed',
        test_output: `Unexpected error: ${(err as Error).message}`,
      });
      throw err;
    }
  }

  /** Apply an approved modification — git backup → write files → build+test → commit or revert. */
  applyModification(modificationId: number): SelfModification {
    const mod = this.getModification(modificationId);
    if (!mod) throw new Error(`Modification #${modificationId} not found`);
    if (mod.status !== 'approved' && mod.status !== 'ready') {
      throw new Error(`Modification #${modificationId} is not approved or ready (current: ${mod.status})`);
    }
    if (!mod.generated_diff || mod.generated_diff.length === 0) {
      throw new Error(`Modification #${modificationId} has no generated code`);
    }
    if (!this.config.projectRoot) throw new Error('projectRoot not configured');

    // 1. Git backup — create a backup branch before modifying anything
    const backupBranch = `selfmod-backup-${modificationId}-${Date.now()}`;
    let hasGit = false;
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: this.config.projectRoot, stdio: 'pipe' });
      hasGit = true;
      execSync(`git stash push -m "selfmod-${modificationId}-backup"`, { cwd: this.config.projectRoot, stdio: 'pipe' });
      execSync(`git stash pop`, { cwd: this.config.projectRoot, stdio: 'pipe' });
      // Tag the current state so we can always get back
      execSync(`git branch ${backupBranch}`, { cwd: this.config.projectRoot, stdio: 'pipe' });
      this.log.info(`[self-mod] Git backup branch created: ${backupBranch}`);
    } catch {
      // No git or git failed — continue without backup (rollbackData still works)
      hasGit = false;
    }

    // 2. Save rollback data
    const rollbackData: FileDiff[] = [];
    for (const diff of mod.generated_diff) {
      const fullPath = path.resolve(this.config.projectRoot, diff.filePath);
      let originalContent = '';
      try { originalContent = fs.readFileSync(fullPath, 'utf-8'); } catch { /* new file */ }
      rollbackData.push({ filePath: diff.filePath, oldContent: originalContent, newContent: diff.newContent });
    }

    // 3. Write files
    for (const diff of mod.generated_diff) {
      const fullPath = path.resolve(this.config.projectRoot, diff.filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, diff.newContent, 'utf-8');
    }

    // 4. Build
    try {
      execSync('npm run build', {
        cwd: this.config.projectRoot,
        timeout: 60_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Build failed — restore files
      this.restoreFiles(rollbackData);
      this.updateModification(modificationId, {
        status: 'failed',
        test_output: `Apply build failed: ${(err as Error).message}`,
      });
      throw new Error(`Build failed after applying: ${(err as Error).message}`);
    }

    // 5. Run tests
    try {
      execSync('npm test', {
        cwd: this.config.projectRoot,
        timeout: 120_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // Tests failed — automatic revert
      this.restoreFiles(rollbackData);
      this.log.warn(`[self-mod] Tests failed after apply for #${modificationId} — auto-reverted`);
      this.updateModification(modificationId, {
        status: 'failed',
        test_result: 'failed',
        test_output: `Apply tests failed (auto-reverted): ${(err as Error).message}`,
      });
      this.ts?.emit('self-modification', 'reflecting', `Apply reverted (tests failed): ${mod.title}`, 'notable');
      throw new Error(`Tests failed after applying — reverted: ${(err as Error).message}`);
    }

    // 6. Git commit on success
    if (hasGit) {
      try {
        const changedFiles = mod.generated_diff.map(d => d.filePath);
        for (const f of changedFiles) {
          execSync(`git add "${f}"`, { cwd: this.config.projectRoot, stdio: 'pipe' });
        }
        const commitMsg = `[selfmod] ${mod.title}\n\nModification #${modificationId}\nSource: ${mod.source_engine}`;
        execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: this.config.projectRoot, stdio: 'pipe' });
        this.log.info(`[self-mod] Git commit created for #${modificationId}`);
      } catch (err) {
        this.log.warn(`[self-mod] Git commit failed (non-critical): ${(err as Error).message}`);
      }
    }

    this.updateModification(modificationId, {
      status: 'applied',
      applied_at: new Date().toISOString(),
      rollback_data: JSON.stringify(rollbackData),
    });

    this.log.info(`[self-mod] Applied modification #${modificationId}: ${mod.title}`);
    this.ts?.emit('self-modification', 'discovering', `Applied: ${mod.title}`, 'breakthrough');

    return this.getModification(modificationId)!;
  }

  /** Rollback an applied modification. */
  rollbackModification(modificationId: number): SelfModification {
    const mod = this.getModification(modificationId);
    if (!mod) throw new Error(`Modification #${modificationId} not found`);
    if (mod.status !== 'applied') throw new Error(`Modification #${modificationId} is not applied`);
    if (!mod.rollback_data || mod.rollback_data.length === 0) {
      throw new Error(`No rollback data for #${modificationId}`);
    }

    this.restoreFiles(mod.rollback_data);

    // Build after restore
    if (this.config.projectRoot) {
      try {
        execSync('npm run build', {
          cwd: this.config.projectRoot,
          timeout: 60_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch { /* best effort */ }
    }

    this.updateModification(modificationId, { status: 'rolled_back' });
    this.log.info(`[self-mod] Rolled back modification #${modificationId}`);
    this.ts?.emit('self-modification', 'reflecting', `Rolled back: ${mod.title}`, 'notable');

    return this.getModification(modificationId)!;
  }

  /** Approve a modification (calls applyModification). */
  approveModification(modificationId: number): SelfModification {
    const mod = this.getModification(modificationId);
    if (!mod) throw new Error(`Modification #${modificationId} not found`);
    if (mod.status !== 'ready') throw new Error(`Modification #${modificationId} is not ready (current: ${mod.status})`);

    this.updateModification(modificationId, { status: 'approved' });
    return this.applyModification(modificationId);
  }

  /** Reject a modification with optional reason code. */
  rejectModification(modificationId: number, notes?: string, reasonCode?: string): SelfModification {
    const mod = this.getModification(modificationId);
    if (!mod) throw new Error(`Modification #${modificationId} not found`);

    this.updateModification(modificationId, {
      status: 'rejected',
      test_output: notes ? `Rejected: ${notes}` : mod.test_output,
    });

    if (reasonCode) {
      this.updateProposalMeta(modificationId, { reason_code: reasonCode });
    }

    this.log.info(`[self-mod] Rejected modification #${modificationId}${reasonCode ? ` [${reasonCode}]` : ''}${notes ? ': ' + notes : ''}`);
    return this.getModification(modificationId)!;
  }

  /** Get all pending modifications (ready or proposed). */
  getPending(): SelfModification[] {
    return (this.stmtGetPending.all() as RawModification[]).map(deserialize);
  }

  /** Get modification history. */
  getHistory(limit = 20): SelfModification[] {
    return (this.stmtGetHistory.all(limit) as RawModification[]).map(deserialize);
  }

  /** Get a single modification by ID. */
  getModification(id: number): SelfModification | null {
    const row = this.stmtGet.get(id) as RawModification | undefined;
    return row ? deserialize(row) : null;
  }

  /** Get status counts. */
  getStatus(): SelfModificationStatus {
    const byStatus: Record<string, number> = {};
    for (const row of this.stmtCountByStatus.all() as { status: string; count: number }[]) {
      byStatus[row.status] = row.count;
    }
    const last = this.stmtLastModification.get() as { created_at: string } | undefined;

    return {
      brainName: this.config.brainName,
      totalModifications: (this.stmtCountTotal.get() as { count: number }).count,
      byStatus,
      lastModification: last?.created_at ?? null,
      projectRoot: this.config.projectRoot || null,
    };
  }

  /** Record before/after metrics for an experiment iteration. */
  recordMetrics(modificationId: number, phase: 'before' | 'after', metrics: Record<string, number>): void {
    const key = phase === 'before' ? 'metrics_before' : 'metrics_after';
    this.updateProposalMeta(modificationId, { [key]: metrics });
  }

  /** Update structured proposal metadata fields. */
  private updateProposalMeta(id: number, meta: Partial<ProposalMeta>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (meta.hypothesis !== undefined) { fields.push('hypothesis = ?'); values.push(meta.hypothesis); }
    if (meta.risk_level !== undefined) { fields.push('risk_level = ?'); values.push(meta.risk_level); }
    if (meta.expected_impact !== undefined) { fields.push('expected_impact = ?'); values.push(JSON.stringify(meta.expected_impact)); }
    if (meta.acceptance_criteria !== undefined) { fields.push('acceptance_criteria = ?'); values.push(JSON.stringify(meta.acceptance_criteria)); }
    if (meta.reason_code !== undefined) { fields.push('reason_code = ?'); values.push(meta.reason_code); }
    if (meta.metrics_before !== undefined) { fields.push('metrics_before = ?'); values.push(JSON.stringify(meta.metrics_before)); }
    if (meta.metrics_after !== undefined) { fields.push('metrics_after = ?'); values.push(JSON.stringify(meta.metrics_after)); }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE self_modifications SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  // ── Private Helpers ────────────────────────────────────

  private updateModification(id: number, fields: Partial<{
    generated_diff: string;
    test_result: string;
    test_output: string | null;
    status: ModificationStatus;
    applied_at: string | null;
    rollback_data: string;
    tokens_used: number;
    model_used: string;
    generation_time_ms: number;
  }>): void {
    const current = this.stmtGet.get(id) as RawModification | undefined;
    if (!current) return;

    this.stmtUpdate.run(
      fields.generated_diff ?? current.generated_diff,
      fields.test_result ?? current.test_result,
      fields.test_output !== undefined ? fields.test_output : current.test_output,
      fields.status ?? current.status,
      fields.applied_at !== undefined ? fields.applied_at : current.applied_at,
      fields.rollback_data ?? current.rollback_data,
      fields.tokens_used ?? current.tokens_used,
      fields.model_used ?? current.model_used,
      fields.generation_time_ms ?? current.generation_time_ms,
      id,
    );
  }

  private checkRateLimit(): boolean {
    const oneHourAgo = Date.now() - 3600_000;
    this.recentGenerations = this.recentGenerations.filter(t => t > oneHourAgo);
    return this.recentGenerations.length < this.config.maxPerHour;
  }

  private parseGeneratedFiles(text: string, _targetFiles: string[]): FileDiff[] {
    const diffs: FileDiff[] = [];

    // Normalize CRLF → LF (Windows compat — Claude API responses may have \r\n)
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Pattern: ### FILE: <path>\n```<lang>\n<content>\n```
    // Supports: typescript, ts, js, javascript, or no language tag
    const fileBlockRegex = /###\s*FILE:\s*(.+?)\n```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    let skippedPaths = 0;

    while ((match = fileBlockRegex.exec(normalized)) !== null) {
      const filePath = match[1]!.trim();
      const newContent = match[2]!;

      // Only accept target files or files matching the whitelist
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (!isPathAllowed(normalizedPath)) {
        this.log.warn(`[self-mod] Skipping non-whitelisted path from Claude: ${normalizedPath}`);
        skippedPaths++;
        continue;
      }

      // Get old content
      let oldContent = '';
      if (this.selfScanner) {
        oldContent = this.selfScanner.getFileContent(normalizedPath) ?? '';
      }
      if (!oldContent && this.config.projectRoot) {
        const fullPath = path.resolve(this.config.projectRoot, normalizedPath);
        try { oldContent = fs.readFileSync(fullPath, 'utf-8'); } catch { /* new file */ }
      }

      diffs.push({ filePath: normalizedPath, oldContent, newContent });
    }

    if (diffs.length === 0 && normalized.length > 0) {
      this.log.warn(`[self-mod] Parser found 0 file blocks (${skippedPaths} skipped by path filter). Response preview: ${normalized.substring(0, 500)}`);
    }

    return diffs;
  }

  private restoreFiles(rollbackData: FileDiff[]): void {
    if (!this.config.projectRoot) return;
    for (const diff of rollbackData) {
      const fullPath = path.resolve(this.config.projectRoot, diff.filePath);
      try {
        if (diff.oldContent) {
          fs.writeFileSync(fullPath, diff.oldContent, 'utf-8');
        } else {
          // File didn't exist before — remove it
          fs.unlinkSync(fullPath);
        }
      } catch (err) {
        this.log.error(`[self-mod] Failed to restore ${diff.filePath}: ${(err as Error).message}`);
      }
    }
  }

  private recoverFromCrash(): void {
    try {
      const stuck = this.db.prepare("SELECT * FROM self_modifications WHERE status = 'testing'").all() as RawModification[];
      for (const row of stuck) {
        if (row.rollback_data) {
          const rollbackData = JSON.parse(row.rollback_data) as FileDiff[];
          this.restoreFiles(rollbackData);
          this.log.warn(`[self-mod] Crash recovery: restored files for modification #${row.id}`);
        }
        this.db.prepare("UPDATE self_modifications SET status = 'failed', test_output = 'Recovered from crash' WHERE id = ?").run(row.id);
      }
    } catch { /* table might not exist yet */ }
  }
}

// ── Raw DB row type ──────────────────────────────────────

interface RawModification {
  id: number;
  title: string;
  problem_description: string;
  source_engine: string;
  target_files: string;
  generated_diff: string | null;
  test_result: string;
  test_output: string | null;
  status: string;
  applied_at: string | null;
  rollback_data: string | null;
  tokens_used: number;
  model_used: string;
  generation_time_ms: number;
  created_at: string;
  // Experiment ledger fields
  hypothesis: string | null;
  risk_level: string | null;
  expected_impact: string | null;
  acceptance_criteria: string | null;
  reason_code: string | null;
  metrics_before: string | null;
  metrics_after: string | null;
}

function deserialize(row: RawModification): SelfModification {
  return {
    id: row.id,
    title: row.title,
    problem_description: row.problem_description,
    source_engine: row.source_engine,
    target_files: JSON.parse(row.target_files) as string[],
    generated_diff: row.generated_diff ? JSON.parse(row.generated_diff) as FileDiff[] : null,
    test_result: row.test_result as 'pending' | 'passed' | 'failed',
    test_output: row.test_output,
    status: row.status as ModificationStatus,
    applied_at: row.applied_at,
    rollback_data: row.rollback_data ? JSON.parse(row.rollback_data) as FileDiff[] : null,
    tokens_used: row.tokens_used,
    model_used: row.model_used,
    generation_time_ms: row.generation_time_ms,
    created_at: row.created_at,
    // Experiment ledger fields
    hypothesis: row.hypothesis ?? null,
    risk_level: row.risk_level ?? null,
    expected_impact: row.expected_impact ? JSON.parse(row.expected_impact) : null,
    acceptance_criteria: row.acceptance_criteria ? JSON.parse(row.acceptance_criteria) : null,
    reason_code: row.reason_code ?? null,
    metrics_before: row.metrics_before ? JSON.parse(row.metrics_before) : null,
    metrics_after: row.metrics_after ? JSON.parse(row.metrics_after) : null,
  };
}
