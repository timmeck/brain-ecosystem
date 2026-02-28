import type { InsightRepository, InsightRecord } from '../db/repositories/insight.repository.js';

export class InsightService {
  constructor(private insightRepo: InsightRepository) {}

  getAll(): InsightRecord[] {
    return this.insightRepo.getAll();
  }

  getRecent(limit: number = 10): InsightRecord[] {
    return this.insightRepo.getRecent(limit);
  }

  getByType(type: string): InsightRecord[] {
    return this.insightRepo.getByType(type);
  }

  getBySeverity(severity: string): InsightRecord[] {
    return this.insightRepo.getBySeverity(severity);
  }

  search(query: string, limit: number = 20): InsightRecord[] {
    return this.insightRepo.search(query, limit);
  }

  count(): number {
    return this.insightRepo.count();
  }
}
