import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { CodeModuleRecord } from '../../types/code.types.js';

type CodeModuleCreate = Omit<CodeModuleRecord, 'id' | 'created_at' | 'updated_at'>;
type CodeModuleUpdate = Partial<Omit<CodeModuleRecord, 'id' | 'created_at'>>;

export class CodeModuleRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO code_modules (project_id, name, file_path, language, fingerprint, description, source_hash, lines_of_code, complexity, reusability_score)
        VALUES (@project_id, @name, @file_path, @language, @fingerprint, @description, @source_hash, @lines_of_code, @complexity, @reusability_score)
      `),
      getById: db.prepare('SELECT * FROM code_modules WHERE id = ?'),
      delete: db.prepare('DELETE FROM code_modules WHERE id = ?'),
      findByFingerprint: db.prepare('SELECT * FROM code_modules WHERE fingerprint = ?'),
      findByProject: db.prepare('SELECT * FROM code_modules WHERE project_id = ? ORDER BY name ASC'),
      findAll: db.prepare('SELECT * FROM code_modules ORDER BY name ASC'),
      countAll: db.prepare('SELECT COUNT(*) as count FROM code_modules'),
      search: db.prepare(`
        SELECT cm.* FROM code_modules cm
        JOIN code_modules_fts fts ON cm.id = fts.rowid
        WHERE code_modules_fts MATCH ?
        ORDER BY rank
      `),
      upsertSimilarity: db.prepare(`
        INSERT INTO module_similarities (module_a_id, module_b_id, similarity_score)
        VALUES (@module_a_id, @module_b_id, @similarity_score)
        ON CONFLICT(module_a_id, module_b_id)
        DO UPDATE SET similarity_score = @similarity_score, computed_at = datetime('now')
      `),
      findSimilarModules: db.prepare(`
        SELECT ms.*, cm.name, cm.file_path, cm.language, cm.reusability_score
        FROM module_similarities ms
        JOIN code_modules cm ON (
          CASE WHEN ms.module_a_id = ? THEN ms.module_b_id ELSE ms.module_a_id END
        ) = cm.id
        WHERE ms.module_a_id = ? OR ms.module_b_id = ?
        ORDER BY ms.similarity_score DESC
        LIMIT ?
      `),
      findHighSimilarityPairs: db.prepare(`
        SELECT ms.*,
          a.name as a_name, a.file_path as a_path,
          b.name as b_name, b.file_path as b_path
        FROM module_similarities ms
        JOIN code_modules a ON ms.module_a_id = a.id
        JOIN code_modules b ON ms.module_b_id = b.id
        WHERE ms.similarity_score >= ?
        ORDER BY ms.similarity_score DESC
        LIMIT ?
      `),
    };
  }

  create(data: CodeModuleCreate): number {
    const result = this.stmts.create.run(data);
    return result.lastInsertRowid as number;
  }

  getById(id: number): CodeModuleRecord | undefined {
    return this.stmts.getById.get(id) as CodeModuleRecord | undefined;
  }

  update(id: number, data: CodeModuleUpdate): boolean {
    const fields = Object.keys(data).filter((key) => (data as Record<string, unknown>)[key] !== undefined);
    if (fields.length === 0) return false;

    const setClauses = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE code_modules SET ${setClauses}, updated_at = datetime('now') WHERE id = @id`
    );
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  findByFingerprint(fingerprint: string): CodeModuleRecord | undefined {
    return this.stmts.findByFingerprint.get(fingerprint) as CodeModuleRecord | undefined;
  }

  findByLanguage(language: string, limit?: number): CodeModuleRecord[] {
    const sql = limit
      ? 'SELECT * FROM code_modules WHERE language = ? ORDER BY name ASC LIMIT ?'
      : 'SELECT * FROM code_modules WHERE language = ? ORDER BY name ASC';
    const stmt = this.db.prepare(sql);
    return (limit ? stmt.all(language, limit) : stmt.all(language)) as CodeModuleRecord[];
  }

  findByProject(projectId: number): CodeModuleRecord[] {
    return this.stmts.findByProject.all(projectId) as CodeModuleRecord[];
  }

  search(query: string): CodeModuleRecord[] {
    return this.stmts.search.all(query) as CodeModuleRecord[];
  }

  findAll(limit?: number): CodeModuleRecord[] {
    if (limit) {
      const stmt = this.db.prepare('SELECT * FROM code_modules ORDER BY name ASC LIMIT ?');
      return stmt.all(limit) as CodeModuleRecord[];
    }
    return this.stmts.findAll.all() as CodeModuleRecord[];
  }

  countAll(): number {
    return (this.stmts.countAll.get() as { count: number }).count;
  }

  upsertSimilarity(moduleAId: number, moduleBId: number, score: number): void {
    // Always store with smaller id first for consistency
    const [a, b] = moduleAId < moduleBId ? [moduleAId, moduleBId] : [moduleBId, moduleAId];
    this.stmts.upsertSimilarity.run({
      module_a_id: a,
      module_b_id: b,
      similarity_score: score,
    });
  }

  findSimilarModules(moduleId: number, limit: number = 10): Array<{ module_id: number; similarity_score: number; name: string; file_path: string }> {
    return this.stmts.findSimilarModules.all(moduleId, moduleId, moduleId, limit) as Array<{
      module_id: number; similarity_score: number; name: string; file_path: string;
    }>;
  }

  findHighSimilarityPairs(minScore: number = 0.75, limit: number = 50): Array<{
    module_a_id: number; module_b_id: number; similarity_score: number;
    a_name: string; a_path: string; b_name: string; b_path: string;
  }> {
    return this.stmts.findHighSimilarityPairs.all(minScore, limit) as Array<{
      module_a_id: number; module_b_id: number; similarity_score: number;
      a_name: string; a_path: string; b_name: string; b_path: string;
    }>;
  }
}
