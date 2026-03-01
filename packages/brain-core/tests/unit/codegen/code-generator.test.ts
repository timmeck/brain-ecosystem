import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import Database from 'better-sqlite3';
import { CodeGenerator, runCodeGeneratorMigration } from '../../../src/codegen/code-generator.js';

// Mock global fetch for Claude API calls
const mockFetchResponse = {
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '```typescript\nexport function hello(): string {\n  return "Hello, World!";\n}\n```\n\nThis function returns a greeting string.' }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }),
  text: vi.fn().mockResolvedValue(''),
};

vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse));

describe('CodeGenerator', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    vi.clearAllMocks();
    // Re-stub fetch after clearAllMocks
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '```typescript\nexport function hello(): string {\n  return "Hello, World!";\n}\n```\n\nThis function returns a greeting string.' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      text: vi.fn().mockResolvedValue(''),
    }));
  });

  afterEach(() => {
    db.close();
  });

  describe('runCodeGeneratorMigration', () => {
    it('should create code_generations table', () => {
      runCodeGeneratorMigration(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_generations'").all();
      expect(tables).toHaveLength(1);
    });

    it('should be idempotent', () => {
      runCodeGeneratorMigration(db);
      runCodeGeneratorMigration(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_generations'").all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('constructor', () => {
    it('should create tables on construction', () => {
      new CodeGenerator(db, { brainName: 'test' });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='code_generations'").all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('generate', () => {
    it('should throw without API key', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: undefined });
      const origKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await expect(gen.generate({ task: 'Hello world' })).rejects.toThrow('ANTHROPIC_API_KEY not configured');

      process.env.ANTHROPIC_API_KEY = origKey;
    });

    it('should generate code and store in DB', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key-123' });

      const result = await gen.generate({
        task: 'Write a hello world function',
        trigger: 'manual',
      });

      expect(result.id).toBe(1);
      expect(result.status).toBe('generated');
      expect(result.generated_code).toContain('hello');
      expect(result.generated_explanation).toContain('greeting');
      expect(result.tokens_used).toBe(150);
      expect(result.task).toBe('Write a hello world function');
    });

    it('should call fetch with correct API parameters', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'sk-test-key' });
      await gen.generate({ task: 'Test task' });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-test-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );
    });

    it('should respect rate limits', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key', maxPerHour: 2 });

      await gen.generate({ task: 'Task 1' });
      await gen.generate({ task: 'Task 2' });
      await expect(gen.generate({ task: 'Task 3' })).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle API errors gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
      }));

      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      const result = await gen.generate({ task: 'Test' });

      expect(result.status).toBe('failed');
      expect(result.generated_explanation).toContain('429');
    });

    it('should emit ThoughtStream thoughts', async () => {
      const emitFn = vi.fn();
      const mockStream = { emit: emitFn, getRecent: vi.fn(), getByEngine: vi.fn(), getStats: vi.fn(), getEngineActivity: vi.fn(), clear: vi.fn(), onThought: vi.fn() };

      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gen.setThoughtStream(mockStream as any);

      await gen.generate({ task: 'Test task' });
      expect(emitFn).toHaveBeenCalledWith('code_generator', 'analyzing', expect.any(String));
      expect(emitFn).toHaveBeenCalledWith('code_generator', 'discovering', expect.any(String), 'notable');
    });

    it('should use context builder when set', async () => {
      const mockBuilder = {
        build: vi.fn().mockReturnValue({
          systemPrompt: 'Enhanced prompt with principles',
          principlesUsed: 5,
          antiPatternsUsed: 2,
          patternsUsed: 3,
          totalTokensEstimate: 500,
        }),
      };

      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gen.setContextBuilder(mockBuilder as any);

      const result = await gen.generate({ task: 'Generate code' });
      expect(mockBuilder.build).toHaveBeenCalled();
      expect(result.principles_used).toBe(5);
      expect(result.anti_patterns_used).toBe(2);
      expect(result.patterns_used).toBe(3);
    });
  });

  describe('approve', () => {
    it('should approve a generated code', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      const result = await gen.generate({ task: 'Test' });

      const approved = gen.approve(result.id, 'Looks good');
      expect(approved?.status).toBe('approved');
      expect(approved?.review_notes).toBe('Looks good');
    });

    it('should not approve non-existent generation', () => {
      const gen = new CodeGenerator(db, { brainName: 'test' });
      const result = gen.approve(999);
      expect(result).toBeUndefined();
    });
  });

  describe('reject', () => {
    it('should reject a generated code', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      const result = await gen.generate({ task: 'Test' });

      const rejected = gen.reject(result.id, 'Not what I need');
      expect(rejected?.status).toBe('rejected');
      expect(rejected?.review_notes).toBe('Not what I need');
    });
  });

  describe('list', () => {
    it('should list all generations', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      await gen.generate({ task: 'Task 1' });
      await gen.generate({ task: 'Task 2' });

      const all = gen.list();
      expect(all).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      await gen.generate({ task: 'Task 1' });
      const result = await gen.generate({ task: 'Task 2' });
      gen.approve(result.id);

      const generated = gen.list('generated');
      expect(generated).toHaveLength(1);
      const approved = gen.list('approved');
      expect(approved).toHaveLength(1);
    });
  });

  describe('getSummary', () => {
    it('should return empty stats when no generations', () => {
      const gen = new CodeGenerator(db, { brainName: 'test' });
      const summary = gen.getSummary();
      expect(summary.total_generations).toBe(0);
      expect(summary.total_tokens_used).toBe(0);
      expect(summary.approval_rate).toBe(0);
    });

    it('should calculate approval rate', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      const r1 = await gen.generate({ task: 'Task 1' });
      const r2 = await gen.generate({ task: 'Task 2' });

      gen.approve(r1.id);
      gen.reject(r2.id);

      const summary = gen.getSummary();
      expect(summary.total_generations).toBe(2);
      expect(summary.approval_rate).toBe(0.5);
      expect(summary.total_tokens_used).toBe(300); // 150 * 2
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent id', () => {
      const gen = new CodeGenerator(db, { brainName: 'test' });
      expect(gen.get(999)).toBeUndefined();
    });

    it('should return generation by id', async () => {
      const gen = new CodeGenerator(db, { brainName: 'test', apiKey: 'test-key' });
      const result = await gen.generate({ task: 'Hello' });

      const fetched = gen.get(result.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.task).toBe('Hello');
    });
  });
});
