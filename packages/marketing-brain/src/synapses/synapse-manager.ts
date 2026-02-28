import { BaseSynapseManager } from '@timmeck/brain-core';
import type { ActivationResult } from '@timmeck/brain-core';

/**
 * Marketing-brain-specific SynapseManager.
 * Extends BaseSynapseManager with post-context domain methods.
 */
export class SynapseManager extends BaseSynapseManager {
  getPostContext(postId: number): {
    campaigns: ActivationResult[];
    similarPosts: ActivationResult[];
    strategies: ActivationResult[];
    rules: ActivationResult[];
    templates: ActivationResult[];
    insights: ActivationResult[];
  } {
    const all = this.activate({ type: 'post', id: postId });
    return {
      campaigns: all.filter(a => a.node.type === 'campaign'),
      similarPosts: all.filter(a => a.node.type === 'post'),
      strategies: all.filter(a => a.node.type === 'strategy'),
      rules: all.filter(a => a.node.type === 'rule'),
      templates: all.filter(a => a.node.type === 'template'),
      insights: all.filter(a => a.node.type === 'insight'),
    };
  }
}
