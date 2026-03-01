import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface GraphNodeRecord {
  id: string;
  type: string;
  label: string;
  activation: number;
  total_activations: number;
}

export interface GraphEdgeRecord {
  id: string;
  source: string;
  target: string;
  weight: number;
  activations: number;
  last_activated: string;
}

export class GraphRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      upsertNode: db.prepare(`
        INSERT INTO graph_nodes (id, type, label, activation, total_activations)
        VALUES (@id, @type, @label, @activation, @total_activations)
        ON CONFLICT(id) DO UPDATE SET
          activation = @activation, total_activations = @total_activations
      `),
      upsertEdge: db.prepare(`
        INSERT INTO graph_edges (id, source, target, weight, activations, last_activated)
        VALUES (@id, @source, @target, @weight, @activations, @last_activated)
        ON CONFLICT(id) DO UPDATE SET
          weight = @weight, activations = @activations, last_activated = @last_activated
      `),
      getAllNodes: db.prepare('SELECT * FROM graph_nodes'),
      getAllEdges: db.prepare('SELECT * FROM graph_edges'),
      getNode: db.prepare('SELECT * FROM graph_nodes WHERE id = ?'),
      getEdge: db.prepare('SELECT * FROM graph_edges WHERE id = ?'),
      getEdgesFrom: db.prepare('SELECT * FROM graph_edges WHERE source = ?'),
      getEdgesTo: db.prepare('SELECT * FROM graph_edges WHERE target = ?'),
      getEdgesFor: db.prepare('SELECT * FROM graph_edges WHERE source = ? OR target = ?'),
      nodeCount: db.prepare('SELECT COUNT(*) as count FROM graph_nodes'),
      edgeCount: db.prepare('SELECT COUNT(*) as count FROM graph_edges'),
      updateEdgeWeight: db.prepare(`UPDATE graph_edges SET weight = ?, activations = activations + 1, last_activated = datetime('now') WHERE id = ?`),
      deleteAllNodes: db.prepare('DELETE FROM graph_nodes'),
      deleteAllEdges: db.prepare('DELETE FROM graph_edges'),
    };
  }

  upsertNode(node: GraphNodeRecord): void {
    this.stmts['upsertNode']!.run(node);
  }

  upsertEdge(edge: GraphEdgeRecord): void {
    this.stmts['upsertEdge']!.run(edge);
  }

  getAllNodes(): GraphNodeRecord[] {
    return this.stmts['getAllNodes']!.all() as GraphNodeRecord[];
  }

  getAllEdges(): GraphEdgeRecord[] {
    return this.stmts['getAllEdges']!.all() as GraphEdgeRecord[];
  }

  getNode(id: string): GraphNodeRecord | undefined {
    return this.stmts['getNode']!.get(id) as GraphNodeRecord | undefined;
  }

  getEdge(id: string): GraphEdgeRecord | undefined {
    return this.stmts['getEdge']!.get(id) as GraphEdgeRecord | undefined;
  }

  getEdgesFrom(nodeId: string): GraphEdgeRecord[] {
    return this.stmts['getEdgesFrom']!.all(nodeId) as GraphEdgeRecord[];
  }

  getEdgesFor(nodeId: string): GraphEdgeRecord[] {
    return this.stmts['getEdgesFor']!.all(nodeId, nodeId) as GraphEdgeRecord[];
  }

  nodeCount(): number {
    const row = this.stmts['nodeCount']!.get() as { count: number };
    return row.count;
  }

  edgeCount(): number {
    const row = this.stmts['edgeCount']!.get() as { count: number };
    return row.count;
  }

  updateEdgeWeight(id: string, weight: number): void {
    this.stmts['updateEdgeWeight']!.run(weight, id);
  }

  clearAll(): void {
    this.stmts['deleteAllEdges']!.run();
    this.stmts['deleteAllNodes']!.run();
  }
}
