import { describe, it, expect, beforeEach } from 'vitest';
import { findPath } from '@timmeck/brain-core';
import { createTestDb, type TestDb } from '../../helpers/setup-db.js';

describe('findPath', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
    testDb.repos.project.create({ name: 'test', path: '/test' } as any);

    for (let i = 0; i < 4; i++) {
      testDb.repos.error.create({
        project_id: 1, terminal_id: null, fingerprint: `fp${i}`, type: 'TypeError',
        message: `error ${i}`, raw_output: `TypeError: ${i}`,
        context: null, file_path: null, line_number: null, column_number: null,
      } as any);
    }

    // Chain: error1 → error2 → error3
    testDb.repos.synapse.create({
      source_type: 'error', source_id: 1,
      target_type: 'error', target_id: 2,
      synapse_type: 'similar_to', weight: 0.8, metadata: null,
    } as any);
    testDb.repos.synapse.create({
      source_type: 'error', source_id: 2,
      target_type: 'error', target_id: 3,
      synapse_type: 'similar_to', weight: 0.7, metadata: null,
    } as any);
  });

  it('finds direct path', () => {
    const path = findPath(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 2 },
    );
    expect(path).not.toBeNull();
    expect(path!.hops).toBe(1);
  });

  it('finds multi-hop path', () => {
    const path = findPath(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 3 },
      3,
    );
    expect(path).not.toBeNull();
    expect(path!.hops).toBe(2);
  });

  it('returns null for no path', () => {
    const path = findPath(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 4 }, // isolated
    );
    expect(path).toBeNull();
  });

  it('respects maxDepth', () => {
    const path = findPath(
      testDb.repos.synapse,
      { type: 'error', id: 1 },
      { type: 'error', id: 3 },
      1, // too shallow
    );
    expect(path).toBeNull();
  });
});
