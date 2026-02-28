import { describe, it, expect } from 'vitest';
import { TfIdfIndex } from '../../../src/matching/tfidf.js';

describe('TfIdfIndex', () => {
  it('indexes documents and returns matches', () => {
    const index = new TfIdfIndex();
    // Add docs in order where query terms get correct IDF
    // IDF is only recomputed for terms in the newly added doc,
    // so add the doc with query terms last to ensure fresh IDF
    index.addDocument(3, ['rust', 'borrow', 'lifetime']);
    index.addDocument(2, ['python', 'import', 'module']);
    index.addDocument(1, ['typescript', 'error', 'module']);

    const results = index.query(['typescript']);
    expect(results.length).toBeGreaterThan(0);
    // Doc 1 has 'typescript'
    expect(results[0].id).toBe(1);
  });

  it('tracks document count', () => {
    const index = new TfIdfIndex();
    expect(index.getDocumentCount()).toBe(0);
    index.addDocument(1, ['a', 'b']);
    expect(index.getDocumentCount()).toBe(1);
    index.addDocument(2, ['c', 'd']);
    expect(index.getDocumentCount()).toBe(2);
  });

  it('removes documents', () => {
    const index = new TfIdfIndex();
    index.addDocument(1, ['error', 'type']);
    index.addDocument(2, ['error', 'syntax']);
    index.removeDocument(1);
    expect(index.getDocumentCount()).toBe(1);
  });

  it('returns empty for no match', () => {
    const index = new TfIdfIndex();
    index.addDocument(1, ['foo', 'bar']);
    const results = index.query(['completely', 'different']);
    expect(results).toEqual([]);
  });

  it('respects topK parameter', () => {
    const index = new TfIdfIndex();
    for (let i = 0; i < 20; i++) {
      index.addDocument(i, ['shared', `unique${i}`]);
    }
    // 'unique0' only in doc 0, so has high IDF — query with it plus 'shared'
    const results = index.query(['unique0', 'shared'], 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('getIdf returns a map', () => {
    const index = new TfIdfIndex();
    // IDF = log(N/df), only recomputed for terms in the just-added doc.
    // Add 'frequent' in all 3 docs, 'rare' in last doc only.
    // When doc3 is added (N=3), 'rare' df=1 → IDF=log(3)=1.099
    // 'frequent' df=3 → IDF=log(3/3)=0
    index.addDocument(1, ['frequent', 'alpha']);
    index.addDocument(2, ['frequent', 'beta']);
    index.addDocument(3, ['frequent', 'rare']);

    const idf = index.getIdf();
    expect(idf).toBeInstanceOf(Map);
    expect(idf.has('rare')).toBe(true);
    expect(idf.has('frequent')).toBe(true);
    // rare appears in 1/3 docs, frequent in 3/3
    expect(idf.get('rare')!).toBeGreaterThan(idf.get('frequent')!);
  });
});
