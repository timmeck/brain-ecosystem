# Trading Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Adaptive Trading Intelligence & Signal Learning System for Claude Code**

Trading Brain is an MCP server that gives Claude Code a persistent trading memory. It learns from every trade outcome — strengthening connections between signals, strategies, and results through a Hebbian synapse network. Over time, it develops statistical confidence in signal combinations, adapts calibration parameters, and runs 9 autonomous research engines to discover patterns in your trading data.

## Quick Start

```bash
npm install -g @timmeck/trading-brain
trading setup
```

## Features

### Core Intelligence
- **Trade Outcome Memory** — Record and query trade outcomes with full signal context
- **Signal Fingerprinting** — RSI, MACD, Trend, Volatility classification into discrete categories
- **Wilson Score Confidence** — Statistical confidence intervals with adaptive z-scores
- **Hebbian Synapse Network** — Weighted graph: "signals that win together wire together"
- **Adaptive Calibration** — Learning rate, Wilson z, decay half-life auto-calibrate across 4 stages
- **DCA Multiplier** — Brain-recommended position sizes based on regime and performance
- **Grid Parameters** — Volatility-aware grid spacing with automatic tuning

### Backtesting & Risk
- **Backtesting Engine** — Run backtests, compare signals, find best signals with Sharpe/PF/MaxDD/Equity Curve
- **Risk Management** — Kelly Criterion (half-Kelly + brain-adjusted), max 25% position size
- **Multi-Timeframe** — Timeframe-aware trade analysis
- **Chain Detection** — Winning and losing streak identification per pair

### Alert System
- **5 Condition Types** — Price, signal, streak, drawdown, custom
- **Cooldown** — Prevents alert storms
- **Webhooks** — Push alerts to external systems
- **History** — Full alert delivery log

### Autonomous Research (9 Engines)
Same engine architecture as Brain, fed with trade history via DataMiner:
- SelfObserver, AnomalyDetective, CrossDomain, AdaptiveStrategy, ExperimentEngine, KnowledgeDistiller, ResearchAgenda, CounterfactualEngine, Journal
- **Feedback loops** running every 5 minutes
- **DataMiner** bootstraps all historical trades into engines at startup

### Dream Mode & Consciousness
- **Dream Engine** — Offline consolidation: memory replay, synapse pruning, compression, importance decay
- **Consciousness Dashboard** — Live neural graph at http://localhost:7785 with thought stream and engine status
- **Prediction Engine** — Holt-Winters forecasting for win rates and PnL with auto-calibration
- **AutoResponder** — Automatically adjusts trading parameters when anomalies detected
- **Self-Improvement Loop** — Generates improvement suggestions

### Memory & Sessions
- **Persistent Memory** — Preferences, decisions, context, facts, goals, lessons
- **Session Tracking** — Conversation goals, summaries, outcomes
- **Key-Based Upsert** — Update memories by key, auto-supersede old values

### Universal Access
- **MCP Server** — Stdio transport for Claude Code
- **MCP HTTP/SSE** — For Cursor, Windsurf, Cline, Continue (port 7780)
- **REST API** — Full HTTP API on port 7779

## MCP Tools (64 tools)

**Trading Core**: trading_record_outcome, trading_signal_weights, trading_signal_confidence, trading_explain_signal, trading_dca_multiplier, trading_grid_params, trading_calibration, trading_calibration_history, trading_rules, trading_chains, trading_query, trading_learn, trading_reset

**Backtesting & Risk**: trading_run_backtest, trading_compare_signals, trading_find_best_signals, trading_risk_metrics, trading_kelly_sizing

**Alerts**: trading_alert_create, trading_alert_list, trading_alert_check, trading_alert_history

**Import**: trading_bulk_import

**Research Engines** (5 tools each): self_observer, anomaly_detective, cross_domain, adaptive_strategy, experiment, knowledge_distiller, research_agenda, counterfactual, journal

**Dream**: trading_dream_status, trading_dream_consolidate, trading_dream_history

**Consciousness**: trading_consciousness_status, trading_consciousness_thoughts

**Prediction**: trading_predict, trading_prediction_accuracy, trading_predictions_list

**AutoResponder**: trading_responder_status, trading_responder_history, trading_responder_rules

**Memory**: trading_remember, trading_recall, trading_session_start, trading_session_end, trading_session_history

**Ecosystem**: trading_status, trading_explore, trading_connections, trading_insights, trading_ecosystem_status, trading_query_peer, trading_error_context

## CLI Commands

```
trading setup              One-command setup: MCP + daemon
trading start / stop       Daemon management
trading status             Stats: trades, rules, chains, insights, synapses
trading doctor             Health check
trading query <text>       Search trades
trading insights           Research insights
trading rules              Learned rules with confidence
trading network            Synapse network
trading dashboard          Interactive HTML dashboard
trading peers              Peer brain status
trading config             Configuration management
trading export             Export all data
trading import <file>      Import trades from JSON
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `TRADING_BRAIN_DATA_DIR` | `~/.trading-brain` | Data directory |
| `TRADING_BRAIN_LOG_LEVEL` | `info` | Log level |
| `TRADING_BRAIN_API_PORT` | `7779` | REST API port |
| `TRADING_BRAIN_API_KEY` | — | API authentication key |
| `TRADING_BRAIN_MCP_HTTP_PORT` | `7780` | MCP HTTP/SSE port |

## How It Learns

1. **Trade Recorded** — Bot reports result via `trading_record_outcome`
2. **Signal Fingerprinted** — RSI/MACD/Trend/Volatility classified
3. **Synapses Form** — Hebbian connections: signal → combo → outcome → pair
4. **Chains Checked** — 3+ consecutive same-result → chain recorded
5. **Confidence Computed** — Wilson Score lower bound on true win rate
6. **Patterns Extracted** — Similar fingerprints grouped, rules generated
7. **Calibration Adapts** — Every 25 trades, parameters recalibrate
8. **Research Runs** — Trends, gaps, synergies, regime shifts detected
9. **Predictions Form** — Holt-Winters forecasts win rates
10. **Auto-Response** — Anomalies trigger parameter adjustments

## Brain Ecosystem

| Brain | Version | Purpose | Ports |
|-------|---------|---------|-------|
| [Brain](../brain) | v3.19.0 | Error memory, code intelligence, autonomous research & code generation | 7777 / 7778 / 7784 / 7787 |
| **Trading Brain** | v2.13.0 | Adaptive trading intelligence with signal learning & backtesting | **7779** / 7780 / 7785 |
| [Marketing Brain](../marketing-brain) | v1.14.0 | Content strategy, engagement & cross-platform optimization | 7781 / 7782 / 7783 / 7786 |
| [Brain Core](../brain-core) | v2.18.0 | Shared infrastructure | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
