import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { ErrorRecord } from '../../types/error.types.js';

type CreateErrorData = Omit<ErrorRecord, 'id' | 'occurrence_count' | 'first_seen' | 'last_seen' | 'resolved' | 'resolved_at'>;
type UpdateErrorData = Partial<Omit<ErrorRecord, 'id' | 'first_seen'>>;

export class ErrorRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO errors (project_id, terminal_id, fingerprint, type, message, raw_output, context, file_path, line_number, column_number)
        VALUES (@project_id, @terminal_id, @fingerprint, @type, @message, @raw_output, @context, @file_path, @line_number, @column_number)
      `),
      createChain: this.db.prepare(`
        INSERT OR IGNORE INTO error_chains (parent_error_id, child_error_id, relationship)
        VALUES (@parent_error_id, @child_error_id, @relationship)
      `),
      findChainChildren: this.db.prepare(
        'SELECT e.* FROM errors e JOIN error_chains ec ON e.id = ec.child_error_id WHERE ec.parent_error_id = ?'
      ),
      findChainParents: this.db.prepare(
        'SELECT e.* FROM errors e JOIN error_chains ec ON e.id = ec.parent_error_id WHERE ec.child_error_id = ?'
      ),
      findRecentByProject: this.db.prepare(
        'SELECT * FROM errors WHERE project_id = ? AND first_seen >= ? ORDER BY first_seen DESC LIMIT ?'
      ),
      findAllPaginated: this.db.prepare(
        'SELECT * FROM errors ORDER BY last_seen DESC LIMIT ? OFFSET ?'
      ),
      getById: this.db.prepare(`
        SELECT * FROM errors WHERE id = ?
      `),
      update: this.db.prepare(`
        UPDATE errors
        SET project_id = COALESCE(@project_id, project_id),
            terminal_id = COALESCE(@terminal_id, terminal_id),
            fingerprint = COALESCE(@fingerprint, fingerprint),
            type = COALESCE(@type, type),
            message = COALESCE(@message, message),
            raw_output = COALESCE(@raw_output, raw_output),
            context = COALESCE(@context, context),
            file_path = COALESCE(@file_path, file_path),
            line_number = COALESCE(@line_number, line_number),
            column_number = COALESCE(@column_number, column_number),
            occurrence_count = COALESCE(@occurrence_count, occurrence_count),
            last_seen = COALESCE(@last_seen, last_seen),
            resolved = COALESCE(@resolved, resolved),
            resolved_at = COALESCE(@resolved_at, resolved_at)
        WHERE id = @id
      `),
      delete: this.db.prepare(`
        DELETE FROM errors WHERE id = ?
      `),
      findByFingerprint: this.db.prepare(`
        SELECT * FROM errors WHERE fingerprint = ? ORDER BY last_seen DESC
      `),
      findByProject: this.db.prepare(`
        SELECT * FROM errors WHERE project_id = ? ORDER BY last_seen DESC
      `),
      findUnresolvedAll: this.db.prepare(`
        SELECT * FROM errors WHERE resolved = 0 ORDER BY last_seen DESC
      `),
      findUnresolvedByProject: this.db.prepare(`
        SELECT * FROM errors WHERE resolved = 0 AND project_id = ? ORDER BY last_seen DESC
      `),
      countSinceAll: this.db.prepare(`
        SELECT COUNT(*) as count FROM errors WHERE first_seen >= ?
      `),
      countSinceByProject: this.db.prepare(`
        SELECT COUNT(*) as count FROM errors WHERE first_seen >= ? AND project_id = ?
      `),
      search: this.db.prepare(`
        SELECT errors.* FROM errors
        JOIN errors_fts ON errors.id = errors_fts.rowid
        WHERE errors_fts MATCH ?
        ORDER BY rank
      `),
      incrementOccurrence: this.db.prepare(`
        UPDATE errors
        SET occurrence_count = occurrence_count + 1,
            last_seen = datetime('now')
        WHERE id = ?
      `),
    };
  }

  create(data: CreateErrorData): number {
    const result = this.stmts.create.run({
      project_id: data.project_id,
      terminal_id: data.terminal_id ?? null,
      fingerprint: data.fingerprint,
      type: data.type,
      message: data.message,
      raw_output: data.raw_output,
      context: data.context ?? null,
      file_path: data.file_path ?? null,
      line_number: data.line_number ?? null,
      column_number: data.column_number ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): ErrorRecord | undefined {
    return this.stmts.getById.get(id) as ErrorRecord | undefined;
  }

  update(id: number, data: UpdateErrorData): void {
    this.stmts.update.run({
      id,
      project_id: data.project_id ?? null,
      terminal_id: data.terminal_id ?? null,
      fingerprint: data.fingerprint ?? null,
      type: data.type ?? null,
      message: data.message ?? null,
      raw_output: data.raw_output ?? null,
      context: data.context ?? null,
      file_path: data.file_path ?? null,
      line_number: data.line_number ?? null,
      column_number: data.column_number ?? null,
      occurrence_count: data.occurrence_count ?? null,
      last_seen: data.last_seen ?? null,
      resolved: data.resolved ?? null,
      resolved_at: data.resolved_at ?? null,
    });
  }

  delete(id: number): void {
    this.stmts.delete.run(id);
  }

  findByFingerprint(fingerprint: string): ErrorRecord[] {
    return this.stmts.findByFingerprint.all(fingerprint) as ErrorRecord[];
  }

  findByProject(projectId: number): ErrorRecord[] {
    return this.stmts.findByProject.all(projectId) as ErrorRecord[];
  }

  findUnresolved(projectId?: number): ErrorRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findUnresolvedByProject.all(projectId) as ErrorRecord[];
    }
    return this.stmts.findUnresolvedAll.all() as ErrorRecord[];
  }

  countSince(since: string, projectId?: number): number {
    if (projectId !== undefined) {
      const row = this.stmts.countSinceByProject.get(since, projectId) as { count: number };
      return row.count;
    }
    const row = this.stmts.countSinceAll.get(since) as { count: number };
    return row.count;
  }

  search(query: string): ErrorRecord[] {
    return this.stmts.search.all(query) as ErrorRecord[];
  }

  incrementOccurrence(id: number): void {
    this.stmts.incrementOccurrence.run(id);
  }

  createChain(parentErrorId: number, childErrorId: number, relationship: string = 'caused_by_fix'): void {
    this.stmts.createChain.run({
      parent_error_id: parentErrorId,
      child_error_id: childErrorId,
      relationship,
    });
  }

  findChainChildren(errorId: number): ErrorRecord[] {
    return this.stmts.findChainChildren.all(errorId) as ErrorRecord[];
  }

  findChainParents(errorId: number): ErrorRecord[] {
    return this.stmts.findChainParents.all(errorId) as ErrorRecord[];
  }

  findRecentByProject(projectId: number, since: string, limit: number = 10): ErrorRecord[] {
    return this.stmts.findRecentByProject.all(projectId, since, limit) as ErrorRecord[];
  }

  findAll(limit: number = 100, offset: number = 0): ErrorRecord[] {
    return this.stmts.findAllPaginated.all(limit, offset) as ErrorRecord[];
  }
}
