import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { SessionRecord, SessionRepoInterface } from '../../types/memory.types.js';

type CreateSessionData = Omit<SessionRecord, 'id' | 'project_id' | 'embedding'>;

export class SessionRepository implements SessionRepoInterface {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO sessions (session_id, started_at, ended_at, summary, goals, outcome, metadata)
        VALUES (@session_id, @started_at, @ended_at, @summary, @goals, @outcome, @metadata)
      `),
      getById: this.db.prepare(
        'SELECT * FROM sessions WHERE id = ?'
      ),
      findBySessionId: this.db.prepare(
        'SELECT * FROM sessions WHERE session_id = ?'
      ),
      findRecent: this.db.prepare(
        'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?'
      ),
      update: this.db.prepare(`
        UPDATE sessions
        SET summary = COALESCE(@summary, summary),
            ended_at = COALESCE(@ended_at, ended_at),
            outcome = COALESCE(@outcome, outcome),
            goals = COALESCE(@goals, goals),
            metadata = COALESCE(@metadata, metadata)
        WHERE id = @id
      `),
      search: this.db.prepare(`
        SELECT s.* FROM sessions s
        JOIN sessions_fts ON s.id = sessions_fts.rowid
        WHERE sessions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      countAll: this.db.prepare(
        'SELECT COUNT(*) as count FROM sessions'
      ),
      findLast: this.db.prepare(
        'SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1'
      ),
    };
  }

  create(data: CreateSessionData): number {
    const result = this.stmts.create.run({
      session_id: data.session_id,
      started_at: data.started_at ?? new Date().toISOString(),
      ended_at: data.ended_at ?? null,
      summary: data.summary ?? null,
      goals: data.goals ?? null,
      outcome: data.outcome ?? null,
      metadata: data.metadata ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): SessionRecord | undefined {
    return this.stmts.getById.get(id) as SessionRecord | undefined;
  }

  findBySessionId(sessionId: string): SessionRecord | undefined {
    return this.stmts.findBySessionId.get(sessionId) as SessionRecord | undefined;
  }

  findByProject(_projectId: number, limit: number = 20): SessionRecord[] {
    // No project_id in marketing-brain — return all recent
    return this.stmts.findRecent.all(limit) as SessionRecord[];
  }

  findRecent(limit: number = 20): SessionRecord[] {
    return this.stmts.findRecent.all(limit) as SessionRecord[];
  }

  update(id: number, data: Partial<SessionRecord>): void {
    this.stmts.update.run({
      id,
      summary: data.summary ?? null,
      ended_at: data.ended_at ?? null,
      outcome: data.outcome ?? null,
      goals: data.goals ?? null,
      metadata: data.metadata ?? null,
    });
  }

  search(query: string, limit: number = 20): SessionRecord[] {
    return this.stmts.search.all(query, limit) as SessionRecord[];
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number };
    return row.count;
  }

  findLast(): SessionRecord | undefined {
    return this.stmts.findLast.get() as SessionRecord | undefined;
  }
}
