import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { TaskRecord, TaskStatus } from '../../types/task.types.js';

type CreateTaskData = Omit<TaskRecord, 'id' | 'created_at' | 'updated_at'>;

export class TaskRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO tasks (project_id, session_id, parent_task_id, title, description, status, priority, due_date, completed_at, blocked_by, tags, notes, embedding)
        VALUES (@project_id, @session_id, @parent_task_id, @title, @description, @status, @priority, @due_date, @completed_at, @blocked_by, @tags, @notes, @embedding)
      `),
      getById: this.db.prepare(
        'SELECT * FROM tasks WHERE id = ?'
      ),
      findByProject: this.db.prepare(
        'SELECT * FROM tasks WHERE project_id = ? ORDER BY priority DESC, created_at DESC LIMIT ?'
      ),
      findByStatus: this.db.prepare(
        'SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at DESC LIMIT ?'
      ),
      findByStatusProject: this.db.prepare(
        'SELECT * FROM tasks WHERE status = ? AND project_id = ? ORDER BY priority DESC, created_at DESC LIMIT ?'
      ),
      findSubtasks: this.db.prepare(
        'SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY priority DESC, created_at'
      ),
      findAll: this.db.prepare(
        'SELECT * FROM tasks ORDER BY priority DESC, created_at DESC LIMIT ?'
      ),
      findAllProject: this.db.prepare(
        'SELECT * FROM tasks WHERE project_id = ? ORDER BY priority DESC, created_at DESC LIMIT ?'
      ),
      search: this.db.prepare(`
        SELECT t.* FROM tasks t
        JOIN tasks_fts ON t.id = tasks_fts.rowid
        WHERE tasks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      update: this.db.prepare(`
        UPDATE tasks
        SET title = COALESCE(@title, title),
            description = COALESCE(@description, description),
            status = COALESCE(@status, status),
            priority = COALESCE(@priority, priority),
            due_date = COALESCE(@due_date, due_date),
            completed_at = COALESCE(@completed_at, completed_at),
            blocked_by = COALESCE(@blocked_by, blocked_by),
            tags = COALESCE(@tags, tags),
            notes = COALESCE(@notes, notes),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      addNote: this.db.prepare(`
        UPDATE tasks
        SET notes = CASE
              WHEN notes IS NULL THEN @note
              ELSE notes || char(10) || @note
            END,
            updated_at = datetime('now')
        WHERE id = @id
      `),
    };
  }

  create(data: CreateTaskData): number {
    const result = this.stmts.create.run({
      project_id: data.project_id ?? null,
      session_id: data.session_id ?? null,
      parent_task_id: data.parent_task_id ?? null,
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? 'pending',
      priority: data.priority ?? 5,
      due_date: data.due_date ?? null,
      completed_at: data.completed_at ?? null,
      blocked_by: data.blocked_by ?? null,
      tags: data.tags ?? null,
      notes: data.notes ?? null,
      embedding: data.embedding ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): TaskRecord | undefined {
    return this.stmts.getById.get(id) as TaskRecord | undefined;
  }

  findByProject(projectId: number, limit: number = 50): TaskRecord[] {
    return this.stmts.findByProject.all(projectId, limit) as TaskRecord[];
  }

  findByStatus(status: TaskStatus, projectId?: number, limit: number = 50): TaskRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findByStatusProject.all(status, projectId, limit) as TaskRecord[];
    }
    return this.stmts.findByStatus.all(status, limit) as TaskRecord[];
  }

  findSubtasks(parentTaskId: number): TaskRecord[] {
    return this.stmts.findSubtasks.all(parentTaskId) as TaskRecord[];
  }

  findAll(projectId?: number, limit: number = 50): TaskRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findAllProject.all(projectId, limit) as TaskRecord[];
    }
    return this.stmts.findAll.all(limit) as TaskRecord[];
  }

  search(query: string, limit: number = 20): TaskRecord[] {
    return this.stmts.search.all(query, limit) as TaskRecord[];
  }

  update(id: number, data: Partial<TaskRecord>): void {
    this.stmts.update.run({
      id,
      title: data.title ?? null,
      description: data.description ?? null,
      status: data.status ?? null,
      priority: data.priority ?? null,
      due_date: data.due_date ?? null,
      completed_at: data.completed_at ?? null,
      blocked_by: data.blocked_by ?? null,
      tags: data.tags ?? null,
      notes: data.notes ?? null,
    });
  }

  addNote(id: number, note: string): void {
    this.stmts.addNote.run({ id, note });
  }
}
