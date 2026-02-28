import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { ProjectDocRecord, DocType } from '../../types/doc.types.js';

type CreateDocData = Omit<ProjectDocRecord, 'id' | 'last_indexed_at'>;

export class DocRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO project_docs (project_id, file_path, doc_type, content, content_hash, parsed_metadata, embedding)
        VALUES (@project_id, @file_path, @doc_type, @content, @content_hash, @parsed_metadata, @embedding)
      `),
      upsert: this.db.prepare(`
        INSERT INTO project_docs (project_id, file_path, doc_type, content, content_hash, parsed_metadata, embedding)
        VALUES (@project_id, @file_path, @doc_type, @content, @content_hash, @parsed_metadata, @embedding)
        ON CONFLICT(project_id, file_path) DO UPDATE SET
          doc_type = excluded.doc_type,
          content = excluded.content,
          content_hash = excluded.content_hash,
          parsed_metadata = excluded.parsed_metadata,
          embedding = NULL,
          last_indexed_at = datetime('now')
      `),
      getById: this.db.prepare(
        'SELECT * FROM project_docs WHERE id = ?'
      ),
      findByProject: this.db.prepare(
        'SELECT * FROM project_docs WHERE project_id = ? ORDER BY doc_type, file_path'
      ),
      findByType: this.db.prepare(
        'SELECT * FROM project_docs WHERE project_id = ? AND doc_type = ? ORDER BY file_path'
      ),
      findByPath: this.db.prepare(
        'SELECT * FROM project_docs WHERE project_id = ? AND file_path = ?'
      ),
      search: this.db.prepare(`
        SELECT pd.* FROM project_docs pd
        JOIN project_docs_fts ON pd.id = project_docs_fts.rowid
        WHERE project_docs_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      searchProject: this.db.prepare(`
        SELECT pd.* FROM project_docs pd
        JOIN project_docs_fts ON pd.id = project_docs_fts.rowid
        WHERE project_docs_fts MATCH ? AND pd.project_id = ?
        ORDER BY rank
        LIMIT ?
      `),
    };
  }

  create(data: CreateDocData): number {
    const result = this.stmts.create.run({
      project_id: data.project_id,
      file_path: data.file_path,
      doc_type: data.doc_type,
      content: data.content,
      content_hash: data.content_hash,
      parsed_metadata: data.parsed_metadata ?? null,
      embedding: data.embedding ?? null,
    });
    return result.lastInsertRowid as number;
  }

  upsert(data: CreateDocData): number {
    const result = this.stmts.upsert.run({
      project_id: data.project_id,
      file_path: data.file_path,
      doc_type: data.doc_type,
      content: data.content,
      content_hash: data.content_hash,
      parsed_metadata: data.parsed_metadata ?? null,
      embedding: data.embedding ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): ProjectDocRecord | undefined {
    return this.stmts.getById.get(id) as ProjectDocRecord | undefined;
  }

  findByProject(projectId: number): ProjectDocRecord[] {
    return this.stmts.findByProject.all(projectId) as ProjectDocRecord[];
  }

  findByType(projectId: number, docType: DocType): ProjectDocRecord[] {
    return this.stmts.findByType.all(projectId, docType) as ProjectDocRecord[];
  }

  findByPath(projectId: number, filePath: string): ProjectDocRecord | undefined {
    return this.stmts.findByPath.get(projectId, filePath) as ProjectDocRecord | undefined;
  }

  search(query: string, projectId?: number, limit: number = 20): ProjectDocRecord[] {
    if (projectId !== undefined) {
      return this.stmts.searchProject.all(query, projectId, limit) as ProjectDocRecord[];
    }
    return this.stmts.search.all(query, limit) as ProjectDocRecord[];
  }
}
