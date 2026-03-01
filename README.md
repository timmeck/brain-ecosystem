# Brain Ecosystem

[![CI](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml/badge.svg)](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**An autonomous AI research system that observes itself, learns, and improves — built as MCP servers for Claude Code.**

Brain Ecosystem is a system of three specialized "brains" connected through a Hebbian synapse network. Nine research engines run autonomously in the background — they observe, detect anomalies, form hypotheses, test them statistically, and distill confirmed knowledge into principles. It even has a Dream Mode that consolidates memories like biological sleep, and a CodeGenerator that writes code using its own accumulated knowledge.

## Packages

| Package | Version | Description | Ports |
|---------|---------|-------------|-------|
| [@timmeck/brain](packages/brain) | [![npm](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain) | Error memory, code intelligence, autonomous research & code generation | 7777 / 7778 / 7784 / 7787 |
| [@timmeck/trading-brain](packages/trading-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain) | Adaptive trading intelligence with signal learning & backtesting | 7779 / 7780 / 7785 |
| [@timmeck/marketing-brain](packages/marketing-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain) | Content strategy, engagement & cross-platform optimization | 7781 / 7782 / 7783 / 7786 |
| [@timmeck/brain-core](packages/brain-core) | [![npm](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core) | Shared infrastructure — 9 research engines, synapses, IPC, MCP, dream, consciousness, prediction, codegen | — |

## Quick Start

```bash
npm install -g @timmeck/brain
brain setup
```

That's it. One command configures MCP, hooks, and starts the daemon. Brain is now learning from every error you encounter.

### Optional: Add more brains

```bash
npm install -g @timmeck/trading-brain
trading setup

npm install -g @timmeck/marketing-brain
marketing setup
```

### Setup with Cursor / Windsurf / Cline / Continue

All brains support MCP over HTTP with SSE transport:

```json
{
  "brain": { "url": "http://localhost:7778/sse" },
  "trading-brain": { "url": "http://localhost:7780/sse" },
  "marketing-brain": { "url": "http://localhost:7782/sse" }
}
```

## What It Does

### Brain — Error Memory, Code Intelligence & Autonomous Research

69 MCP tools. Remembers errors, learns solutions, tracks code modules, and runs autonomous research.

- **Error Memory** — Track errors, match against known solutions with hybrid search (TF-IDF + vector + synapse boost)
- **Code Intelligence** — Register and discover reusable code modules across all projects
- **Persistent Memory** — Remember preferences, decisions, context, facts, goals, and lessons across sessions
- **Autonomous Research** — 9 research engines with feedback loops running every 5 minutes
- **Dream Mode** — Offline memory consolidation: replay, prune, compress, decay during idle
- **Consciousness Dashboard** — Live neural graph at http://localhost:7784 with thought stream
- **Prediction Engine** — Holt-Winters forecasting, auto-calibration, predictions resolved against reality
- **AutoResponder** — Reacts to anomalies: parameter adjustment, escalation, resolution
- **Self-Improvement Loop** — Generates "Tell Claude:" suggestions in `~/.brain/improvement-requests.md`
- **Auto-Experiments** — Tests its own parameters (Z-Threshold, Decay Rate, etc.) every 5 cycles
- **Hypothesis Engine** — Forms and tests hypotheses autonomously from observed patterns
- **Knowledge Distillation** — Extracts principles from confirmed hypotheses (17+ principles distilled)
- **CodeGenerator** — Claude API integration using brain knowledge as context (principles, anti-patterns, strategies)
- **CodeMiner** — Mines GitHub repos (README, package.json, directory structures) for pattern extraction
- **CodeGen Dashboard** — Review generated code at http://localhost:7787 with approve/reject workflow
- **Signal Scanner** — Tracks GitHub trending repos, Hacker News, crypto signals
- **Semantic Search** — Local all-MiniLM-L6-v2 embeddings (23MB, no cloud required)
- **Cross-Project Learning** — Solutions from project A help solve errors in project B
- **Auto Error Detection** — PostToolUse hook catches errors in real-time
- **197 MCP Tools** across the ecosystem (69 brain + 64 trading + 64 marketing)

### Trading Brain — Adaptive Trading Intelligence

64 MCP tools. Learns from every trade outcome through Hebbian synapses.

- **Trade Outcome Memory** — Record and query trades with full signal context
- **Signal Fingerprinting** — RSI, MACD, Trend, Volatility classification
- **Backtesting Engine** — Run backtests, compare signals, Sharpe/PF/MaxDD/Equity Curve
- **Risk Management** — Kelly Criterion position sizing, drawdown tracking
- **Alert System** — 5 condition types, cooldown, webhooks, history
- **Multi-Timeframe** — Timeframe-aware trade analysis
- **Autonomous Research** — 9 research engines with DataMiner bootstrapping trade history
- **Dream Mode** — Offline consolidation during idle periods
- **Consciousness Dashboard** — Live neural graph at http://localhost:7785
- **Prediction Engine** — Holt-Winters forecasting for win rates and PnL

### Marketing Brain — Self-Learning Marketing Intelligence

64 MCP tools. Learns what content works across platforms.

- **Post Tracking** — Store posts with platform, format, hashtags, engagement history
- **Competitor Analysis** — Track and benchmark competitor engagement
- **Content Generation** — Draft posts from learned patterns, rules, and templates
- **Scheduling Engine** — Post queue with optimal auto-timing
- **Cross-Platform** — Optimize for X, LinkedIn, Reddit, Bluesky, Mastodon, Threads
- **Autonomous Research** — 9 research engines with DataMiner bootstrapping post history
- **Dream Mode** — Offline consolidation during idle periods
- **Consciousness Dashboard** — Live neural graph at http://localhost:7786
- **Prediction Engine** — Holt-Winters forecasting for engagement rates

## Architecture

```
+------------------+     +------------------+     +------------------+
|   Claude Code    |     |  Cursor/Windsurf |     |  Browser/CI/CD   |
|   (MCP stdio)    |     |  (MCP HTTP/SSE)  |     |  (REST API)      |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         +----------+-------------+------------------------+
                    |
         +----------+-----------+
         |     Brain Core       |
         |  IPC . MCP . REST    |
         +----------+-----------+
                    |
    +---------------+---------------+
    |               |               |
    v               v               v
+---+----+    +-----+------+   +---+----------+
|  Brain |    |  Trading   |   |  Marketing   |
| :7777  |<-->|  Brain     |<->|  Brain       |
| :7778  |    |  :7779     |   |  :7781       |
| :7784  |    |  :7780     |   |  :7782       |
| :7787  |    |  :7785     |   |  :7783       |
+---+----+    +-----+------+   |  :7786       |
    |               |          +---+----------+
    |               |               |
    v               v               v
+--------+    +------------+   +--------------+
| SQLite |    |   SQLite   |   |   SQLite     |
+--------+    +------------+   +--------------+

Cross-brain peering via IPC named pipes
```

### Autonomous Research Layer

Every brain runs the same 9 research engines in feedback loops:

```
                        ResearchOrchestrator
                               |
        +------+------+-------+-------+------+------+
        |      |      |       |       |      |      |
        v      v      v       v       v      v      v
    Self    Anomaly  Cross  Adaptive Exper. Knowl. Research
   Observer Detect.  Domain Strategy Engine Distill Agenda
        |      |      |       |       |      |      |
        +------+------+-------+-------+------+------+
                               |
                    +----------+----------+
                    |          |          |
                    v          v          v
                 Dream     Prediction  AutoResponder
                 Engine    Engine      (anomaly → action)
                    |          |          |
                    v          v          v
                 Hypothesis  CodeGen    CodeMiner
                 Engine      (Claude)   (GitHub)
```

### Shared Infrastructure (Brain Core)

| Component | Description |
|-----------|-------------|
| **IPC Protocol** | Length-prefixed JSON frames over named pipes / Unix sockets |
| **MCP Server** | Stdio transport for Claude Code with auto-daemon-start |
| **MCP HTTP Server** | SSE transport for Cursor, Windsurf, Cline, Continue |
| **REST API** | HTTP server with CORS, auth, SSE events, batch RPC |
| **Hebbian Synapse Network** | Weighted graph — "neurons that fire together wire together" |
| **9 Research Engines** | SelfObserver, AnomalyDetective, HypothesisEngine, CausalGraph, ExperimentEngine, KnowledgeDistiller, CounterfactualEngine, AdaptiveStrategy, ResearchAgenda |
| **ResearchOrchestrator** | Feedback loops between all engines, runs every 5 minutes |
| **DataMiner** | Bootstraps historical DB data into research engines, incremental mining |
| **Dream Engine** | Offline consolidation — memory replay, synapse pruning, compression, decay |
| **ThoughtStream + Consciousness** | Real-time thought capture + live neural dashboard with SSE |
| **Prediction Engine** | Holt-Winters + EWMA forecasting with auto-calibration |
| **AutoResponder** | Anomaly → automatic parameter adjustment, escalation, resolution |
| **CodeGenerator** | Claude API with brain knowledge as context (principles, patterns) |
| **CodeMiner + PatternExtractor** | GitHub repo mining → dependency, tech stack, structure patterns |
| **CodegenServer** | HTTP + SSE dashboard for code review (approve/reject) |
| **Signal Scanner** | GitHub trending, Hacker News, crypto signal tracking |
| **Webhook Service** | HMAC-SHA256 signed webhooks with retry |
| **Export / Backup** | JSON/CSV export, timestamped SQLite backups with integrity check |
| **Memory System** | Persistent memory with categories, importance, FTS5 search |
| **Cross-Brain** | Peer discovery, event notifications, cross-brain correlation |

## Port Map

| Service | Port | Protocol |
|---------|------|----------|
| Brain REST API | 7777 | HTTP |
| Brain MCP | 7778 | SSE |
| Trading Brain REST | 7779 | HTTP |
| Trading Brain MCP | 7780 | SSE |
| Marketing Brain REST | 7781 | HTTP |
| Marketing Brain MCP | 7782 | SSE |
| Marketing Dashboard | 7783 | SSE |
| Brain Consciousness | 7784 | HTTP + SSE |
| Trading Consciousness | 7785 | HTTP + SSE |
| Marketing Consciousness | 7786 | HTTP + SSE |
| Brain CodeGen Dashboard | 7787 | HTTP + SSE |

## CLI Commands

Each brain provides a full CLI:

```bash
# Brain
brain setup / start / stop / status / doctor
brain query <text> / modules / insights / network / dashboard
brain learn / explain <id> / export / import <dir> / peers

# Trading Brain
trading setup / start / stop / status / doctor
trading query <text> / insights / rules / network / dashboard
trading export / import <file> / peers

# Marketing Brain
marketing setup / start / stop / status / doctor
marketing post <platform> / campaign create <name> / campaign stats <id>
marketing insights / rules / suggest <topic> / query <search>
marketing dashboard / network / export / peers
```

## Environment Variables

| Brain | Data Dir | Config |
|-------|----------|--------|
| Brain | `BRAIN_DATA_DIR` (default: `~/.brain`) | `~/.brain/config.json` |
| Trading Brain | `TRADING_BRAIN_DATA_DIR` (default: `~/.trading-brain`) | `~/.trading-brain/config.json` |
| Marketing Brain | `MARKETING_BRAIN_DATA_DIR` (default: `~/.marketing-brain`) | `~/.marketing-brain/config.json` |

Additional keys: `ANTHROPIC_API_KEY` (enables CodeGenerator), `GITHUB_TOKEN` (enables CodeMiner + Signal Scanner).

## Docker

```bash
docker-compose up -d          # Start all three brains
docker-compose up brain       # Just the main brain
docker-compose logs trading-brain
docker-compose down
```

## Development

```bash
git clone https://github.com/timmeck/brain-ecosystem.git
cd brain-ecosystem
npm install          # installs all workspace dependencies
npm run build        # builds all packages (brain-core first)
npm test             # runs all 2075 tests
```

### Package Dependencies

```
brain-core          (no internal deps)
   ^
   |
   +-- brain        (depends on brain-core)
   +-- trading-brain (depends on brain-core)
   +-- marketing-brain (depends on brain-core)
```

## Tech Stack

- **TypeScript** — Full type safety, ES2022 target, ESM modules
- **better-sqlite3** — Fast, embedded, synchronous database with WAL mode
- **MCP SDK** — Model Context Protocol (stdio + HTTP/SSE transports)
- **@huggingface/transformers** — Local ONNX sentence embeddings (23MB, no cloud)
- **Claude API** — Code generation with brain knowledge context
- **Commander** — CLI framework
- **Winston** — Structured logging with file rotation
- **Vitest** — 2075 tests across the ecosystem

## Support

If Brain helps you, consider giving it a star.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/tmeck86)

## License

[MIT](LICENSE)
