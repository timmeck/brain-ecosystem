# Brain Core

[![npm version](https://img.shields.io/npm/v/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain-core)](https://www.npmjs.com/package/@timmeck/brain-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Shared infrastructure for the Brain Ecosystem — 117+ autonomous engines, synapses, IPC, MCP, LLM service, consciousness, governance, research missions, notifications, self-modification, RAG, Knowledge Graph, code assimilation, and more.**

Brain Core is the nervous system that powers all three Brain MCP servers ([Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/brain), [Trading Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/trading-brain), [Marketing Brain](https://github.com/timmeck/brain-ecosystem/tree/main/packages/marketing-brain)). A 68-step feedback orchestrator runs 117+ engines in autonomic cycles — the brain observes itself, forms hypotheses, runs experiments, dreams, debates, reasons in chains, feels emotions, evolves strategies genetically, absorbs code from other repos, extracts reusable features, governs its own engine dynamics, and modifies its own source code. Full intelligence suite: RAG pipeline, Knowledge Graph, semantic compression, RLHF feedback, tool learning, proactive suggestions, user modeling, code health monitor, inter-brain teaching, consensus voting, active learning, code assimilation with feature extraction. Engine Governance: formal profiles, runtime influence tracking, 4 anti-pattern detectors, active control (throttle/cooldown/isolate/escalate/restore).

## What's Included

### Communication & API

| Module | Description |
|--------|-------------|
| **IPC Protocol** | Length-prefixed JSON frames over named pipes / Unix sockets |
| **IPC Server/Client** | Named pipe server with auto-recovery, request/response with timeouts |
| **MCP Server** | Stdio transport for Claude Code with auto-daemon-start |
| **MCP HTTP Server** | SSE transport for Cursor, Windsurf, Cline, Continue |
| **REST API Server** | HTTP server with CORS, auth, SSE events, batch RPC |
| **Security Middleware** | RateLimiter (token bucket), body size limits, security headers |

### LLM Service

| Module | Description |
|--------|-------------|
| **Multi-Provider** | Anthropic Claude + Ollama local models, auto-routing by task |
| **Smart Caching** | Content-hash cache with TTL, avoid duplicate API calls |
| **Rate Limiting** | Per-hour and per-day token/call budgets with automatic throttling |
| **Usage Tracking** | Detailed stats: calls, tokens, latency, cache hit rate, cost tracking |
| **Prompt Templates** | Reusable templates for analysis, summarization, classification, coding |

### Synapse Network & Learning

| Module | Description |
|--------|-------------|
| **Hebbian Learning** | Weighted graph — "neurons that fire together wire together" |
| **Synapse Decay** | Exponential half-life decay for freshness |
| **Spreading Activation** | BFS-based energy propagation through the graph |
| **A* Pathfinding** | Find shortest paths between nodes |
| **Wilson Score** | Statistical confidence intervals for win rates |

### 117+ Autonomous Engines

#### Observation & Data

| Engine | Description |
|--------|-------------|
| **SelfObserver** | Observes own performance metrics, generates insights |
| **AnomalyDetective** | Detects statistical outliers using Z-scores and drift analysis |
| **DataScout** | External data from GitHub/npm/Hacker News |
| **SignalScanner** | GitHub trending repos, HN mentions, crypto signals |
| **TechRadarEngine** | Daily tech trend scanning, repo watching, LLM relevance scoring |

#### Understanding & Analysis

| Engine | Description |
|--------|-------------|
| **AttentionEngine** | Dynamic focus, context detection, burst detection, engine weight allocation |
| **CausalGraph** | Granger causality analysis for event relationships |
| **CrossDomainEngine** | Finds correlations between events across brains |
| **PatternEngine** | Discovers recurring patterns in data |

#### Ideas & Hypotheses

| Engine | Description |
|--------|-------------|
| **HypothesisEngine** | Forms and tests hypotheses (temporal, correlation, threshold, creative) |
| **CuriosityEngine** | Knowledge gap detection, UCB1 explore/exploit, blind spot detection |
| **DreamEngine** | Offline consolidation — memory replay, synapse pruning, compression, decay |
| **DebateEngine** | Multi-agent debates, Advocatus Diaboli principle challenges, consensus synthesis |

#### Testing & Experimentation

| Engine | Description |
|--------|-------------|
| **ExperimentEngine** | A/B tests on brain parameters |
| **AutoExperimentEngine** | Autonomous parameter tuning with snapshot/rollback |
| **SimulationEngine** | What-if scenarios via CausalGraph + PredictionEngine |
| **PredictionEngine** | Holt-Winters + EWMA forecasting with auto-calibration |

#### Knowledge & Memory

| Engine | Description |
|--------|-------------|
| **KnowledgeDistiller** | Extracts principles from confirmed hypotheses |
| **MemoryPalace** | Knowledge graph with BFS pathfinding and connection building |
| **ResearchJournal** | Logs all discoveries, experiments, breakthroughs |
| **ConceptAbstraction** | Abstract concept formation from concrete observations |

#### Action & Self-Improvement

| Engine | Description |
|--------|-------------|
| **SelfModificationEngine** | Scans own code, generates improvements via Claude API, tests before applying |
| **GoalEngine** | Goal planning with progress tracking and forecasting |
| **AdaptiveStrategy** | Adjusts strategies based on outcomes, reverts if performance drops |
| **MetaCognitionLayer** | Engine performance grading (A-F), frequency adjustment |
| **EvolutionEngine** | Genetic algorithm — tournament selection, crossover, mutation, elitism |
| **ReasoningEngine** | Forward chaining, abductive reasoning, temporal inference, counterfactuals |
| **EmotionalModel** | 8 emotion dimensions, 6 moods, mood-based behavior recommendations |
| **NarrativeEngine** | Brain explains itself in natural language, finds contradictions |
| **TransferEngine** | Cross-brain knowledge transfer, analogies, cross-domain rules |

### Research Missions

| Module | Description |
|--------|-------------|
| **ResearchMissionEngine** | 5-phase autonomous web research pipeline |
| **Web Research Chain** | Brave Search + Jina Reader + Playwright + Firecrawl fallback |
| **Phase Pipeline** | Decompose → Gather → Hypothesize → Analyze → Synthesize |

### Notifications

| Module | Description |
|--------|-------------|
| **NotificationService** | Multi-provider notification routing |
| **Discord Provider** | Webhook-based Discord notifications |
| **Telegram Provider** | Bot API Telegram notifications |
| **Email Provider** | SMTP email notifications |
| **Notification Bridge** | IPC-based cross-brain notification relay |

### Dashboards

| Dashboard | Port | Description |
|-----------|------|-------------|
| **Command Center** | 7790 | 13-page ecosystem dashboard: Overview, Entity, Learning, Trading, Marketing, Intelligence, Cross-Brain, Activity, Debates, Desires, Forge, Infrastructure, Progress |

### Cross-Brain & Ecosystem

| Module | Description |
|--------|-------------|
| **CrossBrainClient** | Discover and query peer brains over IPC |
| **CrossBrainNotifier** | Push event notifications to peers |
| **CrossBrainCorrelator** | Correlate events across brains |
| **BorgSyncEngine** | Collective knowledge synchronization between all brains |
| **EcosystemService** | Aggregated status, health score 0–100, analytics |
| **WatchdogService** | Process monitoring, auto-restart, health checks |
| **PluginRegistry** | Community plugin loading, lifecycle hooks, MCP tools, IPC routes |
| **WindowsServiceManager** | NSSM/SC.exe service install/uninstall/status |
| **CheckpointManager** | Workflow state save/load/resume/fork with crash recovery |
| **TraceCollector** | Hierarchical traces with spans, P50/P99 latency, cost tracking |
| **AgentTrainer** | Benchmark suites, scenario-based training, performance grading |
| **ToolScopeManager** | Context-aware dynamic tool filtering per task |
| **PluginMarketplace** | Plugin discovery, rating, and installation |
| **CodeSandbox** | Docker-isolated code execution for safe experimentation |
| **MessagingInput** | Bidirectional Telegram + Discord bots for remote control |
| **ChatEngine** | Natural language interface with NLU intent routing + IPC dispatch |
| **SubAgentFactory** | Specialized sub-agent creation for focused tasks |
| **FeedbackRouter** | Dead-end data routing to ActionBridge proposals |
| **StrategyMutator** | Strategy evolution: mutation, crossover, tournament selection |
| **CrossBrainSignalRouter** | Bidirectional cross-brain signal routing with confidence filtering |
| **AutoPublisher** | Autonomous content publishing with schedule optimization |
| **EngineRegistry** | Formal engine profiles (reads/writes/emits/subscribes, risk class, invariants) |
| **RuntimeInfluenceTracker** | Before/after metric snapshots per engine step, observed influence graph |
| **LoopDetector** | 4 anti-pattern detectors: retrigger spirals, stagnation, KPI gaming, epistemic drift |
| **GovernanceLayer** | Active engine control: throttle, cooldown, isolate, escalate, restore with auto-review |

### Utilities

| Module | Description |
|--------|-------------|
| **DB Connection** | SQLite (better-sqlite3) with WAL mode, foreign keys, caching |
| **Logger** | Winston-based structured logging with file rotation |
| **CLI Colors** | Shared color palette, formatting helpers |
| **Embedding Engine** | Local vector embeddings with @huggingface/transformers |
| **Webhook / Export / Backup** | HMAC webhooks, JSON/CSV export, SQLite backups |

## Installation

```bash
npm install @timmeck/brain-core
```

## Usage

### Building a new Brain

```typescript
import {
  createConnection, IpcServer, startMcpServer,
  ResearchOrchestrator, DreamEngine, ThoughtStream,
  CommandCenterServer, LLMService,
} from '@timmeck/brain-core';

// 1. Database
const db = createConnection('~/.my-brain/my-brain.db');

// 2. LLM Service (multi-provider)
const llm = new LLMService(db, {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  ollamaBaseUrl: 'http://localhost:11434',
});

// 3. Research Orchestrator (117+ engines, 51-step feedback cycle)
const orchestrator = new ResearchOrchestrator(db, { brainName: 'my-brain' });
orchestrator.start();

// 4. Command Center Dashboard
const dashboard = new CommandCenterServer({
  port: 7790,
  selfName: 'my-brain',
  crossBrain, ecosystemService, correlator,
  thoughtStream: orchestrator.thoughtStream,
  getLLMStats: () => llm.getStats(),
});
dashboard.start();
```

## Brain Ecosystem

| Brain | Purpose | Ports |
|-------|---------|-------|
| [Brain](../brain) | Error memory, code intelligence, full autonomy & self-modification | 7777/7778/7790 |
| [Trading Brain](../trading-brain) | Adaptive trading intelligence with signal learning & paper trading | 7779/7780 |
| [Marketing Brain](../marketing-brain) | Content strategy, social engagement & cross-platform optimization | 7781/7782/7783 |
| **Brain Core** (this) | Shared infrastructure — 117+ engines | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
