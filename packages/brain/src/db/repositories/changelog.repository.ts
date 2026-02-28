import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { ChangelogEntry } from '../../types/decision.types.js';

type CreateChangelogData = Omit<ChangelogEntry, 'id' | 'created_at'>;

export class ChangelogRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO changelog_entries (project_id, session_id, file_path, change_type, summary, reason, diff_snippet, related_error_id, related_decision_id, commit_hash, embedding)
        VALUES (@project_id, @session_id, @file_path, @change_type, @summary, @reason, @diff_snippet, @related_error_id, @related_decision_id, @commit_hash, @embedding)
      `),
      getById: this.db.prepare(
        'SELECT * FROM changelog_entries WHERE id = ?'
      ),
      findByProject: this.db.prepare(
        'SELECT * FROM changelog_entries WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
      ),
      findByFile: this.db.prepare(
        'SELECT * FROM changelog_entries WHERE file_path = ? ORDER BY created_at DESC LIMIT ?'
      ),
      findByFileProject: this.db.prepare(
        'SELECT * FROM changelog_entries WHERE file_path = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?'
      ),
      findBySession: this.db.prepare(
        'SELECT * FROM changelog_entries WHERE session_id = ? ORDER BY created_at DESC'
      ),
      search: this.db.prepare(`
        SELECT c.* FROM changelog_entries c
        JOIN changelog_fts ON c.id = changelog_fts.rowid
        WHERE changelog_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
    };
  }

  create(data: CreateChangelogData): number {
    const result = this.stmts.create.run({
      project_id: data.project_id,
      session_id: data.session_id ?? null,
      file_path: data.file_path,
      change_type: data.change_type,
      summary: data.summary,
      reason: data.reason ?? null,
      diff_snippet: data.diff_snippet ?? null,
      related_error_id: data.related_error_id ?? null,
      related_decision_id: data.related_decision_id ?? null,
      commit_hash: data.commit_hash ?? null,
      embedding: data.embedding ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): ChangelogEntry | undefined {
    return this.stmts.getById.get(id) as ChangelogEntry | undefined;
  }

  findByProject(projectId: number, limit: number = 50): ChangelogEntry[] {
    return this.stmts.findByProject.all(projectId, limit) as ChangelogEntry[];
  }

  findByFile(filePath: string, projectId?: number, limit: number = 50): ChangelogEntry[] {
    if (projectId !== undefined) {
      return this.stmts.findByFileProject.all(filePath, projectId, limit) as ChangelogEntry[];
    }
    return this.stmts.findByFile.all(filePath, limit) as ChangelogEntry[];
  }

  findBySession(sessionId: number): ChangelogEntry[] {
    return this.stmts.findBySession.all(sessionId) as ChangelogEntry[];
  }

  search(query: string, limit: number = 20): ChangelogEntry[] {
    return this.stmts.search.all(query, limit) as ChangelogEntry[];
  }
}
