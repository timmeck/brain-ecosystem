import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectScanner } from '../../../src/services/project-scanner.js';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn().mockReturnValue(''),
  statSync: vi.fn().mockReturnValue({ size: 100, isDirectory: () => true, isFile: () => true }),
  existsSync: vi.fn().mockReturnValue(false),
}));

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';

const mockedExecSync = vi.mocked(execSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedStatSync = vi.mocked(statSync);
const mockedExistsSync = vi.mocked(existsSync);

function createMockErrorService() {
  return {
    report: vi.fn().mockReturnValue({ errorId: 1, isNew: true, matches: [] }),
    query: vi.fn(),
    matchSimilar: vi.fn(),
    resolve: vi.fn(),
    getById: vi.fn(),
    countSince: vi.fn(),
    getErrorChain: vi.fn(),
    setEmbeddingEngine: vi.fn(),
    setAutoResolution: vi.fn(),
  };
}

function createMockSolutionService() {
  return {
    report: vi.fn().mockReturnValue(1),
    rateOutcome: vi.fn(),
    findForError: vi.fn(),
    getById: vi.fn(),
    successRate: vi.fn(),
    analyzeEfficiency: vi.fn(),
  };
}

function createMockGitService() {
  return {
    getGitContext: vi.fn(),
    linkErrorToCommit: vi.fn(),
    findIntroducingCommit: vi.fn(),
    findErrorsByCommit: vi.fn(),
    captureDiff: vi.fn(),
  };
}

describe('ProjectScanner', () => {
  let scanner: ProjectScanner;
  let errorService: ReturnType<typeof createMockErrorService>;
  let solutionService: ReturnType<typeof createMockSolutionService>;
  let gitService: ReturnType<typeof createMockGitService>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorService = createMockErrorService();
    solutionService = createMockSolutionService();
    gitService = createMockGitService();
    scanner = new ProjectScanner(errorService as any, solutionService as any, gitService as any);
  });

  // ─── scanGitHistory ───────────────────────────────────────

  describe('scanGitHistory', () => {
    it('parses fix commits and creates errors + solutions', () => {
      mockedExecSync
        .mockReturnValueOnce(
          'abc1234 fix: TypeError in auth module\ndef5678 feat: add login page\nghi9012 fix(api): null pointer crash\n' as any
        )
        .mockReturnValueOnce('commit abc1234\nAuthor: Tim\n\nfix: TypeError in auth module\n\n src/auth.ts | 5 +++--\n' as any)
        .mockReturnValueOnce('commit ghi9012\nAuthor: Tim\n\nfix(api): null pointer crash\n\n src/api.ts | 3 ++-\n' as any);

      const result = scanner.scanGitHistory('/project', 'test-project');

      expect(result.commitsScanned).toBe(3);
      expect(result.fixCommits).toBe(2);
      expect(result.errorsCreated).toBe(2);
      expect(result.solutionsCreated).toBe(2);
      expect(errorService.report).toHaveBeenCalledTimes(2);
      expect(solutionService.report).toHaveBeenCalledTimes(2);
    });

    it('handles non-git directory gracefully', () => {
      mockedExecSync.mockImplementation(() => { throw new Error('not a git repo'); });

      const result = scanner.scanGitHistory('/not-git', 'test');

      expect(result.commitsScanned).toBe(0);
      expect(result.fixCommits).toBe(0);
      expect(result.errorsCreated).toBe(0);
    });

    it('counts duplicates when error already exists', () => {
      mockedExecSync
        .mockReturnValueOnce('abc1234 fix: duplicate error\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nfix: duplicate error\n' as any);

      errorService.report.mockReturnValue({ errorId: 1, isNew: false, matches: [] });

      const result = scanner.scanGitHistory('/project', 'test');

      expect(result.duplicates).toBe(1);
      expect(result.errorsCreated).toBe(0);
      expect(solutionService.report).not.toHaveBeenCalled();
    });

    it('links error to commit via gitService', () => {
      mockedExecSync
        .mockReturnValueOnce('abc1234 fix: some error\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nfix: some error\n' as any);

      scanner.scanGitHistory('/project', 'test');

      expect(gitService.linkErrorToCommit).toHaveBeenCalledWith(1, 0, 'abc1234', 'fixed_by');
    });

    it('reports solution with git-import source', () => {
      mockedExecSync
        .mockReturnValueOnce('abc1234 fix: broken auth\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nfix: broken auth\n\n src/auth.ts | 2 +-\n' as any);

      scanner.scanGitHistory('/project', 'test');

      expect(solutionService.report).toHaveBeenCalledWith(
        expect.objectContaining({
          errorId: 1,
          source: 'git-import',
        })
      );
    });

    it('respects custom depth parameter', () => {
      mockedExecSync.mockReturnValue('' as any);

      scanner.scanGitHistory('/project', 'test', 500);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'git log --oneline -500',
        expect.objectContaining({ cwd: '/project' })
      );
    });
  });

  // ─── scanLogFiles ─────────────────────────────────────────

  describe('scanLogFiles', () => {
    it('finds and parses log files with errors', () => {
      mockedReaddirSync.mockReturnValue([
        { name: 'app.log', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedStatSync.mockReturnValue({ size: 500, isDirectory: () => false, isFile: () => true } as any);
      mockedReadFileSync.mockReturnValue(
        'Starting server...\nError: ECONNREFUSED 127.0.0.1:5432\n  at connect (net.js:1)\nnormal line\n'
      );

      const result = scanner.scanLogFiles('/project', 'test');

      expect(result.filesScanned).toBe(1);
      expect(result.errorsCreated).toBe(1);
      expect(errorService.report).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test',
          taskContext: expect.stringContaining('log-import'),
        })
      );
    });

    it('skips files larger than 1MB', () => {
      mockedReaddirSync.mockReturnValue([
        { name: 'huge.log', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedStatSync.mockReturnValue({ size: 2 * 1024 * 1024, isFile: () => true, isDirectory: () => false } as any);

      const result = scanner.scanLogFiles('/project', 'test');

      expect(result.filesScanned).toBe(0);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it('skips node_modules and .git directories', () => {
      mockedReaddirSync.mockImplementation((dir: any) => {
        if (dir === '/project') {
          return [
            { name: 'node_modules', isDirectory: () => true, isFile: () => false },
            { name: '.git', isDirectory: () => true, isFile: () => false },
            { name: 'src', isDirectory: () => true, isFile: () => false },
          ] as any;
        }
        return [];
      });

      scanner.scanLogFiles('/project', 'test');

      // Should only recurse into 'src', not node_modules or .git
      expect(mockedReaddirSync).toHaveBeenCalledTimes(2); // /project + /project/src
    });

    it('counts duplicates for existing errors', () => {
      mockedReaddirSync.mockReturnValue([
        { name: 'error.log', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedStatSync.mockReturnValue({ size: 100, isFile: () => true, isDirectory: () => false } as any);
      mockedReadFileSync.mockReturnValue('Error: something broke\n  at foo (bar.js:1)\n');
      errorService.report.mockReturnValue({ errorId: 5, isNew: false, matches: [] });

      const result = scanner.scanLogFiles('/project', 'test');

      expect(result.duplicates).toBe(1);
      expect(result.errorsCreated).toBe(0);
    });

    it('returns zero when no log files found', () => {
      mockedReaddirSync.mockReturnValue([]);

      const result = scanner.scanLogFiles('/project', 'test');

      expect(result.filesScanned).toBe(0);
      expect(result.errorsCreated).toBe(0);
    });
  });

  // ─── scanBuildOutput ──────────────────────────────────────

  describe('scanBuildOutput', () => {
    it('detects npm build system via package.json', () => {
      mockedExistsSync.mockImplementation((p: any) => {
        return String(p).endsWith('package.json');
      });

      // Build succeeds
      mockedExecSync.mockReturnValue('' as any);

      const result = scanner.scanBuildOutput('/project', 'test');

      expect(result.buildSystem).toBe('npm');
      expect(result.command).toBe('npm run build');
      expect(result.exitCode).toBe(0);
      expect(result.errorsCreated).toBe(0);
    });

    it('detects cargo build system via Cargo.toml', () => {
      mockedExistsSync.mockImplementation((p: any) => {
        return String(p).endsWith('Cargo.toml');
      });
      mockedExecSync.mockReturnValue('' as any);

      const result = scanner.scanBuildOutput('/project', 'test');
      expect(result.buildSystem).toBe('cargo');
    });

    it('reports errors from failed build', () => {
      mockedExistsSync.mockImplementation((p: any) => {
        return String(p).endsWith('package.json');
      });

      const buildError = new Error('build failed') as any;
      buildError.status = 1;
      buildError.stderr = 'Error: Cannot find module \'missing-dep\'\n  at require (module.js:1)\n';
      buildError.stdout = '';
      mockedExecSync.mockImplementation(() => { throw buildError; });

      const result = scanner.scanBuildOutput('/project', 'test');

      expect(result.exitCode).toBe(1);
      expect(result.errorsCreated).toBe(1);
      expect(errorService.report).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test',
          command: 'npm run build',
          taskContext: expect.stringContaining('build-import'),
        })
      );
    });

    it('returns unknown when no build system detected', () => {
      mockedExistsSync.mockReturnValue(false as any);

      const result = scanner.scanBuildOutput('/project', 'test');

      expect(result.buildSystem).toBe('unknown');
      expect(result.errorsCreated).toBe(0);
    });
  });

  // ─── scan (orchestrator) ──────────────────────────────────

  describe('scan', () => {
    it('orchestrates all 3 strategies', () => {
      // Git: returns commits
      mockedExecSync
        .mockReturnValueOnce('abc1234 fix: error one\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nfix: error one\n' as any);

      // Logs: no files
      mockedReaddirSync.mockReturnValue([]);

      // Build: no build system
      mockedExistsSync.mockReturnValue(false as any);

      const result = scanner.scan('/project', 'test');

      expect(result.project).toBe('test');
      expect(result.git).not.toBeNull();
      expect(result.logs).not.toBeNull();
      expect(result.build).not.toBeNull();
      expect(result.totals.errors).toBe(1);
      expect(result.totals.solutions).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('respects skipBuild option', () => {
      mockedExecSync.mockReturnValue('' as any);
      mockedReaddirSync.mockReturnValue([]);

      const result = scanner.scan('/project', 'test', { skipBuild: true });

      expect(result.build).toBeNull();
    });

    it('respects skipGit option', () => {
      mockedReaddirSync.mockReturnValue([]);
      mockedExistsSync.mockReturnValue(false as any);

      const result = scanner.scan('/project', 'test', { skipGit: true });

      expect(result.git).toBeNull();
    });

    it('respects skipLogs option', () => {
      mockedExecSync.mockReturnValue('' as any);
      mockedExistsSync.mockReturnValue(false as any);

      const result = scanner.scan('/project', 'test', { skipLogs: true });

      expect(result.logs).toBeNull();
    });

    it('stores result accessible via getLastResult', () => {
      mockedExecSync.mockReturnValue('' as any);
      mockedReaddirSync.mockReturnValue([]);
      mockedExistsSync.mockReturnValue(false as any);

      expect(scanner.getLastResult()).toBeNull();

      const result = scanner.scan('/project', 'test');

      expect(scanner.getLastResult()).toBe(result);
    });

    it('accumulates totals from all strategies', () => {
      // Git: 1 error + 1 solution
      mockedExecSync
        .mockReturnValueOnce('aaa1111 fix: git error\n' as any)
        .mockReturnValueOnce('commit aaa1111\n\nfix: git error\n' as any);

      // Logs: 1 error
      mockedReaddirSync.mockReturnValue([
        { name: 'error.log', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedStatSync.mockReturnValue({ size: 100, isFile: () => true, isDirectory: () => false } as any);
      mockedReadFileSync.mockReturnValue('Fatal Error: out of memory\n');

      // Build: no system
      mockedExistsSync.mockReturnValue(false as any);

      // Second error.report call is new too
      errorService.report.mockReturnValue({ errorId: 2, isNew: true, matches: [] });

      const result = scanner.scan('/project', 'test');

      expect(result.totals.errors).toBe(2);
      expect(result.totals.solutions).toBe(1);
    });
  });

  // ─── Deduplication ────────────────────────────────────────

  describe('deduplication', () => {
    it('does not create solution for duplicate errors from git', () => {
      mockedExecSync
        .mockReturnValueOnce('abc1234 fix: same error\ndef5678 fix: same error\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nfix: same error\n' as any)
        .mockReturnValueOnce('commit def5678\n\nfix: same error\n' as any);

      // First call: new, second call: duplicate
      errorService.report
        .mockReturnValueOnce({ errorId: 1, isNew: true, matches: [] })
        .mockReturnValueOnce({ errorId: 1, isNew: false, matches: [] });

      const result = scanner.scanGitHistory('/project', 'test');

      expect(result.errorsCreated).toBe(1);
      expect(result.duplicates).toBe(1);
      expect(solutionService.report).toHaveBeenCalledTimes(1);
    });

    it('deduplicates identical error chunks from log files', () => {
      mockedReaddirSync.mockReturnValue([
        { name: 'app.log', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedStatSync.mockReturnValue({ size: 200, isFile: () => true, isDirectory: () => false } as any);
      // Same error appears twice
      mockedReadFileSync.mockReturnValue(
        'Error: connection lost\n  at connect (db.js:1)\nok\nError: connection lost\n  at connect (db.js:1)\n'
      );

      scanner.scanLogFiles('/project', 'test');

      // extractErrorChunks deduplicates identical chunks before reporting
      expect(errorService.report).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Error extraction ─────────────────────────────────────

  describe('error extraction from commits', () => {
    it('extracts error from conventional commit format', () => {
      mockedExecSync
        .mockReturnValueOnce('abc1234 fix: TypeError in validation\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nfix: TypeError in validation\n' as any);

      scanner.scanGitHistory('/project', 'test');

      expect(errorService.report).toHaveBeenCalledWith(
        expect.objectContaining({
          errorOutput: 'TypeError in validation',
        })
      );
    });

    it('extracts error from "fixed crash" style messages', () => {
      mockedExecSync
        .mockReturnValueOnce('abc1234 Fixed crash when loading config\n' as any)
        .mockReturnValueOnce('commit abc1234\n\nFixed crash when loading config\n' as any);

      scanner.scanGitHistory('/project', 'test');

      expect(errorService.report).toHaveBeenCalledWith(
        expect.objectContaining({
          errorOutput: expect.stringContaining('loading config'),
        })
      );
    });

    it('skips non-fix commits', () => {
      mockedExecSync.mockReturnValue(
        'abc1234 feat: add new feature\ndef5678 refactor: clean up code\nghi9012 docs: update readme\n' as any
      );

      const result = scanner.scanGitHistory('/project', 'test');

      expect(result.fixCommits).toBe(0);
      expect(errorService.report).not.toHaveBeenCalled();
    });
  });
});
