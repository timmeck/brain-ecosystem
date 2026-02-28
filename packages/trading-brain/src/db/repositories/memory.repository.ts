import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { MemoryRecord, MemoryCategory, MemoryRepoInterface } from '../../types/memory.types.js';

type CreateMemoryData = Omit<MemoryRecord, 'id' | 'created_at' | 'updated_at' | 'project_id' | 'embedding'>;

export class MemoryRepository implements MemoryRepoInterface {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO memories (session_id, category, key, content, importance, source, tags, expires_at, superseded_by, active)
        VALUES (@session_id, @category, @key, @content, @importance, @source, @tags, @expires_at, @superseded_by, @active)
      `),
      getById: this.db.prepare(
        'SELECT * FROM memories WHERE id = ?'
      ),
      findByKey: this.db.prepare(
        'SELECT * FROM memories WHERE key = ? AND active = 1'
      ),
      findByCategoryAll: this.db.prepare(
        'SELECT * FROM memories WHERE category = ? AND active = 1 ORDER BY importance DESC LIMIT ?'
      ),
      findActiveAll: this.db.prepare(
        'SELECT * FROM memories WHERE active = 1 ORDER BY updated_at DESC LIMIT ?'
      ),
      search: this.db.prepare(`
        SELECT m.* FROM memories m
        JOIN memories_fts ON m.id = memories_fts.rowid
        WHERE memories_fts MATCH ? AND m.active = 1
        ORDER BY rank
        LIMIT ?
      `),
      supersede: this.db.prepare(
        "UPDATE memories SET superseded_by = ?, active = 0, updated_at = datetime('now') WHERE id = ?"
      ),
      deactivate: this.db.prepare(
        "UPDATE memories SET active = 0, updated_at = datetime('now') WHERE id = ?"
      ),
      expireOld: this.db.prepare(
        "UPDATE memories SET active = 0 WHERE expires_at IS NOT NULL AND expires_at < datetime('now') AND active = 1"
      ),
      update: this.db.prepare(`
        UPDATE memories
        SET content = COALESCE(@content, content),
            importance = COALESCE(@importance, importance),
            tags = COALESCE(@tags, tags),
            expires_at = COALESCE(@expires_at, expires_at),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      findBySession: this.db.prepare(
        'SELECT * FROM memories WHERE session_id = ? AND active = 1 ORDER BY created_at'
      ),
      countActive: this.db.prepare(
        'SELECT COUNT(*) as count FROM memories WHERE active = 1'
      ),
      countByCategory: this.db.prepare(
        'SELECT category, COUNT(*) as count FROM memories WHERE active = 1 GROUP BY category'
      ),
    };
  }

  create(data: CreateMemoryData): number {
    const result = this.stmts.create.run({
      session_id: data.session_id ?? null,
      category: data.category,
      key: data.key ?? null,
      content: data.content,
      importance: data.importance ?? 5,
      source: data.source ?? 'explicit',
      tags: data.tags ?? null,
      expires_at: data.expires_at ?? null,
      superseded_by: data.superseded_by ?? null,
      active: data.active ?? 1,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): MemoryRecord | undefined {
    return this.stmts.getById.get(id) as MemoryRecord | undefined;
  }

  findByKey(_projectId: number | null, key: string): MemoryRecord | undefined {
    return this.stmts.findByKey.get(key) as MemoryRecord | undefined;
  }

  findByCategory(category: MemoryCategory, _projectId?: number, limit: number = 50): MemoryRecord[] {
    return this.stmts.findByCategoryAll.all(category, limit) as MemoryRecord[];
  }

  findActive(_projectId?: number, limit: number = 50): MemoryRecord[] {
    return this.stmts.findActiveAll.all(limit) as MemoryRecord[];
  }

  search(query: string, limit: number = 20): MemoryRecord[] {
    return this.stmts.search.all(query, limit) as MemoryRecord[];
  }

  supersede(oldId: number, newId: number): void {
    this.stmts.supersede.run(newId, oldId);
  }

  deactivate(id: number): void {
    this.stmts.deactivate.run(id);
  }

  expireOld(): number {
    const result = this.stmts.expireOld.run();
    return result.changes;
  }

  update(id: number, data: Partial<MemoryRecord>): void {
    this.stmts.update.run({
      id,
      content: data.content ?? null,
      importance: data.importance ?? null,
      tags: data.tags ?? null,
      expires_at: data.expires_at ?? null,
    });
  }

  findBySession(sessionId: number): MemoryRecord[] {
    return this.stmts.findBySession.all(sessionId) as MemoryRecord[];
  }

  upsertByKey(
    key: string,
    content: string,
    category: MemoryCategory,
    importance: number = 5,
    source: string = 'explicit',
    tags?: string[],
  ): { memoryId: number; superseded?: number } {
    const existing = this.findByKey(null, key);
    const newId = this.create({
      session_id: null,
      category,
      key,
      content,
      importance,
      source: source as MemoryRecord['source'],
      tags: tags ? JSON.stringify(tags) : null,
      expires_at: null,
      superseded_by: null,
      active: 1,
    });
    if (existing) {
      this.supersede(existing.id, newId);
      return { memoryId: newId, superseded: existing.id };
    }
    return { memoryId: newId };
  }

  countActive(): number {
    const row = this.stmts.countActive.get() as { count: number };
    return row.count;
  }

  countByCategory(): Record<string, number> {
    const rows = this.stmts.countByCategory.all() as Array<{ category: string; count: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.category] = row.count;
    }
    return result;
  }
}
