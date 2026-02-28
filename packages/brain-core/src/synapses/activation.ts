import type { NodeRef, ActivationResult, SynapseRepoInterface } from './types.js';

/**
 * Spreading activation through the synapse network.
 * BFS traversal that propagates energy through weighted connections.
 */
export function spreadingActivation(
  repo: SynapseRepoInterface,
  startNode: NodeRef,
  maxDepth: number = 3,
  minWeight: number = 0.2,
): ActivationResult[] {
  const visited = new Set<string>();
  const results: ActivationResult[] = [];

  const queue: Array<{
    node: NodeRef;
    depth: number;
    pathWeight: number;
    path: string[];
  }> = [{ node: startNode, depth: 0, pathWeight: 1.0, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.node.type}:${current.node.id}`;

    if (visited.has(key)) continue;
    if (current.depth > maxDepth) continue;
    if (current.pathWeight < minWeight) continue;

    visited.add(key);

    if (current.depth > 0) {
      results.push({
        node: current.node,
        activation: current.pathWeight,
        depth: current.depth,
        path: current.path,
      });
    }

    const outgoing = repo.getOutgoing(current.node.type, current.node.id);
    const incoming = repo.getIncoming(current.node.type, current.node.id);

    for (const synapse of outgoing) {
      const nextWeight = current.pathWeight * synapse.weight;
      if (nextWeight >= minWeight) {
        queue.push({
          node: { type: synapse.target_type, id: synapse.target_id },
          depth: current.depth + 1,
          pathWeight: nextWeight,
          path: [...current.path, `--${synapse.synapse_type}-->`],
        });
      }
    }

    for (const synapse of incoming) {
      const nextWeight = current.pathWeight * synapse.weight;
      if (nextWeight >= minWeight) {
        queue.push({
          node: { type: synapse.source_type, id: synapse.source_id },
          depth: current.depth + 1,
          pathWeight: nextWeight,
          path: [...current.path, `<--${synapse.synapse_type}--`],
        });
      }
    }
  }

  return results.sort((a, b) => b.activation - a.activation);
}
