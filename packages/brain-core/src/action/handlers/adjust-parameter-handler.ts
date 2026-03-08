import { getLogger } from '../../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface AdjustParameterPayload {
  engine: string;
  parameter: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
}

export interface AdjustParameterHandlerDeps {
  getParameter: (engine: string, name: string) => { value: number; min: number; max: number } | undefined;
  setParameter: (engine: string, name: string, value: number) => void;
}

export interface AdjustParameterHandlerResult {
  adjusted: boolean;
  engine: string;
  parameter: string;
  oldValue: number;
  newValue: number;
  reason: string;
}

// ── Handler Factory ──────────────────────────────────────────

const log = getLogger();

/**
 * Creates an ActionBridge handler for `adjust_parameter` actions.
 * Translates FeedbackRouter adjust_parameter proposals into ParameterRegistry updates.
 */
export function createAdjustParameterHandler(deps: AdjustParameterHandlerDeps): (payload: Record<string, unknown>) => Promise<AdjustParameterHandlerResult> {
  return async (payload: Record<string, unknown>): Promise<AdjustParameterHandlerResult> => {
    const engine = (payload.engine as string) ?? '';
    const parameter = (payload.parameter as string) ?? '';
    const suggestedValue = (payload.suggestedValue as number) ?? 0;
    const reason = (payload.reason as string) ?? '';

    if (!engine || !parameter) {
      log.warn(`[adjust-parameter-handler] Missing engine or parameter name`);
      return { adjusted: false, engine, parameter, oldValue: 0, newValue: 0, reason };
    }

    const current = deps.getParameter(engine, parameter);
    if (!current) {
      log.warn(`[adjust-parameter-handler] Parameter ${engine}.${parameter} not found`);
      return { adjusted: false, engine, parameter, oldValue: 0, newValue: suggestedValue, reason };
    }

    // Clamp to bounds
    const clamped = Math.max(current.min, Math.min(current.max, suggestedValue));
    const oldValue = current.value;

    try {
      deps.setParameter(engine, parameter, clamped);
      log.info(`[adjust-parameter-handler] Adjusted ${engine}.${parameter}: ${oldValue} → ${clamped} (reason: ${reason})`);

      return {
        adjusted: true,
        engine,
        parameter,
        oldValue,
        newValue: clamped,
        reason,
      };
    } catch (err) {
      log.warn(`[adjust-parameter-handler] Failed to adjust: ${(err as Error).message}`);
      return { adjusted: false, engine, parameter, oldValue, newValue: clamped, reason };
    }
  };
}
