import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface ABTest {
  id: number;
  name: string;
  variant_a: string;
  variant_b: string;
  metric: string;
  status: 'running' | 'completed' | 'cancelled';
  winner: 'a' | 'b' | 'tie' | null;
  a_samples: number;
  b_samples: number;
  a_metric_sum: number;
  b_metric_sum: number;
  significance: number;
  created_at: string;
  completed_at: string | null;
}

export interface ABTestCreate {
  name: string;
  variant_a: string;
  variant_b: string;
  metric?: string;
}

export interface ABTestDataPoint {
  id: number;
  test_id: number;
  variant: 'a' | 'b';
  metric_value: number;
  recorded_at: string;
}

export class ABTestRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO ab_tests (name, variant_a, variant_b, metric)
        VALUES (@name, @variant_a, @variant_b, @metric)
      `),
      getById: db.prepare('SELECT * FROM ab_tests WHERE id = ?'),
      listAll: db.prepare('SELECT * FROM ab_tests ORDER BY created_at DESC LIMIT ?'),
      listByStatus: db.prepare('SELECT * FROM ab_tests WHERE status = ? ORDER BY created_at DESC LIMIT ?'),
      recordData: db.prepare(`
        INSERT INTO ab_test_data (test_id, variant, metric_value)
        VALUES (@test_id, @variant, @metric_value)
      `),
      getDataPoints: db.prepare('SELECT * FROM ab_test_data WHERE test_id = ? ORDER BY recorded_at DESC'),
      getDataByVariant: db.prepare('SELECT * FROM ab_test_data WHERE test_id = ? AND variant = ? ORDER BY recorded_at DESC'),
      updateTest: db.prepare(`
        UPDATE ab_tests SET
          a_samples = @a_samples,
          b_samples = @b_samples,
          a_metric_sum = @a_metric_sum,
          b_metric_sum = @b_metric_sum,
          significance = @significance,
          winner = @winner,
          status = @status,
          completed_at = @completed_at
        WHERE id = @id
      `),
      countAll: db.prepare('SELECT COUNT(*) as count FROM ab_tests'),
      delete: db.prepare('DELETE FROM ab_tests WHERE id = ?'),
    };
  }

  create(data: ABTestCreate): number {
    const result = this.stmts.create.run({
      name: data.name,
      variant_a: data.variant_a,
      variant_b: data.variant_b,
      metric: data.metric ?? 'engagement',
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): ABTest | undefined {
    return this.stmts.getById.get(id) as ABTest | undefined;
  }

  listAll(limit: number = 50): ABTest[] {
    return this.stmts.listAll.all(limit) as ABTest[];
  }

  listByStatus(status: string, limit: number = 50): ABTest[] {
    return this.stmts.listByStatus.all(status, limit) as ABTest[];
  }

  recordDataPoint(testId: number, variant: 'a' | 'b', metricValue: number): number {
    const result = this.stmts.recordData.run({
      test_id: testId,
      variant,
      metric_value: metricValue,
    });
    return result.lastInsertRowid as number;
  }

  getDataPoints(testId: number): ABTestDataPoint[] {
    return this.stmts.getDataPoints.all(testId) as ABTestDataPoint[];
  }

  getDataByVariant(testId: number, variant: 'a' | 'b'): ABTestDataPoint[] {
    return this.stmts.getDataByVariant.all(testId, variant) as ABTestDataPoint[];
  }

  update(id: number, data: Partial<ABTest>): boolean {
    const current = this.getById(id);
    if (!current) return false;

    const result = this.stmts.updateTest.run({
      id,
      a_samples: data.a_samples ?? current.a_samples,
      b_samples: data.b_samples ?? current.b_samples,
      a_metric_sum: data.a_metric_sum ?? current.a_metric_sum,
      b_metric_sum: data.b_metric_sum ?? current.b_metric_sum,
      significance: data.significance ?? current.significance,
      winner: data.winner ?? current.winner,
      status: data.status ?? current.status,
      completed_at: data.completed_at ?? current.completed_at,
    });
    return result.changes > 0;
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number };
    return row.count;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }
}
