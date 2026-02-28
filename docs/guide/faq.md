# FAQ

## How do I fix "daemon not running"?

If you see "daemon not running" when running `brain status` or when MCP tools fail:

**1. Start the daemon manually:**

```bash
brain start
```

**2. Check if the process is stuck:**

```bash
# Find any orphaned brain processes
# Windows:
tasklist | grep -i brain

# macOS/Linux:
ps aux | grep brain
```

Kill orphaned processes if found, then start again.

**3. Run doctor:**

```bash
brain doctor
```

This checks MCP registration, daemon health, database connectivity, and hook configuration. It will report what is wrong and suggest fixes.

**4. Check the logs:**

Logs are stored in your data directory:

```
~/.brain/logs/         # Brain
~/.trading-brain/logs/ # Trading Brain
~/.marketing-brain/logs/ # Marketing Brain
```

Look at the most recent log file for error messages.

## How do I reset the database?

::: warning
Resetting deletes all learned data -- errors, solutions, synapses, memories, sessions, decisions, and everything else. This cannot be undone.
:::

**Brain:**

```bash
brain stop
rm ~/.brain/brain.db
brain start
```

The database will be recreated with empty tables on the next start.

**Trading Brain:**

```bash
trading stop
rm ~/.trading-brain/trading-brain.db
trading start
```

Or use the MCP tool (which resets data but keeps the daemon running):

```
trading_reset(confirm: true)
```

**Marketing Brain:**

```bash
marketing stop
rm ~/.marketing-brain/marketing-brain.db
marketing start
```

## How do I update Brain?

```bash
npm update -g @timmeck/brain
brain stop
brain start
```

Database migrations run automatically on startup. Your data is preserved across updates.

For Trading Brain and Marketing Brain:

```bash
npm update -g @timmeck/trading-brain
npm update -g @timmeck/marketing-brain
trading stop && trading start
marketing stop && marketing start
```

## Can I use Brain with Cursor/Windsurf?

Yes. Brain supports MCP over HTTP with SSE transport, which is the protocol used by Cursor, Windsurf, Cline, and Continue.

**1. Make sure the daemon is running:**

```bash
brain start
```

**2. Add to your editor's MCP configuration:**

```json
{
  "brain": {
    "url": "http://localhost:7778/sse"
  }
}
```

For multiple brains:

```json
{
  "brain": { "url": "http://localhost:7778/sse" },
  "trading-brain": { "url": "http://localhost:7780/sse" },
  "marketing-brain": { "url": "http://localhost:7782/sse" }
}
```

The SSE (Server-Sent Events) transport works with any MCP-compatible editor. Claude Code uses stdio transport instead, which is configured automatically by `brain setup`.

## Where is the data stored?

Each brain stores its data in a directory in your home folder:

| Brain | Default Location | Override Variable |
|-------|-----------------|-------------------|
| Brain | `~/.brain/` | `BRAIN_DATA_DIR` |
| Trading Brain | `~/.trading-brain/` | `TRADING_BRAIN_DATA_DIR` |
| Marketing Brain | `~/.marketing-brain/` | `MARKETING_BRAIN_DATA_DIR` |

Each directory contains:

- `*.db` -- SQLite database (all knowledge, synapses, memories, etc.)
- `config.json` -- Optional configuration overrides
- `logs/` -- Rotating log files

To change the location, set the environment variable before running:

```bash
export BRAIN_DATA_DIR=/custom/path
brain start
```

## How do I fix hook issues?

Brain uses git hooks (specifically `PostToolUse`) to automatically catch errors in real-time. If hooks are not working:

**1. Re-run setup:**

```bash
brain setup
```

The setup wizard validates hook configuration and repairs it if needed.

**2. Check MCP registration:**

For Claude Code, check `~/.claude/claude_desktop_config.json` (or the equivalent for your OS) to verify Brain is registered as an MCP server.

**3. Verify the daemon is running:**

Hooks need the daemon to process errors. If the daemon is not running, hooks will silently fail:

```bash
brain status
```

**4. Check hook permissions:**

On macOS/Linux, make sure the hook scripts are executable:

```bash
chmod +x .git/hooks/post-*
```

## Can I run Brain on a server?

Yes. Use the Docker deployment:

```bash
docker-compose up -d
```

Connect your local editor to the server's MCP HTTP endpoints:

```json
{
  "brain": { "url": "http://your-server:7778/sse" }
}
```

See the [Docker guide](/guide/docker) for full details.

## How much disk space does Brain use?

Typical database sizes:

| Brain | Typical Size | Heavy Use |
|-------|-------------|-----------|
| Brain | 5-50 MB | 100-500 MB |
| Trading Brain | 2-20 MB | 50-200 MB |
| Marketing Brain | 2-20 MB | 50-200 MB |

The main driver of database size is the number of errors/trades/posts tracked and their associated synapse connections. Embedding vectors (used by Brain for semantic search) also contribute. The embedding model itself is downloaded on first use and is approximately 23 MB.

## How do I export my data?

Each brain supports JSON export:

```bash
brain export         # Exports to ~/.brain/export/
trading export       # Exports to ~/.trading-brain/export/
marketing export     # Exports to ~/.marketing-brain/export/
```

To import on another machine:

```bash
brain import /path/to/export/
```

## Does Brain send data to the cloud?

No. Brain runs entirely locally:

- **Database**: SQLite stored on your machine
- **Embeddings**: Local ONNX model (all-MiniLM-L6-v2), no API calls
- **MCP**: Communication stays between your editor and the local daemon
- **IPC**: Named pipes / Unix sockets, local only

No data leaves your machine unless you explicitly deploy to a server.

## How many errors/trades/posts can Brain handle?

Brain uses SQLite with WAL mode, which is fast for read-heavy workloads. Practical limits:

| Metric | Comfortable Range | Tested Up To |
|--------|------------------|-------------|
| Errors | 10,000+ | 50,000+ |
| Solutions | 5,000+ | 25,000+ |
| Synapses | 50,000+ | 200,000+ |
| Trades | 10,000+ | 100,000+ |
| Posts | 5,000+ | 50,000+ |
| Memories | 10,000+ | 100,000+ |

If you approach these limits, Brain will still work but learning cycles may take longer. The decay and pruning mechanisms help keep the network size manageable by removing unused synapses.

## Can multiple people share a Brain?

Brain is designed as a single-user tool. Each developer should run their own Brain instance. However:

- You can **export** data from one Brain and **import** it into another
- You can run Brain in a **Docker container** on a shared server and connect multiple editors
- Cross-project learning means individual Brains naturally share knowledge across projects

A multi-user mode with authentication is not currently supported but is being considered for future releases.
