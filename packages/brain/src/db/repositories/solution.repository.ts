import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { SolutionRecord, ErrorSolution, SolutionAttempt } from '../../types/solution.types.js';

type CreateSolutionData = Omit<SolutionRecord, 'id' | 'success_count' | 'fail_count' | 'created_at' | 'updated_at'>;
type UpdateSolutionData = Partial<Omit<SolutionRecord, 'id' | 'created_at'>>;

interface AttemptData {
  errorSolutionId: number;
  terminalId?: number | null;
  success: number;
  output?: string | null;
  durationMs?: number | null;
}

export class SolutionRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO solutions (description, commands, code_change, source, confidence)
        VALUES (@description, @commands, @code_change, @source, @confidence)
      `),
      getById: this.db.prepare(`
        SELECT * FROM solutions WHERE id = ?
      `),
      update: this.db.prepare(`
        UPDATE solutions
        SET description = COALESCE(@description, description),
            commands = COALESCE(@commands, commands),
            code_change = COALESCE(@code_change, code_change),
            source = COALESCE(@source, source),
            confidence = COALESCE(@confidence, confidence),
            success_count = COALESCE(@success_count, success_count),
            fail_count = COALESCE(@fail_count, fail_count),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      delete: this.db.prepare(`
        DELETE FROM solutions WHERE id = ?
      `),
      findForError: this.db.prepare(`
        SELECT s.* FROM solutions s
        JOIN error_solutions es ON s.id = es.solution_id
        WHERE es.error_id = ?
        ORDER BY s.confidence DESC
      `),
      linkToError: this.db.prepare(`
        INSERT OR IGNORE INTO error_solutions (error_id, solution_id)
        VALUES (@error_id, @solution_id)
      `),
      recordAttempt: this.db.prepare(`
        INSERT INTO solution_attempts (error_solution_id, terminal_id, success, output, duration_ms)
        VALUES (@error_solution_id, @terminal_id, @success, @output, @duration_ms)
      `),
      getAttempts: this.db.prepare(`
        SELECT * FROM solution_attempts WHERE error_solution_id = ? ORDER BY attempted_at DESC
      `),
      getAll: this.db.prepare(`
        SELECT * FROM solutions
      `),
      successRate: this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sa.success = 1 THEN 1 ELSE 0 END) as successes
        FROM solution_attempts sa
        JOIN error_solutions es ON sa.error_solution_id = es.id
        WHERE es.solution_id = ?
      `),
      updateSuccessCount: this.db.prepare(`
        UPDATE solutions
        SET success_count = success_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `),
      updateFailCount: this.db.prepare(`
        UPDATE solutions
        SET fail_count = fail_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `),
    };
  }

  create(data: CreateSolutionData): number {
    const result = this.stmts.create.run({
      description: data.description,
      commands: data.commands ?? null,
      code_change: data.code_change ?? null,
      source: data.source,
      confidence: data.confidence,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): SolutionRecord | undefined {
    return this.stmts.getById.get(id) as SolutionRecord | undefined;
  }

  update(id: number, data: UpdateSolutionData): void {
    this.stmts.update.run({
      id,
      description: data.description ?? null,
      commands: data.commands ?? null,
      code_change: data.code_change ?? null,
      source: data.source ?? null,
      confidence: data.confidence ?? null,
      success_count: data.success_count ?? null,
      fail_count: data.fail_count ?? null,
      updated_at: data.updated_at ?? null,
    });
  }

  delete(id: number): void {
    this.stmts.delete.run(id);
  }

  findForError(errorId: number): SolutionRecord[] {
    return this.stmts.findForError.all(errorId) as SolutionRecord[];
  }

  linkToError(errorId: number, solutionId: number): void {
    this.stmts.linkToError.run({
      error_id: errorId,
      solution_id: solutionId,
    });
  }

  recordAttempt(data: AttemptData): number {
    const result = this.stmts.recordAttempt.run({
      error_solution_id: data.errorSolutionId,
      terminal_id: data.terminalId ?? null,
      success: data.success,
      output: data.output ?? null,
      duration_ms: data.durationMs ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getAttempts(errorSolutionId: number): SolutionAttempt[] {
    return this.stmts.getAttempts.all(errorSolutionId) as SolutionAttempt[];
  }

  getAll(): SolutionRecord[] {
    return this.stmts.getAll.all() as SolutionRecord[];
  }

  successRate(solutionId: number): number {
    const row = this.stmts.successRate.get(solutionId) as { total: number; successes: number };
    if (row.total === 0) return 0;
    return row.successes / row.total;
  }
}
