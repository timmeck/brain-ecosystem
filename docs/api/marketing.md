# Marketing Brain MCP Tools Reference

Marketing Brain exposes 22 MCP tools through both stdio (Claude Code) and HTTP/SSE (Cursor, Windsurf, etc.) transports. All tools are prefixed with `marketing_`.

## Post Tools

### `marketing_post_draft`

Check a post draft against learned marketing rules before publishing. Returns violations and recommendations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The post content/text to check |
| `platform` | string | Yes | Target platform (`x`, `reddit`, `linkedin`, `bluesky`) |

**Returns**: List of rule violations with severity and recommendations for improvement.

---

### `marketing_post_report`

Report a published post to track in Marketing Brain. Stores content, platform, format, engagement history, and creates synapse connections.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | string | Yes | Platform (`x`, `reddit`, `linkedin`, `bluesky`) |
| `content` | string | Yes | Post content/text |
| `format` | string | No | Post format: `text`, `image`, `video`, `thread`, `article` (default: `text`) |
| `url` | string | No | Post URL |
| `hashtags` | string | No | Hashtags (comma-separated) |
| `campaign` | string | No | Campaign name (creates campaign if it does not exist) |

**Returns**: Post ID and synapse connections created.

---

### `marketing_post_engagement`

Update engagement metrics for a tracked post. Call this periodically to track how engagement changes over time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `post_id` | number | Yes | Post ID |
| `likes` | number | No | Current likes count |
| `comments` | number | No | Current comments count |
| `shares` | number | No | Current shares/retweets count |
| `impressions` | number | No | Current impressions count |
| `clicks` | number | No | Current clicks count |
| `saves` | number | No | Current saves/bookmarks count |
| `reach` | number | No | Current reach count |

**Returns**: Updated engagement totals.

---

### `marketing_post_similar`

Find posts similar to a given post using synapse network spreading activation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `post_id` | number | Yes | Post ID to find similar posts for |

**Returns**: List of similar posts with activation scores and content previews.

## Campaign Tools

### `marketing_campaign_create`

Create a new marketing campaign to group and track related posts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Campaign name |
| `brand` | string | No | Brand name (e.g., `REPOSIGNAL`, `Brain`) |
| `goal` | string | No | Campaign goal |
| `platform` | string | No | Primary platform |

**Returns**: Campaign ID.

---

### `marketing_campaign_stats`

Get performance statistics for a campaign including total engagement, post count, and trends.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `campaign_id` | number | Yes | Campaign ID |

**Returns**: Aggregate engagement metrics, post count, and performance trends.

## Strategy Tools

### `marketing_strategy_report`

Report a marketing strategy that worked. Brain will learn from it and suggest similar strategies in the future.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `description` | string | Yes | Strategy description |
| `approach` | string | No | Approach taken |
| `outcome` | string | No | Outcome/result |
| `post_id` | number | No | Related post ID |

**Returns**: Strategy ID and synapse connections created.

---

### `marketing_strategy_suggest`

Get strategy suggestions based on a topic or context. Searches past successful strategies and uses synapse activation to find related approaches.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Topic or context to search for |
| `limit` | number | No | Max results (default: 5) |

**Returns**: List of relevant strategies with descriptions and outcomes.

## Content Tools

### `marketing_template_find`

Find reusable content templates that match a query or platform. Templates are extracted from high-performing posts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Search query |
| `platform` | string | No | Filter by platform |
| `limit` | number | No | Max results |

**Returns**: List of templates with structure, platform, and performance data.

---

### `marketing_rule_check`

Check a post draft against all learned marketing rules. Returns violations and recommendations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | Post content to check |
| `platform` | string | Yes | Target platform |

**Returns**: List of rule matches with severity and recommendations.

## Analytics Tools

### `marketing_insight_list`

Get current active marketing insights (trends, gaps, synergies, optimizations).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by: `trend`, `gap`, `synergy`, `template`, `optimization` |
| `limit` | number | No | Max results |

**Returns**: List of insights with type, title, description, and priority.

---

### `marketing_analytics_summary`

Get a complete analytics summary: posts, campaigns, strategies, rules, insights, and network stats.

*No parameters.*

**Returns**: Comprehensive overview of all Marketing Brain metrics and statistics.

---

### `marketing_analytics_best`

Get top performing posts, best strategies, and platform-level engagement stats.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Max results per category |

**Returns**: Top posts by engagement, best strategies, and platform-level breakdowns.

## Pattern & Testing Tools

### `marketing_extract_patterns`

Extract engagement patterns from post history. Discovers what content performs best, on which platforms, in which formats, and at what times.

*No parameters.*

**Returns**: Extracted patterns with statistical significance and actionable recommendations.

---

### `marketing_track_ab_test`

Create a new A/B test to compare two content variants.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Test name |
| `variant_a` | string | Yes | Description of variant A |
| `variant_b` | string | Yes | Description of variant B |
| `metric` | string | No | Metric to track (default: `engagement`) |

**Returns**: A/B test ID and setup confirmation.

---

### `marketing_ab_test_result`

Record a data point for a running A/B test.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `test_id` | number | Yes | A/B test ID |
| `variant` | enum | Yes | Which variant: `a` or `b` |
| `metric_value` | number | Yes | The metric value to record |

**Returns**: Updated test statistics for both variants.

---

### `marketing_content_calendar`

Get AI-suggested posting schedule based on learned timing patterns.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | string | No | Filter schedule for a specific platform |

**Returns**: Suggested next post timing and weekly posting schedule optimized by platform.

## Memory & Session Tools

### `marketing_remember`

Store a memory -- preferences, decisions, context, facts, goals, or lessons learned from marketing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The memory content to store |
| `category` | enum | Yes | `preference`, `decision`, `context`, `fact`, `goal`, `lesson` |
| `key` | string | No | Unique key for upsert |
| `importance` | number | No | Importance 1-10 (default 5) |
| `tags` | string[] | No | Tags for organization |

**Returns**: Memory ID and superseded memory ID if applicable.

---

### `marketing_recall`

Search marketing memories by natural language query.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `category` | enum | No | Filter by category |
| `limit` | number | No | Max results (default 10) |

**Returns**: Matching memories sorted by relevance.

---

### `marketing_session_start`

Start a new marketing session. Track goals and context for the conversation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `goals` | string[] | No | Session goals |

**Returns**: Session ID.

---

### `marketing_session_end`

End a marketing session with a summary of what was accomplished.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | number | Yes | Session ID to end |
| `summary` | string | Yes | Summary of what was accomplished |
| `outcome` | enum | No | `completed`, `paused`, `abandoned` (default: `completed`) |

---

### `marketing_session_history`

List past marketing sessions with summaries and outcomes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | No | Max results (default 10) |

**Returns**: List of sessions with ID, outcome, summary, and timestamps.

## Ecosystem Tools

### `marketing_ecosystem_status`

Get status of all brains in the ecosystem (brain, trading-brain, marketing-brain).

*No parameters.*

**Returns**: Version, PID, uptime, and method count for each running brain.

---

### `marketing_query_peer`

Query another brain in the ecosystem. Call any method on brain or trading-brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `peer` | string | Yes | Peer brain name: `brain` or `trading-brain` |
| `method` | string | Yes | IPC method to call (e.g., `analytics.summary`, `trade.recent`) |
| `args` | object | No | Method arguments as key-value pairs |

**Returns**: Raw result from the peer brain.

---

### `marketing_cross_promote`

Get insights from Brain as content ideas. Fetches active research insights that could become marketing content.

*No parameters.*

**Returns**: Active research insights from Brain that can be turned into posts or articles.

---

### `marketing_trading_performance`

Get trading performance stats for performance-related content posts.

*No parameters.*

**Returns**: Trading Brain analytics summary for use in performance marketing content.
