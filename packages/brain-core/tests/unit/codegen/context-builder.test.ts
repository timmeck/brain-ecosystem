import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContextBuilder } from '../../../src/codegen/context-builder.js';
import { PatternExtractor, runPatternExtractorMigration } from '../../../src/codegen/pattern-extractor.js';
import { runCodeMinerMigration } from '../../../src/codegen/code-miner.js';
import type { GenerationRequest } from '../../../src/codegen/types.js';

describe('ContextBuilder', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runCodeMinerMigration(db);
    runPatternExtractorMigration(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('build', () => {
    it('should build a basic prompt without any engines', () => {
      const builder = new ContextBuilder();
      const request: GenerationRequest = { task: 'Write a hello world function' };
      const result = builder.build(request);

      expect(result.systemPrompt).toContain('Code-Generator');
      expect(result.systemPrompt).toContain('Write a hello world function');
      expect(result.systemPrompt).toContain('TypeScript ESM');
      expect(result.principlesUsed).toBe(0);
      expect(result.antiPatternsUsed).toBe(0);
      expect(result.patternsUsed).toBe(0);
      expect(result.totalTokensEstimate).toBeGreaterThan(0);
    });

    it('should include target file in prompt', () => {
      const builder = new ContextBuilder();
      const request: GenerationRequest = {
        task: 'Write a rate limiter',
        target_file: 'src/middleware/rate-limiter.ts',
      };
      const result = builder.build(request);
      expect(result.systemPrompt).toContain('src/middleware/rate-limiter.ts');
    });

    it('should include additional context', () => {
      const builder = new ContextBuilder();
      const request: GenerationRequest = {
        task: 'Generate a service',
        context: 'Use token bucket algorithm',
      };
      const result = builder.build(request);
      expect(result.systemPrompt).toContain('token bucket algorithm');
    });

    it('should handle custom language', () => {
      const builder = new ContextBuilder();
      const request: GenerationRequest = {
        task: 'Generate a script',
        language: 'python',
      };
      const result = builder.build(request);
      expect(result.systemPrompt).toContain('python');
    });

    it('should include principles from KnowledgeDistiller', () => {
      const mockDistiller = {
        getPrinciples: vi.fn().mockReturnValue([
          { statement: 'Always validate input', confidence: 0.92, success_rate: 0.88 },
          { statement: 'Use dependency injection', confidence: 0.85, success_rate: 0.80 },
        ]),
        getAntiPatterns: vi.fn().mockReturnValue([
          { statement: 'Never use global state', failure_rate: 0.75, alternative: 'Use DI containers' },
        ]),
        getPackage: vi.fn().mockReturnValue({
          strategies: [
            { description: 'Prefer composition over inheritance', effectiveness: 0.90 },
          ],
        }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder = new ContextBuilder(mockDistiller as any);
      const request: GenerationRequest = { task: 'Generate a validator' };
      const result = builder.build(request);

      expect(result.systemPrompt).toContain('Always validate input');
      expect(result.systemPrompt).toContain('confidence: 0.92');
      expect(result.systemPrompt).toContain('Never use global state');
      expect(result.systemPrompt).toContain('DI containers');
      expect(result.systemPrompt).toContain('composition over inheritance');
      expect(result.principlesUsed).toBe(2);
      expect(result.antiPatternsUsed).toBe(1);
    });

    it('should include journal insights', () => {
      const mockJournal = {
        getEntries: vi.fn().mockReturnValue([
          { title: 'Discovered: Rate limiting improves stability', content: 'After implementing rate limiting, error rate dropped 40%.' },
        ]),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder = new ContextBuilder(null, mockJournal as any);
      const request: GenerationRequest = { task: 'Generate code' };
      const result = builder.build(request);

      expect(result.systemPrompt).toContain('Rate limiting improves stability');
    });

    it('should include patterns from PatternExtractor', () => {
      const extractor = new PatternExtractor(db);
      // Seed some patterns
      db.prepare(`INSERT INTO extracted_patterns (pattern_type, pattern_key, pattern_data, frequency, confidence) VALUES (?, ?, ?, ?, ?)`).run('dependency', 'zod', JSON.stringify({ name: 'zod', percentage: 68 }), 34, 0.68);
      db.prepare(`INSERT INTO extracted_patterns (pattern_type, pattern_key, pattern_data, frequency, confidence) VALUES (?, ?, ?, ?, ?)`).run('tech_stack', 'ESM + TypeScript + Vitest', JSON.stringify({ stack: 'ESM + TypeScript + Vitest', count: 25 }), 25, 0.5);

      const builder = new ContextBuilder(null, null, extractor);
      const request: GenerationRequest = { task: 'Generate code', include_patterns: true };
      const result = builder.build(request);

      expect(result.systemPrompt).toContain('zod');
      expect(result.systemPrompt).toContain('68%');
      expect(result.patternsUsed).toBeGreaterThan(0);
    });
  });
});
