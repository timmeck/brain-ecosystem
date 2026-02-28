# Brain Ecosystem

[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Self-learning MCP servers that give Claude Code persistent memory.**

Brain gives Claude Code a persistent, self-learning memory — it remembers your errors, learns from your patterns, and gets smarter with every session. Works with Claude Code, Cursor, Windsurf, Cline, and Continue.

## What Brain Does

### Before Brain: Every session starts from zero

```
You: Fix this TypeError
Claude: *investigates from scratch, tries 3 approaches, 15 minutes later finds the fix*

Next day, same error in another project:
Claude: *investigates from scratch again*
```

### After Brain: Errors get solved faster every time

```
You: Fix this TypeError
Claude: *Brain found 3 similar errors. Solution with 94% confidence:
         "Add null check before accessing .length — this pattern occurs
          in array-processing modules across 4 of your projects."*
Fixed in 30 seconds.
```

## Packages

| Package | Version | Description | Ports |
|---------|---------|-------------|-------|
| [@timmeck/brain](packages/brain) | [![npm](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain) | Error memory, code intelligence & persistent context | 7777 / 7778 |
| [@timmeck/trading-brain](packages/trading-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain) | Adaptive trading intelligence with memory & sessions | 7779 / 7780 |
| [@timmeck/marketing-brain](packages/marketing-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain) | Content strategy & engagement with memory & sessions | 7781 / 7782 / 7783 |
| [@timmeck/brain-core](packages/brain-core) | [![npm](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core) | Shared infrastructure (IPC, MCP, REST, CLI, math, synapses, memory) | — |

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

Each brain runs as a background daemon and registers itself as an MCP server.

### Setup with Cursor / Windsurf / Cline / Continue

All brains support MCP over HTTP with SSE transport:

```json
{
  "brain": { "url": "http://localhost:7778/sse" },
  "trading-brain": { "url": "http://localhost:7780/sse" },
  "marketing-brain": { "url": "http://localhost:7782/sse" }
}
```

## Brain — Error Memory & Code Intelligence

The flagship. 28 MCP tools for error tracking, code reuse, and persistent context.

- **Error Memory** — Track errors, match against known solutions with hybrid search (TF-IDF + vector + synapse boost)
- **Code Intelligence** — Register and discover reusable code modules across all projects
- **Persistent Memory** — Remember preferences, decisions, context, facts, goals, and lessons across sessions
- **Session Tracking** — Auto-tracks conversation sessions with goals, summaries, and outcomes
- **Decision History** — Record architecture/design decisions with alternatives and rationale
- **Semantic Changelog** — Track what changed, why, and how it connects to errors and decisions
- **Task/Goal Tracking** — Manage tasks with priorities, subtasks, and full context aggregation
- **Auto Error Detection** — PostToolUse hook catches errors in real-time, no manual reporting needed
- **Cross-Project Learning** — Solutions from project A help solve errors in project B
- **Proactive Prevention** — Warns before errors occur when code matches known antipatterns
- **Semantic Search** — Local all-MiniLM-L6-v2 embeddings (23MB, no cloud required)
- **REST API** — Full HTTP API on port 7777 with 60+ methods

## Trading Brain — Adaptive Trading Intelligence

22 MCP tools for trade outcome tracking, signal learning, and strategy optimization.

- **Trade Outcome Memory** — Record and query trade outcomes with full signal context
- **Signal Fingerprinting** — RSI, MACD, Trend, and Volatility classification into discrete categories
- **Wilson Score Confidence** — Statistical confidence intervals with adaptive z-scores
- **DCA Multiplier** — Brain-recommended position sizes based on regime and historical performance
- **Grid Parameters** — Volatility-aware grid spacing with automatic tuning
- **Chain Detection** — Identifies winning and losing streaks per pair
- **Adaptive Calibration** — Learning rate, Wilson z-score, and decay half-life auto-calibrate across 4 stages
- **Memory & Sessions** — Persistent memory for trading preferences, decisions, and session goals

## Marketing Brain — Self-Learning Marketing Intelligence

22 MCP tools for content strategy, engagement tracking, and campaign management.

- **Post Tracking** — Store posts with platform, format, hashtags, URL, and full engagement history
- **Campaign Management** — Group posts into campaigns, track aggregate performance
- **Draft Checking** — Check posts against learned rules before publishing
- **Template Library** — High-performing post structures become reusable templates
- **Timing Patterns** — Discovers best/worst posting hours from engagement data
- **Gap Analysis** — Spots blind spots: "You never post on LinkedIn — potential?"
- **Interactive Dashboard** — Neural canvas background, force-directed synapse graph, live SSE updates
- **Memory & Sessions** — Persistent memory for marketing decisions, strategies, and session goals

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
         |  IPC · MCP · REST    |
         +----------+-----------+
                    |
    +---------------+---------------+
    |               |               |
    v               v               v
+---+----+    +-----+------+   +---+----------+
|  Brain |    |  Trading   |   |  Marketing   |
| :7777  |<-->|  Brain     |<->|  Brain       |
| :7778  |    |  :7779     |   |  :7781       |
+---+----+    |  :7780     |   |  :7782       |
    |         +-----+------+   |  :7783       |
    |               |          +---+----------+
    v               v               v
+---+----+    +-----+------+   +---+----------+
| SQLite |    |   SQLite   |   |   SQLite     |
+--------+    +------------+   +--------------+

Cross-brain peering via IPC named pipes
```

### Shared Architecture (Brain Core)

Every brain is built on the same infrastructure:

| Component | Description |
|-----------|-------------|
| **IPC Protocol** | Length-prefixed JSON frames over named pipes (Windows) / Unix sockets |
| **MCP Server** | Stdio transport for Claude Code with auto-daemon-start |
| **MCP HTTP Server** | SSE transport for Cursor, Windsurf, Cline, Continue |
| **REST API** | HTTP server with CORS, auth, SSE events, batch RPC |
| **Hebbian Synapse Network** | Weighted graph — "neurons that fire together wire together" |
| **Learning Engine** | Extracts patterns, generates rules with adaptive thresholds |
| **Research Engine** | Automated trend analysis, gap detection, synergy mapping |
| **Memory System** | Persistent memory with categories, importance, FTS5 search |
| **Cross-Brain Client** | Discover and query peer brains at runtime |
| **Cross-Brain Notifier** | Push event notifications to peers |
| **Wilson Score** | Statistical confidence intervals for win rates / rule confidence |
| **Time Decay** | Exponential half-life decay for freshness |
| **SQLite** | better-sqlite3 with WAL mode, foreign keys, caching |

### Cross-Brain Communication

Brains discover and query each other at runtime via IPC named pipes. When one brain learns something, peers are notified automatically. Use `brain peers`, `trading peers`, or `marketing peers` to see online peers.

```bash
# From Claude Code:
brain_ecosystem_status     # status of all brains
brain_query_peer           # query another brain
trading_error_context      # correlate trades with Brain errors
marketing_cross_promote    # pull Brain insights as content ideas
```

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

## Configuration

Each brain is configured via environment variables or config files:

| Brain | Data Dir | Config |
|-------|----------|--------|
| Brain | `BRAIN_DATA_DIR` (default: `~/.brain`) | `~/.brain/config.json` |
| Trading Brain | `TRADING_BRAIN_DATA_DIR` (default: `~/.trading-brain`) | `~/.trading-brain/config.json` |
| Marketing Brain | `MARKETING_BRAIN_DATA_DIR` (default: `~/.marketing-brain`) | `~/.marketing-brain/config.json` |

## Development

```bash
git clone https://github.com/timmeck/brain-ecosystem.git
cd brain-ecosystem
npm install          # installs all workspace dependencies
npm run build        # builds all packages (brain-core first)
npm test             # runs all 538 tests
```

### Workspace Commands

```bash
npm run build                    # build all packages
npm test                         # test all packages
npm run lint                     # lint all packages
npm run build:core               # build brain-core only
npm run build:brain              # build brain only
npm run build:trading            # build trading-brain only
npm run build:marketing          # build marketing-brain only
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

Build `brain-core` first when making changes to shared infrastructure.

## Tech Stack

- **TypeScript** — Full type safety, ES2022 target, ESM modules
- **better-sqlite3** — Fast, embedded, synchronous database with WAL mode
- **MCP SDK** — Model Context Protocol (stdio + HTTP/SSE transports)
- **@huggingface/transformers** — Local ONNX sentence embeddings (Brain only)
- **Commander** — CLI framework
- **Chalk** — Colored terminal output
- **Winston** — Structured logging with file rotation
- **Vitest** — Testing (538 tests across ecosystem)

Visit the [Brain Hub](https://timmeck.github.io/brain-hub/) for the full ecosystem overview.

## Support

If Brain helps you, consider giving it a star — it helps others discover the project and keeps development going.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/tmeck86)

## License

[MIT](LICENSE)
