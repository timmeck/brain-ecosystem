/**
 * Relevance Scorer — LLM-basiertes Scoring für TechRadar Entries
 *
 * Bewertet: "Ist das relevant für das Brain Ecosystem?"
 * Nutzt LLMService wenn verfügbar, sonst Keyword-basiertes Fallback.
 */

import { getLogger } from '../utils/logger.js';
import type { LLMService } from '../llm/llm-service.js';
import type { TechRadarCategory, TechRadarRing, TechRadarAction } from './types.js';

const log = getLogger();

// Keywords die auf Relevanz für Brain Ecosystem hindeuten
const RELEVANCE_KEYWORDS: Record<string, number> = {
  // Direct relevance
  'mcp': 15, 'model context protocol': 15, 'claude': 12, 'anthropic': 12,
  'llm': 10, 'ai agent': 10, 'ai assistant': 8,
  // Tech stack
  'typescript': 8, 'node': 5, 'sqlite': 8, 'better-sqlite3': 12,
  'vitest': 8, 'eslint': 5, 'monorepo': 6,
  // Domains
  'trading bot': 10, 'paper trading': 12, 'crypto': 6, 'defi': 5,
  'marketing automation': 10, 'content strategy': 8, 'social media api': 8,
  // Concepts
  'embeddings': 8, 'vector': 6, 'rag': 8, 'retrieval augmented': 8,
  'self-modifying': 10, 'metacognition': 10, 'knowledge graph': 8,
  'websocket': 6, 'real-time': 5, 'ipc': 6,
  // Tools
  'ollama': 10, 'ccxt': 10, 'playwright': 8, 'discord.js': 6,
  'bluesky': 8, 'atproto': 8,
};

export interface RelevanceResult {
  score: number;          // 0-100
  reason: string;
  category: TechRadarCategory;
  ring: TechRadarRing;
  action: TechRadarAction;
  actionDetail: string;
}

export class RelevanceScorer {
  private llmService: LLMService | null = null;

  setLLMService(llmService: LLMService): void {
    this.llmService = llmService;
  }

  /**
   * Score how relevant a finding is for the Brain Ecosystem.
   * Uses LLM when available, keyword fallback otherwise.
   */
  async score(name: string, description: string, source: string): Promise<RelevanceResult> {
    // Try LLM first
    if (this.llmService) {
      try {
        return await this.scoreLLM(name, description, source);
      } catch (err) {
        log.warn(`[RelevanceScorer] LLM scoring failed, using keyword fallback: ${(err as Error).message}`);
      }
    }

    return this.scoreKeywords(name, description);
  }

  private async scoreLLM(name: string, description: string, source: string): Promise<RelevanceResult> {
    const prompt = `Analyze this technology finding for relevance to the "Brain Ecosystem" project.

The Brain Ecosystem is a TypeScript monorepo with:
- brain-core: shared infra (IPC, MCP server, SQLite, math, synapses, LLM integration)
- brain: error memory & code intelligence
- trading-brain: paper trading with signal learning (CCXT, CoinGecko)
- marketing-brain: content strategy & engagement learning (Bluesky, Reddit)

Tech stack: TypeScript, Node.js, better-sqlite3, Vitest, MCP protocol, Ollama, Anthropic Claude

Finding:
Name: ${name}
Source: ${source}
Description: ${description}

Respond in JSON format:
{
  "score": <0-100 relevance score>,
  "reason": "<one sentence why relevant or not>",
  "category": "<framework|library|tool|language|platform|technique|ai_model|crypto|other>",
  "ring": "<adopt|trial|assess|hold>",
  "action": "<integrate|update|investigate|monitor|none>",
  "actionDetail": "<specific recommendation>"
}`;

    const result = await this.llmService!.call('custom', prompt);

    if (!result) {
      throw new Error('LLM returned null');
    }

    try {
      // Extract JSON from response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        score: Math.max(0, Math.min(100, parsed.score ?? 0)),
        reason: parsed.reason ?? 'No reason provided',
        category: parsed.category ?? 'other',
        ring: parsed.ring ?? 'assess',
        action: parsed.action ?? 'monitor',
        actionDetail: parsed.actionDetail ?? '',
      };
    } catch {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  /** Keyword-based fallback scoring */
  scoreKeywords(name: string, description: string): RelevanceResult {
    const text = `${name} ${description}`.toLowerCase();
    let score = 0;

    for (const [keyword, weight] of Object.entries(RELEVANCE_KEYWORDS)) {
      if (text.includes(keyword.toLowerCase())) {
        score += weight;
      }
    }

    // Cap at 100
    score = Math.min(100, score);

    // Determine category from keywords
    const category = this.inferCategory(text);
    const ring = score >= 70 ? 'adopt' as const : score >= 50 ? 'trial' as const : score >= 30 ? 'assess' as const : 'hold' as const;
    const action = score >= 60 ? 'investigate' as const : score >= 40 ? 'monitor' as const : 'none' as const;

    return {
      score,
      reason: score > 0 ? `Keyword matches: relevance ${score}/100` : 'No relevant keywords found',
      category,
      ring,
      action,
      actionDetail: action === 'investigate' ? `Look into ${name} for potential integration` : '',
    };
  }

  private inferCategory(text: string): TechRadarCategory {
    if (text.includes('framework') || text.includes('react') || text.includes('next')) return 'framework';
    if (text.includes('model') || text.includes('llm') || text.includes('gpt') || text.includes('claude')) return 'ai_model';
    if (text.includes('tool') || text.includes('cli') || text.includes('editor')) return 'tool';
    if (text.includes('language') || text.includes('rust') || text.includes('zig')) return 'language';
    if (text.includes('platform') || text.includes('cloud') || text.includes('aws')) return 'platform';
    if (text.includes('crypto') || text.includes('defi') || text.includes('blockchain')) return 'crypto';
    if (text.includes('technique') || text.includes('pattern') || text.includes('algorithm')) return 'technique';
    return 'library';
  }
}
