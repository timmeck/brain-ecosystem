# Trading Brain -- Adaptive Trading Intelligence

Trading Brain is a self-learning MCP server for tracking trade outcomes, learning signal patterns, and optimizing trading strategies. It provides 22 MCP tools for signal analysis, confidence scoring, and strategy recommendations.

## Key Features

### Trade Outcome Memory

Every trade outcome is recorded with its full signal context -- RSI, MACD, trend score, volatility, market regime, bot type, pair, and profit percentage. This builds a rich dataset that the learning engine mines for patterns.

```bash
# Example: Recording a trade outcome via MCP
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
```

### Signal Fingerprinting

Trading Brain classifies each set of signals into a discrete fingerprint. For example, an RSI of 35 is classified as "oversold", MACD of -0.5 as "bearish", trend of 0.7 as "strong_up", and volatility of 0.04 as "normal". These classifications create a composite fingerprint like `oversold_bearish_strong_up_normal` that can be tracked across many trades.

### Wilson Score Confidence

Rather than using simple win rate percentages, Trading Brain uses Wilson Score confidence intervals. This gives statistically sound lower-bound confidence that accounts for sample size:

- 3 wins out of 3 trades = 43.8% confidence (small sample)
- 30 wins out of 30 trades = 90.6% confidence (large sample)

The Wilson z-score adapts across four calibration stages as more data is collected, starting conservative and becoming more precise.

### DCA Multiplier

When running Dollar Cost Averaging strategies, Trading Brain recommends position size multipliers based on:

- Historical win rate for the current market regime
- Current RSI level (oversold conditions suggest larger positions)
- Current volatility (higher volatility suggests smaller positions)
- Synapse weight of the signal pattern

### Grid Parameters

For grid trading strategies, Trading Brain calculates optimal grid spacing based on historical volatility data and learned regime behavior. It adjusts grid density and range based on what has worked in similar market conditions.

### Chain Detection

Trading Brain detects winning and losing streaks per trading pair. This helps identify when a strategy is working well (let it run) or struggling (reduce exposure). Chains are detected automatically as trade outcomes are recorded.

### Adaptive Calibration

The learning system auto-calibrates across four stages as data accumulates:

| Stage | Trade Count | Behavior |
|-------|------------|----------|
| **Bootstrap** | 0-50 | Conservative defaults, fast learning rate |
| **Early** | 50-200 | Slightly relaxed thresholds |
| **Mature** | 200-500 | Standard parameters |
| **Advanced** | 500+ | Tight confidence intervals, slow learning rate |

Calibration parameters include learning rate, Wilson z-score, decay half-life, pattern extraction interval, and spreading activation thresholds.

### Signal Explainability

Ask Trading Brain to explain any signal fingerprint in detail. It returns:

- Wilson Score breakdown (successes, total, lower bound, z-score)
- Sample size
- Historical accuracy (wins, losses, win rate)
- Synapse data (weight, activations, total profit)
- Similar signals with their performance
- Related learned patterns with confidence

## CLI Commands

```bash
# Lifecycle
trading setup          # Configure MCP, hooks, start daemon
trading start          # Start the daemon
trading stop           # Stop the daemon
trading status         # Show daemon status and stats
trading doctor         # Diagnose issues

# Analysis
trading query <text>   # Search trades and signals
trading insights       # Show active research insights
trading rules          # Show learned trading rules
trading network        # Show synapse network stats
trading dashboard      # Open the web dashboard

# Data
trading export         # Export database to JSON
trading import <file>  # Import from a JSON export
trading peers          # Show connected peer brains
```

## MCP Tools

Trading Brain exposes 22 MCP tools. See the [Trading MCP Tools Reference](/api/trading) for full parameter details.

### Core Trading Tools
- `trading_record_outcome` -- Record a trade with full signal context
- `trading_signal_weights` -- Get brain-weighted signal strengths
- `trading_signal_confidence` -- Get Wilson Score confidence for a signal
- `trading_dca_multiplier` -- Get recommended DCA position size
- `trading_grid_params` -- Get recommended grid spacing

### Analysis Tools
- `trading_explore` -- Spreading activation through the synapse network
- `trading_connections` -- Find path between two nodes
- `trading_rules` -- List learned trading rules
- `trading_insights` -- Get research insights
- `trading_chains` -- Detect winning/losing streaks
- `trading_query` -- Search trades and signals
- `trading_status` -- Get overall statistics

### Explainability Tools
- `trading_explain_signal` -- Deep dive into a signal's confidence
- `trading_calibration` -- Current calibration parameters
- `trading_calibration_history` -- How parameters changed over time

### Learning Tools
- `trading_learn` -- Trigger a manual learning cycle
- `trading_reset` -- Reset all data (requires confirmation)

### Memory & Session Tools
- `trading_remember` -- Store a memory
- `trading_recall` -- Search memories
- `trading_session_start` -- Start a session
- `trading_session_end` -- End a session
- `trading_session_history` -- List past sessions

### Ecosystem Tools
- `trading_ecosystem_status` -- Status of all brains
- `trading_query_peer` -- Query another brain
- `trading_error_context` -- Correlate trades with Brain errors

## Ports

| Service | Port | Protocol |
|---------|------|----------|
| REST API | 7779 | HTTP |
| MCP HTTP | 7780 | SSE |

## Data Location

By default, Trading Brain stores its data in `~/.trading-brain/`. Override with the `TRADING_BRAIN_DATA_DIR` environment variable.
