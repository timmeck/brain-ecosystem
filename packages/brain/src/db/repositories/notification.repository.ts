import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  message: string;
  priority: number;
  project_id: number | null;
  acknowledged: number;
  acknowledged_at: string | null;
  created_at: string;
}

type NotificationCreate = Omit<NotificationRecord, 'id' | 'acknowledged' | 'acknowledged_at' | 'created_at'>;

export class NotificationRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO notifications (type, title, message, priority, project_id)
        VALUES (@type, @title, @message, @priority, @project_id)
      `),
      getById: db.prepare('SELECT * FROM notifications WHERE id = ?'),
      delete: db.prepare('DELETE FROM notifications WHERE id = ?'),
      findUnacknowledgedAll: db.prepare(
        'SELECT * FROM notifications WHERE acknowledged = 0 ORDER BY priority DESC, created_at DESC'
      ),
      findUnacknowledgedByProject: db.prepare(
        'SELECT * FROM notifications WHERE acknowledged = 0 AND project_id = ? ORDER BY priority DESC, created_at DESC'
      ),
      acknowledge: db.prepare(
        `UPDATE notifications SET acknowledged = 1, acknowledged_at = datetime('now') WHERE id = ?`
      ),
    };
  }

  create(data: NotificationCreate): number {
    const result = this.stmts.create.run(data);
    return result.lastInsertRowid as number;
  }

  getById(id: number): NotificationRecord | undefined {
    return this.stmts.getById.get(id) as NotificationRecord | undefined;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  findUnacknowledged(projectId?: number): NotificationRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findUnacknowledgedByProject.all(projectId) as NotificationRecord[];
    }
    return this.stmts.findUnacknowledgedAll.all() as NotificationRecord[];
  }

  acknowledge(id: number): boolean {
    const result = this.stmts.acknowledge.run(id);
    return result.changes > 0;
  }
}
