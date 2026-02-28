# Synapse Networks

The synapse network is Brain's knowledge graph -- a weighted directed graph stored in SQLite that connects all entities (errors, solutions, code modules, projects, signals, posts, campaigns) through typed, weighted relationships.

## Synapse Types

Each brain defines its own synapse types that represent meaningful relationships:

### Brain Synapse Types

| Type | Source | Target | Meaning |
|------|--------|--------|---------|
| `solved_by` | error | solution | This solution fixes this error |
| `related_to` | error | error | These errors are related |
| `uses` | solution | code_module | This solution uses this code |
| `in_project` | error/solution | project | Belongs to this project |
| `caused_by` | error | code_module | This code caused this error |
| `prevents` | rule | error | This rule prevents this error |

### Trading Brain Synapse Types

| Type | Source | Target | Meaning |
|------|--------|--------|---------|
| `predicts` | signal | outcome | This signal predicted this outcome |
| `similar_to` | signal | signal | These signals have similar fingerprints |
| `in_regime` | signal | regime | This signal occurred in this regime |
| `correlates` | pair | pair | These pairs tend to move together |

### Marketing Brain Synapse Types

| Type | Source | Target | Meaning |
|------|--------|--------|---------|
| `posted_on` | post | platform | This post was on this platform |
| `has_format` | post | format | This post uses this format |
| `in_campaign` | post | campaign | This post belongs to this campaign |
| `high_engagement` | post | pattern | This post exemplifies this pattern |
| `similar_to` | post | post | These posts have similar content |

## Synapse Record

Every synapse in the network has the same structure:

```typescript
interface SynapseRecord {
  id: number;
  source_type: string;       // e.g., "error"
  source_id: number;         // e.g., 42
  target_type: string;       // e.g., "solution"
  target_id: number;         // e.g., 7
  synapse_type: string;      // e.g., "solved_by"
  weight: number;            // 0.0 to 1.0
  activation_count: number;  // times activated
  last_activated_at: string; // ISO timestamp
  metadata: string | null;   // optional JSON context
  created_at: string;        // ISO timestamp
  updated_at: string;        // ISO timestamp
}
```

## Weight Calculations

Weights are managed by three operations:

### Strengthen

When a connection proves useful, its weight increases asymptotically toward 1.0:

```
newWeight = min(1.0, weight + (1.0 - weight) * learningRate)
```

The `activation_count` is incremented and `last_activated_at` is updated.

### Weaken

When a connection proves wrong, its weight is reduced by a multiplicative factor:

```
newWeight = weight * factor    // e.g., factor = 0.5
```

If the weight drops below the prune threshold (default: 0.01), the synapse is deleted.

### Decay

Inactive synapses lose weight over time using exponential half-life decay:

```
factor = 0.5 ^ (daysSinceLastActivation / decayHalfLifeDays)
newWeight = weight * factor
```

Synapses with a grace period of `decayAfterDays` (default: 7) are exempt from decay.

## Network Queries

### Outgoing Synapses

Find all connections leaving a node:

```typescript
const outgoing = repo.getOutgoing('error', 42);
// Returns all synapses where source_type='error' AND source_id=42
```

### Incoming Synapses

Find all connections arriving at a node:

```typescript
const incoming = repo.getIncoming('solution', 7);
// Returns all synapses where target_type='solution' AND target_id=7
```

### Top Synapses by Weight

Find the strongest connections in the network:

```typescript
const strongest = repo.topByWeight(10);
// Returns the 10 highest-weight synapses
```

### Diverse Top Synapses

Get top synapses across different synapse types (prevents one type from dominating):

```typescript
const diverse = repo.topDiverse(3);
// Returns top 3 synapses per synapse_type
```

## Network Statistics

The `NetworkStats` interface provides an overview of the network:

```typescript
interface NetworkStats {
  totalNodes: number;          // unique nodes referenced
  totalSynapses: number;       // total synapse count
  avgWeight: number;           // average synapse weight
  nodesByType: Record<string, number>;    // e.g., { error: 42, solution: 35 }
  synapsesByType: Record<string, number>; // e.g., { solved_by: 28, related_to: 15 }
}
```

Access via CLI:

```bash
brain network
trading network
marketing network
```

Or via MCP:

```
brain_status       -- includes network stats
trading_status     -- includes network stats
```

## Network Visualization

The synapse network can be visualized through:

1. **CLI**: `brain network` shows a text-based summary with node counts, synapse counts, and weight distribution.

2. **Dashboard**: Marketing Brain's interactive dashboard (port 7783) includes a force-directed graph visualization where:
   - Nodes are colored by type
   - Edges are weighted by synapse strength (thicker = stronger)
   - The graph updates in real-time via SSE

3. **REST API**: Query synapse data programmatically via the REST API for custom visualizations:
   ```
   GET http://localhost:7777/api/synapses/stats
   GET http://localhost:7777/api/synapses/top?limit=20
   ```

## Using `brain synapses` CLI

The CLI provides several ways to inspect the synapse network:

```bash
# Show network overview
brain network

# Explore connections from a specific node
brain explain <rule_id>

# View insights generated from the network
brain insights

# Check what Brain learned (rules derived from strong synapses)
brain learn
```

## The Synapse Manager

Each brain has a `SynapseManager` (extending `BaseSynapseManager` from brain-core) that orchestrates all synapse operations:

- **Creating synapses** when new relationships are discovered
- **Strengthening** when relationships are confirmed
- **Weakening** when relationships fail
- **Running decay** during learning cycles
- **Computing activation** for similarity queries
- **Finding paths** between nodes

The manager abstracts the repository layer and applies the correct Hebbian configuration parameters.
