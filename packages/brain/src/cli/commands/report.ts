import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Command } from 'commander';
import { withIpc } from '../ipc-helper.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultOutputPath(): string {
  return path.join(os.homedir(), '.brain', 'reports', `brain-report-${today()}.md`);
}

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try { return await p; } catch { return null; }
}

// ── Contract Violations ─────────────────────────────────

interface ContractViolation {
  source: string;
  field: string;
  expected: string;
  received: string;
  rejected: boolean;  // true = section not rendered, false = normalized and rendered
}

const reportWarnings: string[] = [];
const reportViolations: ContractViolation[] = [];

function violation(source: string, field: string, expected: string, received: unknown, rejected: boolean): void {
  const actualType = Array.isArray(received) ? 'array' : typeof received;
  reportViolations.push({ source, field, expected, received: actualType, rejected });
  const action = rejected ? 'REJECTED' : 'normalized';
  reportWarnings.push(`[report.${action}] ${source}.${field}: expected ${expected}, got ${actualType}`);
}

// ── Normalizers ─────────────────────────────────────────
// Each normalizer: raw data → clean typed shape | null
// null = section is unreliable and should not be rendered with data

interface NormalizedAnalytics { errors: number; solutions: number; rules: number; insights: number }

function normalizeAnalytics(raw: Any): NormalizedAnalytics | null {
  if (!raw || typeof raw !== 'object') return null;
  const extract = (field: string, subfield: string): number | null => {
    const v = raw[field];
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v[subfield] === 'number') return v[subfield];
    if (v != null) violation('analytics', field, `number|{${subfield}: number}`, v, false);
    return null;
  };
  const errors = extract('errors', 'total');
  const solutions = extract('solutions', 'total');
  const rules = extract('rules', 'active');
  const insights = extract('insights', 'active');
  // Need at least one valid metric to be useful
  if (errors == null && solutions == null && rules == null && insights == null) {
    violation('analytics', '*', 'at least one valid metric', raw, true);
    return null;
  }
  return { errors: errors ?? 0, solutions: solutions ?? 0, rules: rules ?? 0, insights: insights ?? 0 };
}

interface NormalizedHypothesisSummary { entries: Array<{ status: string; count: number }> }

function normalizeHypothesisSummary(raw: Any): NormalizedHypothesisSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const entries: Array<{ status: string; count: number }> = [];
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === 'number') {
      entries.push({ status: key, count: val });
    }
    // silently skip non-scalar (e.g. topConfirmed: Hypothesis[])
  }
  if (entries.length === 0) {
    violation('hypothesis', 'summary', 'object with scalar values', raw, true);
    return null;
  }
  return { entries };
}

interface NormalizedPredictSummary { total: number; correct: number; accuracyRate: number | null }

function normalizePredictSummary(raw: Any): NormalizedPredictSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const total = typeof raw.total_predictions === 'number' ? raw.total_predictions
    : typeof raw.total === 'number' ? raw.total : null;
  if (total == null) {
    violation('predict', 'summary.total', 'number', raw.total_predictions ?? raw.total, true);
    return null;
  }
  const correct = typeof raw.correct === 'number' ? raw.correct : 0;
  const accRate = typeof raw.accuracy_rate === 'number' ? raw.accuracy_rate
    : typeof raw.accuracy === 'number' ? raw.accuracy : null;
  return { total, correct, accuracyRate: accRate };
}

interface NormalizedPredictAccuracyItem { domain: string; total: number; correct: number; accuracyRate: number | null }

function normalizePredictAccuracy(raw: Any): NormalizedPredictAccuracyItem[] | null {
  if (!raw) return null;
  if (!Array.isArray(raw)) {
    // Try to salvage dict shape { domain: rate }
    if (typeof raw === 'object') {
      violation('predict', 'accuracy', 'array', raw, false);
      return Object.entries(raw).map(([domain, rate]) => ({
        domain, total: 0, correct: 0, accuracyRate: typeof rate === 'number' ? rate : null,
      }));
    }
    violation('predict', 'accuracy', 'array', raw, true);
    return null;
  }
  return raw.map((item: Any) => ({
    domain: item.domain ?? '?',
    total: typeof item.total === 'number' ? item.total : 0,
    correct: typeof item.correct === 'number' ? item.correct : 0,
    accuracyRate: typeof item.accuracy_rate === 'number' ? item.accuracy_rate : null,
  }));
}

interface NormalizedTransferStatus {
  totalTransfers: number; applied: number; rejected: number; avgEffectiveness: number | null;
}

function normalizeTransferStatus(raw: Any): NormalizedTransferStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const total = raw.totalTransfers ?? raw.total;
  if (typeof total !== 'number') {
    violation('transfer', 'status.totalTransfers', 'number', total, true);
    return null;
  }
  return {
    totalTransfers: total,
    applied: typeof raw.appliedTransfers === 'number' ? raw.appliedTransfers : (raw.successful ?? 0),
    rejected: typeof raw.rejectedTransfers === 'number' ? raw.rejectedTransfers : (raw.failed ?? 0),
    avgEffectiveness: typeof raw.avgEffectiveness === 'number' ? raw.avgEffectiveness : null,
  };
}

interface NormalizedJournalEntry { timestamp: string; text: string }

function normalizeJournalEntries(raw: Any): NormalizedJournalEntry[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((e: Any) => {
    const rawTs = e.timestamp ?? e.created_at ?? '';
    const ts = typeof rawTs === 'number' ? new Date(rawTs).toISOString().slice(0, 16) : String(rawTs);
    const text = e.title ?? e.content ?? e.description ?? JSON.stringify(e);
    return { timestamp: ts, text };
  });
}

export function renderMarkdown(data: Record<string, Any>): string {
  const lines: string[] = [];
  const ln = (s = '') => lines.push(s);
  reportWarnings.length = 0;
  reportViolations.length = 0;

  // --- Header ---
  ln(`# Brain Report — ${today()}`);
  ln();

  // --- 1. Executive Summary ---
  ln('## 1. Executive Summary');
  ln();
  const analytics = normalizeAnalytics(data.analytics);
  if (analytics) {
    ln(`| Metric | Count |`);
    ln(`|--------|-------|`);
    ln(`| Errors | ${analytics.errors} |`);
    ln(`| Solutions | ${analytics.solutions} |`);
    ln(`| Rules | ${analytics.rules} |`);
    ln(`| Insights | ${analytics.insights} |`);
  } else if (data.analytics) {
    ln('*Analytics data unreliable — unexpected shape from engine.*');
  } else {
    ln('*Analytics not available.*');
  }
  ln();

  // --- 2. What Brain Needs From You ---
  ln('## 2. What Brain Needs From You');
  ln();

  const desires: Any[] = Array.isArray(data.desires) ? data.desires : [];
  if (desires.length > 0) {
    ln('### Desires (by priority)');
    ln();
    for (const d of desires.sort((a: Any, b: Any) => (b.priority ?? 0) - (a.priority ?? 0))) {
      ln(`- **P${d.priority ?? '?'}** — ${d.suggestion ?? d.description ?? 'No description'}`);
      if (d.alternatives?.length > 0) {
        ln(`  - Alternative: ${d.alternatives[0]}`);
      }
    }
    ln();
  }

  const suggestions: string[] = Array.isArray(data.suggestions) ? data.suggestions : [];
  if (suggestions.length > 0) {
    ln('### Thought-Stream Suggestions');
    ln();
    for (const s of suggestions) {
      ln(`- ${s}`);
    }
    ln();
  }

  const pending: Any[] = Array.isArray(data.pending) ? data.pending : [];
  if (pending.length > 0) {
    ln('### Pending Self-Modifications');
    ln();
    for (const m of pending) {
      const risk = m.risk_level ? ` [${m.risk_level}]` : '';
      ln(`- **#${m.id}** ${m.title}${risk}`);
    }
    ln();
  }

  if (desires.length === 0 && suggestions.length === 0 && pending.length === 0) {
    ln('*No pending desires, suggestions, or self-modifications.*');
    ln();
  }

  // --- 3. Hypotheses ---
  ln('## 3. Hypotheses');
  ln();
  const hSummary = normalizeHypothesisSummary(data.hypothesisSummary);
  if (hSummary) {
    ln('### Status Overview');
    ln();
    ln(`| Status | Count |`);
    ln(`|--------|-------|`);
    for (const { status, count } of hSummary.entries) {
      ln(`| ${status} | ${count} |`);
    }
    ln();
  }

  const confirmed: Any[] = Array.isArray(data.confirmedHypotheses) ? data.confirmedHypotheses : [];
  if (confirmed.length > 0) {
    ln('### Confirmed');
    ln();
    for (const h of confirmed) {
      ln(`- **${h.statement ?? h.hypothesis ?? h.title ?? 'Untitled'}** (confidence: ${h.confidence ?? '?'})`);
    }
    ln();
  } else if (!hSummary) {
    ln('*Hypothesis engine not available.*');
    ln();
  }

  // --- 3b. Hypothesis Survival Metrics ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const survival = data.hypothesisSurvival as any;
  if (survival && typeof survival === 'object' && survival.totalRejected != null) {
    ln('### Survival Metrics');
    ln();
    const fmtMs = (ms: number | null): string => {
      if (ms == null) return '—';
      if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}min`;
      if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
      return `${(ms / 86_400_000).toFixed(1)}d`;
    };
    ln(`| Metric | Value |`);
    ln(`|--------|-------|`);
    ln(`| Median survival (rejected) | ${fmtMs(survival.medianSurvivalMs)} |`);
    ln(`| P90 survival (rejected) | ${fmtMs(survival.p90SurvivalMs)} |`);
    ln(`| Avg survival (rejected) | ${fmtMs(survival.avgRejectedSurvivalMs)} |`);
    ln(`| Longest confirmed survivor | ${fmtMs(survival.longestSurvivorMs)} |`);
    ln(`| Confirmed → Rejected (drift) | ${survival.confirmedThenRejected ?? 0} |`);
    ln(`| Rejections/day (velocity) | ${(survival.rejectionsPerDay ?? 0).toFixed(1)} |`);
    ln(`| Total rejected | ${survival.totalRejected ?? 0} |`);
    ln(`| Total confirmed alive | ${survival.totalConfirmedAlive ?? 0} |`);
    ln(`| Data span | ${(survival.dataSpanDays ?? 0).toFixed(1)} days |`);
    ln();
    if (survival.longestSurvivorStatement) {
      ln(`*Longest survivor:* "${(survival.longestSurvivorStatement as string).slice(0, 120)}"`);
      ln();
    }
  }

  // --- 4. Prediction Accuracy ---
  ln('## 4. Prediction Accuracy');
  ln();
  const pSummary = normalizePredictSummary(data.predictSummary);
  const pAccuracy = normalizePredictAccuracy(data.predictAccuracy);
  if (pSummary) {
    ln(`- Total predictions: ${pSummary.total}`);
    ln(`- Correct: ${pSummary.correct}`);
    ln(`- Accuracy: ${pSummary.accuracyRate != null ? (pSummary.accuracyRate * 100).toFixed(1) + '%' : '?'}`);
    ln();
  } else if (data.predictSummary) {
    ln('*Prediction summary data unreliable — unexpected shape from engine.*');
    ln();
  }
  if (pAccuracy && pAccuracy.length > 0) {
    ln('### By Domain');
    ln();
    ln(`| Domain | Total | Correct | Accuracy |`);
    ln(`|--------|-------|---------|----------|`);
    for (const item of pAccuracy) {
      const rate = item.accuracyRate != null ? (item.accuracyRate * 100).toFixed(1) + '%' : '?';
      ln(`| ${item.domain} | ${item.total} | ${item.correct} | ${rate} |`);
    }
    ln();
  }
  if (!pSummary && !pAccuracy && !data.predictSummary && !data.predictAccuracy) {
    ln('*Prediction engine not available.*');
    ln();
  }

  // --- 5. Research Journal ---
  ln('## 5. Research Journal');
  ln();
  const milestones: Any[] = Array.isArray(data.milestones) ? data.milestones : [];
  if (milestones.length > 0) {
    ln('### Milestones');
    ln();
    for (const m of milestones.slice(0, 10)) {
      ln(`- ${m.title ?? m.description ?? m.content ?? JSON.stringify(m)}`);
    }
    ln();
  }

  const journalEntries = normalizeJournalEntries(data.journalEntries);
  if (journalEntries && journalEntries.length > 0) {
    ln('### Recent Entries');
    ln();
    for (const e of journalEntries.slice(0, 10)) {
      ln(`- ${e.timestamp ? `[${e.timestamp}] ` : ''}${e.text}`);
    }
    ln();
  }

  if (milestones.length === 0 && (!journalEntries || journalEntries.length === 0)) {
    ln('*No journal entries available.*');
    ln();
  }

  // --- 6. Cross-Brain Transfers ---
  ln('## 6. Cross-Brain Transfers');
  ln();
  const tStatus = normalizeTransferStatus(data.transferStatus);
  if (tStatus) {
    ln(`- Total transfers: ${tStatus.totalTransfers}`);
    ln(`- Applied: ${tStatus.applied}`);
    ln(`- Rejected: ${tStatus.rejected}`);
    if (tStatus.avgEffectiveness != null) {
      ln(`- Avg effectiveness: ${(tStatus.avgEffectiveness * 100).toFixed(1)}%`);
    }
    ln();
  } else if (data.transferStatus) {
    ln('*Transfer status data unreliable — unexpected shape from engine.*');
    ln();
  }

  // Use recentTransfers from status if transferHistory is empty
  const rawTStatus = data.transferStatus;
  const tHistory: Any[] = Array.isArray(data.transferHistory) ? data.transferHistory
    : (Array.isArray(rawTStatus?.recentTransfers) ? rawTStatus.recentTransfers : []);
  if (tHistory.length > 0) {
    ln('### Recent Transfers');
    ln();
    for (const t of tHistory.slice(0, 10)) {
      const dir = t.direction ?? t.sourceDomain ?? '?';
      const peer = t.peer ?? t.target ?? t.targetDomain ?? '?';
      ln(`- ${dir} → ${peer}: ${t.itemCount ?? t.count ?? '?'} items (accepted: ${t.accepted ?? t.applied ?? '?'})`);
    }
    ln();
  }

  const borgStatus = data.borgStatus;
  if (borgStatus && typeof borgStatus === 'object') {
    ln('### BorgSync');
    ln();
    ln(`- Enabled: ${borgStatus.enabled ?? false}`);
    ln(`- Mode: ${borgStatus.mode ?? '?'}`);
    ln(`- Total syncs: ${borgStatus.totalSyncs ?? 0}`);
    ln(`- Sent: ${borgStatus.totalSent ?? 0}, Received: ${borgStatus.totalReceived ?? 0}`);
    ln();
  }

  if (!tStatus && tHistory.length === 0 && !borgStatus) {
    ln('*Transfer data not available.*');
    ln();
  }

  // --- 7. Auto-Experiments ---
  ln('## 7. Auto-Experiments');
  ln();
  const expStatus = data.experimentStatus;
  if (expStatus && typeof expStatus === 'object') {
    ln(`- Running: ${expStatus.running ?? 0}`);
    ln(`- Completed: ${expStatus.completed ?? 0}`);
    ln(`- Successful: ${expStatus.successful ?? 0}`);
  } else {
    ln('*Auto-experiment engine not available.*');
  }
  ln();

  // --- 8. Governance ---
  ln('## 8. Governance');
  ln();
  const gov = data.governanceStatus;
  if (gov && typeof gov === 'object') {
    if (gov.engines && Array.isArray(gov.engines)) {
      ln(`| Engine | Status | Throttle |`);
      ln(`|--------|--------|----------|`);
      for (const e of gov.engines) {
        ln(`| ${e.name ?? e.id ?? '?'} | ${e.status ?? '?'} | ${e.throttled ? 'YES' : 'no'} |`);
      }
    } else {
      ln(`- Active engines: ${gov.activeEngines ?? gov.total ?? '?'}`);
      ln(`- Throttled: ${gov.throttled ?? 0}`);
      ln(`- Isolated: ${gov.isolated ?? 0}`);
    }
  } else {
    ln('*Governance not available.*');
  }
  ln();

  // --- Data Quality ---
  const rejected = reportViolations.filter(v => v.rejected);
  const normalized = reportViolations.filter(v => !v.rejected);
  if (reportViolations.length > 0) {
    ln('## Data Quality');
    ln();
    if (rejected.length > 0) {
      ln(`**${rejected.length} section(s) rejected** due to unrecognized data shapes:`);
      for (const v of rejected) {
        ln(`- \`${v.source}.${v.field}\`: expected ${v.expected}, got ${v.received}`);
      }
      ln();
    }
    if (normalized.length > 0) {
      ln(`${normalized.length} field(s) normalized (non-standard but usable):`);
      for (const v of normalized) {
        ln(`- \`${v.source}.${v.field}\`: expected ${v.expected}, got ${v.received}`);
      }
      ln();
    }
  }

  ln('---');
  ln(`*Generated by \`brain report\` at ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/** Get warnings from the last renderMarkdown call (for testing). */
export function getReportWarnings(): string[] {
  return [...reportWarnings];
}

/** Get structured contract violations from the last renderMarkdown call (for testing). */
export function getReportViolations(): ContractViolation[] {
  return [...reportViolations];
}

export function reportCommand(): Command {
  const cmd = new Command('report')
    .description('Generate a Brain briefing report (Markdown)')
    .option('-o, --output <file>', 'Output file path')
    .option('--stdout', 'Print to terminal instead of file')
    .action(async (opts) => {
      await withIpc(async (client) => {
        // Gather all data in parallel with safe() wrapper
        const [
          analytics,
          desires,
          suggestions,
          pending,
          hypothesisSummary,
          confirmedHypotheses,
          milestones,
          journalEntries,
          predictSummary,
          predictAccuracy,
          transferStatus,
          transferHistory,
          borgStatus,
          experimentStatus,
          governanceStatus,
          hypothesisSurvival,
        ] = await Promise.all([
          safe(client.request('analytics.summary', {})),
          safe(client.request('desires.structured', {})),
          safe(client.request('desires.suggestions', {})),
          safe(client.request('selfmod.pending', {})),
          safe(client.request('hypothesis.summary', {})),
          safe(client.request('hypothesis.list', { status: 'confirmed' })),
          safe(client.request('journal.milestones', {})),
          safe(client.request('journal.entries', {})),
          safe(client.request('predict.summary', {})),
          safe(client.request('predict.accuracy', {})),
          safe(client.request('transfer.status', {})),
          safe(client.request('transfer.history', {})),
          safe(client.request('borg.status', {})),
          safe(client.request('autoexperiment.status', {})),
          safe(client.request('governance.status', {})),
          safe(client.request('hypothesis.survival', {})),
        ]);

        const data = {
          analytics,
          desires,
          suggestions,
          pending,
          hypothesisSummary,
          confirmedHypotheses,
          milestones,
          journalEntries,
          predictSummary,
          predictAccuracy,
          transferStatus,
          transferHistory,
          borgStatus,
          experimentStatus,
          governanceStatus,
          hypothesisSurvival,
        };

        const markdown = renderMarkdown(data);

        if (opts.stdout) {
          console.log(markdown);
          return;
        }

        const outputPath = opts.output ?? defaultOutputPath();
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, markdown, 'utf8');
        console.log(`Report written to ${outputPath}`);
      });
    });

  return cmd;
}
