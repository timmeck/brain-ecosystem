import { describe, it, expect, beforeEach } from 'vitest';
import { TrendAnalyzer } from '../../../src/research/trend-analyzer.js';
import { createTestDb, type TestDb } from '../../helpers/setup-db.js';

describe('TrendAnalyzer', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.repos.project.create({ name: 'test-project', path: '/test' } as any);

    for (let i = 0; i < 10; i++) {
      testDb.repos.error.create({
        project_id: 1, terminal_id: null, fingerprint: `fp${i}`, type: 'TypeError',
        message: `Cannot read property of undefined ${i}`,
        raw_output: `TypeError: test ${i}`, context: null,
        file_path: null, line_number: null, column_number: null,
      } as any);
    }
  });

  const researchConfig = {
    intervalMs: 3600000, initialDelayMs: 300000, minDataPoints: 3,
    trendWindowDays: 7, gapMinOccurrences: 5, synergyMinWeight: 0.5,
    templateMinAdaptations: 3, insightExpiryDays: 30,
  };

  it('creates without error', () => {
    const analyzer = new TrendAnalyzer(
      testDb.repos.error, testDb.repos.solution, testDb.repos.project,
      testDb.repos.insight, researchConfig,
    );
    expect(analyzer).toBeTruthy();
  });

  it('runs analyze without crashing', () => {
    const analyzer = new TrendAnalyzer(
      testDb.repos.error, testDb.repos.solution, testDb.repos.project,
      testDb.repos.insight, researchConfig,
    );
    const count = analyzer.analyze();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
