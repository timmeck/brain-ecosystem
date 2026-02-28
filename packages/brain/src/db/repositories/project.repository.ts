import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface ProjectRecord {
  id: number;
  name: string;
  path: string | null;
  language: string | null;
  framework: string | null;
  created_at: string;
  updated_at: string;
}

type CreateProjectData = Omit<ProjectRecord, 'id' | 'created_at' | 'updated_at'>;
type UpdateProjectData = Partial<Omit<ProjectRecord, 'id' | 'created_at'>>;

export class ProjectRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO projects (name, path, language, framework)
        VALUES (@name, @path, @language, @framework)
      `),
      getById: this.db.prepare(`
        SELECT * FROM projects WHERE id = ?
      `),
      update: this.db.prepare(`
        UPDATE projects
        SET name = COALESCE(@name, name),
            path = COALESCE(@path, path),
            language = COALESCE(@language, language),
            framework = COALESCE(@framework, framework),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      delete: this.db.prepare(`
        DELETE FROM projects WHERE id = ?
      `),
      findByName: this.db.prepare(`
        SELECT * FROM projects WHERE name = ?
      `),
      findByPath: this.db.prepare(`
        SELECT * FROM projects WHERE path = ?
      `),
      getAll: this.db.prepare(`
        SELECT * FROM projects ORDER BY name
      `),
    };
  }

  create(data: CreateProjectData): number {
    const result = this.stmts.create.run({
      name: data.name,
      path: data.path ?? null,
      language: data.language ?? null,
      framework: data.framework ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): ProjectRecord | undefined {
    return this.stmts.getById.get(id) as ProjectRecord | undefined;
  }

  update(id: number, data: UpdateProjectData): void {
    this.stmts.update.run({
      id,
      name: data.name ?? null,
      path: data.path ?? null,
      language: data.language ?? null,
      framework: data.framework ?? null,
      updated_at: data.updated_at ?? null,
    });
  }

  delete(id: number): void {
    this.stmts.delete.run(id);
  }

  findByName(name: string): ProjectRecord | undefined {
    return this.stmts.findByName.get(name) as ProjectRecord | undefined;
  }

  findByPath(path: string): ProjectRecord | undefined {
    return this.stmts.findByPath.get(path) as ProjectRecord | undefined;
  }

  getAll(): ProjectRecord[] {
    return this.stmts.getAll.all() as ProjectRecord[];
  }
}
