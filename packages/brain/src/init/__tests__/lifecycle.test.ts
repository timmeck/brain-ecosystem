import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Must re-import each test to reset module-level lastVacuumTime
describe('runRetentionCleanup', () => {
  function createMockDb() {
    return {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 0 }),
      }),
      pragma: vi.fn(),
      exec: vi.fn(),
    };
  }

  const mockConfig = {
    dbPath: '/tmp/test.db',
    retention: {
      errorDays: 30,
      insightDays: 60,
    },
  };

  it('runs cleanup without errors', async () => {
    // Re-import to get fresh module state
    const { runRetentionCleanup } = await import('../lifecycle.js');
    const db = createMockDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => runRetentionCleanup(db as any, mockConfig as any)).not.toThrow();
    expect(db.prepare).toHaveBeenCalled();
    expect(db.pragma).toHaveBeenCalledWith('optimize');
  });

  it('runs VACUUM when due (first call after module load)', async () => {
    // Use vi.resetModules to force fresh module-level state
    vi.resetModules();
    vi.mock('../../utils/logger.js', () => ({
      getLogger: () => ({
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      }),
    }));
    const { runRetentionCleanup } = await import('../lifecycle.js');

    const db = createMockDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runRetentionCleanup(db as any, mockConfig as any);
    expect(db.pragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)');
    expect(db.exec).toHaveBeenCalledWith('VACUUM');
  });

  it('handles DB errors gracefully', async () => {
    const { runRetentionCleanup } = await import('../lifecycle.js');
    const db = createMockDb();
    db.prepare.mockImplementation(() => { throw new Error('DB locked'); });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => runRetentionCleanup(db as any, mockConfig as any)).not.toThrow();
  });
});
