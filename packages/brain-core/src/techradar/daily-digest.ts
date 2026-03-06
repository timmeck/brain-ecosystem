/**
 * Daily Digest — Generiert tägliche Zusammenfassung der TechRadar-Findings
 */

import { getLogger } from '../utils/logger.js';
import type { LLMService } from '../llm/llm-service.js';
import type { TechRadarEntry, DailyDigest, DigestEntry, DigestOpportunity, DigestActionItem } from './types.js';

const log = getLogger();

export class DigestGenerator {
  private llmService: LLMService | null = null;

  setLLMService(llmService: LLMService): void {
    this.llmService = llmService;
  }

  /**
   * Generate a daily digest from today's radar entries.
   * Uses LLM for summary when available, otherwise creates structured report.
   */
  async generate(entries: TechRadarEntry[], date: string): Promise<DailyDigest> {
    const digestEntries: DigestEntry[] = entries
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 20)
      .map(e => ({
        name: e.name,
        source: e.source,
        category: e.category,
        relevance_score: e.relevance_score,
        summary: e.description.substring(0, 200),
      }));

    const opportunities = this.extractOpportunities(entries);
    const actionItems = this.extractActionItems(entries);

    let summary: string;
    if (this.llmService && entries.length > 0) {
      try {
        summary = await this.generateLLMSummary(entries, date);
      } catch (err) {
        log.warn(`[Digest] LLM summary failed: ${(err as Error).message}`);
        summary = this.generateFallbackSummary(entries, date);
      }
    } else {
      summary = this.generateFallbackSummary(entries, date);
    }

    return {
      date,
      summary,
      entries: digestEntries,
      opportunities,
      action_items: actionItems,
      created_at: new Date().toISOString(),
    };
  }

  private async generateLLMSummary(entries: TechRadarEntry[], date: string): Promise<string> {
    const topEntries = entries
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 10)
      .map(e => `- ${e.name} (${e.source}, relevance: ${e.relevance_score}): ${e.description.substring(0, 100)}`)
      .join('\n');

    const result = await this.llmService!.call(
      'summarize',
      `Write a concise daily tech digest for ${date}. Focus on what matters for a TypeScript AI project (Brain Ecosystem).

Top findings today:
${topEntries}

Write 3-5 sentences highlighting the most important developments and their implications. Be direct, no fluff.`,
    );

    return result?.text ?? this.generateFallbackSummary(entries, date);
  }

  private generateFallbackSummary(entries: TechRadarEntry[], date: string): string {
    if (entries.length === 0) return `No new findings for ${date}.`;

    const high = entries.filter(e => e.relevance_score >= 60);
    const bySource = new Map<string, number>();
    for (const e of entries) {
      bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
    }

    const sourceSummary = [...bySource.entries()]
      .map(([s, c]) => `${c} from ${s}`)
      .join(', ');

    return `TechRadar Digest for ${date}: ${entries.length} findings (${sourceSummary}). ${high.length} high-relevance items found.`;
  }

  private extractOpportunities(entries: TechRadarEntry[]): DigestOpportunity[] {
    return entries
      .filter(e => e.action_type === 'integrate' || e.action_type === 'update')
      .slice(0, 5)
      .map(e => ({
        title: `${e.action_type === 'integrate' ? 'Integrate' : 'Update'}: ${e.name}`,
        description: e.action_detail || e.description.substring(0, 200),
        effort: e.relevance_score >= 70 ? 'low' as const : 'medium' as const,
        impact: e.relevance_score >= 70 ? 'high' as const : 'medium' as const,
      }));
  }

  private extractActionItems(entries: TechRadarEntry[]): DigestActionItem[] {
    return entries
      .filter(e => e.action_type !== 'none' && e.relevance_score >= 40)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 10)
      .map(e => ({
        action: e.action_detail || `${e.action_type}: ${e.name}`,
        priority: e.relevance_score >= 70 ? 'high' as const : e.relevance_score >= 50 ? 'medium' as const : 'low' as const,
        related_entry: e.name,
      }));
  }
}
