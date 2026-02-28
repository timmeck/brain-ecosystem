# Cross-Brain Communication

When multiple brains are running, they discover each other at runtime and can exchange information through IPC (Inter-Process Communication). This page explains the cross-brain architecture, the IPC protocol, and how event subscriptions work.

## Architecture

Each brain runs as an independent daemon with its own SQLite database. Cross-brain communication happens through named pipes (Windows) or Unix domain sockets (Linux/macOS):

```
+--------+          IPC           +-----------+
|  Brain | <---named pipe--->     |  Trading  |
| :7777  |                        |  Brain    |
| :7778  | <---named pipe--->     |  :7779    |
+--------+                        |  :7780    |
    ^                              +-----------+
    |                                    ^
    |          IPC                       |
    +------named pipe------+             |
                            |            |
                       +--------------+  |
                       |  Marketing   |--+
                       |  Brain       |
                       |  :7781       |
                       |  :7782       |
                       |  :7783       |
                       +--------------+
```

Each brain knows the pipe names of all other brains in the ecosystem. When it needs to communicate, it opens a short-lived IPC connection, sends the request, receives the response, and disconnects.

## Peer Discovery

Brains discover each other through a hardcoded peer list in `CrossBrainClient`. The default peers are:

| Brain | Pipe Name |
|-------|-----------|
| `brain` | `brain` |
| `trading-brain` | `trading-brain` |
| `marketing-brain` | `marketing-brain` |

Each brain filters itself out of the peer list, so Brain only sees `trading-brain` and `marketing-brain` as peers.

To check which peers are online:

```bash
brain peers
trading peers
marketing peers
```

## IPC Protocol

The IPC protocol uses length-prefixed JSON frames:

1. **4 bytes**: Message length as a 32-bit unsigned integer (big-endian)
2. **N bytes**: JSON-encoded message body

Messages follow a simple request/response pattern:

```json
// Request
{
  "id": 1,
  "method": "analytics.summary",
  "params": {}
}

// Response
{
  "id": 1,
  "result": { "errors": { "total": 42 }, ... }
}

// Error response
{
  "id": 1,
  "error": { "code": -32601, "message": "Method not found" }
}
```

The protocol supports any JSON-serializable data. Connections have a configurable timeout (default: 3 seconds for cross-brain queries, preventing hangs if a peer is unresponsive).

## Querying Peers

### From MCP Tools

Each brain exposes MCP tools for querying peers:

```
brain_query_peer(peer: "trading-brain", method: "analytics.summary")
trading_query_peer(peer: "brain", method: "error.query", args: { search: "timeout" })
marketing_query_peer(peer: "brain", method: "research.insights", args: { activeOnly: true })
```

### Specialized Cross-Brain Tools

Some tools combine data from multiple brains:

- **`brain_error_trading_context`** -- Fetches an error from Brain, then queries Trading Brain for recent trades around that time. Useful for correlating API errors with failed trades.

- **`trading_error_context`** -- Queries Brain for errors matching a trading pair or search term. Useful for understanding why a trade might have failed due to infrastructure issues.

- **`marketing_cross_promote`** -- Pulls active research insights from Brain as potential content ideas. A new code pattern discovered by Brain could become a blog post.

- **`marketing_trading_performance`** -- Gets trading performance stats from Trading Brain for creating performance-related marketing content.

### Ecosystem Status

All three brains have an `*_ecosystem_status` tool that broadcasts a status query to all peers:

```bash
# From Claude Code:
brain_ecosystem_status
```

This returns the version, PID, uptime, and method count for each running brain.

## Event Subscriptions

Brains can subscribe to events from other brains. When something notable happens (a new error pattern is discovered, a trade streak is detected, a campaign reaches a milestone), the source brain pushes a notification to all subscribers.

### Event Flow

1. **Subscribe**: Brain subscribes to Trading Brain's `trade.streak` events.
2. **Event occurs**: Trading Brain detects a 5-win streak on BTC/USDT.
3. **Notify**: Trading Brain pushes a `CrossBrainEvent` to Brain:
   ```json
   {
     "source": "trading-brain",
     "event": "trade.streak",
     "data": { "pair": "BTC/USDT", "length": 5, "type": "win" },
     "timestamp": "2025-01-15T10:30:00Z"
   }
   ```
4. **Process**: Brain receives the event and stores it. It could create a memory, trigger a research insight, or strengthen relevant synapses.

### Subscription Management

Subscriptions are managed through IPC routes:

```
cross-brain.subscribe    -- Subscribe to an event type
cross-brain.unsubscribe  -- Unsubscribe from an event type
cross-brain.notify       -- Receive an event notification
```

The `CrossBrainSubscriptionManager` in `brain-core` handles subscription persistence and routing.

## Example: Error-Trade Correlation

Here is a concrete example of how cross-brain communication adds value:

1. Your trading bot makes an API call that fails with a timeout error.
2. Brain's PostToolUse hook catches the error and stores it.
3. The trading bot retries and the trade eventually executes, but at a worse price.
4. Trading Brain records the outcome as a loss.
5. You ask Claude Code: "Why did my BTC/USDT trade lose money?"
6. Claude Code calls `trading_error_context(pair: "BTC/USDT", search: "timeout")`.
7. Trading Brain queries Brain for matching errors and returns:
   - Error #87: "API timeout after 30s" (occurred 2 minutes before the trade)
   - Error #88: "Connection reset by peer" (occurred during the trade)
8. Claude Code correlates the timeline: the trade lost money because of API infrastructure issues, not because the signal was wrong.

This kind of cross-brain correlation would be impossible if each brain operated in isolation.

## Broadcasting

The `CrossBrainClient` supports broadcasting a query to all peers simultaneously:

```typescript
const results = await client.broadcast('analytics.summary', {});
// Returns: [{ name: 'trading-brain', result: {...} }, { name: 'marketing-brain', result: {...} }]
```

Peers that are offline are silently skipped. The broadcast completes when all online peers have responded (or timed out).
