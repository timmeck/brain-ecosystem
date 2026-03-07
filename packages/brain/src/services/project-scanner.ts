import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import type { ErrorService } from './error.service.js';
import type { SolutionService } from './solution.service.js';
import type { GitService } from './git.service.js';
import { getLogger } from '../utils/logger.js';

export interface ScanOptions {
  gitDepth?: number;
  skipBuild?: boolean;
  skipGit?: boolean;
  skipLogs?: boolean;
}

export interface ScanResult {
  project: string;
  directory: string;
  duration: number;
  git: GitScanResult | null;
  logs: LogScanResult | null;
  build: BuildScanResult | null;
  totals: { errors: number; solutions: number; duplicates: number };
}

export interface GitScanResult {
  commitsScanned: number;
  fixCommits: number;
  errorsCreated: number;
  solutionsCreated: number;
  duplicates: number;
}

export interface LogScanResult {
  filesScanned: number;
  errorsCreated: number;
  duplicates: number;
}

export interface BuildScanResult {
  buildSystem: string;
  command: string;
  exitCode: number;
  errorsCreated: number;
}

const FIX_PATTERNS = /\b(fix|bug|error|crash|resolve[ds]?|patch|hotfix)\b/i;

// Log patterns for future log-scanning feature
// const LOG_PATTERNS = ['*.log', '*.err', 'npm-debug.log*', 'crash-*.txt'];
const LOG_EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'vendor', 'coverage', '.cache', '.turbo', 'target', 'out', 'venv',
]);
const MAX_LOG_SIZE = 1024 * 1024; // 1MB

interface BuildSystem {
  name: string;
  command: string;
  detect: string; // filename to check
}

const BUILD_SYSTEMS: BuildSystem[] = [
  { name: 'npm', command: 'npm run build', detect: 'package.json' },
  { name: 'cargo', command: 'cargo build 2>&1', detect: 'Cargo.toml' },
  { name: 'make', command: 'make 2>&1', detect: 'Makefile' },
  { name: 'gradle', command: './gradlew build 2>&1', detect: 'build.gradle' },
  { name: 'maven', command: 'mvn compile 2>&1', detect: 'pom.xml' },
  { name: 'go', command: 'go build ./... 2>&1', detect: 'go.mod' },
];

export class ProjectScanner {
  private logger = getLogger();
  private lastScanResult: ScanResult | null = null;

  constructor(
    private errorService: ErrorService,
    private solutionService: SolutionService,
    private gitService: GitService,
  ) {}

  getLastResult(): ScanResult | null {
    return this.lastScanResult;
  }

  scan(directory: string, project: string, options: ScanOptions = {}): ScanResult {
    const start = Date.now();
    const dir = resolve(directory);

    const totals = { errors: 0, solutions: 0, duplicates: 0 };

    let git: GitScanResult | null = null;
    let logs: LogScanResult | null = null;
    let build: BuildScanResult | null = null;

    if (!options.skipGit) {
      try {
        git = this.scanGitHistory(dir, project, options.gitDepth ?? 200);
        totals.errors += git.errorsCreated;
        totals.solutions += git.solutionsCreated;
        totals.duplicates += git.duplicates;
      } catch (err) {
        this.logger.warn(`Git scan failed: ${(err as Error).message}`);
      }
    }

    if (!options.skipLogs) {
      try {
        logs = this.scanLogFiles(dir, project);
        totals.errors += logs.errorsCreated;
        totals.duplicates += logs.duplicates;
      } catch (err) {
        this.logger.warn(`Log scan failed: ${(err as Error).message}`);
      }
    }

    if (!options.skipBuild) {
      try {
        build = this.scanBuildOutput(dir, project);
        totals.errors += build.errorsCreated;
      } catch (err) {
        this.logger.warn(`Build scan failed: ${(err as Error).message}`);
      }
    }

    const result: ScanResult = {
      project,
      directory: dir,
      duration: Date.now() - start,
      git,
      logs,
      build,
      totals,
    };

    this.lastScanResult = result;
    this.logger.info(`Project scan complete: ${totals.errors} errors, ${totals.solutions} solutions, ${totals.duplicates} duplicates (${result.duration}ms)`);
    return result;
  }

  scanGitHistory(dir: string, project: string, depth: number = 200): GitScanResult {
    const result: GitScanResult = {
      commitsScanned: 0,
      fixCommits: 0,
      errorsCreated: 0,
      solutionsCreated: 0,
      duplicates: 0,
    };

    // Get commit log
    let logOutput: string;
    try {
      logOutput = execSync(`git log --oneline -${depth}`, {
        cwd: dir,
        timeout: 10000,
        encoding: 'utf8',
      }).trim();
    } catch {
      this.logger.warn('Not a git repository or git not available');
      return result;
    }

    if (!logOutput) return result;
    const commits = logOutput.split('\n').filter(Boolean);
    result.commitsScanned = commits.length;

    // Filter for fix commits
    const fixCommits = commits.filter(line => FIX_PATTERNS.test(line));
    result.fixCommits = fixCommits.length;

    for (const line of fixCommits) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      const hash = line.slice(0, spaceIdx);
      const message = line.slice(spaceIdx + 1);

      // Get the diff for this commit
      let diff: string;
      try {
        diff = execSync(`git show --stat --no-color ${hash}`, {
          cwd: dir,
          timeout: 5000,
          encoding: 'utf8',
          maxBuffer: 512 * 1024,
        }).trim();
      } catch {
        continue;
      }

      // Extract error info from commit message
      const errorOutput = this.extractErrorFromCommit(message, diff);
      if (!errorOutput) continue;

      // Report error
      const errorResult = this.errorService.report({
        project,
        errorOutput,
        taskContext: `git-import: ${hash.slice(0, 8)}`,
        command: `git show ${hash.slice(0, 8)}`,
      });

      if (errorResult.isNew) {
        result.errorsCreated++;

        // Create solution from the fix commit
        const solutionDesc = this.extractSolutionFromCommit(message, diff);
        if (solutionDesc) {
          this.solutionService.report({
            errorId: errorResult.errorId,
            description: solutionDesc,
            codeChange: this.extractDiffSummary(diff),
            source: 'git-import',
          });
          result.solutionsCreated++;
        }

        // Link error to commit
        try {
          this.gitService.linkErrorToCommit(errorResult.errorId, 0, hash, 'fixed_by');
        } catch {
          // project_id 0 may fail — best effort
        }
      } else {
        result.duplicates++;
      }
    }

    this.logger.info(`Git scan: ${result.commitsScanned} commits, ${result.fixCommits} fixes → ${result.errorsCreated} errors, ${result.solutionsCreated} solutions`);
    return result;
  }

  scanLogFiles(dir: string, project: string): LogScanResult {
    const result: LogScanResult = {
      filesScanned: 0,
      errorsCreated: 0,
      duplicates: 0,
    };

    const logFiles = this.findLogFiles(dir);
    result.filesScanned = logFiles.length;

    for (const filePath of logFiles) {
      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      // Split into error chunks (groups of lines with stack traces)
      const errorChunks = this.extractErrorChunks(content);
      const rel = relative(dir, filePath);

      for (const chunk of errorChunks) {
        const errorResult = this.errorService.report({
          project,
          errorOutput: chunk,
          filePath: rel,
          taskContext: `log-import: ${rel}`,
        });

        if (errorResult.isNew) {
          result.errorsCreated++;
        } else {
          result.duplicates++;
        }
      }
    }

    this.logger.info(`Log scan: ${result.filesScanned} files → ${result.errorsCreated} errors`);
    return result;
  }

  scanBuildOutput(dir: string, project: string): BuildScanResult {
    const buildSystem = this.detectBuildSystem(dir);
    if (!buildSystem) {
      return { buildSystem: 'unknown', command: '', exitCode: -1, errorsCreated: 0 };
    }

    const result: BuildScanResult = {
      buildSystem: buildSystem.name,
      command: buildSystem.command,
      exitCode: 0,
      errorsCreated: 0,
    };

    let output: string;
    try {
      output = execSync(buildSystem.command, {
        cwd: dir,
        timeout: 60000,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Build succeeded — no errors to report
      return result;
    } catch (err) {
      const execErr = err as { status?: number; stdout?: string; stderr?: string };
      result.exitCode = execErr.status ?? 1;
      output = (execErr.stderr ?? '') + '\n' + (execErr.stdout ?? '');
    }

    if (!output.trim()) return result;

    // Parse build output for errors
    const errorChunks = this.extractErrorChunks(output);

    for (const chunk of errorChunks) {
      const errorResult = this.errorService.report({
        project,
        errorOutput: chunk,
        taskContext: `build-import: ${buildSystem.command}`,
        command: buildSystem.command,
      });

      if (errorResult.isNew) {
        result.errorsCreated++;
      }
    }

    this.logger.info(`Build scan (${buildSystem.name}): exit ${result.exitCode} → ${result.errorsCreated} errors`);
    return result;
  }

  // ─── Private Helpers ───────────────────────────────────────

  private extractErrorFromCommit(message: string, _diff: string): string | null {
    // Try to extract meaningful error description from fix commit
    const msg = message.toLowerCase();

    // Common patterns: "fix: TypeError in foo", "fix(auth): null check missing"
    const fixMatch = message.match(/^(?:fix|bug|hotfix|patch)(?:\([^)]+\))?:\s*(.+)/i);
    if (fixMatch) {
      return fixMatch[1]!.trim();
    }

    // "Fixed crash when ...", "Resolve error in ..."
    const verbMatch = message.match(/(?:fix(?:ed|es)?|resolv(?:ed|es)?|patch(?:ed)?|crash)\s+(.+)/i);
    if (verbMatch) {
      return verbMatch[1]!.trim();
    }

    // If message mentions an error type directly
    const errorTypeMatch = message.match(/(TypeError|ReferenceError|SyntaxError|RangeError|Error|Exception|ENOENT|ECONNREFUSED|segfault|panic|SIGKILL|OOM|null pointer)[:\s]+(.+)/i);
    if (errorTypeMatch) {
      return `${errorTypeMatch[1]}: ${errorTypeMatch[2]}`.trim();
    }

    // Fallback: use the whole message if it's clearly about a fix
    if (FIX_PATTERNS.test(msg)) {
      return message.trim();
    }

    return null;
  }

  private extractSolutionFromCommit(message: string, _diff: string): string | null {
    // The commit message itself describes the solution
    const fixMatch = message.match(/^(?:fix|bug|hotfix|patch)(?:\([^)]+\))?:\s*(.+)/i);
    if (fixMatch) return `Fix: ${fixMatch[1]!.trim()}`;

    return `Fix applied in commit: ${message.trim()}`;
  }

  private extractDiffSummary(diff: string): string {
    // Get just the stat lines, not the full diff
    const lines = diff.split('\n');
    const statLines = lines.filter(l =>
      l.match(/^\s*\S+\s*\|\s*\d+/) || l.match(/^\d+ files? changed/)
    );
    if (statLines.length > 0) {
      return statLines.join('\n');
    }
    // Truncate if needed
    return diff.length > 2000 ? diff.slice(0, 2000) + '\n... (truncated)' : diff;
  }

  private findLogFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (current: string, depth: number): void => {
      if (depth > 5) return; // max recursion depth
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = join(current, entry.name);

        if (entry.isDirectory()) {
          if (!LOG_EXCLUDE_DIRS.has(entry.name)) {
            walk(fullPath, depth + 1);
          }
          continue;
        }

        if (!entry.isFile()) continue;

        // Check log patterns
        const name = entry.name;
        const isLog = name.endsWith('.log') ||
                      name.endsWith('.err') ||
                      name.startsWith('npm-debug.log') ||
                      name.match(/^crash-.*\.txt$/);

        if (!isLog) continue;

        try {
          const stat = statSync(fullPath);
          if (stat.size > MAX_LOG_SIZE) continue;
          files.push(fullPath);
        } catch {
          // skip unreadable
        }
      }
    };

    walk(dir, 0);
    return files;
  }

  private extractErrorChunks(content: string): string[] {
    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let inError = false;

    for (const line of lines) {
      const isErrorLine = /\b(Error|Exception|FATAL|CRITICAL|panic|Traceback|segfault)\b/i.test(line) ||
                          /^\s+at\s+/.test(line) ||
                          /^\s+File\s+"/.test(line) ||
                          /^\s+\.{3}\s+\d+\s+more/.test(line);

      if (isErrorLine) {
        if (!inError) {
          inError = true;
          currentChunk = [];
        }
        currentChunk.push(line);
      } else if (inError) {
        // Allow 1 non-error line in a stack trace (blank lines between frames)
        if (line.trim() === '' && currentChunk.length < 50) {
          currentChunk.push(line);
        } else {
          // End of error chunk
          if (currentChunk.length >= 1) {
            chunks.push(currentChunk.join('\n').trim());
          }
          currentChunk = [];
          inError = false;
        }
      }
    }

    // Don't forget last chunk
    if (currentChunk.length >= 1) {
      chunks.push(currentChunk.join('\n').trim());
    }

    // Deduplicate identical chunks
    return [...new Set(chunks)];
  }

  private detectBuildSystem(dir: string): BuildSystem | null {
    for (const bs of BUILD_SYSTEMS) {
      if (existsSync(join(dir, bs.detect))) {
        return bs;
      }
    }
    return null;
  }
}
