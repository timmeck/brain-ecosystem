import type { InsightRecord } from '../types/research.types.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { getLogger } from '../utils/logger.js';

export interface InsightQuery {
  projectId?: number;
  type?: string;
  activeOnly?: boolean;
  limit?: number;
}

export interface TrendResult {
  errorType: string;
  count: number;
  direction: 'increasing' | 'decreasing' | 'stable';
  period: string;
}

export class ResearchService {
  private logger = getLogger();

  constructor(
    private insightRepo: InsightRepository,
    private errorRepo: ErrorRepository,
    private synapseManager: SynapseManager,
  ) {}

  getInsights(query: InsightQuery): InsightRecord[] {
    if (query.type) {
      return this.insightRepo.findByType(query.type);
    }
    if (query.activeOnly !== false) {
      return this.insightRepo.findActive(query.projectId);
    }
    return this.insightRepo.findActive(query.projectId);
  }

  createInsight(data: {
    type: string;
    title: string;
    description: string;
    evidence?: string;
    priority?: number;
    projectId?: number;
    expiresInDays?: number;
  }): number {
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86400000).toISOString()
      : null;

    const id = this.insightRepo.create({
      type: data.type as InsightRecord['type'],
      title: data.title,
      description: data.description,
      evidence: data.evidence ?? '[]',
      priority: data.priority ?? 0,
      project_id: data.projectId ?? null,
      active: 1,
      expires_at: expiresAt,
    });

    this.logger.info(`Insight created (id=${id}, type=${data.type})`);
    return id;
  }

  getTrends(projectId?: number, windowDays: number = 7): TrendResult[] {
    const now = new Date();
    const currentStart = new Date(now.getTime() - windowDays * 86400000).toISOString();
    const previousStart = new Date(now.getTime() - windowDays * 2 * 86400000).toISOString();

    const currentCount = this.errorRepo.countSince(currentStart, projectId);
    const previousCount = this.errorRepo.countSince(previousStart, projectId) - currentCount;

    const direction = currentCount > previousCount * 1.2
      ? 'increasing' as const
      : currentCount < previousCount * 0.8
        ? 'decreasing' as const
        : 'stable' as const;

    return [{
      errorType: 'all',
      count: currentCount,
      direction,
      period: `${windowDays}d`,
    }];
  }

  expireOldInsights(): number {
    return this.insightRepo.expire();
  }

  rateInsight(id: number, rating: number, comment?: string): boolean {
    const clamped = Math.max(-1, Math.min(1, rating)); // -1 (bad), 0 (neutral), 1 (useful)
    return this.insightRepo.rate(id, clamped, comment);
  }
}
