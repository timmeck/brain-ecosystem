#!/usr/bin/env node
/**
 * Verify ALL brain features are wired up and responding.
 * Queries each brain for its registered methods, then tests a representative sample.
 */
import { createConnection } from 'net';

function encode(msg) {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

let callId = 0;
function ipcCall(pipeName, method, params = {}, timeoutMs = 10000) {
  const id = String(++callId);
  return new Promise((resolve, reject) => {
    const client = createConnection(pipeName, () => {
      client.write(encode({ id, type: 'request', method, params }));
    });
    let buf = Buffer.alloc(0);
    client.on('data', c => {
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) return;
        const json = buf.subarray(4, 4 + len).toString('utf8');
        buf = buf.subarray(4 + len);
        const msg = JSON.parse(json);
        if (msg.id === id) {
          client.destroy();
          resolve(msg);
          return;
        }
      }
    });
    client.on('error', e => { client.destroy(); reject(e); });
    setTimeout(() => { client.destroy(); reject(new Error('timeout')); }, timeoutMs);
  });
}

// ── Helpers ─────────────────────────────────────────────

function errMsg(r) {
  if (!r.error) return null;
  if (typeof r.error === 'string') return r.error;
  if (r.error.message) return r.error.message;
  return JSON.stringify(r.error);
}

let pass = 0, fail = 0, skip = 0;

async function test(pipe, label, method, params = {}, validate) {
  try {
    const r = await ipcCall(pipe, method, params);
    const err = errMsg(r);
    if (err) {
      if (err.includes('not available') || err.includes('not configured') || err.includes('No embedding')) {
        skip++;
        return { status: 'skip', error: err };
      }
      console.log(`  \u2717  ${label}: ${err}`);
      fail++;
      return { status: 'fail', error: err };
    }
    if (validate) {
      const ok = validate(r.result);
      if (!ok) {
        console.log(`  \u2717  ${label}: validation failed \u2014 ${JSON.stringify(r.result).slice(0, 120)}`);
        fail++;
        return { status: 'fail', result: r.result };
      }
    }
    pass++;
    return { status: 'pass', result: r.result };
  } catch (e) {
    console.log(`  \u2717  ${label}: ${e.message}`);
    fail++;
    return { status: 'fail', error: e.message };
  }
}

const BRAIN = '\\\\.\\pipe\\brain';
const TRADING = '\\\\.\\pipe\\trading-brain';
const MARKETING = '\\\\.\\pipe\\marketing-brain';

async function testBrain(pipe, name) {
  console.log(`\n\u2550\u2550 ${name.toUpperCase()} \u2550${'═'.repeat(40 - name.length)}`);

  // Get status
  const status = await test(pipe, 'status', 'status', {}, r => r?.name);
  if (status.status !== 'pass') {
    console.log(`  \u2717 ${name} NOT REACHABLE - skipping`);
    return;
  }
  console.log(`  \u2713  status (${status.result.methods} methods, uptime ${Math.round(status.result.uptime)}s)`);

  // Brain-specific methods (only for main brain)
  const brainOnly = name === 'brain' ? [
    ['error.query', { limit: 1 }],
    ['solution.query', { errorId: 1 }],
    ['code.modules', { limit: 1 }],
    ['memory.stats', {}],
    ['memory.recall', { query: 'test', limit: 1 }],
    ['notification.pending', {}],
    ['goals.list', {}],
    ['watchdog.status', {}],
  ] : [];

  // Core feature groups to test - one representative method per namespace
  const tests = [
    ...brainOnly,
    // Shared core
    ['rule.list', {}],
    ['synapse.stats', {}],
    ['analytics.summary', {}],

    // Research engines
    ['research.status', {}],
    ['research.discoveries', { limit: 1 }],
    ['hypothesis.list', { limit: 1 }],
    ['experiment.list', { limit: 1 }],
    ['predict.summary', {}],
    ['observer.stats', {}],
    ['anomaly.detect', {}],
    ['strategy.status', {}],
    ['knowledge.summary', {}],
    ['agenda.list', { limit: 1 }],
    ['journal.entries', { limit: 1 }],
    ['curiosity.status', {}],

    // Consciousness & Meta
    ['consciousness.status', {}],
    ['consciousness.thoughts', { limit: 3 }],
    ['consciousness.engines', {}],
    ['engines.status', {}],
    ['dream.status', {}],
    ['attention.status', {}],
    ['narrative.contradictions', {}],
    ['emotional.status', {}],
    ['metacognition.status', {}],
    ['reasoning.status', {}],
    ['evolution.status', {}],
    ['emergence.status', {}],
    ['transfer.status', {}],
    ['concept.status', {}],
    ['palace.status', {}],
    ['selftest.status', {}],
    ['simulation.status', {}],
    ['teach.status', {}],

    // Cross-brain (brain-only for some)
    ...(name === 'brain' ? [
      ['ecosystem.status', {}],
      ['peer.status', {}],
      ['borg.status', {}],
      ['debate.list', { limit: 1 }],
      ['challenge.history', { limit: 1 }],
      ['crossdomain.correlations', { limit: 1 }],
      ['plugin.list', {}],
      // datascout has no IPC routes (internal engine)
      ['techradar.stats', {}],
      ['selfmod.list', {}],
      ['mission.list', {}],
      ['mission.status', {}],
    ] : []),

    // Infrastructure (shared)
    ['llm.status', {}],
    ['meta.status', {}],
    ['causal.stats', {}],
    ['counterfactual.history', { limit: 1 }],

    // Intelligence (Sessions 55-65) — currently brain-only
    ...(name === 'brain' ? [
      ['rag.status', {}],
      ['rag.search', { query: 'error', limit: 2 }],
      ['kg.query', { subject: 'error' }],
      ['kg.status', {}],
      ['kg.contradictions', {}],
      ['compression.stats', {}],
      ['feedback.stats', {}],
      ['feedback.record', { type: 'test', targetId: 999, signal: 'positive', detail: 'verify' }],
      ['toolTracker.stats', {}],
      ['toolTracker.recommend', { context: 'debugging' }],
      ['toolTracker.patterns', {}],
      ['proactive.suggestions', { limit: 5 }],
      ['proactive.status', {}],
      ['userModel.profile', {}],
      ['userModel.status', {}],
      ['codeHealth.status', {}],
      ['teaching.curriculum', {}],
      ['teaching.status', {}],
      ['consensus.history', {}],
      ['consensus.status', {}],
      ['activeLearning.gaps', { limit: 5 }],
      ['activeLearning.status', {}],
    ] : []),

    // Trading-specific
    ...(name === 'trading-brain' ? [
      ['trade.recent', { limit: 1 }],
      ['trade.count', {}],
      ['signal.weights', { signals: {}, regime: 'neutral' }],
      ['paper.status', {}],
      ['paper.portfolio', {}],
      ['paper.history', { limit: 1 }],
      ['calibration.get', {}],
      ['risk.metrics', { pair: 'BTC/USD' }],
      ['market.providers', {}],
    ] : []),

    // Marketing-specific
    ...(name === 'marketing-brain' ? [
      ['post.list', {}],
      ['post.stats', {}],
      ['campaign.list', {}],
      ['template.list', { limit: 1 }],
      ['competitor.list', {}],
      ['audience.list', {}],
    ] : []),
  ];

  const results = { pass: [], fail: [], skip: [] };

  for (const [method, params] of tests) {
    const r = await test(pipe, `${method}`, method, params);
    if (r.status === 'pass') results.pass.push(method);
    else if (r.status === 'skip') results.skip.push(method);
    else results.fail.push(method);
  }

  // Summary
  const skipped = results.skip.length > 0 ? ` (${results.skip.length} skipped: no service)` : '';
  console.log(`  \u2500\u2500 ${results.pass.length} passed, ${results.fail.length} failed${skipped}`);

  if (results.fail.length > 0) {
    console.log(`  Failed: ${results.fail.join(', ')}`);
  }
}

async function main() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  BRAIN ECOSYSTEM \u2014 FULL FEATURE VERIFICATION');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await testBrain(BRAIN, 'brain');
  await testBrain(TRADING, 'trading-brain');
  await testBrain(MARKETING, 'marketing-brain');

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`  TOTAL: ${pass} passed, ${fail} failed, ${skip} skipped`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
