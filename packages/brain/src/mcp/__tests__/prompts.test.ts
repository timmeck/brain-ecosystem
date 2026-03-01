/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPromptsDirect } from '../prompts.js';

type Callback = (...args: any[]) => any;

describe('MCP Prompts (registerPromptsDirect)', () => {
  let registeredPrompts: Record<string, Callback>;
  let mockServer: { prompt: ReturnType<typeof vi.fn> };
  let mockRouter: { handle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    registeredPrompts = {};
    mockServer = {
      prompt: vi.fn((...args: unknown[]) => {
        // The prompt method can have 3 or 4 args before the callback
        const name = args[0] as string;
        const cb = args[args.length - 1] as Callback;
        registeredPrompts[name] = cb;
      }),
    };

    mockRouter = {
      handle: vi.fn(),
    };
  });

  it('registers all 4 prompts on the server', () => {
    registerPromptsDirect(mockServer as any, mockRouter as any);

    expect(mockServer.prompt).toHaveBeenCalledTimes(4);
    expect(registeredPrompts).toHaveProperty('brain-investigate-error');
    expect(registeredPrompts).toHaveProperty('brain-before-code-change');
    expect(registeredPrompts).toHaveProperty('brain-project-overview');
    expect(registeredPrompts).toHaveProperty('brain-review-solution');
  });

  describe('brain-investigate-error', () => {
    beforeEach(() => {
      registerPromptsDirect(mockServer as any, mockRouter as any);
    });

    it('calls error.report and returns structured response', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.report') {
            return {
              errorId: 1,
              isNew: true,
              matches: [],
              crossProjectMatches: [],
            };
          }
          if (method === 'synapse.context') {
            return { preventionRules: [], relevantModules: [] };
          }
          return {};
        });

      const result = await registeredPrompts['brain-investigate-error']!({
        error_output: 'TypeError: cannot read property of undefined',
      });

      expect(mockRouter.handle).toHaveBeenCalledWith('error.report', {
        project: 'default',
        errorOutput: 'TypeError: cannot read property of undefined',
      });
      expect(mockRouter.handle).toHaveBeenCalledWith('synapse.context', { errorId: 1 });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(result.messages[0].content.text).toContain('Error #1');
      expect(result.messages[0].content.text).toContain('NEW');
    });

    it('includes suggestions when available', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.report') {
            return {
              errorId: 5,
              isNew: true,
              matches: [{ errorId: 2, score: 0.95, isStrong: true, signals: [] }],
              crossProjectMatches: [],
              suggestions: {
                errorId: 5,
                suggestions: [
                  {
                    category: 'auto',
                    score: 0.92,
                    solution: {
                      id: 10,
                      description: 'Install missing dependency',
                      commands: 'npm install lodash',
                      code_change: null,
                    },
                    reasoning: 'Matched error #2 (95% similar). 100% success rate.',
                  },
                ],
                autoApply: {
                  category: 'auto',
                  score: 0.92,
                  solution: { id: 10, description: 'Install missing dependency' },
                },
                totalConsidered: 1,
              },
            };
          }
          if (method === 'synapse.context') {
            return { preventionRules: [], relevantModules: [] };
          }
          return {};
        });

      const result = await registeredPrompts['brain-investigate-error']!({
        error_output: 'ModuleNotFoundError: lodash',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Solution Suggestions');
      expect(text).toContain('[AUTO]');
      expect(text).toContain('Solution #10');
      expect(text).toContain('92%');
      expect(text).toContain('Install missing dependency');
      expect(text).toContain('npm install lodash');
      expect(text).toContain('RECOMMENDED');
    });

    it('includes similar errors and cross-project matches', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.report') {
            return {
              errorId: 3,
              isNew: true,
              matches: [
                { errorId: 7, score: 0.88, isStrong: true, signals: [] },
              ],
              crossProjectMatches: [
                { errorId: 15, score: 0.72, isStrong: false, signals: [] },
              ],
            };
          }
          if (method === 'synapse.context') {
            return { preventionRules: [], relevantModules: [] };
          }
          return {};
        });

      const result = await registeredPrompts['brain-investigate-error']!({
        error_output: 'SyntaxError: unexpected token',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Similar Errors');
      expect(text).toContain('Error #7');
      expect(text).toContain('88%');
      expect(text).toContain('STRONG');
      expect(text).toContain('Cross-Project Matches');
      expect(text).toContain('Error #15');
    });

    it('includes prevention rules and related modules from synapse context', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.report') {
            return {
              errorId: 1,
              isNew: true,
              matches: [],
              crossProjectMatches: [],
            };
          }
          if (method === 'synapse.context') {
            return {
              preventionRules: [{ id: 1 }, { id: 2 }],
              relevantModules: [{ id: 10 }],
            };
          }
          return {};
        });

      const result = await registeredPrompts['brain-investigate-error']!({
        error_output: 'Error: test',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Prevention Rules');
      expect(text).toContain('2 prevention rules');
      expect(text).toContain('Related Code Modules');
      expect(text).toContain('1 code modules');
    });

    it('handles synapse.context failure gracefully', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.report') {
            return {
              errorId: 1,
              isNew: false,
              matches: [],
              crossProjectMatches: [],
            };
          }
          if (method === 'synapse.context') {
            throw new Error('Synapse not available');
          }
          return {};
        });

      const result = await registeredPrompts['brain-investigate-error']!({
        error_output: 'Error: test',
      });

      // Should still return a valid result despite synapse error
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('Error #1');
      expect(result.messages[0].content.text).toContain('SEEN BEFORE');
    });
  });

  describe('brain-before-code-change', () => {
    beforeEach(() => {
      registerPromptsDirect(mockServer as any, mockRouter as any);
    });

    it('returns file advisory with errors and changes', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.query') {
            return [
              { id: 1, type: 'TypeError', message: 'cannot read property x', resolved: false },
              { id: 2, type: 'RangeError', message: 'index out of bounds', resolved: true },
            ];
          }
          if (method === 'changelog.query') {
            return [
              { change_type: 'refactor', summary: 'Extracted helper function', reason: 'DRY principle' },
            ];
          }
          if (method === 'rule.list') {
            return [{ id: 1 }, { id: 2 }, { id: 3 }];
          }
          if (method === 'decision.query') {
            return [
              { title: 'Use async/await', description: 'Decided to use async/await instead of callbacks for all new code in this module for consistency.' },
            ];
          }
          return [];
        });

      const result = await registeredPrompts['brain-before-code-change']!({
        file_path: 'src/services/auth.ts',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Brain Advisory: src/services/auth.ts');
      expect(text).toContain('Known Errors');
      expect(text).toContain('2 total');
      expect(text).toContain('1 unresolved');
      expect(text).toContain('#1');
      expect(text).toContain('UNRESOLVED');
      expect(text).toContain('Recent Changes');
      expect(text).toContain('Extracted helper function');
      expect(text).toContain('DRY principle');
      expect(text).toContain('Active Prevention Rules');
      expect(text).toContain('3 learned rules');
      expect(text).toContain('Related Decisions');
      expect(text).toContain('Use async/await');
    });

    it('calls correct IPC methods with file_path', async () => {
      mockRouter.handle.mockResolvedValue([]);

      await registeredPrompts['brain-before-code-change']!({
        file_path: 'src/index.ts',
      });

      expect(mockRouter.handle).toHaveBeenCalledWith('error.query', { search: 'src/index.ts' });
      expect(mockRouter.handle).toHaveBeenCalledWith('changelog.query', { filePath: 'src/index.ts', limit: 5 });
      expect(mockRouter.handle).toHaveBeenCalledWith('rule.list', {});
      expect(mockRouter.handle).toHaveBeenCalledWith('decision.query', { query: 'src/index.ts', limit: 3 });
    });

    it('shows fallback message when no prior knowledge exists', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'error.query') return [];
          if (method === 'changelog.query') return [];
          if (method === 'rule.list') return [];
          if (method === 'decision.query') return [];
          return [];
        });

      const result = await registeredPrompts['brain-before-code-change']!({
        file_path: 'brand-new-file.ts',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('No prior knowledge about this file');
    });

    it('handles all IPC calls failing gracefully', async () => {
      mockRouter.handle.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const result = await registeredPrompts['brain-before-code-change']!({
        file_path: 'src/broken.ts',
      });

      // Should still produce valid output — fallback message
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('No prior knowledge about this file');
    });
  });

  describe('brain-project-overview', () => {
    beforeEach(() => {
      registerPromptsDirect(mockServer as any, mockRouter as any);
    });

    it('returns health overview with stats', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'analytics.summary') {
            return {
              errors: { total: 42, unresolved: 5 },
              solutions: { total: 15 },
              rules: { active: 8 },
              modules: { total: 120 },
              insights: { active: 3 },
            };
          }
          if (method === 'synapse.stats') {
            return { totalSynapses: 200, totalNodes: 50, avgWeight: 0.456 };
          }
          if (method === 'synapse.list') {
            return [
              { sourceType: 'error', sourceId: 1, targetType: 'module', targetId: 5, weight: 0.95, type: 'similar_to' },
            ];
          }
          if (method === 'task.list') {
            return [
              { priority: 1, title: 'Fix auth bug' },
            ];
          }
          if (method === 'research.insights') {
            return [
              { type: 'pattern', title: 'Null checks missing', description: 'Multiple modules lack null checks on API responses.' },
            ];
          }
          return {};
        });

      const result = await registeredPrompts['brain-project-overview']!({ project: 'my-app' });

      const text = result.messages[0].content.text;
      expect(text).toContain('Brain Project Intelligence: my-app');
      expect(text).toContain('Health Overview');
      expect(text).toContain('42 total');
      expect(text).toContain('5 unresolved');
      expect(text).toContain('15 recorded');
      expect(text).toContain('8 active learned rules');
      expect(text).toContain('120 indexed');
      expect(text).toContain('3 active');
      expect(text).toContain('Synapse Network');
      expect(text).toContain('200');
      expect(text).toContain('50 nodes');
      expect(text).toContain('0.456');
      expect(text).toContain('Strongest Connections');
      expect(text).toContain('error:1');
      expect(text).toContain('module:5');
      expect(text).toContain('Active Tasks');
      expect(text).toContain('Fix auth bug');
      expect(text).toContain('Recent Insights');
      expect(text).toContain('Null checks missing');
    });

    it('works without project name', async () => {
      mockRouter.handle.mockImplementation(() => {
        throw new Error('Not found');
      });

      const result = await registeredPrompts['brain-project-overview']!({});

      const text = result.messages[0].content.text;
      expect(text).toContain('Brain Project Intelligence');
      expect(text).not.toContain(':');
    });
  });

  describe('brain-review-solution', () => {
    beforeEach(() => {
      registerPromptsDirect(mockServer as any, mockRouter as any);
    });

    it('returns solution details', async () => {
      mockRouter.handle
        .mockImplementation((method: string) => {
          if (method === 'solution.query') {
            return [{
              id: 7,
              description: 'Add null check before accessing property',
              commands: 'npm run lint --fix',
              code_change: '- obj.prop\n+ obj?.prop',
              source: 'human',
              confidence: 0.88,
              success_count: 5,
              fail_count: 1,
            }];
          }
          if (method === 'solution.efficiency') {
            return {
              avgDurationMs: 1200,
              successRateOverall: 0.83,
              totalAttempts: 6,
            };
          }
          return {};
        });

      const result = await registeredPrompts['brain-review-solution']!({
        solution_id: '7',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Solution Review');
      expect(text).toContain('Solution #7');
      expect(text).toContain('Add null check before accessing property');
      expect(text).toContain('npm run lint --fix');
      expect(text).toContain('obj?.prop');
      expect(text).toContain('human');
      expect(text).toContain('88%');
      expect(text).toContain('5 successes');
      expect(text).toContain('1 failures');
      expect(text).toContain('Overall Solution Statistics');
      expect(text).toContain('1200');
      expect(text).toContain('83%');
      expect(text).toContain('6');
    });

    it('calls solution.query with parsed integer errorId', async () => {
      mockRouter.handle.mockImplementation(() => {
        throw new Error('Not found');
      });

      await registeredPrompts['brain-review-solution']!({ solution_id: '42' });

      expect(mockRouter.handle).toHaveBeenCalledWith('solution.query', { errorId: 42 });
    });

    it('handles missing solution gracefully', async () => {
      mockRouter.handle.mockImplementation(() => {
        throw new Error('Solution not found');
      });

      const result = await registeredPrompts['brain-review-solution']!({
        solution_id: '999',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Could not retrieve solution details');
    });
  });
});
