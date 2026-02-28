import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { DecisionRecord, DecisionCategory, DecisionStatus } from '../../types/decision.types.js';

type CreateDecisionData = Omit<DecisionRecord, 'id' | 'created_at' | 'updated_at'>;

export class DecisionRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO decisions (project_id, session_id, title, description, alternatives, category, status, superseded_by, tags, embedding)
        VALUES (@project_id, @session_id, @title, @description, @alternatives, @category, @status, @superseded_by, @tags, @embedding)
      `),
      getById: this.db.prepare(
        'SELECT * FROM decisions WHERE id = ?'
      ),
      findByProject: this.db.prepare(
        'SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
      ),
      findByCategory: this.db.prepare(
        'SELECT * FROM decisions WHERE category = ? AND status = ? ORDER BY created_at DESC LIMIT ?'
      ),
      findByCategoryProject: this.db.prepare(
        'SELECT * FROM decisions WHERE category = ? AND project_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?'
      ),
      findActive: this.db.prepare(
        "SELECT * FROM decisions WHERE status = 'active' ORDER BY created_at DESC LIMIT ?"
      ),
      findActiveProject: this.db.prepare(
        "SELECT * FROM decisions WHERE status = 'active' AND project_id = ? ORDER BY created_at DESC LIMIT ?"
      ),
      search: this.db.prepare(`
        SELECT d.* FROM decisions d
        JOIN decisions_fts ON d.id = decisions_fts.rowid
        WHERE decisions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      supersede: this.db.prepare(
        "UPDATE decisions SET superseded_by = ?, status = 'superseded', updated_at = datetime('now') WHERE id = ?"
      ),
      update: this.db.prepare(`
        UPDATE decisions
        SET title = COALESCE(@title, title),
            description = COALESCE(@description, description),
            alternatives = COALESCE(@alternatives, alternatives),
            category = COALESCE(@category, category),
            status = COALESCE(@status, status),
            tags = COALESCE(@tags, tags),
            updated_at = datetime('now')
        WHERE id = @id
      `),
    };
  }

  create(data: CreateDecisionData): number {
    const result = this.stmts.create.run({
      project_id: data.project_id ?? null,
      session_id: data.session_id ?? null,
      title: data.title,
      description: data.description,
      alternatives: data.alternatives ?? null,
      category: data.category ?? 'architecture',
      status: data.status ?? 'active',
      superseded_by: data.superseded_by ?? null,
      tags: data.tags ?? null,
      embedding: data.embedding ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): DecisionRecord | undefined {
    return this.stmts.getById.get(id) as DecisionRecord | undefined;
  }

  findByProject(projectId: number, limit: number = 50): DecisionRecord[] {
    return this.stmts.findByProject.all(projectId, limit) as DecisionRecord[];
  }

  findByCategory(category: DecisionCategory, projectId?: number, status: DecisionStatus = 'active', limit: number = 50): DecisionRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findByCategoryProject.all(category, projectId, status, limit) as DecisionRecord[];
    }
    return this.stmts.findByCategory.all(category, status, limit) as DecisionRecord[];
  }

  findActive(projectId?: number, limit: number = 50): DecisionRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findActiveProject.all(projectId, limit) as DecisionRecord[];
    }
    return this.stmts.findActive.all(limit) as DecisionRecord[];
  }

  search(query: string, limit: number = 20): DecisionRecord[] {
    return this.stmts.search.all(query, limit) as DecisionRecord[];
  }

  supersede(oldId: number, newId: number): void {
    this.stmts.supersede.run(newId, oldId);
  }

  update(id: number, data: Partial<DecisionRecord>): void {
    this.stmts.update.run({
      id,
      title: data.title ?? null,
      description: data.description ?? null,
      alternatives: data.alternatives ?? null,
      category: data.category ?? null,
      status: data.status ?? null,
      tags: data.tags ?? null,
    });
  }
}
