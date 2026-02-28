# Hebbian Learning

Brain's learning system is based on Hebbian learning theory -- the neuroscience principle that "neurons that fire together, wire together." This page explains how Brain applies this principle to build a self-improving knowledge network.

## The Core Principle

In neuroscience, when two neurons frequently activate together, the synapse (connection) between them strengthens. When they stop co-activating, the synapse weakens and may eventually be pruned.

Brain applies this same principle to software knowledge:

- When an **error** is fixed by a **solution**, the synapse between them strengthens.
- When a **solution fails** for an error, the synapse weakens.
- When a synapse is **not used** for a long time, it decays.
- When a synapse's weight drops **below a threshold**, it is pruned (deleted).

## How Synapses Form

A synapse is created the first time two nodes co-activate. In Brain's error tracking context:

1. Error #42 occurs.
2. Solution #7 is reported as a fix for error #42.
3. Brain creates a synapse: `error:42 --solved_by--> solution:7` with an initial weight (default: 0.3).

The synapse record includes:

| Field | Description |
|-------|-------------|
| `source_type` | Type of the source node (e.g., `error`) |
| `source_id` | ID of the source node |
| `target_type` | Type of the target node (e.g., `solution`) |
| `target_id` | ID of the target node |
| `synapse_type` | Relationship label (e.g., `solved_by`) |
| `weight` | Current strength, 0.0 to 1.0 |
| `activation_count` | How many times this synapse has been activated |
| `last_activated_at` | Timestamp of last activation |

## Strengthening

When a synapse is activated again (e.g., the same solution fixes another similar error), its weight increases asymptotically toward 1.0:

```
newWeight = min(1.0, currentWeight + (1.0 - currentWeight) * learningRate)
```

This formula has important properties:

- **Diminishing returns**: Each activation adds less weight as the synapse approaches 1.0.
- **Bounded**: Weight can never exceed 1.0.
- **Fast initial learning**: Early activations cause large weight increases.

With a learning rate of 0.3 (the default), weights progress like this:

| Activation | Weight |
|------------|--------|
| 1 (initial) | 0.300 |
| 2 | 0.510 |
| 3 | 0.657 |
| 4 | 0.760 |
| 5 | 0.832 |
| 10 | 0.972 |

A synapse with weight 0.97 represents very high confidence that the connection is valid and useful.

## Weakening

When a solution fails (e.g., it was tried but did not fix the error), the synapse is weakened by a multiplicative factor:

```
newWeight = currentWeight * factor    // default factor: 0.5
```

If the weight drops below the prune threshold (default: 0.01), the synapse is deleted entirely. This prevents the network from accumulating useless connections.

## Time Decay

Synapses that are not activated decay over time using an exponential half-life model:

```
factor = 0.5 ^ (daysSinceLastActivation / decayHalfLifeDays)
newWeight = currentWeight * factor
```

The decay configuration has three parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `decayHalfLifeDays` | 30 | Half-life in days -- after this many days of inactivity, weight halves |
| `decayAfterDays` | 7 | Grace period -- no decay for this many days after last activation |
| `pruneThreshold` | 0.01 | Weight below which synapses are deleted |

Decay runs periodically (typically during learning cycles) and processes all synapses that have been inactive longer than `decayAfterDays`.

### Decay Example

A synapse with weight 0.8 that has not been activated:

| Days Inactive | Weight |
|--------------|--------|
| 0 | 0.800 |
| 7 | 0.800 (grace period) |
| 15 | 0.658 |
| 30 | 0.400 |
| 60 | 0.200 |
| 90 | 0.100 |
| 120 | 0.050 |
| 150 | 0.025 |
| 180 | 0.013 |
| ~195 | < 0.01 (pruned) |

## Spreading Activation

Spreading activation is how Brain navigates the synapse network to find related knowledge. Starting from a node, energy propagates through weighted connections via BFS (Breadth-First Search):

1. Start at the source node with activation energy = 1.0.
2. For each outgoing and incoming synapse, propagate energy: `nextEnergy = currentEnergy * synapseWeight`.
3. Skip nodes already visited or with energy below the minimum weight threshold (default: 0.2).
4. Continue up to `maxDepth` hops (default: 3).
5. Return all activated nodes sorted by activation energy (highest first).

This means nodes connected by strong synapses receive high activation energy, while nodes connected by weak or long chains receive low energy. The result is a relevance-ranked list of related knowledge.

### Example

Starting from `error:42`:

```
error:42 (1.0)
  --solved_by--> solution:7 (0.8)
    --uses--> code_module:15 (0.8 * 0.6 = 0.48)
    --in_project--> project:2 (0.8 * 0.5 = 0.40)
  --related_to--> error:38 (0.5)
    --solved_by--> solution:12 (0.5 * 0.7 = 0.35)
  --in_project--> project:1 (0.4)
```

Results sorted by activation: solution:7 (0.8), error:38 (0.5), code_module:15 (0.48), project:1 (0.4), project:2 (0.40), solution:12 (0.35).

## Pathfinding

Pathfinding finds the highest-weight path between two specific nodes. This is used to answer questions like "how is this error related to that code module?"

The algorithm uses BFS with bidirectional traversal (following both outgoing and incoming synapses). Path weight is the product of all synapse weights along the path:

```
pathWeight = synapse1.weight * synapse2.weight * ... * synapseN.weight
```

This favors shorter paths with strong synapses over longer paths with weak connections.

## Real-World Examples

### Error Resolution Chain

```
Error: "Cannot read property 'length' of undefined"
  |
  |--(solved_by, w=0.85)--> Solution: "Add null check before .length"
  |                           |
  |                           +--(uses, w=0.6)--> Code Module: "safe-access.ts"
  |
  |--(related_to, w=0.7)--> Error: "TypeError: Cannot read properties of null"
  |                           |
  |                           +--(solved_by, w=0.9)--> Solution: "Optional chaining ?."
  |
  |--(in_project, w=0.5)--> Project: "api-server"
```

When a new "Cannot read property 'length' of undefined" error occurs, Brain activates this network and suggests both the null check and optional chaining solutions, ranked by synapse weight.

### Trading Signal Learning

```
Signal: "oversold_bullish_strong_up_normal"
  |
  |--(predicts, w=0.82)--> Outcome: "win"
  |
  |--(similar_to, w=0.65)--> Signal: "oversold_bullish_moderate_up_normal"
  |                             |
  |                             +--(predicts, w=0.71)--> Outcome: "win"
  |
  |--(in_regime, w=0.4)--> Regime: "bullish_trend"
```

### Marketing Content Patterns

```
Post: "Thread about CLI tools"
  |
  |--(format, w=0.9)--> Format: "thread"
  |
  |--(platform, w=0.85)--> Platform: "x"
  |
  |--(high_engagement, w=0.75)--> Pattern: "threads_on_x_outperform"
  |
  |--(campaign, w=0.6)--> Campaign: "Developer Tools"
```

## Adaptive Calibration

In Trading Brain, the Hebbian parameters are not static -- they auto-calibrate based on the amount of data collected:

| Parameter | Bootstrap (0-50) | Early (50-200) | Mature (200-500) | Advanced (500+) |
|-----------|----------------:|----------------:|-----------------:|----------------:|
| Learning Rate | 0.30 | 0.25 | 0.20 | 0.15 |
| Prune Threshold | 0.01 | 0.01 | 0.01 | 0.01 |
| Wilson Z | 1.64 | 1.96 | 2.33 | 2.58 |
| Decay Half-Life | 30 days | 21 days | 14 days | 10 days |

This means the system is aggressive about learning early (fast learning rate, conservative confidence) and becomes more precise as it accumulates evidence (slow learning rate, tight confidence intervals).
