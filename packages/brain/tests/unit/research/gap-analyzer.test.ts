import { describe, it, expect, beforeEach } from 'vitest';
import { GapAnalyzer } from '../../../src/research/gap-analyzer.js';
import { createTestDb, type TestDb } from '../../helpers/setup-db.js';

describe('GapAnalyzer', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.repos.project.create({ name: 'test-project', path: '/test' } as any);

    for (let i = 0; i < 8; i++) {
      testDb.repos.error.create({
        project_id: 1, terminal_id: null, fingerprint: 'same_fp', type: 'ModuleNotFoundError',
        message: "No module named 'missing_lib'",
        raw_output: `ModuleNotFoundError: No module named 'missing_lib'`,
        context: null, file_path: null, line_number: null, column_number: null,
      } as any);
    }
  });

  const researchConfig = {
    intervalMs: 3600000, initialDelayMs: 300000, minDataPoints: 3,
    trendWindowDays: 7, gapMinOccurrences: 5, synergyMinWeight: 0.5,
    templateMinAdaptations: 3, insightExpiryDays: 30,
  };

  it('creates without error', () => {
    const analyzer = new GapAnalyzer(
      testDb.repos.error, testDb.repos.solution, testDb.repos.synapse,
      testDb.repos.project, testDb.repos.insight, researchConfig,
    );
    expect(analyzer).toBeTruthy();
  });

  it('runs analyze without crashing', () => {
    const analyzer = new GapAnalyzer(
      testDb.repos.error, testDb.repos.solution, testDb.repos.synapse,
      testDb.repos.project, testDb.repos.insight, researchConfig,
    );
    const count = analyzer.analyze();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
