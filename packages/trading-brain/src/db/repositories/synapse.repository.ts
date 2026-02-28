import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface SynapseRecord {
  id: string;
  fingerprint: string;
  weight: number;
  wins: number;
  losses: number;
  activations: number;
  total_profit: number;
  last_activated: string;
  created_at: string;
}

export class SynapseRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      upsert: db.prepare(`
        INSERT INTO synapses (id, fingerprint, weight, wins, losses, activations, total_profit, last_activated)
        VALUES (@id, @fingerprint, @weight, @wins, @losses, @activations, @total_profit, @last_activated)
        ON CONFLICT(id) DO UPDATE SET
          weight = @weight, wins = @wins, losses = @losses,
          activations = @activations, total_profit = @total_profit,
          last_activated = @last_activated
      `),
      getById: db.prepare('SELECT * FROM synapses WHERE id = ?'),
      getAll: db.prepare('SELECT * FROM synapses ORDER BY weight DESC'),
      count: db.prepare('SELECT COUNT(*) as count FROM synapses'),
      updateWeight: db.prepare('UPDATE synapses SET weight = ?, last_activated = datetime("now") WHERE id = ?'),
      deleteById: db.prepare('DELETE FROM synapses WHERE id = ?'),
      getByMinWeight: db.prepare('SELECT * FROM synapses WHERE weight >= ? ORDER BY weight DESC'),
      getStrongest: db.prepare('SELECT * FROM synapses ORDER BY weight DESC LIMIT ?'),
    };
  }

  upsert(synapse: Omit<SynapseRecord, 'created_at'>): void {
    this.stmts['upsert']!.run(synapse);
  }

  getById(id: string): SynapseRecord | undefined {
    return this.stmts['getById']!.get(id) as SynapseRecord | undefined;
  }

  getAll(): SynapseRecord[] {
    return this.stmts['getAll']!.all() as SynapseRecord[];
  }

  count(): number {
    const row = this.stmts['count']!.get() as { count: number };
    return row.count;
  }

  updateWeight(id: string, weight: number): void {
    this.stmts['updateWeight']!.run(weight, id);
  }

  delete(id: string): void {
    this.stmts['deleteById']!.run(id);
  }

  getByMinWeight(minWeight: number): SynapseRecord[] {
    return this.stmts['getByMinWeight']!.all(minWeight) as SynapseRecord[];
  }

  getStrongest(limit: number = 20): SynapseRecord[] {
    return this.stmts['getStrongest']!.all(limit) as SynapseRecord[];
  }
}
