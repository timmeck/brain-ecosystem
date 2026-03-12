# Brain Ecosystem

[![CI](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml/badge.svg)](https://github.com/timmeck/brain-ecosystem/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

[Deutsche Version](README.de.md)

**An autonomous AI research system that observes itself, learns, evolves, and modifies its own code — built as MCP servers for Claude Code.**

![Command Center](docs/assets/command-center.png)

Brain Ecosystem is a system of three specialized "brains" connected through a Hebbian synapse network. 60 autonomous engines run in feedback loops — observing, detecting anomalies, forming hypotheses, testing them statistically, distilling principles, dreaming, debating, reasoning in chains, feeling emotions, evolving strategies genetically, and modifying their own source code. Multi-provider LLM support (Anthropic + Ollama) with Vision (image analysis). Live market data via CCXT WebSocket. Social feeds via Bluesky + Reddit. Web research via Brave Search + Playwright + Firecrawl. Borg collective sync across all 3 brains. Plugin SDK for community brains. Causal inference with intervention planning. Multi-step research roadmaps with goal dependencies. Creative cross-domain idea generation. Self-protection guardrails with circuit breaker. Engine Governance with formal profiles, runtime influence tracking, anti-pattern detection (retrigger spirals, stagnation, KPI gaming, epistemic drift), and active control (throttle, cooldown, isolate, escalate, restore). Natural language chat interface with multi-brain routing. Sub-agent specialization. Cross-brain signal routing. Autonomous content publishing. Strategy backtesting on historical OHLCV data. Strategy export/import for sharing between instances. Adaptive scheduling that speeds up productive hours and slows down idle ones. Strategy mutation and evolution. Portfolio optimization with Kelly criterion. 635 MCP tools. 4,271 tests. The brain literally thinks about itself, gets curious, runs experiments, absorbs code from other repos, and writes code to improve itself.

## Packages

| Package | Version | Description | Ports |
|---------|---------|-------------|-------|
| [@timmeck/brain](packages/brain) | [![npm](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain) | Error memory, code intelligence, autonomous research & self-modification | 7777 / 7778 / 7790 |
| [@timmeck/trading-brain](packages/trading-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/trading-brain)](https://www.npmjs.com/package/@timmeck/trading-brain) | Adaptive trading intelligence with signal learning, paper trading & live market data | 7779 / 7780 |
| [@timmeck/marketing-brain](packages/marketing-brain) | [![npm](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain) | Content strategy, social engagement & cross-platform optimization | 7781 / 7782 / 7783 |
| [@timmeck/brain-core](packages/brain-core) | [![npm](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core) | Shared infrastructure — 60+ engine/service classes, synapses, IPC, MCP, LLM, consciousness, governance, missions, notifications | — |

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

## Why Brain?

Most AI tools forget everything between sessions. Brain doesn't. It builds a persistent knowledge graph from every error, every trade, every content experiment — and uses that knowledge to get better over time. It runs autonomous research missions, challenges its own assumptions (Advocatus Diaboli), and even modifies its own source code when it finds improvements. If you want an AI that actually learns from your work instead of starting from zero every time, Brain is for you.

### What's New

- **RAG Pipeline** — Universal vector search across all knowledge (insights, memories, principles, errors, solutions, rules) with LLM-based reranking
- **Knowledge Graph** — Typed subject-predicate-object triples with transitive inference, contradiction detection, and automatic fact extraction
- **Semantic Compression** — Periodic clustering and merging of similar insights into meta-insights, reducing noise while preserving signal
- **RLHF Feedback** — Explicit reward signals (positive/negative/correction) that adjust synapse weights, insight priorities, and rule confidence
- **Tool-Use Learning** — Tracks tool outcomes (success/failure/partial), recommends tools based on context, detects tool sequences via Markov chains
- **Proactive Suggestions** — Detects recurring errors, unused knowledge, stale insights, and performance trends — suggests fixes without being asked
- **User Modeling** — Infers skill domains, work patterns, and communication style from interactions — adapts response detail level
- **Code Health Monitor** — Periodic codebase scans: complexity trends, duplication detection, dependency health, tech debt scoring
- **Inter-Brain Teaching** — Brains share their strongest principles with each other, evaluated by relevance before acceptance
- **Consensus Decisions** — Multi-brain voting for high-risk decisions (SelfMod, strategy changes) with majority/supermajority/veto rules
- **Active Learning** — Intelligent gap-closing: research missions, targeted user questions, experiments, teach requests, passive observation
- **Code Assimilation** — RepoAbsorber clones, scans, and indexes GitHub repos into RAG + Knowledge Graph. FeatureExtractor identifies reusable functions, patterns, and architecture across TypeScript, Go, Python, Rust
- **Intelligence Dashboard** — Live Command Center page showing RAG vectors, KG facts, tool stats, feedback scores, user model, proactive suggestions
- **Intelligence CLI** — `brain intel` overview, `brain intel rag <query>`, `brain intel knowledge`, `brain intel features [search/extract/suggest/stats]`, `brain intel llm`
- **Contradiction Resolver** — Classifies knowledge graph contradictions (confidence gap, temporal, contextual, trade-off) and auto-resolves them with audit trail
- **Self-Capability Awareness** — FeatureRecommender recognizes Brain's existing abilities (rate limiter, cache, streaming, monitoring, middleware) and only wishes for features it truly lacks
- **Generic Utilities** — `retryWithBackoff<T>()` with exponential backoff + jitter, `BatchQueue<T,R>` for efficient batch processing
- **Workflow Checkpointing** — Save/load/resume/fork workflow state with crash recovery (LangGraph-inspired)
- **Structured LLM Output** — ContentBlock types (Text, Reasoning, ToolCall, Citation, JSON) + composable middleware pipeline
- **Observability & Tracing** — Hierarchical traces with spans, P50/P99 latency, token/cost tracking (LangSmith-inspired)
- **Messaging Input** — Bidirectional Telegram + Discord bots: receive commands, respond with brain status
- **Agent Training CLI** — Benchmark suites, performance grading, scenario-based training (CrewAI-inspired)
- **Dynamic Tool Scoping** — Context-aware tool filtering: only relevant tools for each task (LangGraph-inspired)
- **Plugin Marketplace** — Discovery, rating, installation of community brain plugins (OpenClaw-inspired)
- **Code Sandbox** — Docker-isolated code execution for safe experimentation (AutoGen-inspired)
- **SelfMod Pipeline** — Feature-aware self-modification: absorbed repo code as reference for code generation
- **Vision** — LLM image analysis via Anthropic Vision + Ollama llava: analyze screenshots, charts, UI bugs
- **Causal Planner** — Root-cause diagnosis from causal graph, intervention suggestions with side-effect prediction
- **Research Roadmaps** — Goal dependencies with multi-step decomposition: data → hypotheses → target achievement
- **Creative Engine** — Cross-domain idea generation: principle cross-pollination, analogy search, speculative hypotheses
- **Guardrails** — Self-protection: parameter bounds validation, circuit breaker, auto-rollback on declining fitness, protected core paths
- **Engine Governance** — Formal engine profiles (25 registered), runtime influence tracking, 4 anti-pattern detectors (retrigger spirals, stagnation, KPI gaming, epistemic drift), active governance (throttle/cooldown/isolate/escalate/restore)
- **ChatEngine** — Natural language interface with NLU intent routing and IPC dispatch to any brain subsystem
- **SubAgentFactory** — Specialized sub-agent creation for focused tasks (research, trading, content, code)
- **FeedbackRouter** — Dead-end data routing to ActionBridge proposals, closing the learning-to-action gap
- **StrategyMutator** — Strategy evolution: parameter mutation, crossover breeding, tournament selection
- **CrossBrainSignalRouter** — Bidirectional cross-brain signal routing with confidence filtering
- **AutoPublisher** — Autonomous content publishing pipeline with schedule optimization
- **Strategy Backtesting** — Backtest StrategyForge strategies on historical OHLCV data with Sharpe ratio, max drawdown, profit factor, equity curve
- **Strategy Export/Import** — Share strategies as portable JSON between brain instances with schema validation and duplicate detection
- **Multi-Brain Chat** — Chat queries automatically routed to 1-3 brains based on keywords, responses aggregated as markdown
- **Adaptive Scheduling** — Dynamic cycle intervals: speeds up during productive hours, slows down during idle hours (168 hourly buckets)
- **Borg Sync (all 3 brains)** — Collective knowledge sharing now enabled in Trading Brain and Marketing Brain (bidirectional, selective mode)
- **Desire Feedback Loop** — Desire priorities auto-adjust based on action outcomes (failed desires deprioritized, successful boosted), cross-brain coordination prevents duplicate work, adaptive confidence formula
- **Debate System Fixes** — Challenge outcomes adjust principle confidence (disproved→removed, weakened→-30%, survived→+10%), debate recommendations become ActionBridge proposals, cross-brain perspective sharing, targeted weakest-first challenges
- **Intelligence Loop Tuning** — CreativeEngine reads stored principles (not re-extracting), relaxed hypothesis confirmation thresholds, lower novelty barrier for insight conversion, prediction accuracy counts partial matches

## What It Does

### Brain — Error Memory, Code Intelligence & Full Autonomy

277 MCP tools. Remembers errors, learns solutions, runs 68-step autonomous research cycles, dreams, debates, challenges principles (Advocatus Diaboli), reasons, feels, absorbs code from GitHub repos, extracts reusable features, and modifies its own code. ChatEngine provides natural language access to all subsystems with multi-brain routing. SubAgentFactory creates specialized agents for focused tasks.

- **Error Memory** — Track errors, match against known solutions with hybrid search (TF-IDF + vector + synapse boost)
- **Code Intelligence** — Register and discover reusable code modules across all projects
- **Persistent Memory** — Remember preferences, decisions, context, facts, goals, and lessons across sessions
- **40+ Autonomous Engines** — SelfObserver, AnomalyDetective, HypothesisEngine, KnowledgeDistiller, CuriosityEngine, EmergenceEngine, DebateEngine, NarrativeEngine, ReasoningEngine, EmotionalModel, EvolutionEngine, GoalEngine, MemoryPalace, AttentionEngine, TransferEngine, MetaCognitionLayer, AutoExperimentEngine, SelfTestEngine, TeachEngine, SimulationEngine, DataScout, SelfScanner, SelfModificationEngine, ConceptAbstraction, SignalScanner, TechRadar, and more
- **Dream Mode** — Offline memory consolidation: replay, prune, compress, decay during idle
- **LLM Service** — Multi-provider AI support (Anthropic Claude + Ollama local models), auto-routing, caching, rate limiting, budget tracking
- **Research Missions** — 5-phase autonomous web research: decompose, gather, hypothesize, analyze, synthesize
- **TechRadar** — Daily scanning of trending repos, tech trends, and relevance scoring
- **Notifications** — Discord, Telegram, Email providers for cross-brain alerts
- **Web Research** — Brave Search + Jina Reader + Playwright + Firecrawl fallback chain
- **Borg Sync** — Collective knowledge sharing between all brains (opt-in, selective/full mode)
- **Plugin SDK** — Community brain plugins with lifecycle hooks, MCP tools, and IPC routes
- **Advocatus Diaboli** — Principle challenges with resilience scoring (survived/weakened/disproved)

### Dashboards

| Dashboard | Port | Description |
|-----------|------|-------------|
| **Command Center** | 7790 | 9-page ecosystem dashboard: Ecosystem, Consciousness, Learning, Trading, Marketing, Intelligence, Cross-Brain, Debates & Challenges, Infrastructure |


- **Command Center** — Live overview of the entire ecosystem: all 3 brains, 72+ engines, error log, self-modification feed, research missions, knowledge growth chart, engine dependency flow, quick actions, Borg network with animated sync packets, debate history, Advocatus Diaboli challenges with resilience bars, LLM usage, thought stream

### Trading Brain — Adaptive Trading Intelligence

181 MCP tools. Learns from every trade outcome through Hebbian synapses and autonomous research. Full intelligence suite (RAG, KG, Feedback, Tool Learning, User Model, Proactive). PortfolioOptimizer with Kelly criterion position sizing and HHI diversification. StrategyMutator for evolutionary strategy breeding.

- **Trade Outcome Memory** — Record and query trades with full signal context
- **Paper Trading** — 10 positions active, live equity tracking, balance management
- **Live Market Data** — CoinGecko, Yahoo Finance, CCXT WebSocket real-time feeds
- **Signal Fingerprinting** — RSI, MACD, Trend, Volatility classification
- **Backtesting Engine** — Run backtests on historical trades or strategies on OHLCV data, compare signals, Sharpe/PF/MaxDD/Equity Curve
- **Strategy Export/Import** — Share strategies as portable JSON between instances
- **Risk Management** — Kelly Criterion position sizing, drawdown tracking
- **40+ Autonomous Engines** — Same full engine suite as Brain, with trading-specific DataMiner

### Marketing Brain — Self-Learning Marketing Intelligence

177 MCP tools. Learns what content works across platforms. Full intelligence suite (RAG, KG, Feedback, Tool Learning, User Model, Proactive). FeedbackRouter closes the learning-to-action gap. AutoPublisher enables autonomous content scheduling and publishing.

- **Post Tracking** — Store posts with platform, format, hashtags, engagement history
- **Social Feeds** — Bluesky + Reddit live data providers
- **Competitor Analysis** — Track and benchmark competitor engagement
- **Content Generation** — Draft posts from learned patterns, rules, and templates
- **Scheduling Engine** — Post queue with optimal auto-timing
- **Cross-Platform** — Optimize for X, LinkedIn, Reddit, Bluesky, Mastodon, Threads
- **40+ Autonomous Engines** — Same full engine suite as Brain, with marketing-specific DataMiner

### Autonomous Research Layer

All three brains share 60 autonomous engine/service classes via Brain Core:

- **65-Step Feedback Loop** — ResearchOrchestrator runs with adaptive scheduling (2-15 min intervals): observe → hypothesize → experiment → measure → distill → adapt → absorb → resolve contradictions
- **Self-Improvement** — HypothesisEngine generates theories, AutoExperiment tests them, AdaptiveStrategy applies winners
- **Dream Mode** — Offline memory consolidation: replay, prune, compress, decay during idle
- **Knowledge Distillation** — Extracts principles and anti-patterns from raw experience
- **Prediction Engine** — Holt-Winters + EWMA forecasting with auto-calibration
- **Genetic Evolution** — EvolutionEngine breeds optimal strategy combinations

### Shared Infrastructure (Brain Core)

Brain Core provides the building blocks all brains share:

| Module | What It Does |
|--------|-------------|
| **IPC** | Named pipe communication between brains |
| **MCP** | Model Context Protocol servers (stdio + HTTP/SSE) |
| **REST** | Base API server with CORS, auth, RPC |
| **LLM** | Multi-provider AI (Anthropic + Ollama), caching, rate limiting |
| **Synapses** | Hebbian learning network connecting all knowledge |
| **Engines** | 40 autonomous engines + 20 forge/service classes |
| **Watchdog** | Daemon monitoring, auto-restart, health checks |
| **Notifications** | Discord, Telegram, Email multi-channel alerts |
| **Missions** | 5-phase autonomous web research pipeline |
| **Consciousness** | ThoughtStream, entity model, real-time dashboard |
| **Borg Sync** | Collective knowledge sharing between all brains |
| **Plugin SDK** | Community brain plugins with lifecycle hooks |
| **Debate Engine** | Multi-perspective debates + Advocatus Diaboli challenges |
| **RAG** | Universal vector search with embedding indexing + LLM reranking |
| **Knowledge Graph** | Typed triples with transitive inference + contradiction detection |
| **Feedback** | RLHF reward signals adjusting synapses, priorities, confidence |
| **Tool Learning** | Tool outcome tracking, context-based recommendations, Markov chains |
| **Proactive** | Recurring error detection, unused knowledge alerts, trend warnings |
| **User Model** | Skill inference, work patterns, adaptive response detail |
| **Code Health** | Complexity trends, duplication, dependency health, tech debt score |
| **Teaching** | Inter-brain knowledge sharing with relevance filtering |
| **Consensus** | Multi-brain voting for high-risk decisions |
| **Active Learning** | Intelligent gap detection + multi-strategy gap closing |
| **Semantic Compression** | Insight deduplication via clustering + LLM summarization |
| **RepoAbsorber** | Autonomous code learning: clone → scan → RAG index → KG facts |
| **FeatureExtractor** | Extract reusable functions/patterns from absorbed repos (TS, Go, Py, Rust) |
| **ContradictionResolver** | Classify and resolve knowledge graph contradictions with audit trail |
| **Retry & BatchQueue** | Generic exponential backoff with jitter + batch processing utilities |
| **Checkpointing** | Save/load/resume/fork workflow state for crash recovery |
| **Structured Output** | ContentBlock types + composable LLM middleware pipeline |
| **Tracing** | Hierarchical spans with P50/P99 latency, token/cost tracking |
| **Messaging** | Bidirectional Telegram + Discord bots for remote control |
| **Agent Training** | Benchmark suites, scenario training, performance grading |
| **Tool Scoping** | Context-aware dynamic tool filtering per task |
| **Marketplace** | Plugin discovery, rating, and installation |
| **Code Sandbox** | Docker-isolated code execution for safe experimentation |
| **ChatEngine** | Natural language interface with NLU intent routing, multi-brain dispatch + response aggregation |
| **SubAgentFactory** | Specialized sub-agent creation for focused tasks |
| **FeedbackRouter** | Dead-end data routing to ActionBridge proposals |
| **StrategyMutator** | Strategy evolution: mutation, crossover, tournament selection |
| **CrossBrainSignalRouter** | Bidirectional cross-brain signal routing with confidence filtering |
| **AutoPublisher** | Autonomous content publishing with schedule optimization |
| **EngineRegistry** | Formal engine profiles: reads/writes/emits/subscribes, risk class, invariants |
| **RuntimeInfluenceTracker** | Before/after snapshots per engine step, observed influence graph |
| **LoopDetector** | 4 anti-pattern detectors: retrigger spirals, stagnation, KPI gaming, epistemic drift |
| **GovernanceLayer** | Active engine control: throttle, cooldown, isolate, escalate, restore |
| **AdaptiveScheduler** | Dynamic cycle intervals: speeds up productive hours, slows down idle hours |
| **MultiBrainRouter** | Chat message routing to 1-3 brains with parallel query + response aggregation |
| **StrategyExporter** | Export strategies as portable JSON with lineage tracking |
| **StrategyImporter** | Import + validate strategies with duplicate detection |

## Evidence & Measurements

### Verified Counts (March 2026)

| Metric | Claimed | Measured |
|--------|---------|----------|
| Autonomous engines (brain-core) | 80+ | 40 engine classes + 20 forge/service classes + 4 governance modules = 64 unique |
| MCP tools | 635 | 635 (brain: 277, trading: 181, marketing: 177) |
| Test suite | 4,271 | 4,271 tests across 319 files (100% pass rate) |

### Paper Trading (Live)

- Starting Balance: $10,000
- Open Positions: 10 (crypto pairs via CCXT + CoinGecko)
- Win Rate: early stage, insufficient closed trades for statistical significance
- Market Data: CoinGecko REST + CCXT WebSocket real-time feeds

### System Health

- Daemon Uptime: Watchdog auto-restart with exponential backoff (max 3 retries in 60s)
- IPC Latency: <5ms local (measured via TraceCollector)
- DB: SQLite WAL mode, retention cleanup every 24h, auto-optimize
- Build: 4 packages compile cleanly (TypeScript strict mode)

### Self-Modification Safety

- Approval Flow: propose → generate → sandbox validate → build + test → ready → **human approve** → apply
- Protected Paths: IPC, LLM providers, guardrails, DB migrations
- Circuit Breaker: auto-trip on 3+ warnings, manual reset required
- Rate Limit: max 3 generations/hour, max 200 changed lines/mod
- Sandbox: Code pre-validated in isolated subprocess before touching real files

### Known Limitations

- Paper trading only (no real money)
- Yahoo Finance stock prices may be stale (rate limiting) — crypto prices work fine
- Playwright: no stale browser detection if Chromium crashes
- LLM stats only via IPC (no CLI command yet)

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
| :7790  |    |  :7780     |   |  :7782       |
+---+----+    +-----+------+   |  :7783       |
    |              |           +---+----------+
    |              |                |
    v              v                v
+--------+    +------------+   +--------------+
| SQLite |    |   SQLite   |   |   SQLite     |
+--------+    +------------+   +--------------+

Cross-brain peering via IPC named pipes
Borg Sync for collective knowledge sharing
Watchdog auto-restart with exponential backoff
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
| Command Center | 7790 | HTTP + SSE |

## CLI Commands

Each brain provides a full CLI:

```bash
# Brain
brain setup / start / stop / status / doctor
brain query <text> / modules / insights / network / dashboard
brain learn / explain <id> / export / import <dir> / peers
brain borg status / enable / disable / sync / history
brain plugins list / routes / tools
brain watchdog status / restart <name>
brain selfmod list / pending / show / approve / reject / status
brain intel / intel rag <query> / intel knowledge / intel features / intel llm
brain guardrail status / health / rollback / reset
brain governance status / actions / throttle / cooldown / isolate / restore
brain roadmap list / show <id> / ready / create <title> <goalId>
brain creative status / insights / pollinate / analogies <concept>

# Trading Brain
trading setup / start / stop / status / doctor
trading query <text> / insights / rules / network / dashboard
trading export / import <file> / peers
trading backtest strategy <id> [--pair BTC/USDT] [--days 30]
trading strategy export <id> [--file out.json] / import <file>

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

Additional keys: `ANTHROPIC_API_KEY` (enables LLM features), `BRAVE_SEARCH_API_KEY` (web research), `GITHUB_TOKEN` (CodeMiner + Signal Scanner).

## Optional Integrations

Brain follows the "Highend Optional" principle — everything optional, core always works, graceful fallback. Add API keys to your `.env` file (e.g. `~/.brain/.env`) to enable features:

### Telegram Bot

Receive and respond to commands via Telegram (status checks, queries, missions, etc.).

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`, follow the prompts, pick a name
3. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Add to your `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=your-chat-id          # optional: restrict to one chat
   ```
5. To find your Chat ID: message the bot, then visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
6. Restart Brain: `brain stop && brain start`
7. Send `/help` to your bot — it should respond with available commands

### Discord Bot

Receive and respond to commands via Discord (mention the bot or use commands).

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to **Bot** tab, click **Reset Token**, copy it
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**
5. Go to **OAuth2 > URL Generator**, select scopes `bot` + `applications.commands`
6. Under **Bot Permissions**, select: Send Messages, Read Message History, View Channels
7. Copy the generated URL, open it in your browser, invite the bot to your server
8. Add to your `.env`:
   ```env
   DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.AbCdEf.xxxxx
   DISCORD_CHANNEL_ID=123456789012345678   # optional: restrict to one channel
   ```
9. Restart Brain: `brain stop && brain start`
10. Mention the bot in Discord — it should respond

### Anthropic API (LLM Features)

Required for autonomous research, self-modification, code generation, and missions.

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key under **API Keys**
3. Add to your `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
   ```

### Brave Search (Web Research)

Enables web research for missions, TechRadar, and autonomous discovery.

1. Sign up at [brave.com/search/api](https://brave.com/search/api/)
2. Get a free API key (2,000 queries/month on free tier)
3. Add to your `.env`:
   ```env
   BRAVE_SEARCH_API_KEY=BSAxxxxx
   ```

### GitHub Token (Code Intelligence)

Enables CodeMiner repo scanning, Signal Scanner trending repos, and TechRadar.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Generate a **classic** token with `public_repo` scope
3. Add to your `.env`:
   ```env
   GITHUB_TOKEN=ghp_xxxxx
   ```

### Ollama (Local AI)

Run AI models locally without API costs. Used as fallback or for privacy-sensitive tasks.

1. Install from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3.2`
3. Ollama runs on `http://localhost:11434` by default — Brain auto-detects it

### Notifications (Discord/Telegram/Email)

Brain can send alerts for cross-brain events, self-modification proposals, anomalies, etc.

```env
# Discord webhook (different from the bot above — this is for outbound notifications)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx

# Telegram (reuses the same bot token)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=your-chat-id

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=you@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=you@gmail.com
EMAIL_TO=alerts@yourdomain.com
```

### Full `.env` Example

```env
# Required for LLM features
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Web research
BRAVE_SEARCH_API_KEY=BSAxxxxx

# GitHub intelligence
GITHUB_TOKEN=ghp_xxxxx

# Telegram bot (bidirectional)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# Discord bot (bidirectional)
DISCORD_BOT_TOKEN=MTIzNDU2.xxxxx
DISCORD_CHANNEL_ID=123456789012345678

# Discord notifications (outbound webhook)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
```

> All keys are optional. Brain works without any of them — you just get more features as you add them.

## Development

```bash
git clone https://github.com/timmeck/brain-ecosystem.git
cd brain-ecosystem
npm install          # installs all workspace dependencies
npm run build        # builds all packages (brain-core first)
npm test             # runs all 4,271 tests
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
- **Claude API** — Code generation, self-modification, research missions
- **Ollama** — Local AI model support (Llama, Mistral, etc.)
- **CCXT** — Crypto exchange WebSocket feeds
- **Playwright** — Headless browser for web research
- **Commander** — CLI framework
- **Winston** — Structured logging with file rotation
- **Vitest** — 4,271 tests across 319 test files

## Docker (Optional)

```bash
# Build all brains
docker build -t brain-ecosystem .

# Run with persistent data
docker run -d \
  -v ~/.brain:/root/.brain \
  -v ~/.trading-brain:/root/.trading-brain \
  -v ~/.marketing-brain:/root/.marketing-brain \
  -p 7777-7790:7777-7790 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  brain-ecosystem
```

## Support

If Brain helps you, consider giving it a star.

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/tmeck86)

## License

[MIT](LICENSE)
