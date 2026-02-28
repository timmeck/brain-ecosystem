# Trading Brain Setup

This example shows how to install and configure **Trading Brain** -- an adaptive trading intelligence system that learns from market signals, tracks prediction accuracy, and builds a Hebbian synapse network of correlated signals.

## What You Get

- Signal recording with outcome tracking (correct/incorrect predictions)
- Wilson Score confidence intervals for statistically robust accuracy metrics
- Adaptive calibration that adjusts confidence based on historical performance
- Signal fingerprinting for pattern recognition across markets
- Hebbian synapse network linking correlated signals
- Spreading activation for discovering non-obvious signal relationships
- Cross-brain communication with the core Brain (if installed)

## Prerequisites

- Node.js >= 20
- (Optional) Core Brain installed for cross-brain event sharing

## Quick Start

### Option 1: Run the Setup Script

```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

```bash
# Install Trading Brain globally
npm install -g @timmeck/trading-brain

# Run the setup wizard
trading setup

# Verify it is running
trading status
```

## After Setup

Restart Claude Code to load the Trading Brain MCP server. The daemon starts automatically when Claude Code connects.

## Available CLI Commands

```bash
trading daemon        # Start the background daemon
trading status        # Show daemon status and statistics
trading setup         # Run the setup wizard
trading mcp           # Start the MCP stdio server
trading dashboard     # Open the web dashboard
trading signals       # List recent signals
trading accuracy      # Show prediction accuracy report
trading synapses      # Show synapse network statistics
```

## MCP Tools Available in Claude Code

Once configured, Claude Code gains access to these trading-specific tools:

- `trading_record_signal` -- Record a new trading signal with metadata
- `trading_record_outcome` -- Record whether a signal's prediction was correct
- `trading_query_signals` -- Search for similar historical signals
- `trading_accuracy_report` -- Get accuracy statistics with confidence intervals
- `trading_explain_confidence` -- Understand why a signal has its confidence score
- `trading_synapse_graph` -- Visualize signal correlations

## Configuration

Trading Brain stores data in `~/.trading-brain/` by default. Customize with:

```bash
export TRADING_BRAIN_DATA_DIR=/path/to/custom/data
trading daemon
```
