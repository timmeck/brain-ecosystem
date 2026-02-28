# Trading Brain MCP Tools Reference

Trading Brain exposes 22 MCP tools through both stdio (Claude Code) and HTTP/SSE (Cursor, Windsurf, etc.) transports. All tools are prefixed with `trading_`.

## Core Trading Tools

### `trading_record_outcome`

Record a trade outcome. This is the main entry point for the learning loop -- it updates synapses, the graph, chain detection, and triggers pattern extraction.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pair` | string | Yes | Trading pair (e.g., `BTC/USDT`) |
| `bot_type` | string | Yes | Bot type (e.g., `DCA`, `Grid`, `SmartTrader`) |
| `profit_pct` | number | Yes | Profit percentage of the trade |
| `win` | boolean | Yes | Whether the trade was profitable |
| `rsi14` | number | No | RSI-14 value at entry |
| `macd` | number | No | MACD value at entry |
| `trend_score` | number | No | Trend score at entry |
| `volatility` | number | No | Volatility at entry |
| `regime` | string | No | Market regime (e.g., `bullish_trend`, `ranging`, `bearish_trend`) |

**Returns**: Trade ID, signal fingerprint, and synapse weight.

**Example**:
```
trading_record_outcome(
  pair: "BTC/USDT",
  bot_type: "DCA",
  profit_pct: 2.3,
  win: true,
  rsi14: 35,
  macd: -0.5,
  trend_score: 0.7,
  volatility: 0.04,
  regime: "bullish_trend"
)
→ Trade #147 recorded (WIN, 2.30%). Fingerprint: oversold_bearish_strong_up_normal. Synapse weight: 0.510
```

---

### `trading_signal_weights`

Get brain-weighted signal strengths based on learned experience. Returns adjusted weights for each signal type.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rsi14` | number | No | RSI-14 value |
| `macd` | number | No | MACD value |
| `trend_score` | number | No | Trend score |
| `volatility` | number | No | Volatility |
| `regime` | string | No | Market regime |

**Returns**: Weighted signal strengths based on historical success rates.

---

### `trading_signal_confidence`

Get Wilson Score confidence for a signal pattern. Returns 0-1 confidence based on historical win rate, accounting for sample size.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rsi14` | number | No | RSI-14 value |
| `macd` | number | No | MACD value |
| `trend_score` | number | No | Trend score |
| `volatility` | number | No | Volatility |
| `regime` | string | No | Market regime |

**Returns**: Confidence percentage (e.g., `"Confidence: 73.2%"`).

---

### `trading_dca_multiplier`

Get brain-recommended DCA position size multiplier based on regime success history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `regime` | string | Yes | Market regime |
| `rsi` | number | Yes | Current RSI value |
| `volatility` | number | Yes | Current volatility |

**Returns**: Recommended position size multiplier with reasoning.

---

### `trading_grid_params`

Get brain-recommended grid spacing parameters based on volatility history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `regime` | string | Yes | Market regime |
| `volatility` | number | Yes | Current volatility |
| `pair` | string | Yes | Trading pair |

**Returns**: Recommended grid spacing, range, and density parameters.

## Analysis Tools

### `trading_explore`

Explore the brain network using spreading activation. Find related nodes from a starting concept.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Node ID, label, or partial match to start exploration from |

**Returns**: Related nodes with activation scores, sorted by relevance.

---

### `trading_connections`

Find the shortest path between two nodes in the brain network.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | string | Yes | Source node ID |
| `to` | string | Yes | Target node ID |

**Returns**: Path with node sequence and total weight.

---

### `trading_rules`

Get all learned trading rules with confidence scores and win rates.

*No parameters.*

**Returns**: List of rules with pattern, action, confidence, occurrences, and win rate.

---

### `trading_insights`

Get research insights (trends, gaps, synergies, performance, regime shifts).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by: `trend`, `gap`, `synergy`, `performance`, `regime_shift` |
| `limit` | number | No | Max results (default 20) |

**Returns**: List of insights with type, title, and description.

---

### `trading_chains`

Get detected trade chains (winning/losing streaks).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pair` | string | No | Filter by trading pair |
| `limit` | number | No | Max results (default 20) |

**Returns**: List of detected chains with pair, streak length, type, and profitability.

---

### `trading_query`

Search trades and signals by fingerprint, pair, or bot type.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | Yes | Search query |
| `limit` | number | No | Max results (default 50) |

**Returns**: Matching trades with full signal context and outcome.

---

### `trading_status`

Get brain stats: trades, synapses, graph size, rules, insights, calibration.

*No parameters.*

**Returns**: Comprehensive summary of all Trading Brain statistics.

## Explainability Tools

### `trading_explain_signal`

Explain the confidence assessment for a specific trading signal. Provides a complete breakdown of how Brain evaluates the signal.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fingerprint` | string | Yes | The signal fingerprint to explain |

**Returns**: Detailed breakdown including:
- Wilson Score (successes, total, lower bound, z-score)
- Sample size
- Historical accuracy (wins, losses, win rate)
- Synapse data (weight, activations, total profit)
- Similar signals with their performance
- Related learned patterns with confidence

---

### `trading_calibration`

Get current adaptive calibration parameters (learning rate, Wilson Z, decay half-life, etc.).

*No parameters.*

**Returns**: Current calibration parameter values.

---

### `trading_calibration_history`

Show current calibration parameters and how they have changed over time.

*No parameters.*

**Returns**: Current calibration values and historical snapshots showing parameter evolution.

## Learning Tools

### `trading_learn`

Manually trigger a learning cycle (pattern extraction, calibration, decay).

*No parameters.*

**Returns**: Results of the learning cycle (patterns extracted, rules created, synapses decayed/pruned).

---

### `trading_reset`

Reset all trading brain data (trades, synapses, graph, rules, insights, chains, calibration).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `confirm` | boolean | Yes | Must be `true` to confirm the reset |

**Returns**: Confirmation of reset or cancellation message.

## Memory & Session Tools

### `trading_remember`

Store a memory -- preferences, decisions, context, facts, goals, or lessons learned from trading.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The memory content to store |
| `category` | enum | Yes | `preference`, `decision`, `context`, `fact`, `goal`, `lesson` |
| `key` | string | No | Unique key for upsert (updates existing memory with same key) |
| `importance` | number | No | Importance 1-10 (default 5) |
| `tags` | string[] | No | Tags for organization |

**Returns**: Memory ID and superseded memory ID if applicable.

---

### `trading_recall`

Search trading memories by natural language query.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `category` | enum | No | Filter by category |
| `limit` | number | No | Max results (default 10) |

**Returns**: Matching memories sorted by relevance.

---

### `trading_session_start`

Start a new trading session. Track goals and context for the conversation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `goals` | string[] | No | Session goals |

**Returns**: Session ID.

---

### `trading_session_end`

End a trading session with a summary of what was accomplished.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | number | Yes | Session ID to end |
| `summary` | string | Yes | Summary of what was accomplished |
| `outcome` | enum | No | `completed`, `paused`, `abandoned` (default: `completed`) |

---

### `trading_session_history`

List past trading sessions with summaries and outcomes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Max results (default 10) |

**Returns**: List of sessions with ID, outcome, summary, and timestamps.

## Ecosystem Tools

### `trading_ecosystem_status`

Get status of all brains in the ecosystem (brain, trading-brain, marketing-brain).

*No parameters.*

**Returns**: Version, PID, uptime, and method count for each running brain.

---

### `trading_query_peer`

Query another brain in the ecosystem. Call any method on brain or marketing-brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `peer` | string | Yes | Peer brain name: `brain` or `marketing-brain` |
| `method` | string | Yes | IPC method to call (e.g., `analytics.summary`, `error.query`) |
| `args` | object | No | Method arguments as key-value pairs |

**Returns**: Raw result from the peer brain.

---

### `trading_error_context`

Ask Brain for errors that might correlate with trade failures. Useful for understanding infrastructure-related trade losses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pair` | string | Yes | Trading pair (e.g., `BTC/USDT`) |
| `search` | string | No | Error search query (e.g., `"timeout"`, `"API error"`) |

**Returns**: Matching errors from Brain with ID, type, message, and resolution status.
