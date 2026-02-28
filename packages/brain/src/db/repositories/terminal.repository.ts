import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface TerminalRecord {
  id: number;
  uuid: string;
  project_id: number | null;
  pid: number | null;
  shell: string | null;
  cwd: string | null;
  connected_at: string;
  last_seen: string;
  disconnected_at: string | null;
}

type CreateTerminalData = Omit<TerminalRecord, 'id' | 'connected_at' | 'last_seen' | 'disconnected_at'>;
type UpdateTerminalData = Partial<Omit<TerminalRecord, 'id' | 'connected_at'>>;

export class TerminalRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO terminals (uuid, project_id, pid, shell, cwd)
        VALUES (@uuid, @project_id, @pid, @shell, @cwd)
      `),
      getById: this.db.prepare(`
        SELECT * FROM terminals WHERE id = ?
      `),
      update: this.db.prepare(`
        UPDATE terminals
        SET project_id = COALESCE(@project_id, project_id),
            pid = COALESCE(@pid, pid),
            shell = COALESCE(@shell, shell),
            cwd = COALESCE(@cwd, cwd),
            last_seen = COALESCE(@last_seen, last_seen),
            disconnected_at = COALESCE(@disconnected_at, disconnected_at)
        WHERE id = @id
      `),
      delete: this.db.prepare(`
        DELETE FROM terminals WHERE id = ?
      `),
      findByUuid: this.db.prepare(`
        SELECT * FROM terminals WHERE uuid = ?
      `),
      findConnected: this.db.prepare(`
        SELECT * FROM terminals WHERE disconnected_at IS NULL ORDER BY connected_at DESC
      `),
      cleanupStale: this.db.prepare(`
        UPDATE terminals
        SET disconnected_at = datetime('now')
        WHERE disconnected_at IS NULL AND last_seen < ?
      `),
    };
  }

  create(data: CreateTerminalData): number {
    const result = this.stmts.create.run({
      uuid: data.uuid,
      project_id: data.project_id ?? null,
      pid: data.pid ?? null,
      shell: data.shell ?? null,
      cwd: data.cwd ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): TerminalRecord | undefined {
    return this.stmts.getById.get(id) as TerminalRecord | undefined;
  }

  update(id: number, data: UpdateTerminalData): void {
    this.stmts.update.run({
      id,
      project_id: data.project_id ?? null,
      pid: data.pid ?? null,
      shell: data.shell ?? null,
      cwd: data.cwd ?? null,
      last_seen: data.last_seen ?? null,
      disconnected_at: data.disconnected_at ?? null,
    });
  }

  delete(id: number): void {
    this.stmts.delete.run(id);
  }

  findByUuid(uuid: string): TerminalRecord | undefined {
    return this.stmts.findByUuid.get(uuid) as TerminalRecord | undefined;
  }

  findConnected(): TerminalRecord[] {
    return this.stmts.findConnected.all() as TerminalRecord[];
  }

  cleanupStale(olderThan: string): number {
    const result = this.stmts.cleanupStale.run(olderThan);
    return result.changes;
  }
}
