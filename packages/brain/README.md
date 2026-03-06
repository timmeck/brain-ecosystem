# Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Autonomous Error Memory, Code Intelligence & Self-Improving AI for Claude Code — 134 MCP Tools, 60+ Engines**

Brain is an MCP server that gives Claude Code a persistent, self-improving memory. It remembers errors, learns solutions, and runs 60+ autonomous engines in a 40-step feedback cycle. It observes itself, detects anomalies, forms and tests hypotheses, distills principles, reasons in chains, feels emotions, evolves strategies genetically, debates itself, challenges its own principles (Advocatus Diaboli), gets curious about knowledge gaps, syncs knowledge via Borg collective, loads community plugins, and modifies its own source code. Multi-provider LLM (Anthropic + Ollama). Autonomous web research missions. Live tech radar scanning. 137 MCP tools. 1407 tests.

## Quick Start

```bash
npm install -g @timmeck/brain
brain setup
```

That's it. One command configures MCP, hooks, and starts the daemon.

## Architecture

```
Claude Code  ──MCP stdio──►  Brain Daemon (:7777)
Cursor/Windsurf ─MCP SSE──►  MCP HTTP Server (:7778)
Browser ────────HTTP──────►  Mission Control (:7788)
                              Command Center  (:7790)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              Error Memory    Research Engine   60+ Engines
              Code Intel      Mission Engine    ResearchOrchestrator
              Synapse Net     LLM Service       40-step feedback loop
              Prevention      Web Research          │
              Git Intel       TechRadar         ┌───┴───────────┐
                    │                           ▼               ▼
                    ▼                     Self-Modification  Dream Mode
                  SQLite (~/.brain)       CodeGenerator      Memory
                                          SelfScanner        Consolidation
```

Cross-brain communication via IPC named pipes (trading-brain, marketing-brain).

## Features

### Error Memory & Code Intelligence
- **Error Memory** — Track errors, match against known solutions with hybrid search (TF-IDF + vector + synapse boost)
- **Code Intelligence** — Register and discover reusable code modules across all projects
- **Proactive Prevention** — Warns before errors occur when code matches known antipatterns
- **Cross-Project Learning** — Solutions from project A help solve errors in project B
- **Auto Error Detection** — PostToolUse hook catches errors in real-time
- **Git Integration** — Links errors to commits, tracks which changes introduced or fixed bugs

### Persistent Memory
- **Memory System** — Remember preferences, decisions, context, facts, goals, and lessons across sessions
- **Session Tracking** — Auto-tracks conversation sessions with goals, summaries, and outcomes
- **Decision History** — Record architecture/design decisions with alternatives and rationale
- **Semantic Changelog** — Tracks every file change with semantic meaning, diffs, and context
- **Task & Goal Tracking** — Persistent tasks with priority, status, and cross-session continuity
- **Semantic Search** — Local all-MiniLM-L6-v2 embeddings (23MB, no cloud required)

### LLM Service
- **Multi-Provider** — Anthropic Claude + Ollama local models with auto-routing
- **Smart Caching** — Content-hash cache, avoid duplicate API calls
- **Rate Limiting** — Per-hour and per-day token budgets with automatic throttling
- **Usage Tracking** — Calls, tokens, latency, cache hit rate, cost tracking
- **Tier Routing** — Templates mapped to tiers (critical/standard/bulk), auto-routed to best provider

### Research Missions
- **5-Phase Pipeline** — Decompose → Gather → Hypothesize → Analyze → Synthesize
- **Web Research** — Brave Search + Jina Reader + Playwright + Firecrawl fallback chain
- **Autonomous** — Brain decides what to research and executes independently
- **Source Tracking** — Every finding traced back to its original source

### TechRadar
- **Daily Scanning** — Tracks trending repos, tech news, library updates
- **Repo Watching** — Monitor specific repos for changes (3 default repos configured)
- **LLM Relevance Scoring** — AI judges how relevant each finding is to your stack
- **Digest Generation** — Daily summaries of what's new and relevant

### 60+ Autonomous Engines

The ResearchOrchestrator runs a 40-step feedback cycle every 5 minutes:

#### Core Research Engines

| Engine | Purpose |
|--------|---------|
| SelfObserver | Monitors Brain's own performance metrics and behavior |
| AnomalyDetective | Detects statistical anomalies in error patterns and metrics |
| DataScout | Discovers external data sources and imports relevant data |
| SignalScanner | Scans GitHub repos, HN, crypto markets for signals |
| TechRadar | Daily tech landscape scanning with relevance scoring |
| HypothesisEngine | Generates and statistically tests hypotheses about patterns |
| ExperimentEngine | Proposes, runs, and measures controlled experiments |
| AutoExperimentEngine | Autonomously discovers and runs parameter experiments |
| SimulationEngine | What-if scenarios and counterfactual reasoning |
| KnowledgeDistiller | Extracts principles and anti-patterns from experience |

#### Intelligence Engines

| Engine | Purpose |
|--------|---------|
| AttentionEngine | Dynamic focus allocation across topics and engines |
| CausalGraph | Discovers cause-effect relationships between events |
| CrossDomainEngine | Finds correlations across brain domains |
| PatternExtractor | Mines recurring code and error patterns |
| TransferEngine | Transfers knowledge between domains via analogies |
| NarrativeEngine | Generates natural language explanations of findings |
| CuriosityEngine | Detects knowledge gaps and generates exploration questions |
| ResearchAgendaEngine | Prioritizes what to investigate next |
| CounterfactualEngine | "What if X hadn't happened?" reasoning |

#### Meta-Cognition Engines

| Engine | Purpose |
|--------|---------|
| MetaCognitionLayer | Evaluates engine effectiveness, produces report cards |
| DebateEngine | Multi-perspective reasoning with synthesis |
| EmergenceEngine | Detects emergent properties from engine interactions |
| ConceptAbstraction | Forms hierarchical concept taxonomies |
| MemoryPalace | Builds associative knowledge graph for navigation |
| ReasoningEngine | Deductive, abductive, and temporal inference chains |
| EmotionalModel | Frustration, curiosity, satisfaction — influences priorities |
| SelfTestEngine | Tests understanding of its own principles |
| TeachEngine | Packages knowledge for transfer to other brains |

#### Autonomy Engines

| Engine | Purpose |
|--------|---------|
| SelfModificationEngine | Generates code improvements, tests before applying |
| CodeGenerator | Produces new code from learned patterns |
| CodeMiner | Extracts reusable patterns from codebases |
| GoalEngine | Sets, tracks, and forecasts autonomous goals |
| EvolutionEngine | Genetic algorithm for strategy optimization |
| AdaptiveStrategyEngine | Real-time parameter adaptation based on outcomes |
| DreamEngine | Offline memory consolidation during idle |
| ResearchOrchestrator | Orchestrates the entire 40-step feedback cycle |

### Self-Improvement Loop

Brain continuously improves itself through a closed-loop cycle:

1. **Observe** — SelfObserver records performance metrics (error rates, resolution times, cache hits)
2. **Hypothesize** — HypothesisEngine generates testable theories about what could work better
3. **Experiment** — AutoExperimentEngine runs controlled A/B tests on parameters
4. **Measure** — MetaCognitionLayer evaluates which experiments improved outcomes
5. **Adapt** — AdaptiveStrategy applies winning parameters, reverts failures
6. **Evolve** — EvolutionEngine genetically breeds the best strategy combinations

Frustration Detection: EmotionalModel tracks repeated failures. High frustration triggers more aggressive exploration via CuriosityEngine.

### Dream Mode

During idle periods (no active conversations), DreamEngine performs memory consolidation:

- **Replay** — Re-processes important experiences to strengthen synaptic connections
- **Pruning** — Removes low-value memories and weak synapse connections
- **Compression** — Merges similar patterns into generalized principles
- **Decay** — Time-based weight reduction on unused knowledge
- **Triggers** — Starts automatically after configurable idle period, or manually via `dream.start`

### Prediction Engine

Forecasts future metrics using statistical models:

- **Holt-Winters** — Triple exponential smoothing for seasonal patterns
- **EWMA** — Exponential weighted moving average for trend detection
- **Auto-Calibration** — Tracks prediction accuracy and adjusts model parameters
- **Domain-Aware** — Separate models per domain (errors, performance, learning)

### AutoResponder

Automatic anomaly response system:

- **Rule-Based** — Configurable rules: "if error_rate > threshold, trigger learning cycle"
- **Cooldown** — Prevents response storms with per-rule cooldown periods
- **Action Types** — Learning cycles, notifications, parameter adjustments, dream triggers
- **History** — Full audit trail of what was detected and what action was taken

### Code Generation & Mining

- **CodeGenerator** — Generates code improvements via Claude API with full diff preview
- **CodeMiner** — Analyzes codebases to extract reusable patterns and modules
- **PatternExtractor** — Identifies recurring code patterns across projects
- **SignalScanner** — Monitors GitHub trending, Hacker News, crypto markets for relevant signals
- **Self-Improvement Proposals** — Engines can propose improvements to their own source code

### Self-Modification
- **SelfScanner** — Indexes own TypeScript source code with SHA256 change detection
- **SelfModificationEngine** — Generates improvements via Claude API, tests before applying
- **Experiment Ledger** — Tracks hypothesis, risk level, metrics before/after for every modification
- **Safety** — All modifications require explicit approval, automatic rollback on test failure

### Notifications
- **Discord, Telegram, Email** — Multi-channel alert routing
- **Notification Bridge** — IPC-based cross-brain notification relay
- **Configurable** — All providers optional, graceful fallback
- **Event Routing** — Different events route to different channels

### Dashboards

| Dashboard | Port | What It Shows |
|-----------|------|--------------|
| **Mission Control** | 7788 | 7-tab: Overview, Consciousness Entity, Thoughts, CodeGen, Self-Mod, Engines, Intelligence |
| **Command Center** | 7790 | 8-page: Ecosystem, Learning, Trading, Marketing, Cross-Brain & Borg, Debates & Challenges, Activity & Missions, Infrastructure |

**Mission Control** — The Consciousness Entity visualization shows Brain's current emotional state, active thought streams, engine activity heatmap, and real-time thought generation. CodeGen tab shows pending code proposals. Self-Mod tab shows modification history with diffs.

**Command Center** — Live overview of the entire ecosystem: all 3 brains, 60+ engines, error log, self-modification feed, research missions, knowledge growth chart, engine dependency flow, quick actions, animated Borg network, peer graph, debate history, Advocatus Diaboli challenges with resilience bars, watchdog daemon monitoring, LLM usage tracking.

## MCP Tools (137 tools)

**Error & Code**: brain_report_error, brain_query_error, brain_report_solution, brain_report_attempt, brain_find_reusable_code, brain_register_code, brain_check_code_similarity

**Memory & Sessions**: brain_remember, brain_recall, brain_session_start, brain_session_end, brain_session_history

**Research Engines** (5 tools each): self_observer, anomaly_detective, cross_domain, adaptive_strategy, experiment, knowledge_distiller, research_agenda, counterfactual, journal

**Dream, Consciousness, Prediction, AutoResponder, Attention, Transfer, Narrative, Curiosity, Emergence, Debate, Challenge (Advocatus Diaboli), MetaCognition, Evolution, Reasoning, Emotions, Self-Modification, Ecosystem, Borg, Plugins** — full tool suites for each

## CLI Commands

```
brain setup              One-command setup: MCP + hooks + daemon
brain start / stop       Daemon management (with watchdog)
brain status             Stats: errors, solutions, engines, synapses
brain doctor             Health check: daemon, DB, MCP, hooks
brain query <text>       Search for errors and solutions
brain learn              Trigger a learning cycle
brain peers              Show peer brains in the ecosystem
brain dashboard          Generate interactive HTML dashboard
brain missions           Research mission management (create, list, report)
brain watchdog           Watchdog daemon status and control
brain service            Windows service management (install, uninstall, status)
brain borg               Borg collective sync (status, enable, disable, sync, history)
brain plugins            Community plugins (list, routes, tools)
brain export             Export Brain data as JSON
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `BRAIN_DATA_DIR` | `~/.brain` | Data directory |
| `BRAIN_LOG_LEVEL` | `info` | Log level |
| `BRAIN_API_PORT` | `7777` | REST API port |
| `BRAIN_MCP_HTTP_PORT` | `7778` | MCP HTTP/SSE port |
| `ANTHROPIC_API_KEY` | — | Enables LLM features, CodeGen, Self-Mod |
| `BRAVE_SEARCH_API_KEY` | — | Enables web research missions |
| `GITHUB_TOKEN` | — | Enables CodeMiner + Signal Scanner |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama local model endpoint |

## Brain Ecosystem

| Brain | Purpose | Ports |
|-------|---------|-------|
| **Brain** (this) | Error memory, code intelligence, full autonomy & self-modification | **7777** / 7778 / 7788 / 7790 |
| [Trading Brain](../trading-brain) | Adaptive trading intelligence with signal learning & paper trading | 7779 / 7780 |
| [Marketing Brain](../marketing-brain) | Content strategy, social engagement & cross-platform optimization | 7781 / 7782 / 7783 |
| [Brain Core](../brain-core) | Shared infrastructure — 60+ engines | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
