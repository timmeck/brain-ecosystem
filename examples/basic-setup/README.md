# Basic Brain Setup

This example shows how to install and configure the core **Brain** package -- an adaptive error memory and code intelligence system for Claude Code.

## What You Get

- Automatic error tracking and pattern recognition
- Cross-project error matching with solution suggestions
- Hebbian synapse network that strengthens connections between related errors
- Code module analysis and antipattern detection
- Terminal command history with success/failure tracking

## Quick Start

### Option 1: Run the Setup Script

```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

```bash
# Install Brain globally
npm install -g @timmeck/brain

# Run the setup wizard (configures Claude Code MCP integration)
brain setup

# Verify everything is working
brain status
```

## After Setup

Restart Claude Code to pick up the new MCP server configuration. Brain will automatically start its daemon process when Claude Code launches.

## Verify It Works

Ask Claude Code to do something that might produce an error. Brain will automatically:

1. Capture the error
2. Search for matching errors in its database
3. Suggest solutions from previous resolutions

You can also check Brain's status at any time:

```bash
brain status
```

## Configuration

Brain stores its data in `~/.brain/` by default. You can customize this with the `BRAIN_DATA_DIR` environment variable:

```bash
export BRAIN_DATA_DIR=/path/to/custom/data
brain daemon
```

## Available CLI Commands

```bash
brain daemon          # Start the background daemon
brain status          # Show daemon status and statistics
brain setup           # Run the setup wizard
brain mcp             # Start the MCP stdio server (used by Claude Code)
brain dashboard       # Open the web dashboard
brain errors          # List recent errors
brain solutions       # List known solutions
brain synapses        # Show synapse network statistics
```
