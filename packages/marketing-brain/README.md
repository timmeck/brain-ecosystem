# Marketing Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Self-Learning Marketing Intelligence System for Claude Code — 142 MCP Tools, 72+ Engines**

Marketing Brain is an MCP server that gives Claude Code a persistent marketing memory. It tracks every post you publish, learns what works across 6 platforms, and builds a Hebbian synapse network connecting posts, campaigns, strategies, templates, and insights. Live social feeds from Bluesky + Reddit. Over time, it learns your best-performing patterns, generates content drafts, schedules posts, analyzes competitors, and runs 72+ autonomous engines in a 49-step feedback cycle to discover engagement patterns, reason about causality, evolve strategies genetically, and improve itself. Full intelligence suite: RAG, Knowledge Graph, feedback learning, tool tracking, user model, proactive suggestions. Multi-provider LLM (Anthropic + Ollama). 407 tests.

## Quick Start

```bash
npm install -g @timmeck/marketing-brain
marketing setup
```

That's it. One command configures MCP, hooks, and starts the daemon.

## Features

### Content Intelligence
- **Post Tracking** — Store posts with platform, format, hashtags, URL, and full engagement history
- **Campaign Management** — Group posts into campaigns, track aggregate performance
- **Draft Checking** — Check posts against learned rules before publishing
- **Template Library** — High-performing post structures become reusable templates
- **Timing Patterns** — Discovers best/worst posting hours from engagement data
- **Gap Analysis** — "You never post on LinkedIn — potential?"
- **Full-Text Search** — FTS5 indexes on posts, strategies, and templates

### Content Generation Pipeline
- **Draft from Patterns** — Generate drafts based on learned rules, patterns, and templates
- **Hashtag Suggestions** — Data-driven hashtag recommendations
- **Competitor Analysis** — Track and benchmark competitor engagement
- **A/B Testing** — Statistical significance tracking for content variants

### Scheduling & Cross-Platform
- **Scheduling Engine** — Post queue with optimal auto-timing based on learned patterns
- **Due Check + Webhooks** — Automated publish triggers
- **6 Platforms** — X, LinkedIn, Reddit, Bluesky, Mastodon, Threads
- **Thread Splitting** — Long content auto-split for thread-based platforms
- **Format Adaptation** — Optimize content for each platform's format

### Live Social Feeds
- **Bluesky** — Real-time feed from Bluesky AT Protocol
- **Reddit** — Subreddit monitoring and engagement tracking
- **Extensible** — Provider architecture for adding more platforms

### LLM Service
- **Multi-Provider** — Anthropic Claude + Ollama local models with auto-routing
- **Smart Caching** — Content-hash cache, avoid duplicate API calls
- **Rate Limiting** — Per-hour and per-day token budgets with automatic throttling
- **Usage Tracking** — Calls, tokens, latency, cache hit rate, cost tracking

### 72+ Autonomous Engines

The ResearchOrchestrator runs a 40-step feedback cycle every 5 minutes:

- **Observation** — SelfObserver, AnomalyDetective, DataScout, SignalScanner, TechRadar
- **Understanding** — AttentionEngine, CausalGraph, CrossDomain, PatternEngine
- **Ideas** — HypothesisEngine, CuriosityEngine, DreamEngine, DebateEngine
- **Testing** — ExperimentEngine, AutoExperiment, SimulationEngine, PredictionEngine
- **Knowledge** — KnowledgeDistiller, MemoryPalace, ResearchJournal, ConceptAbstraction
- **Action** — SelfModification, GoalEngine, AdaptiveStrategy, MetaCognition, Evolution, Reasoning, EmotionalModel

DataMiner bootstraps all historical posts and engagement data at startup.

### Dream Mode & Consciousness
- **Dream Engine** — Offline consolidation: memory replay, synapse pruning, compression, importance decay
- **Prediction Engine** — Holt-Winters forecasting for engagement rates and post performance
- **AutoResponder** — Automatically adjusts marketing parameters when anomalies detected
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
| **Marketing Dashboard** | 7783 | Interactive synapse graph, platform charts, top posts, insights |
| **Mission Control** | 7788 | 7-tab: Overview, Consciousness Entity, Thoughts, CodeGen, Self-Mod, Engines, Intelligence |
| **Command Center** | 7790 | 7-page: Ecosystem, Learning Pipeline, Trading Flow, Marketing Flow, Cross-Brain & Borg, Activity & Missions, Infrastructure |

### Memory & Sessions
- **Persistent Memory** — Preferences, decisions, context, facts, goals, lessons
- **Session Tracking** — Conversation goals, summaries, outcomes
- **Semantic Search** — Local all-MiniLM-L6-v2 embeddings (23MB, no cloud required)

### Universal Access
- **MCP Server** — Stdio transport for Claude Code
- **MCP HTTP/SSE** — For Cursor, Windsurf, Cline, Continue (port 7782)
- **REST API** — Full HTTP API on port 7781

## MCP Tools (128 tools)

**Content**: marketing_post_draft, marketing_post_report, marketing_post_engagement, marketing_post_similar, marketing_extract_patterns, marketing_content_calendar

**Campaigns**: marketing_campaign_create, marketing_campaign_stats

**Strategies & Templates**: marketing_strategy_report, marketing_strategy_suggest, marketing_template_find, marketing_rule_check

**Competitor**: marketing_competitor_track, marketing_competitor_analyze, marketing_competitor_compare

**Scheduling**: marketing_schedule_post, marketing_schedule_list, marketing_schedule_check

**Cross-Platform**: marketing_optimize_cross_platform, marketing_adapt_format, marketing_split_thread

**A/B Testing**: marketing_track_ab_test, marketing_ab_test_result

**Analytics**: marketing_analytics_summary, marketing_analytics_best, marketing_insight_list

**Research Engines** (5 tools each): self_observer, anomaly_detective, cross_domain, adaptive_strategy, experiment, knowledge_distiller, research_agenda, counterfactual, journal

**Dream, Consciousness, Prediction, AutoResponder, Attention, Transfer, Narrative, Curiosity, Emergence, Debate, MetaCognition, Evolution, Reasoning, Emotions, Self-Modification, Memory, Ecosystem** — full tool suites for each

## CLI Commands

```
marketing setup                  One-command setup: MCP + daemon
marketing start / stop           Daemon management (with watchdog)
marketing status                 Stats: posts, campaigns, synapses, insights
marketing doctor                 Health check
marketing post <platform> [url]  Report a published post
marketing campaign create <name> Create a campaign
marketing campaign list          List campaigns
marketing campaign stats <id>    Campaign performance
marketing insights               Research insights
marketing rules                  Learned marketing rules
marketing suggest <topic>        Content suggestions
marketing learn                  Trigger learning cycle
marketing query <search>         Search everything
marketing dashboard              Interactive HTML dashboard
marketing network                Synapse network
marketing export                 Export all data
marketing import <file>          Bulk import posts
marketing peers                  Peer brain status
marketing config                 Configuration management
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `MARKETING_BRAIN_DATA_DIR` | `~/.marketing-brain` | Data directory |
| `MARKETING_BRAIN_LOG_LEVEL` | `info` | Log level |
| `MARKETING_BRAIN_API_PORT` | `7781` | REST API port |
| `MARKETING_BRAIN_MCP_HTTP_PORT` | `7782` | MCP HTTP/SSE port |
| `ANTHROPIC_API_KEY` | — | Enables LLM features, CodeGen, Self-Mod |
| `BRAVE_SEARCH_API_KEY` | — | Enables web research missions |

## How It Learns

1. **Post Reported** — You publish a post and report it via CLI or MCP tool
2. **Engagement Tracked** — Likes, shares, impressions updated over time
3. **Synapses Form** — Post ↔ Campaign, Post ↔ Post (similar), Strategy ↔ Post connections
4. **Patterns Extracted** — Timing, format, platform patterns discovered by learning engine
5. **Rules Generated** — High-confidence patterns become rules with Wilson Score confidence
6. **Competitors Benchmarked** — Competitor data feeds into research engines
7. **Research Runs** — Trends, gaps, synergies surfaced as actionable insights
8. **Content Scheduled** — Optimal posting times learned from engagement data
9. **Predictions Form** — Holt-Winters forecasts engagement rates
10. **Auto-Response** — Anomalies trigger parameter adjustments

## Brain Ecosystem

| Brain | Purpose | Ports |
|-------|---------|-------|
| [Brain](../brain) | Error memory, code intelligence, full autonomy & self-modification | 7777 / 7778 / 7788 / 7790 |
| [Trading Brain](../trading-brain) | Adaptive trading intelligence with signal learning & paper trading | 7779 / 7780 |
| **Marketing Brain** (this) | Content strategy, social engagement & cross-platform optimization | **7781** / 7782 / 7783 |
| [Brain Core](../brain-core) | Shared infrastructure — 72+ engines | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
