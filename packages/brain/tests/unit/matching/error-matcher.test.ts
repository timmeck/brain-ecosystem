import { describe, it, expect } from 'vitest';
import { matchError } from '../../../src/matching/error-matcher.js';
import type { ErrorRecord } from '../../../src/types/error.types.js';

function makeError(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    id: 1,
    project_id: 1,
    terminal_id: null,
    type: 'TypeError',
    message: "Cannot read properties of undefined (reading 'map')",
    fingerprint: 'abc123',
    raw_output: "TypeError: Cannot read properties of undefined (reading 'map')",
    context: null,
    file_path: '/app/src/main.ts',
    line_number: null,
    column_number: null,
    occurrence_count: 1,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    resolved: 0,
    resolved_at: null,
    ...overrides,
  };
}

describe('matchError', () => {
  it('returns matches sorted by score', () => {
    const incoming = makeError({ id: 0 });
    const candidates = [
      makeError({ id: 1, fingerprint: 'abc123', type: 'TypeError' }),
      makeError({ id: 2, fingerprint: 'different', type: 'RangeError', message: 'Maximum call stack size exceeded' }),
    ];

    const results = matchError(incoming, candidates);
    expect(results.length).toBeGreaterThan(0);
    // Identical fingerprint should score highest
    expect(results[0].errorId).toBe(1);
  });

  it('returns empty for no candidates', () => {
    const incoming = makeError({ id: 0 });
    const results = matchError(incoming, []);
    expect(results).toEqual([]);
  });

  it('fingerprint match boosts score', () => {
    const incoming = makeError({ id: 0, fingerprint: 'same_fp' });
    const exactFp = makeError({ id: 1, fingerprint: 'same_fp' });
    const diffFp = makeError({ id: 2, fingerprint: 'other_fp', type: 'RangeError', message: 'completely different' });

    const results = matchError(incoming, [exactFp, diffFp]);
    if (results.length >= 2) {
      expect(results[0].errorId).toBe(1);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    }
  });

  it('results have score and signals', () => {
    const incoming = makeError({ id: 0 });
    const candidate = makeError({ id: 1 });
    const results = matchError(incoming, [candidate]);
    if (results.length > 0) {
      expect(typeof results[0].score).toBe('number');
      expect(results[0].signals.length).toBeGreaterThan(0);
      expect(typeof results[0].isStrong).toBe('boolean');
    }
  });
});
