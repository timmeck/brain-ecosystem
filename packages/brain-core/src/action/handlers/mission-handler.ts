import { getLogger } from '../../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface MissionHandlerDeps {
  createMission: (topic: string, mode: string) => { id?: number; topic: string; status: string };
}

export interface MissionHandlerResult {
  started: boolean;
  topic: string;
  missionId: number | null;
}

// ── Handler Factory ──────────────────────────────────────────

const log = getLogger();

/**
 * Creates an ActionBridge handler for `start_mission` actions.
 * Translates ContradictionResolver desires into MissionEngine missions.
 */
export function createMissionHandler(deps: MissionHandlerDeps): (payload: Record<string, unknown>) => Promise<MissionHandlerResult> {
  return async (payload: Record<string, unknown>): Promise<MissionHandlerResult> => {
    const desireKey = (payload.desireKey as string) ?? '';
    const description = (payload.description as string) ?? '';

    // Extract topic: prefer description (has full statements), fallback to desireKey
    let topic: string;

    // Try "X" vs "Y" pattern from description first
    const match = description.match(/"([^"]{3,})"\s*vs\s*"([^"]{3,})"/);
    if (match) {
      topic = `Contradiction: "${match[1].substring(0, 60)}" vs "${match[2].substring(0, 60)}"`;
    } else if (description.length > 10) {
      topic = description.substring(0, 120);
    } else {
      // Fallback to desireKey cleanup
      topic = desireKey.replace(/^contradiction_/, '').replace(/_/g, ' ');
      if (topic.length < 5) topic = 'general research';
    }

    log.info(`[mission-handler] Starting mission for topic="${topic}" (desireKey=${desireKey})`);

    try {
      const mission = deps.createMission(topic, 'quick');
      log.info(`[mission-handler] Mission #${mission.id ?? 0} started: "${topic}"`);

      return {
        started: true,
        topic,
        missionId: mission.id ?? null,
      };
    } catch (err) {
      log.warn(`[mission-handler] Failed to start mission: ${(err as Error).message}`);
      return {
        started: false,
        topic,
        missionId: null,
      };
    }
  };
}
