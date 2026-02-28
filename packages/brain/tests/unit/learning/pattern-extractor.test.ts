import { describe, it, expect } from 'vitest';
import { extractPatterns } from '../../../src/learning/pattern-extractor.js';
import type { ErrorRecord } from '../../../src/types/error.types.js';

function makeErrorRecord(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    id: 1,
    project_id: 1,
    terminal_id: null,
    type: 'TypeError',
    message: "Cannot read properties of undefined (reading 'map')",
    fingerprint: 'fp1',
    raw_output: '',
    context: null,
    file_path: '/app/main.ts',
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

describe('extractPatterns', () => {
  it('finds pattern from similar errors', () => {
    const errors = [
      makeErrorRecord({ id: 1, message: "Cannot read properties of undefined (reading 'map')", fingerprint: 'fp1' }),
      makeErrorRecord({ id: 2, message: "Cannot read properties of undefined (reading 'filter')", fingerprint: 'fp2' }),
      makeErrorRecord({ id: 3, message: "Cannot read properties of undefined (reading 'forEach')", fingerprint: 'fp3' }),
      makeErrorRecord({ id: 4, message: "Cannot read properties of undefined (reading 'reduce')", fingerprint: 'fp4' }),
    ];

    const patterns = extractPatterns(errors);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].errorIds.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for single error', () => {
    const errors = [makeErrorRecord({ id: 1 })];
    const patterns = extractPatterns(errors);
    expect(patterns).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(extractPatterns([])).toEqual([]);
  });
});
