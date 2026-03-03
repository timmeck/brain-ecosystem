# Marketing Brain

[![npm version](https://img.shields.io/npm/v/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain)
[![npm downloads](https://img.shields.io/npm/dm/@timmeck/marketing-brain)](https://www.npmjs.com/package/@timmeck/marketing-brain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)

**Self-Learning Marketing Intelligence System for Claude Code — 128 MCP Tools, 30+ Engines**

Marketing Brain is an MCP server that gives Claude Code a persistent marketing memory. It tracks every post you publish, learns what works across 6 platforms, and builds a Hebbian synapse network connecting posts, campaigns, strategies, templates, and insights. Over time, it learns your best-performing patterns, generates content drafts, schedules posts, analyzes competitors, and runs 30+ autonomous engines in a 40-step feedback cycle to discover engagement patterns, reason about causality, evolve strategies genetically, and improve itself.

## Quick Start

```bash
npm install -g @timmeck/marketing-brain
marketing setup
```

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

### 30+ Autonomous Engines
Same full engine suite as Brain, fed with post/engagement history via DataMiner:
- **Core Research** — SelfObserver, AnomalyDetective, CrossDomain, AdaptiveStrategy, ExperimentEngine, KnowledgeDistiller, ResearchAgenda, CounterfactualEngine, Journal
- **Intelligence** — AttentionEngine, TransferEngine, NarrativeEngine, CuriosityEngine, EmergenceEngine, DebateEngine, ReasoningEngine, EmotionalModel
- **Meta-Cognition** — ParameterRegistry, MetaCognitionLayer, AutoExperimentEngine, EvolutionEngine, GoalEngine, MemoryPalace
- **Autonomy** — SelfTestEngine, TeachEngine, DataScout, SimulationEngine, SelfScanner, SelfModificationEngine, BootstrapService
- **40-step feedback cycle** running every 5 minutes
- **DataMiner** bootstraps all historical posts and engagement data at startup

### Dream Mode & Consciousness
- **Dream Engine** — Offline consolidation: memory replay, synapse pruning, compression, importance decay
- **Mission Control Dashboard** — Unified dashboard at http://localhost:7788 (Consciousness Entity, Thoughts, Engines, Intelligence)
- **Prediction Engine** — Holt-Winters forecasting for engagement rates and post performance
- **AutoResponder** — Automatically adjusts marketing parameters when anomalies detected
- **Self-Improvement Loop** — Generates improvement suggestions
- **ReasoningEngine** — Forward chaining, abductive reasoning, temporal inference
- **EmotionalModel** — 8 emotion dimensions, 6 moods, mood-based recommendations
- **EvolutionEngine** — Genetic algorithm for parameter optimization

### Memory & Sessions
- **Persistent Memory** — Preferences, decisions, context, facts, goals, lessons
- **Session Tracking** — Conversation goals, summaries, outcomes
- **Synapse-Wired** — Memories and sessions connect to the Hebbian network

### Dashboards

| Dashboard | Port | What It Shows |
|-----------|------|--------------|
| **Marketing Dashboard** | 7783 | Interactive synapse graph, platform charts, top posts, insights |
| **Mission Control** | 7788 | Unified 7-tab dashboard: Overview, Consciousness (Entity visualization), Thoughts, CodeGen, Self-Mod, Engines, Intelligence |

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

**Dream**: marketing_dream_status, marketing_dream_consolidate, marketing_dream_history

**Consciousness**: marketing_consciousness_status, marketing_consciousness_thoughts

**Prediction**: marketing_predict, marketing_prediction_accuracy, marketing_predictions_list

**AutoResponder**: marketing_responder_status, marketing_responder_history, marketing_responder_rules

**Attention**: marketing_focus_status, marketing_focus_set, marketing_focus_history

**Transfer**: marketing_transfer_status, marketing_transfer_analogies, marketing_transfer_rules

**Narrative**: marketing_explain, marketing_ask, marketing_weekly_digest, marketing_contradictions

**Curiosity**: marketing_curiosity_status, marketing_curiosity_gaps, marketing_curiosity_questions, marketing_curiosity_explore

**Emergence**: marketing_emergence_status, marketing_emergence_detect, marketing_emergence_complexity_metrics, marketing_emergence_journal

**Debate**: marketing_debate_start, marketing_debate_synthesize, marketing_debate_perspective, marketing_debate_history

**MetaCognition**: marketing_metacognition_status, marketing_engine_report, marketing_auto_experiment_status, marketing_parameter_registry

**SelfAware**: marketing_selftest_run, marketing_selftest_results, marketing_teach_status, marketing_teach_create, marketing_datascout_status, marketing_datascout_scan, marketing_simulation_run, marketing_simulation_results, marketing_simulation_scenarios, marketing_palace_status, marketing_palace_map, marketing_palace_path, marketing_palace_build, marketing_goal_status, marketing_goal_create, marketing_goal_progress

**Evolution**: marketing_evolution_status, marketing_evolution_history, marketing_evolution_best, marketing_evolution_run

**Reasoning**: marketing_reasoning_status, marketing_reason, marketing_explain_why, marketing_what_if

**Emotions**: marketing_emotional_status, marketing_mood_history, marketing_mood_influences, marketing_mood_advice

**Self-Modification**: marketing_selfmod_status, marketing_selfmod_pending, marketing_selfmod_approve, marketing_selfmod_history

**Memory**: marketing_remember, marketing_recall, marketing_session_start, marketing_session_end, marketing_session_history

**Ecosystem**: marketing_status, marketing_ecosystem_status, marketing_query_peer, marketing_cross_promote, marketing_trading_performance

## CLI Commands

```
marketing setup                  One-command setup: MCP + daemon
marketing start / stop           Daemon management
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
| `MARKETING_BRAIN_API_KEY` | — | API authentication key |
| `MARKETING_BRAIN_MCP_HTTP_PORT` | `7782` | MCP HTTP/SSE port |

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

| Brain | Version | Purpose | Ports |
|-------|---------|---------|-------|
| [Brain](../brain) | v3.34.0 | Error memory, code intelligence, full autonomy & self-modification | 7777 / 7778 / 7788 |
| [Trading Brain](../trading-brain) | v2.29.0 | Adaptive trading intelligence with signal learning & backtesting | 7779 / 7780 |
| **Marketing Brain** | v1.30.0 | Content strategy, engagement & cross-platform optimization | **7781** / 7782 / 7783 |
| [Brain Core](../brain-core) | v2.34.0 | Shared infrastructure — 30+ engines | — |

## Support

[![Star this repo](https://img.shields.io/github/stars/timmeck/brain-ecosystem?style=social)](https://github.com/timmeck/brain-ecosystem)
[![Sponsor](https://img.shields.io/badge/Sponsor-Support%20Development-ea4aaa)](https://github.com/sponsors/timmeck)

## License

[MIT](LICENSE)
