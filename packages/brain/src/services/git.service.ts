import { execSync } from 'node:child_process';
import type Database from 'better-sqlite3';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { getLogger } from '../utils/logger.js';

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export class GitService {
  private logger = getLogger();

  constructor(
    private db: Database.Database,
    private synapseManager: SynapseManager,
  ) {}

  /**
   * Get current git info for context enrichment
   */
  getGitContext(cwd?: string): { branch: string | null; diff: string | null; lastCommit: string | null } {
    try {
      const opts = cwd ? { cwd, timeout: 5000 } : { timeout: 5000 };
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { ...opts, encoding: 'utf8' }).trim();
      const diff = execSync('git diff --stat HEAD', { ...opts, encoding: 'utf8' }).trim();
      const lastCommit = execSync('git log -1 --pretty=format:"%H %s"', { ...opts, encoding: 'utf8' }).trim();
      return { branch, diff: diff || null, lastCommit };
    } catch {
      return { branch: null, diff: null, lastCommit: null };
    }
  }

  /**
   * Store a git commit and link it to an error
   */
  linkErrorToCommit(errorId: number, projectId: number, commitHash: string, relationship: string = 'introduced_by'): void {
    try {
      // Store commit info
      const commitInfo = this.getCommitInfo(commitHash);
      if (commitInfo) {
        this.db.prepare(`
          INSERT OR IGNORE INTO git_commits (project_id, commit_hash, message, author, timestamp, files_changed, insertions, deletions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(projectId, commitInfo.hash, commitInfo.message, commitInfo.author, commitInfo.timestamp,
          commitInfo.filesChanged, commitInfo.insertions, commitInfo.deletions);
      }

      // Link error to commit
      this.db.prepare(`
        INSERT OR IGNORE INTO error_commits (error_id, commit_hash, relationship)
        VALUES (?, ?, ?)
      `).run(errorId, commitHash, relationship);

      this.logger.info(`Linked error #${errorId} to commit ${commitHash.slice(0, 8)} (${relationship})`);
    } catch (err) {
      this.logger.warn(`Failed to link error to commit: ${err}`);
    }
  }

  /**
   * Find which commit introduced an error
   */
  findIntroducingCommit(errorId: number): Array<{ commitHash: string; message: string; relationship: string }> {
    const rows = this.db.prepare(`
      SELECT ec.commit_hash, ec.relationship, gc.message
      FROM error_commits ec
      LEFT JOIN git_commits gc ON ec.commit_hash = gc.commit_hash
      WHERE ec.error_id = ?
      ORDER BY ec.created_at DESC
    `).all(errorId) as Array<{ commit_hash: string; message: string | null; relationship: string }>;

    return rows.map(r => ({
      commitHash: r.commit_hash,
      message: r.message ?? 'unknown',
      relationship: r.relationship,
    }));
  }

  /**
   * Find errors introduced by a specific commit
   */
  findErrorsByCommit(commitHash: string): Array<{ errorId: number; relationship: string }> {
    const rows = this.db.prepare(`
      SELECT error_id, relationship FROM error_commits WHERE commit_hash = ?
    `).all(commitHash) as Array<{ error_id: number; relationship: string }>;

    return rows.map(r => ({ errorId: r.error_id, relationship: r.relationship }));
  }

  /**
   * Capture current git diff for error context
   */
  captureDiff(cwd?: string): string | null {
    try {
      const opts = cwd ? { cwd, timeout: 5000, encoding: 'utf8' as const } : { timeout: 5000, encoding: 'utf8' as const };
      const diff = execSync('git diff HEAD --no-color', opts).trim();
      // Truncate to avoid huge diffs
      return diff.length > 5000 ? diff.slice(0, 5000) + '\n... (truncated)' : diff || null;
    } catch {
      return null;
    }
  }

  private getCommitInfo(hash: string, cwd?: string): GitCommitInfo | null {
    try {
      const opts = cwd ? { cwd, timeout: 5000, encoding: 'utf8' as const } : { timeout: 5000, encoding: 'utf8' as const };
      const info = execSync(`git log -1 --pretty=format:"%H|||%s|||%an|||%aI" ${hash}`, opts).trim();
      const [commitHash, message, author, timestamp] = info.split('|||');

      const stat = execSync(`git diff --stat ${hash}~1..${hash}`, opts).trim();
      const statMatch = stat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

      return {
        hash: commitHash ?? hash,
        message: message ?? '',
        author: author ?? '',
        timestamp: timestamp ?? new Date().toISOString(),
        filesChanged: parseInt(statMatch?.[1] ?? '0', 10),
        insertions: parseInt(statMatch?.[2] ?? '0', 10),
        deletions: parseInt(statMatch?.[3] ?? '0', 10),
      };
    } catch {
      return null;
    }
  }
}
