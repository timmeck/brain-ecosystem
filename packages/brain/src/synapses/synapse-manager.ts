import { BaseSynapseManager } from '@timmeck/brain-core';
import type { ActivationResult } from '@timmeck/brain-core';

/**
 * Brain-specific SynapseManager.
 * Extends BaseSynapseManager with error-context domain methods.
 */
export class SynapseManager extends BaseSynapseManager {
  getErrorContext(errorId: number): {
    solutions: ActivationResult[];
    relatedErrors: ActivationResult[];
    relevantModules: ActivationResult[];
    preventionRules: ActivationResult[];
    insights: ActivationResult[];
  } {
    const all = this.activate({ type: 'error', id: errorId });
    return {
      solutions: all.filter(a => a.node.type === 'solution'),
      relatedErrors: all.filter(a => a.node.type === 'error'),
      relevantModules: all.filter(a => a.node.type === 'code_module'),
      preventionRules: all.filter(a => a.node.type === 'rule'),
      insights: all.filter(a => a.node.type === 'insight'),
    };
  }
}
