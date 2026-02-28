import type { PathNode, SynapsePath, SynapseRecord, SynapseRepoInterface } from './types.js';

/**
 * Find the highest-weight path between two nodes in the synapse network.
 * Uses BFS with bidirectional traversal (outgoing + incoming).
 */
export function findPath(
  repo: SynapseRepoInterface,
  from: PathNode,
  to: PathNode,
  maxDepth: number = 5,
): SynapsePath | null {
  const visited = new Set<string>();

  const queue: Array<{
    node: PathNode;
    path: SynapseRecord[];
    totalWeight: number;
  }> = [{ node: from, path: [], totalWeight: 1.0 }];

  let bestPath: SynapsePath | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.node.type}:${current.node.id}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (current.node.type === to.type && current.node.id === to.id) {
      if (!bestPath || current.totalWeight > bestPath.totalWeight) {
        bestPath = {
          from,
          to,
          synapses: current.path,
          totalWeight: current.totalWeight,
          hops: current.path.length,
        };
      }
      continue;
    }

    if (current.path.length >= maxDepth) continue;

    const outgoing = repo.getOutgoing(current.node.type, current.node.id);
    for (const synapse of outgoing) {
      const targetKey = `${synapse.target_type}:${synapse.target_id}`;
      if (!visited.has(targetKey)) {
        queue.push({
          node: { type: synapse.target_type, id: synapse.target_id },
          path: [...current.path, synapse],
          totalWeight: current.totalWeight * synapse.weight,
        });
      }
    }

    const incoming = repo.getIncoming(current.node.type, current.node.id);
    for (const synapse of incoming) {
      const sourceKey = `${synapse.source_type}:${synapse.source_id}`;
      if (!visited.has(sourceKey)) {
        queue.push({
          node: { type: synapse.source_type, id: synapse.source_id },
          path: [...current.path, synapse],
          totalWeight: current.totalWeight * synapse.weight,
        });
      }
    }
  }

  return bestPath;
}
