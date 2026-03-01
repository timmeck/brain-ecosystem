# Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/brain)](https://www.npmjs.com/package/@timmeck/brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Autonomous Error Memory, Code Intelligence & Self-Improving Research System for Claude Code**

Brain is an MCP server that gives Claude Code a persistent, self-improving memory. It remembers errors, learns solutions, tracks code modules, and runs 9 autonomous research engines in feedback loops. It observes itself, detects anomalies, forms hypotheses, tests them statistically, distills confirmed knowledge into principles, and generates code using its accumulated wisdom. It even dreams — consolidating memories during idle periods like biological sleep.

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

### Autonomous Research (9 Engines)

The research orchestrator runs every 5 minutes, coordinating all engines in feedback loops:

| Engine | What It Does |
|--------|-------------|
| **SelfObserver** | Observes Brain's own performance and generates insights |
| **AnomalyDetective** | Detects statistical outliers using Z-scores |
| **CrossDomainEngine** | Finds correlations between events across brains |
| **AdaptiveStrategy** | Adjusts strategies, reverts if performance drops |
| **ExperimentEngine** | A/B tests on Brain's own parameters every 5 cycles |
| **KnowledgeDistiller** | Extracts principles from confirmed hypotheses (17+ distilled) |
| **ResearchAgenda** | Prioritizes what to research next |
| **CounterfactualEngine** | "What if" analysis for hypothetical interventions |
| **Journal** | Logs all discoveries, experiments, breakthroughs |

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

### Consciousness Dashboard (`:7784`)
- **Neural Graph** — Force-directed visualization of the synapse network (Canvas 2D physics)
- **Thought Stream** — Real-time feed of every engine's activity
- **Engine Status** — Live status cards for all 16 engines
- **Brain Insights** — Notable discoveries and breakthroughs
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
- **CodeGen Dashboard** — Web UI at http://localhost:7787 for reviewing and managing code generations
- **Signal Scanner** — Tracks GitHub trending repos, Hacker News mentions, crypto signals

### Dashboards

| Dashboard | Port | What It Shows |
|-----------|------|--------------|
| **Consciousness** | 7784 | Neural graph, thought stream, engine status |
| **CodeGen** | 7787 | Code generations, approve/reject, mined patterns |

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
  +------+------+------+------+------+
  |      |      |      |      |      |
Research Dream  Pred.  Auto   Code   Signal
Orch.   Engine Engine Respond Gen    Scanner
  |                                   |
  +-- 9 Engines in Feedback Loops ----+
         |
      SQLite (better-sqlite3, WAL mode)
```

## MCP Tools (69 tools)

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

**Ecosystem**: brain_status, brain_notifications, brain_ecosystem_status, brain_query_peer, brain_error_trading_context

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
| **Brain** | v3.19.0 | Error memory, code intelligence, autonomous research & code generation | **7777** / 7778 / 7784 / 7787 |
| [Trading Brain](../trading-brain) | v2.13.0 | Adaptive trading intelligence with signal learning & backtesting | 7779 / 7780 / 7785 |
| [Marketing Brain](../marketing-brain) | v1.14.0 | Content strategy, engagement & cross-platform optimization | 7781 / 7782 / 7783 / 7786 |
| [Brain Core](../brain-core) | v2.18.0 | Shared infrastructure (9 engines, synapses, IPC, MCP, dream, consciousness, codegen) | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
