# Marketing Brain -- Self-Learning Marketing Intelligence

Marketing Brain is a self-learning MCP server for content strategy, engagement tracking, and campaign management. It provides 22 MCP tools for post tracking, pattern extraction, A/B testing, content calendars, and campaign analytics.

## Key Features

### Post Tracking

Every published post is stored with full context: platform, content, format, hashtags, URL, campaign association, and engagement metrics. Engagement can be updated over time as metrics change.

```bash
# Example: Report a published post via MCP
marketing_post_report(
  platform: "x",
  content: "Brain v1.0 is live! Self-learning error memory for Claude Code.",
  format: "text",
  url: "https://x.com/...",
  hashtags: "#AI,#MCP,#ClaudeCode",
  campaign: "Brain Launch"
)
```

### Campaign Management

Group posts into campaigns and track aggregate performance. Each campaign has a name, optional brand, goal, and platform. Campaign stats show total engagement, post count, and performance trends.

### Draft Checking

Before publishing a post, check it against learned marketing rules. Brain returns violations and recommendations based on patterns it has extracted from your past engagement data. This catches issues like:

- Content formats that underperform on specific platforms
- Missing hashtags that correlate with high engagement
- Posting at times that historically get low reach

### Template Library

High-performing post structures are automatically extracted as reusable templates. When creating new content, search templates by query or platform to find proven formats.

### Pattern Extraction

The learning engine analyzes your post history to discover engagement patterns:

- Which **platforms** get the best engagement
- Which **formats** (text, image, video, thread, article) perform best per platform
- Which **hashtags** correlate with high engagement
- What **posting times** get the most reach

Patterns are extracted automatically and surfaced as insights and rules.

### A/B Testing

Create structured A/B tests to compare two content variants. Record data points for each variant, and Brain tracks which variant performs better with statistical significance.

```bash
# Example: Create an A/B test via MCP
marketing_track_ab_test(
  name: "Thread vs Single Post",
  variant_a: "Single post with image",
  variant_b: "5-tweet thread with code examples",
  metric: "engagement"
)
```

### Content Calendar

Brain suggests optimal posting schedules based on learned timing patterns. It analyzes when your posts get the most engagement and recommends:

- The best time for your next post
- A weekly posting schedule optimized per platform
- Gap analysis showing platforms or times you are underusing

### Timing Patterns

Brain discovers the best and worst posting hours from your engagement data. Over time, it builds a map of when your audience is most active on each platform.

### Gap Analysis

Brain spots blind spots in your content strategy. For example: "You post on X 5 times per week but never on LinkedIn -- LinkedIn posts in your niche get 3x more engagement per post."

### Interactive Dashboard

A web-based dashboard with a neural canvas background, force-directed synapse graph visualization, and live SSE updates showing real-time brain activity. Available on port 7783.

## CLI Commands

```bash
# Lifecycle
marketing setup          # Configure MCP, hooks, start daemon
marketing start          # Start the daemon
marketing stop           # Stop the daemon
marketing status         # Show daemon status and stats
marketing doctor         # Diagnose issues

# Content
marketing post <platform>  # Report a published post
marketing campaign create <name>  # Create a new campaign
marketing campaign stats <id>     # Campaign performance stats
marketing suggest <topic>         # Get content suggestions

# Analysis
marketing insights       # Show active insights
marketing rules          # Show learned rules
marketing query <search> # Search posts and strategies
marketing network        # Show synapse network stats
marketing dashboard      # Open the web dashboard

# Data
marketing export         # Export database to JSON
marketing peers          # Show connected peer brains
```

## MCP Tools

Marketing Brain exposes 22 MCP tools. See the [Marketing MCP Tools Reference](/api/marketing) for full parameter details.

### Post Tools
- `marketing_post_draft` -- Check a draft against learned rules
- `marketing_post_report` -- Report a published post
- `marketing_post_engagement` -- Update engagement metrics
- `marketing_post_similar` -- Find similar posts via synapse network

### Campaign Tools
- `marketing_campaign_create` -- Create a new campaign
- `marketing_campaign_stats` -- Get campaign performance stats

### Strategy Tools
- `marketing_strategy_report` -- Report a successful strategy
- `marketing_strategy_suggest` -- Get strategy suggestions

### Content Tools
- `marketing_template_find` -- Find reusable content templates
- `marketing_rule_check` -- Check draft against marketing rules

### Analytics Tools
- `marketing_insight_list` -- List active insights
- `marketing_analytics_summary` -- Complete analytics overview
- `marketing_analytics_best` -- Top performing content

### Pattern & Testing Tools
- `marketing_extract_patterns` -- Run pattern extraction
- `marketing_track_ab_test` -- Create an A/B test
- `marketing_ab_test_result` -- Record A/B test data point
- `marketing_content_calendar` -- Get suggested posting schedule

### Memory & Session Tools
- `marketing_remember` -- Store a memory
- `marketing_recall` -- Search memories
- `marketing_session_start` -- Start a session
- `marketing_session_end` -- End a session
- `marketing_session_history` -- List past sessions

### Ecosystem Tools
- `marketing_ecosystem_status` -- Status of all brains
- `marketing_query_peer` -- Query another brain
- `marketing_cross_promote` -- Pull Brain insights as content ideas
- `marketing_trading_performance` -- Get trading stats for performance content

## Ports

| Service | Port | Protocol |
|---------|------|----------|
| REST API | 7781 | HTTP |
| MCP HTTP | 7782 | SSE |
| Dashboard | 7783 | HTTP + SSE |

## Data Location

By default, Marketing Brain stores its data in `~/.marketing-brain/`. Override with the `MARKETING_BRAIN_DATA_DIR` environment variable.
