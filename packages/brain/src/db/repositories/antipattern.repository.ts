import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface AntipatternRecord {
  id: number;
  pattern: string;
  description: string;
  severity: string;
  suggestion: string | null;
  occurrences: number;
  project_id: number | null;
  global: number;
  created_at: string;
}

type AntipatternCreate = Omit<AntipatternRecord, 'id' | 'created_at'>;
type AntipatternUpdate = Partial<Omit<AntipatternRecord, 'id' | 'created_at'>>;

export class AntipatternRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO antipatterns (pattern, description, severity, suggestion, occurrences, project_id, global)
        VALUES (@pattern, @description, @severity, @suggestion, @occurrences, @project_id, @global)
      `),
      getById: db.prepare('SELECT * FROM antipatterns WHERE id = ?'),
      delete: db.prepare('DELETE FROM antipatterns WHERE id = ?'),
      findByProject: db.prepare('SELECT * FROM antipatterns WHERE project_id = ? ORDER BY occurrences DESC'),
      findGlobal: db.prepare('SELECT * FROM antipatterns WHERE global = 1 ORDER BY occurrences DESC'),
    };
  }

  create(data: AntipatternCreate): number {
    const result = this.stmts.create.run(data);
    return result.lastInsertRowid as number;
  }

  getById(id: number): AntipatternRecord | undefined {
    return this.stmts.getById.get(id) as AntipatternRecord | undefined;
  }

  update(id: number, data: AntipatternUpdate): boolean {
    const fields = Object.keys(data).filter((key) => (data as Record<string, unknown>)[key] !== undefined);
    if (fields.length === 0) return false;

    const setClauses = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(`UPDATE antipatterns SET ${setClauses} WHERE id = @id`);
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  findByProject(projectId: number): AntipatternRecord[] {
    return this.stmts.findByProject.all(projectId) as AntipatternRecord[];
  }

  findGlobal(): AntipatternRecord[] {
    return this.stmts.findGlobal.all() as AntipatternRecord[];
  }
}
