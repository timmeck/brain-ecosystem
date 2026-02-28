import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface RuleRecord {
  id: number;
  pattern: string;
  action: string;
  description: string | null;
  confidence: number;
  occurrences: number;
  active: number;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

type CreateRuleData = Omit<RuleRecord, 'id' | 'confidence' | 'occurrences' | 'active' | 'created_at' | 'updated_at'> & {
  confidence?: number;
  occurrences?: number;
  active?: number;
};
type UpdateRuleData = Partial<Omit<RuleRecord, 'id' | 'created_at'>>;

export class RuleRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO rules (pattern, action, description, confidence, occurrences, active, project_id)
        VALUES (@pattern, @action, @description, @confidence, @occurrences, @active, @project_id)
      `),
      getById: this.db.prepare(`
        SELECT * FROM rules WHERE id = ?
      `),
      update: this.db.prepare(`
        UPDATE rules
        SET pattern = COALESCE(@pattern, pattern),
            action = COALESCE(@action, action),
            description = COALESCE(@description, description),
            confidence = COALESCE(@confidence, confidence),
            occurrences = COALESCE(@occurrences, occurrences),
            active = COALESCE(@active, active),
            project_id = COALESCE(@project_id, project_id),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      delete: this.db.prepare(`
        DELETE FROM rules WHERE id = ?
      `),
      findActiveAll: this.db.prepare(`
        SELECT * FROM rules WHERE active = 1 ORDER BY confidence DESC
      `),
      findActiveByProject: this.db.prepare(`
        SELECT * FROM rules WHERE active = 1 AND (project_id = ? OR project_id IS NULL) ORDER BY confidence DESC
      `),
      findByPattern: this.db.prepare(`
        SELECT * FROM rules WHERE pattern = ?
      `),
    };
  }

  create(data: CreateRuleData): number {
    const result = this.stmts.create.run({
      pattern: data.pattern,
      action: data.action,
      description: data.description ?? null,
      confidence: data.confidence ?? 0.5,
      occurrences: data.occurrences ?? 0,
      active: data.active ?? 1,
      project_id: data.project_id ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): RuleRecord | undefined {
    return this.stmts.getById.get(id) as RuleRecord | undefined;
  }

  update(id: number, data: UpdateRuleData): void {
    this.stmts.update.run({
      id,
      pattern: data.pattern ?? null,
      action: data.action ?? null,
      description: data.description ?? null,
      confidence: data.confidence ?? null,
      occurrences: data.occurrences ?? null,
      active: data.active ?? null,
      project_id: data.project_id ?? null,
      updated_at: data.updated_at ?? null,
    });
  }

  delete(id: number): void {
    this.stmts.delete.run(id);
  }

  findActive(projectId?: number): RuleRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findActiveByProject.all(projectId) as RuleRecord[];
    }
    return this.stmts.findActiveAll.all() as RuleRecord[];
  }

  findByPattern(pattern: string): RuleRecord[] {
    return this.stmts.findByPattern.all(pattern) as RuleRecord[];
  }
}
