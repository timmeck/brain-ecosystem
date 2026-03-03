# Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Autonomous Error Memory, Code Intelligence & Self-Improving AI for Claude Code — 134 MCP Tools, 30+ Engines**

Brain is an MCP server that gives Claude Code a persistent, self-improving memory. It remembers errors, learns solutions, and runs 30+ autonomous engines in a 40-step feedback cycle. It observes itself, detects anomalies, forms and tests hypotheses, distills principles, reasons in chains, feels emotions, evolves strategies genetically, debates itself, gets curious about knowledge gaps, and modifies its own source code. It dreams — consolidating memories during idle periods like biological sleep. 134 MCP tools. 2496 tests.

## Quick Start

```bash
npm install -g @timmeck/brain
brain setup
```

That's it. One command configures MCP, hooks, and starts the daemon.

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
- **Semantic Changelog** — Track what changed, why, and how it connects to errors and decisions
- **Task/Goal Tracking** — Manage tasks with priorities, subtasks, and full context aggregation
- **Semantic Search** — Local all-MiniLM-L6-v2 embeddings (23MB, no cloud required)

### 30+ Autonomous Engines

The ResearchOrchestrator runs a 40-step feedback cycle every 5 minutes, coordinating all engines:

#### Core Research (9 Engines)

| Engine | What It Does |
|--------|-------------|
| **SelfObserver** | Observes Brain's own performance and generates insights |
| **AnomalyDetective** | Detects statistical outliers using Z-scores and drift analysis |
| **CrossDomainEngine** | Finds correlations between events across brains |
| **AdaptiveStrategy** | Adjusts strategies, reverts if performance drops |
| **ExperimentEngine** | A/B tests on Brain's own parameters every 5 cycles |
| **KnowledgeDistiller** | Extracts principles from confirmed hypotheses |
| **ResearchAgenda** | Prioritizes what to research next |
| **CounterfactualEngine** | "What if" analysis for hypothetical interventions |
| **Journal** | Logs all discoveries, experiments, breakthroughs |

#### Intelligence & Awareness

| Engine | What It Does |
|--------|-------------|
| **AttentionEngine** | Dynamic focus, context detection, burst detection, engine weight allocation |
| **TransferEngine** | Cross-brain knowledge transfer, analogies, cross-domain rules |
| **NarrativeEngine** | Brain explains itself in natural language, finds contradictions, generates digests |
| **CuriosityEngine** | Knowledge gap detection, UCB1 explore/exploit, blind spot detection |
| **EmergenceEngine** | Emergent behavior detection, complexity metrics (entropy, phi), phase transitions |
| **DebateEngine** | Multi-agent debates, advocatus diaboli, consensus synthesis |
| **ReasoningEngine** | Forward chaining, abductive reasoning, temporal inference, counterfactuals |
| **EmotionalModel** | 8 emotion dimensions, 6 moods, mood-based behavior recommendations |

#### Meta-Cognition & Optimization

| Engine | What It Does |
|--------|-------------|
| **ParameterRegistry** | Central tunable parameter store with 30+ parameters, bounds, snapshots |
| **MetaCognitionLayer** | Engine performance grading (A-F), frequency adjustment |
| **AutoExperimentEngine** | Autonomous parameter tuning with snapshot/rollback |
| **EvolutionEngine** | Genetic algorithm — tournament selection, crossover, mutation, elitism |
| **GoalEngine** | Goal planning with progress tracking, linear regression forecasting |
| **MemoryPalace** | Knowledge graph with BFS pathfinding and auto-connection building |

#### Autonomy & Self-Improvement

| Engine | What It Does |
|--------|-------------|
| **SelfTestEngine** | Tests if brain truly understands its principles vs memorization |
| **TeachEngine** | Generates teaching packages for other brains |
| **DataScout** | External data acquisition from GitHub/npm/HN |
| **SimulationEngine** | What-if scenarios via CausalGraph + PredictionEngine |
| **SelfScanner** | Indexes own TypeScript source code with SHA256 change detection |
| **SelfModificationEngine** | Generates and tests code changes autonomously via Claude API |
| **BootstrapService** | Cold-start fix: seeds data so engines produce output from cycle 1 |

### Self-Improvement Loop
- **Hypothesis Engine** — Forms hypotheses from observed patterns, tests them statistically
- **Auto-Experiments** — Tests its own parameters (Z-Threshold, Decay Rate, Research Interval)
- **Self-Metrics** — Tracks own cycle data: anomaly_count, insight_count, cycle_duration_ms
- **Frustration Detection** — If a suggestion is ignored 3x, generates alternative approaches
- **Improvement Requests** — Writes "Tell Claude:" suggestions to `~/.brain/improvement-requests.md`
- **Knowledge Distillation** — Confirmed hypotheses become reusable principles

### Dream Mode
- **Memory Replay** — Spreading Activation strengthens active memory pathways
- **Synapse Pruning** — Weak connections (weight < 0.15) are deleted
- **Memory Compression** — Similar memories are clustered and merged
- **Importance Decay** — Old memories gradually lose importance, eventually archived
- **Triggers** — Every 20 cycles, after 5 minutes idle, or manually

### Mission Control Dashboard (`:7788`)
- **7 Tabs** — Overview, Neural Graph, Thoughts, CodeGen, Self-Mod, Engines, Intelligence
- **Neural Graph** — Force-directed visualization of the synapse network (Canvas 2D physics, zoom/pan/drag)
- **Thought Stream** — Real-time feed of every engine's activity with significance filtering
- **CodeGen** — Generate, review, approve/reject code with syntax highlighting
- **Self-Mod** — Pending modifications with side-by-side diff viewer
- **Engine Status** — Live status cards for all 30+ engines
- **Intelligence** — Attention topics, transfer analogies, cross-domain rules
- **Trigger Cycle** — Button to manually trigger a feedback cycle

### Prediction Engine
- **Holt-Winters** — Double Exponential Smoothing for metric forecasting
- **EWMA Fallback** — When insufficient data for Holt-Winters
- **Auto-Calibration** — Confidence calibrated against actual outcomes
- **Self-Resolving** — Predictions are checked against reality and scored

### AutoResponder
- **Anomaly Response** — Automatically adjusts parameters when anomalies are detected
- **Configurable Rules** — Define which anomalies trigger which actions
- **Cooldown System** — Prevents response storms
- **Journal Logging** — Every auto-response is logged for review

### Code Generation & Mining
- **CodeGenerator** — Claude API integration, uses brain knowledge (principles, anti-patterns, strategies, patterns) as context
- **Human-in-the-Loop** — Generated code is reviewed: approve or reject with notes
- **CodeMiner** — Mines GitHub repos (README, package.json, directory trees) for pattern learning
- **PatternExtractor** — Extracts dependency, tech stack, structure, and README patterns from mined repos
- **CodeGen Tab** — Integrated in Mission Control at http://localhost:7788 for reviewing and managing code generations
- **Signal Scanner** — Tracks GitHub trending repos, Hacker News mentions, crypto signals

### Dashboards

| Dashboard | Port | What It Shows |
|-----------|------|--------------|
| **Mission Control** | 7788 | Unified 7-tab dashboard: Overview, Neural Graph, Thoughts, CodeGen, Self-Mod, Engines, Intelligence |

## Architecture

```
Claude Code / Cursor / Browser
         |
    MCP / HTTP / REST
         |
    +----+----+
    | BrainCore|
    +----+----+
         |
  +------+------+------+------+------+
  |      |      |      |      |      |
Error  Code  Synapse Memory  Git  Embedding
Memory Intel Network System Intel Engine
  |      |      |      |      |      |
  +------+------+------+------+------+
         |
    ResearchOrchestrator (40 steps)
         |
  +------+------+------+------+------+------+------+
  |      |      |      |      |      |      |      |
Dream  Pred.  AutoR  Hypo.  CodeGen Signal Attention
Engine Engine espond Engine (Claude) Scanner Engine
  |      |      |      |      |      |      |      |
  +------+------+------+------+------+------+------+
         |
  30+ Engines in Feedback Loops
  (Research, Intelligence, MetaCog, Evolution,
   Reasoning, Emotions, Self-Modification, ...)
         |
      SQLite (better-sqlite3, WAL mode)
```

## MCP Tools (134 tools)

**Error & Code**: brain_report_error, brain_query_error, brain_report_solution, brain_report_attempt, brain_find_reusable_code, brain_register_code, brain_check_code_similarity

**Memory & Sessions**: brain_remember, brain_recall, brain_session_start, brain_session_end, brain_session_history

**Decisions, Changes, Tasks, Docs**: brain_record_decision, brain_query_decisions, brain_record_change, brain_query_changes, brain_add_task, brain_update_task, brain_list_tasks, brain_task_context, brain_index_project, brain_query_docs, brain_project_context

**Research & Learning**: brain_explore, brain_connections, brain_insights, brain_rate_insight, brain_suggest, brain_explain_learning, brain_override_rule, brain_get_suggestions

**9 Research Engines** (5 tools each): self_observer, anomaly_detective, cross_domain, adaptive_strategy, experiment, knowledge_distiller, research_agenda, counterfactual, journal — each with _status, _list, _get, _summary, _config

**Dream Mode**: brain_dream_status, brain_dream_consolidate, brain_dream_history

**Consciousness**: brain_consciousness_status, brain_consciousness_thoughts

**Prediction**: brain_predict, brain_prediction_accuracy, brain_predictions_list

**AutoResponder**: brain_responder_status, brain_responder_history, brain_responder_rules

**CodeGen**: brain_generate_code, brain_codegen_status, brain_codegen_review, brain_codeminer_status, brain_codeminer_patterns

**Attention**: brain_focus_status, brain_focus_set, brain_focus_history

**Transfer**: brain_transfer_status, brain_transfer_analogies, brain_transfer_rules

**Narrative**: brain_explain, brain_ask, brain_weekly_digest, brain_contradictions

**Curiosity**: brain_curiosity_status, brain_curiosity_gaps, brain_curiosity_questions, brain_curiosity_explore

**Emergence**: brain_emergence_status, brain_emergence_detect, brain_emergence_complexity_metrics, brain_emergence_journal

**Debate**: brain_debate_start, brain_debate_synthesize, brain_debate_perspective, brain_debate_history

**MetaCognition**: brain_metacognition_status, brain_engine_report, brain_auto_experiment_status, brain_parameter_registry

**SelfAware**: brain_selftest_run, brain_selftest_results, brain_teach_status, brain_teach_create, brain_datascout_status, brain_datascout_scan, brain_simulation_run, brain_simulation_results, brain_simulation_scenarios, brain_palace_status, brain_palace_map, brain_palace_path, brain_palace_build, brain_goal_status, brain_goal_create, brain_goal_progress

**Evolution**: brain_evolution_status, brain_evolution_history, brain_evolution_best, brain_evolution_run

**Reasoning**: brain_reasoning_status, brain_reason, brain_explain_why, brain_what_if

**Emotions**: brain_emotional_status, brain_mood_history, brain_mood_influences, brain_mood_advice

**Self-Modification**: brain_selfmod_status, brain_selfmod_pending, brain_selfmod_approve, brain_selfmod_history

**Ecosystem**: brain_status, brain_notifications, brain_ecosystem_status, brain_query_peer, brain_error_trading_context, brain_unified_status

## CLI Commands

```
brain setup              One-command setup: MCP + hooks + daemon
brain start              Start the Brain daemon
brain stop               Stop the daemon
brain status             Show stats
brain doctor             Health check: daemon, DB, MCP, hooks
brain query <text>       Search for errors and solutions
brain modules            List registered code modules
brain insights           Show research insights
brain network            Explore the synapse network
brain learn              Trigger a learning cycle
brain explain <id>       Full error report
brain rules              List active learned rules
brain synapses           Show strongest synapse connections
brain config             View and manage configuration
brain export             Export Brain data as JSON
brain import <dir>       Import a project directory
brain dashboard          Generate interactive HTML dashboard
brain peers              Show peer brains in the ecosystem
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `BRAIN_DATA_DIR` | `~/.brain` | Data directory |
| `BRAIN_LOG_LEVEL` | `info` | Log level |
| `BRAIN_API_PORT` | `7777` | REST API port |
| `BRAIN_API_KEY` | — | API authentication key |
| `BRAIN_MCP_HTTP_PORT` | `7778` | MCP HTTP/SSE port |
| `BRAIN_EMBEDDINGS_ENABLED` | `true` | Enable local embeddings |
| `ANTHROPIC_API_KEY` | — | Enables CodeGenerator + CodeGen Dashboard |
| `GITHUB_TOKEN` | — | Enables CodeMiner + Signal Scanner |

## Brain Ecosystem

| Brain | Version | Purpose | Ports |
|-------|---------|---------|-------|
| **Brain** | v3.34.0 | Error memory, code intelligence, full autonomy & self-modification | **7777** / 7778 / 7788 |
| [Trading Brain](../trading-brain) | v2.29.0 | Adaptive trading intelligence with signal learning & backtesting | 7779 / 7780 |
| [Marketing Brain](../marketing-brain) | v1.30.0 | Content strategy, engagement & cross-platform optimization | 7781 / 7782 / 7783 |
| [Brain Core](../brain-core) | v2.34.0 | Shared infrastructure — 30+ engines, synapses, IPC, MCP, dream, consciousness, codegen | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
