import { getLogger } from '../../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface CreativeSeedPayload {
  topic: string;
  domains: string[];
  source: string;
  confidence: number;
}

export interface CreativeSeedHandlerDeps {
  pollinate: (topic: string, domains?: string[]) => { ideas: Array<{ title: string; score: number }> };
}

export interface CreativeSeedHandlerResult {
  seeded: boolean;
  topic: string;
  ideasGenerated: number;
}

// ── Handler Factory ──────────────────────────────────────────

const log = getLogger();

/**
 * Creates an ActionBridge handler for `creative_seed` actions.
 * Translates FeedbackRouter creative_seed proposals into CreativeEngine.pollinate() calls.
 */
export function createCreativeSeedHandler(deps: CreativeSeedHandlerDeps): (payload: Record<string, unknown>) => Promise<CreativeSeedHandlerResult> {
  return async (payload: Record<string, unknown>): Promise<CreativeSeedHandlerResult> => {
    const topic = (payload.topic as string) ?? 'general';
    const domains = (payload.domains as string[]) ?? [];
    const source = (payload.source as string) ?? 'unknown';

    log.info(`[creative-seed-handler] Seeding creativity for topic="${topic}" from ${source}`);

    try {
      const result = deps.pollinate(topic, domains.length > 0 ? domains : undefined);
      const count = result.ideas?.length ?? 0;

      log.info(`[creative-seed-handler] Generated ${count} ideas for "${topic}"`);

      return {
        seeded: count > 0,
        topic,
        ideasGenerated: count,
      };
    } catch (err) {
      log.warn(`[creative-seed-handler] Failed to seed: ${(err as Error).message}`);
      return {
        seeded: false,
        topic,
        ideasGenerated: 0,
      };
    }
  };
}
