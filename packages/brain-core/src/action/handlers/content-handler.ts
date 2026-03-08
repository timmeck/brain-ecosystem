import { getLogger } from '../../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface ContentHandlerDeps {
  publishNow: (pieceId: number) => Promise<{ success: boolean; postId?: string }>;
  getPiece: (id: number) => { id: number; title: string; platform: string; status: string } | null;
}

export interface ContentHandlerResult {
  published: boolean;
  pieceId: number;
  postId?: string;
  platform?: string;
}

// ── Handler Factory ──────────────────────────────────────────

const log = getLogger();

/**
 * Creates an ActionBridge handler for `publish_content` actions.
 * Translates publish proposals into ContentForge.publishNow() calls.
 */
export function createContentHandler(deps: ContentHandlerDeps): (payload: Record<string, unknown>) => Promise<ContentHandlerResult> {
  return async (payload: Record<string, unknown>): Promise<ContentHandlerResult> => {
    const pieceId = (payload.pieceId as number) ?? 0;

    const piece = deps.getPiece(pieceId);
    if (!piece) {
      log.warn(`[content-handler] Content piece #${pieceId} not found`);
      throw new Error(`Content piece #${pieceId} not found`);
    }

    if (piece.status === 'published') {
      log.info(`[content-handler] Content #${pieceId} already published`);
      return { published: false, pieceId, platform: piece.platform };
    }

    log.info(`[content-handler] Publishing content #${pieceId}: ${piece.title} on ${piece.platform}`);

    const result = await deps.publishNow(pieceId);

    return {
      published: result.success,
      pieceId,
      postId: result.postId,
      platform: piece.platform,
    };
  };
}
