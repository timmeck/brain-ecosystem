# Trading Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Adaptive Trading Intelligence & Signal Learning System for Claude Code — 131 MCP Tools, 60+ Engines**

Trading Brain is an MCP server that gives Claude Code a persistent trading memory. It learns from every trade outcome — strengthening connections between signals, strategies, and results through a Hebbian synapse network ("signals that win together wire together"). Paper trading with live market data (CoinGecko, Yahoo Finance, CCXT WebSocket). Over time, it develops statistical confidence in signal combinations, adapts calibration parameters, and runs 60+ autonomous engines in a 40-step feedback cycle to discover patterns, reason about causality, evolve strategies genetically, and improve itself. Multi-provider LLM (Anthropic + Ollama). 121 tests.

## Quick Start

```bash
npm install -g @timmeck/trading-brain
trading setup
```

That's it. One command configures MCP, hooks, and starts the daemon.

## Features

### Core Intelligence
- **Trade Outcome Memory** — Record and query trade outcomes with full signal context
- **Signal Fingerprinting** — RSI, MACD, Trend, Volatility classification into discrete categories
- **Wilson Score Confidence** — Statistical confidence intervals with adaptive z-scores
- **Hebbian Synapse Network** — Weighted graph: "signals that win together wire together"
- **Adaptive Calibration** — Learning rate, Wilson z, decay half-life auto-calibrate across 4 stages
- **DCA Multiplier** — Brain-recommended position sizes based on regime and performance
- **Grid Parameters** — Volatility-aware grid spacing with automatic tuning

### Paper Trading & Live Market Data
- **Paper Trading** — 10 active positions, live equity tracking, balance management
- **Live Market Data** — CoinGecko + Yahoo Finance + CCXT WebSocket real-time feeds
- **Equity Tracking** — Real-time portfolio valuation including position principal + unrealized PnL
- **Risk Management** — Kelly Criterion (half-Kelly + brain-adjusted), max 25% position size

### Backtesting
- **Backtesting Engine** — Run backtests, compare signals, find best signals with Sharpe/PF/MaxDD/Equity Curve
- **Multi-Timeframe** — Timeframe-aware trade analysis
- **Chain Detection** — Winning and losing streak identification per pair

### Alert System
- **5 Condition Types** — Price, signal, streak, drawdown, custom
- **Cooldown** — Prevents alert storms
- **Webhooks** — Push alerts to external systems
- **History** — Full alert delivery log

### LLM Service
- **Multi-Provider** — Anthropic Claude + Ollama local models with auto-routing
- **Smart Caching** — Content-hash cache, avoid duplicate API calls
- **Rate Limiting** — Per-hour and per-day token budgets with automatic throttling
- **Usage Tracking** — Calls, tokens, latency, cache hit rate, cost tracking

### 60+ Autonomous Engines

The ResearchOrchestrator runs a 40-step feedback cycle every 5 minutes:

- **Observation** — SelfObserver, AnomalyDetective, DataScout, SignalScanner, TechRadar
- **Understanding** — AttentionEngine, CausalGraph, CrossDomain, PatternEngine
- **Ideas** — HypothesisEngine, CuriosityEngine, DreamEngine, DebateEngine
- **Testing** — ExperimentEngine, AutoExperiment, SimulationEngine, PredictionEngine
- **Knowledge** — KnowledgeDistiller, MemoryPalace, ResearchJournal, ConceptAbstraction
- **Action** — SelfModification, GoalEngine, AdaptiveStrategy, MetaCognition, Evolution, Reasoning, EmotionalModel

DataMiner bootstraps all historical trades into engines at startup.

### Dream Mode & Consciousness
- **Dream Engine** — Offline consolidation: memory replay, synapse pruning, compression, importance decay
- **Prediction Engine** — Holt-Winters forecasting for win rates and PnL with auto-calibration
- **AutoResponder** — Automatically adjusts trading parameters when anomalies detected
- **ReasoningEngine** — Forward chaining, abductive reasoning, temporal inference
- **EmotionalModel** — 8 emotion dimensions, 6 moods, mood-based recommendations
- **EvolutionEngine** — Genetic algorithm for parameter optimization

### Notifications
- **Discord, Telegram, Email** — Multi-channel alert routing
- **Notification Bridge** — IPC-based cross-brain notification relay
- **Configurable** — All providers optional, graceful fallback

### Research Missions
- **5-Phase Pipeline** — Decompose → Gather → Hypothesize → Analyze → Synthesize
- **Web Research** — Brave Search + Jina Reader + Playwright + Firecrawl fallback chain
- **Autonomous** — Brain decides what to research and executes independently

### Dashboards

| Dashboard | Port | What It Shows |
|-----------|------|--------------|
| **Mission Control** | 7788 | 7-tab: Overview, Consciousness Entity, Thoughts, CodeGen, Self-Mod, Engines, Intelligence |
| **Command Center** | 7790 | 7-page: Ecosystem, Learning Pipeline, Trading Flow, Marketing Flow, Cross-Brain & Borg, Activity & Missions, Infrastructure |

### Memory & Sessions
- **Persistent Memory** — Preferences, decisions, context, facts, goals, lessons
- **Session Tracking** — Conversation goals, summaries, outcomes
- **Semantic Search** — Local all-MiniLM-L6-v2 embeddings (23MB, no cloud required)

### Universal Access
- **MCP Server** — Stdio transport for Claude Code
- **MCP HTTP/SSE** — For Cursor, Windsurf, Cline, Continue (port 7780)
- **REST API** — Full HTTP API on port 7779

## MCP Tools (128 tools)

**Trading Core**: trading_record_outcome, trading_signal_weights, trading_signal_confidence, trading_explain_signal, trading_dca_multiplier, trading_grid_params, trading_calibration, trading_calibration_history, trading_rules, trading_chains, trading_query, trading_learn, trading_reset

**Backtesting & Risk**: trading_run_backtest, trading_compare_signals, trading_find_best_signals, trading_risk_metrics, trading_kelly_sizing

**Alerts**: trading_alert_create, trading_alert_list, trading_alert_check, trading_alert_history

**Import**: trading_bulk_import

**Research Engines** (5 tools each): self_observer, anomaly_detective, cross_domain, adaptive_strategy, experiment, knowledge_distiller, research_agenda, counterfactual, journal

**Dream, Consciousness, Prediction, AutoResponder, Attention, Transfer, Narrative, Curiosity, Emergence, Debate, MetaCognition, Evolution, Reasoning, Emotions, Self-Modification, Memory, Ecosystem** — full tool suites for each

## CLI Commands

```
trading setup              One-command setup: MCP + daemon
trading start / stop       Daemon management (with watchdog)
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
| `TRADING_BRAIN_MCP_HTTP_PORT` | `7780` | MCP HTTP/SSE port |
| `ANTHROPIC_API_KEY` | — | Enables LLM features, CodeGen, Self-Mod |
| `BRAVE_SEARCH_API_KEY` | — | Enables web research missions |

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

| Brain | Purpose | Ports |
|-------|---------|-------|
| [Brain](../brain) | Error memory, code intelligence, full autonomy & self-modification | 7777 / 7778 / 7788 / 7790 |
| **Trading Brain** (this) | Adaptive trading intelligence with signal learning & paper trading | **7779** / 7780 |
| [Marketing Brain](../marketing-brain) | Content strategy, social engagement & cross-platform optimization | 7781 / 7782 / 7783 |
| [Brain Core](../brain-core) | Shared infrastructure — 60+ engines | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
