import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { SynapseRecord } from '../../types/synapse.types.js';

type SynapseCreate = Omit<SynapseRecord, 'id' | 'activation_count' | 'last_activated_at' | 'created_at' | 'updated_at'>;
type SynapseUpdate = Partial<Omit<SynapseRecord, 'id' | 'created_at'>>;

export class SynapseRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO synapses (source_type, source_id, target_type, target_id, synapse_type, weight, metadata)
        VALUES (@source_type, @source_id, @target_type, @target_id, @synapse_type, @weight, @metadata)
      `),
      getById: db.prepare('SELECT * FROM synapses WHERE id = ?'),
      delete: db.prepare('DELETE FROM synapses WHERE id = ?'),
      getOutgoing: db.prepare(
        'SELECT * FROM synapses WHERE source_type = ? AND source_id = ? ORDER BY weight DESC'
      ),
      getIncoming: db.prepare(
        'SELECT * FROM synapses WHERE target_type = ? AND target_id = ? ORDER BY weight DESC'
      ),
      findConnected: db.prepare(`
        SELECT * FROM synapses
        WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)
        ORDER BY weight DESC
      `),
      findBySourceTarget: db.prepare(`
        SELECT * FROM synapses
        WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND synapse_type = ?
      `),
      findInactiveSince: db.prepare(`
        SELECT * FROM synapses WHERE last_activated_at < ?
      `),
      countNodes: db.prepare(`
        SELECT COUNT(*) as count FROM (
          SELECT source_type, source_id FROM synapses
          UNION
          SELECT target_type, target_id FROM synapses
        )
      `),
      avgWeight: db.prepare('SELECT AVG(weight) as avg_weight FROM synapses'),
      countByType: db.prepare('SELECT synapse_type, COUNT(*) as count FROM synapses GROUP BY synapse_type'),
      totalCount: db.prepare('SELECT COUNT(*) as count FROM synapses'),
      topByWeight: db.prepare('SELECT * FROM synapses ORDER BY weight DESC LIMIT ?'),
      topDiverse: db.prepare(`
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY synapse_type ORDER BY weight DESC) as rn
          FROM synapses
        ) WHERE rn <= ? ORDER BY weight DESC
      `),
    };
  }

  create(data: SynapseCreate): number {
    const result = this.stmts.create.run({
      source_type: data.source_type,
      source_id: data.source_id,
      target_type: data.target_type,
      target_id: data.target_id,
      synapse_type: data.synapse_type,
      weight: data.weight,
      metadata: data.metadata ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): SynapseRecord | undefined {
    return this.stmts.getById.get(id) as SynapseRecord | undefined;
  }

  update(id: number, data: SynapseUpdate): boolean {
    const fields = Object.keys(data).filter(
      (key) => (data as Record<string, unknown>)[key] !== undefined
    );
    if (fields.length === 0) return false;

    const setClauses = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE synapses SET ${setClauses}, updated_at = datetime('now') WHERE id = @id`
    );
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  getOutgoing(sourceType: string, sourceId: number): SynapseRecord[] {
    return this.stmts.getOutgoing.all(sourceType, sourceId) as SynapseRecord[];
  }

  getIncoming(targetType: string, targetId: number): SynapseRecord[] {
    return this.stmts.getIncoming.all(targetType, targetId) as SynapseRecord[];
  }

  findBySourceTarget(
    sourceType: string, sourceId: number,
    targetType: string, targetId: number,
    synapseType: string,
  ): SynapseRecord | undefined {
    return this.stmts.findBySourceTarget.get(
      sourceType, sourceId, targetType, targetId, synapseType
    ) as SynapseRecord | undefined;
  }

  findConnected(nodeType: string, nodeId: number): SynapseRecord[] {
    return this.stmts.findConnected.all(nodeType, nodeId, nodeType, nodeId) as SynapseRecord[];
  }

  findInactiveSince(cutoff: string): SynapseRecord[] {
    return this.stmts.findInactiveSince.all(cutoff) as SynapseRecord[];
  }

  topByWeight(limit: number): SynapseRecord[] {
    return this.stmts.topByWeight.all(limit) as SynapseRecord[];
  }

  topDiverse(perType: number): SynapseRecord[] {
    return this.stmts.topDiverse.all(perType) as SynapseRecord[];
  }

  countNodes(): number {
    const row = this.stmts.countNodes.get() as { count: number };
    return row.count;
  }

  totalCount(): number {
    const row = this.stmts.totalCount.get() as { count: number };
    return row.count;
  }

  avgWeight(): number {
    const row = this.stmts.avgWeight.get() as { avg_weight: number | null };
    return row.avg_weight ?? 0;
  }

  countByType(): Record<string, number> {
    const rows = this.stmts.countByType.all() as Array<{ synapse_type: string; count: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) result[row.synapse_type] = row.count;
    return result;
  }
}
