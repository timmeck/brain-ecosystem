import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryPalace } from '../../../src/memory-palace/memory-palace.js';

describe('MemoryPalace', () => {
  let db: Database.Database;
  let palace: MemoryPalace;

  beforeEach(() => {
    db = new Database(':memory:');
    palace = new MemoryPalace(db, { brainName: 'test-brain' });
  });

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'knowledge_connections'").all() as { name: string }[];
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('knowledge_connections');
  });

  it('should return empty stats initially', () => {
    const stats = palace.getStats();
    expect(stats.totalNodes).toBe(0);
    expect(stats.totalEdges).toBe(0);
    expect(stats.density).toBe(0);
    expect(stats.avgStrength).toBe(0);
    expect(stats.topConnected).toHaveLength(0);
  });

  it('should return empty status initially', () => {
    const status = palace.getStatus();
    expect(status.stats.totalNodes).toBe(0);
    expect(status.stats.totalEdges).toBe(0);
    expect(status.recentConnections).toHaveLength(0);
    expect(status.topConnectedNodes).toHaveLength(0);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should return empty result from buildConnections without data sources', () => {
    const result = palace.buildConnections();
    expect(result.newConnections).toBe(0);
    expect(result.totalConnections).toBe(0);
    expect(result.scannedSources).toHaveLength(0);
  });

  it('should build connections from confirmed hypotheses → principles', () => {
    palace.setDataSources({
      getHypotheses: (status) => {
        if (status === 'confirmed') return [
          { id: 1, statement: 'High error frequency correlates with deployment timing', status: 'confirmed' },
        ];
        return [{ id: 1, statement: 'High error frequency correlates with deployment timing', status: 'confirmed' }];
      },
      getPrinciples: () => [
        { id: 10, statement: 'Error frequency increases during rapid deployment cycles' },
      ],
    });

    const result = palace.buildConnections();
    expect(result.newConnections).toBeGreaterThan(0);
    expect(result.scannedSources).toContain('hypotheses→principles');

    const connections = palace.getConnections('hypothesis', '1');
    expect(connections.length).toBeGreaterThan(0);
    expect(connections[0].relation).toBe('derived_from');
  });

  it('should build connections from experiments → hypotheses', () => {
    palace.setDataSources({
      getExperiments: () => [
        { id: 5, name: 'Test anomaly detection threshold', hypothesis: 'Lower threshold catches more anomalies' },
      ],
      getHypotheses: () => [
        { id: 3, statement: 'Lower anomaly threshold catches more edge cases', status: 'pending' },
      ],
    });

    const result = palace.buildConnections();
    expect(result.scannedSources).toContain('experiments→hypotheses');
  });

  it('should build connections from journal cross-references (shared tags)', () => {
    palace.setDataSources({
      getJournalEntries: () => [
        { id: 1, title: 'Discovery A', tags: '["anomaly","deployment","error"]' },
        { id: 2, title: 'Discovery B', tags: '["anomaly","deployment","testing"]' },
        { id: 3, title: 'Unrelated', tags: '["marketing"]' },
      ],
    });

    const result = palace.buildConnections();
    expect(result.scannedSources).toContain('journal→cross-refs');
    // Entries 1 and 2 share "anomaly" and "deployment" (2 tags)
    const connections = palace.getConnections('journal', '1');
    expect(connections.length).toBeGreaterThan(0);
  });

  it('should add manual connections', () => {
    const added = palace.addConnection('principle', '1', 'hypothesis', '2', 'supports', 0.8);
    expect(added).toBe(true);

    const connections = palace.getConnections('principle', '1');
    expect(connections).toHaveLength(1);
    expect(connections[0].relation).toBe('supports');
    expect(connections[0].strength).toBe(0.8);
    expect(connections[0].autoDetected).toBe(false);
  });

  it('should not create duplicate connections (UNIQUE constraint)', () => {
    palace.addConnection('principle', '1', 'hypothesis', '2', 'supports', 0.8);
    const added = palace.addConnection('principle', '1', 'hypothesis', '2', 'supports', 0.9);
    expect(added).toBe(false);

    const connections = palace.getConnections('principle', '1');
    expect(connections).toHaveLength(1);
    expect(connections[0].strength).toBe(0.8); // Original value kept
  });

  it('should find BFS path between connected nodes', () => {
    palace.addConnection('principle', '1', 'hypothesis', '2', 'supports');
    palace.addConnection('hypothesis', '2', 'experiment', '3', 'tested_by');

    const path = palace.getPath('principle', '1', 'experiment', '3');
    expect(path).not.toBeNull();
    expect(path!.length).toBe(2);
    expect(path![0].type).toBe('hypothesis');
    expect(path![0].id).toBe('2');
    expect(path![1].type).toBe('experiment');
    expect(path![1].id).toBe('3');
  });

  it('should return null for disconnected nodes', () => {
    palace.addConnection('principle', '1', 'hypothesis', '2', 'supports');
    // No connection from hypothesis:2 to experiment:99
    const path = palace.getPath('principle', '1', 'experiment', '99');
    expect(path).toBeNull();
  });

  it('should respect maxDepth in BFS', () => {
    // Chain: 1→2→3→4→5
    palace.addConnection('principle', '1', 'hypothesis', '2', 'supports');
    palace.addConnection('hypothesis', '2', 'experiment', '3', 'tested_by');
    palace.addConnection('experiment', '3', 'anomaly', '4', 'caused_by');
    palace.addConnection('anomaly', '4', 'journal', '5', 'references');

    // maxDepth=2 should not find a path of length 4
    const path = palace.getPath('principle', '1', 'journal', '5', 2);
    expect(path).toBeNull();

    // maxDepth=4 should find the path
    const path2 = palace.getPath('principle', '1', 'journal', '5', 4);
    expect(path2).not.toBeNull();
    expect(path2!.length).toBe(4);
  });

  it('should return knowledge map as nodes + edges', () => {
    palace.addConnection('principle', '1', 'hypothesis', '2', 'supports', 0.8);
    palace.addConnection('hypothesis', '2', 'experiment', '3', 'tested_by', 0.6);

    const map = palace.getKnowledgeMap();
    expect(map.nodes.length).toBe(3);
    expect(map.edges.length).toBe(2);
    expect(map.edges[0].strength).toBeGreaterThanOrEqual(map.edges[1].strength); // ordered by strength
  });

  it('should detect isolated nodes from data sources', () => {
    // principle:1 is connected, principle:2 is isolated
    palace.addConnection('principle', '1', 'hypothesis', '10', 'supports');

    palace.setDataSources({
      getPrinciples: () => [
        { id: 1, statement: 'Connected principle' },
        { id: 2, statement: 'Isolated principle' },
      ],
    });

    const isolated = palace.getIsolatedNodes();
    expect(isolated.length).toBe(1);
    expect(isolated[0]).toEqual({ type: 'principle', id: '2' });
  });

  it('should calculate density correctly', () => {
    // 3 nodes, 2 edges → density = 2 / (3*2/2) = 2/3 ≈ 0.667
    palace.addConnection('principle', '1', 'hypothesis', '2', 'supports');
    palace.addConnection('hypothesis', '2', 'experiment', '3', 'tested_by');

    const stats = palace.getStats();
    expect(stats.totalNodes).toBe(3);
    expect(stats.totalEdges).toBe(2);
    expect(stats.density).toBeCloseTo(2 / 3, 1);
  });

  it('should return buildConnections counts', () => {
    palace.setDataSources({
      getHypotheses: (status) => {
        if (status === 'confirmed') return [
          { id: 1, statement: 'Error frequency increases during rapid deployment cycles', status: 'confirmed' },
        ];
        return [{ id: 1, statement: 'Error frequency increases during rapid deployment cycles', status: 'confirmed' }];
      },
      getPrinciples: () => [
        { id: 10, statement: 'Error frequency correlates with deployment timing and rapid release cycles' },
      ],
    });

    const result = palace.buildConnections();
    expect(typeof result.newConnections).toBe('number');
    expect(typeof result.totalConnections).toBe('number');
    expect(Array.isArray(result.scannedSources)).toBe(true);
  });
});
