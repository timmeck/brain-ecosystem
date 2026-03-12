// ── Browser Agent ──────────────────────────────────────────
//
// Autonomer Browser-Agent inspiriert von OpenBrowser (ntegrals).
//
// Kern-Pattern: LLM-gesteuerter Feedback-Loop
//   1. analyzePage() → Page-State (DOM, Links, Forms, Text)
//   2. LLM entscheidet nächste Action(s) basierend auf State + Task
//   3. executeAction() → Ergebnis
//   4. Observe → Stall Detection → Loop oder Done
//
// Sicherheit: Domain-Whitelist/Blacklist, Step-Limit, Failure-Threshold,
//             Stall Detection, Timeout, Max-Pages.

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────

export interface BrowserAgentConfig {
  /** Max steps per task. Default: 25 */
  maxSteps?: number;
  /** Max consecutive failures before abort. Default: 5 */
  failureThreshold?: number;
  /** Page timeout in ms. Default: 30_000 */
  pageTimeoutMs?: number;
  /** Allowed domains (empty = all allowed). Default: [] */
  allowedDomains?: string[];
  /** Blocked domains. Default: common ad/tracking domains */
  blockedDomains?: string[];
  /** Max concurrent pages. Default: 3 */
  maxPages?: number;
  /** Screenshot on each step for LLM context. Default: false */
  screenshotEachStep?: boolean;
  /** Max actions the LLM can return per step. Default: 5 */
  actionsPerStep?: number;
  /** Stall detection: max URL repeats before declaring stall. Default: 3 */
  maxUrlRepeats?: number;
}

export type BrowserActionType =
  | 'navigate' | 'click' | 'fill' | 'select' | 'scroll_down' | 'scroll_up'
  | 'wait' | 'screenshot' | 'extract' | 'back' | 'evaluate' | 'done' | 'fail';

export interface BrowserAction {
  type: BrowserActionType;
  selector?: string;
  value?: string;
  url?: string;
  script?: string;
  description?: string;
  /** For 'extract': key to store extracted data under */
  extractKey?: string;
  /** For 'done'/'fail': final message */
  message?: string;
}

export interface BrowserStepResult {
  step: number;
  actions: BrowserAction[];
  results: ActionResult[];
  pageState?: PageState;
  stallDetected: boolean;
  durationMs: number;
}

export interface ActionResult {
  action: BrowserAction;
  success: boolean;
  url?: string;
  error?: string;
  extractedText?: string;
  screenshot?: string;  // base64
  durationMs: number;
}

export interface BrowserTaskResult {
  taskId: string;
  status: 'completed' | 'failed' | 'aborted' | 'stalled';
  steps: BrowserStepResult[];
  extractedData: Record<string, string>;
  screenshots: string[];
  totalTokensUsed: number;
  consecutiveFailures: number;
  error?: string;
  finalMessage?: string;
  durationMs: number;
}

export interface DOMElement {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  href?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

export interface PageState {
  url: string;
  title: string;
  interactiveElements: DOMElement[];
  links: DOMElement[];
  forms: Array<{ action?: string; method?: string; fields: DOMElement[] }>;
  textContent: string;
  headings: Array<{ level: number; text: string }>;
}

export interface BrowserAgentStatus {
  activeTasks: number;
  completedTasks: number;
  stalledTasks: number;
  totalSteps: number;
  totalTokensUsed: number;
  pagesOpen: number;
  browserConnected: boolean;
}

// ── LLM Planner Interface ─────────────────────────────────
// Injected — no hard dependency on LLMService.

export interface BrowserActionPlanner {
  /**
   * Given the current task, page state, and step history,
   * return the next action(s) to execute.
   * Return a 'done' or 'fail' action to end the task.
   */
  planNextActions(context: PlannerContext): Promise<PlannerResult>;
}

export interface PlannerContext {
  task: string;
  currentStep: number;
  maxSteps: number;
  pageState: PageState;
  previousSteps: Array<{ step: number; actions: string[]; results: string[]; url: string }>;
  extractedData: Record<string, string>;
  consecutiveFailures: number;
}

export interface PlannerResult {
  actions: BrowserAction[];
  reasoning?: string;
  tokensUsed?: number;
}

// ── Stall Detector ────────────────────────────────────────

export class StallDetector {
  private readonly maxRepeats: number;
  private urlHistory: string[] = [];
  private actionHistory: string[] = [];

  constructor(maxRepeats = 3) {
    this.maxRepeats = maxRepeats;
  }

  record(url: string, actions: string[]): void {
    this.urlHistory.push(url);
    this.actionHistory.push(actions.join(','));
  }

  isStalled(): boolean {
    // Check URL repetition
    if (this.urlHistory.length >= this.maxRepeats) {
      const recent = this.urlHistory.slice(-this.maxRepeats);
      if (recent.every(u => u === recent[0])) {
        // Same URL N times — check if actions also repeat
        const recentActions = this.actionHistory.slice(-this.maxRepeats);
        if (recentActions.every(a => a === recentActions[0])) {
          return true;  // Same URL + same actions = stalled
        }
      }
    }

    // Check action pattern repetition (ABAB or ABCABC)
    if (this.actionHistory.length >= 4) {
      const last4 = this.actionHistory.slice(-4);
      if (last4[0] === last4[2] && last4[1] === last4[3]) {
        return true;  // ABAB pattern
      }
    }

    return false;
  }

  reset(): void {
    this.urlHistory = [];
    this.actionHistory = [];
  }
}

// ── Migration ─────────────────────────────────────────────

export function runBrowserAgentMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_agent_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      step INTEGER NOT NULL DEFAULT 0,
      action_type TEXT NOT NULL,
      url TEXT,
      selector TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      error TEXT,
      duration_ms INTEGER,
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_browser_log_task ON browser_agent_log(task_id);
  `);
}

// ── Default blocked domains ───────────────────────────────

const DEFAULT_BLOCKED_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'facebook.com/tr', 'analytics.google.com', 'pixel.facebook.com',
];

// ── Default LLM Planner (JSON-based) ─────────────────────
// Parses LLM response as JSON array of actions.
// Can be replaced with a real LLM planner via setPlanner().

export function parseLLMActions(text: string): BrowserAction[] {
  // Try to extract JSON array from LLM response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // Single action fallback
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return [JSON.parse(objMatch[0]) as BrowserAction];
      } catch { /* parse failed */ }
    }
    return [{ type: 'fail', message: 'Could not parse LLM response as actions' }];
  }

  try {
    const actions = JSON.parse(jsonMatch[0]) as BrowserAction[];
    if (!Array.isArray(actions)) return [{ type: 'fail', message: 'Expected array of actions' }];
    return actions;
  } catch {
    return [{ type: 'fail', message: 'Invalid JSON in LLM response' }];
  }
}

/** Build the system prompt for the browser agent LLM. */
export function buildBrowserSystemPrompt(): string {
  return `You are an autonomous browser agent. You navigate web pages to complete tasks.

AVAILABLE ACTIONS (return as JSON array):
- {"type":"navigate","url":"https://..."} — Go to URL
- {"type":"click","selector":"CSS selector"} — Click element
- {"type":"fill","selector":"CSS selector","value":"text"} — Type into input
- {"type":"select","selector":"CSS selector","value":"option"} — Select dropdown
- {"type":"scroll_down"} — Scroll down one viewport
- {"type":"scroll_up"} — Scroll up one viewport
- {"type":"back"} — Go back one page
- {"type":"wait","value":"1000"} — Wait ms
- {"type":"extract","selector":"CSS selector","extractKey":"name"} — Extract text content
- {"type":"screenshot"} — Take screenshot
- {"type":"evaluate","script":"JS code"} — Run JavaScript
- {"type":"done","message":"result summary"} — Task completed successfully
- {"type":"fail","message":"reason"} — Task cannot be completed

RULES:
1. Return a JSON array of 1-5 actions to execute in sequence
2. Use CSS selectors that are specific (prefer #id, [name=...], [aria-label=...])
3. After extracting data, use "done" with a summary
4. If stuck after 3+ attempts, use "fail" with explanation
5. Never navigate to domains not in the current task context
6. Prefer efficient paths — minimize unnecessary clicks

EXAMPLE RESPONSE:
[{"type":"navigate","url":"https://example.com"},{"type":"click","selector":"#search-input"},{"type":"fill","selector":"#search-input","value":"test query"}]`;
}

/** Build the user prompt for each step. */
export function buildStepPrompt(context: PlannerContext): string {
  const parts: string[] = [];
  parts.push(`TASK: ${context.task}`);
  parts.push(`STEP: ${context.currentStep}/${context.maxSteps}`);
  parts.push(`URL: ${context.pageState.url}`);
  parts.push(`TITLE: ${context.pageState.title}`);

  if (context.consecutiveFailures > 0) {
    parts.push(`WARNING: ${context.consecutiveFailures} consecutive failures. Try a different approach.`);
  }

  // Headings
  if (context.pageState.headings.length > 0) {
    parts.push('\nHEADINGS:');
    for (const h of context.pageState.headings.slice(0, 10)) {
      parts.push(`  ${'#'.repeat(h.level)} ${h.text}`);
    }
  }

  // Interactive elements
  if (context.pageState.interactiveElements.length > 0) {
    parts.push('\nINTERACTIVE ELEMENTS:');
    for (const el of context.pageState.interactiveElements.slice(0, 30)) {
      const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : el.ariaLabel ? `[aria-label="${el.ariaLabel}"]` : `${el.tag}${el.classes ? '.' + el.classes[0] : ''}`;
      const label = el.text || el.placeholder || el.ariaLabel || el.type || '';
      parts.push(`  [${el.tag}] ${selector} — "${label.slice(0, 60)}"`);
    }
  }

  // Links
  if (context.pageState.links.length > 0) {
    parts.push('\nLINKS:');
    for (const link of context.pageState.links.slice(0, 15)) {
      parts.push(`  "${(link.text ?? '').slice(0, 50)}" → ${link.href}`);
    }
  }

  // Forms
  if (context.pageState.forms.length > 0) {
    parts.push('\nFORMS:');
    for (const form of context.pageState.forms) {
      const fieldNames = form.fields.map(f => f.name || f.id || f.type || 'unknown').join(', ');
      parts.push(`  <form action="${form.action ?? ''}"> fields: ${fieldNames}`);
    }
  }

  // Text content (truncated)
  if (context.pageState.textContent.length > 0) {
    parts.push(`\nPAGE TEXT (truncated):\n${context.pageState.textContent.slice(0, 2000)}`);
  }

  // Previous steps summary
  if (context.previousSteps.length > 0) {
    parts.push('\nPREVIOUS STEPS:');
    for (const s of context.previousSteps.slice(-5)) {
      parts.push(`  Step ${s.step}: ${s.actions.join(' → ')} [${s.results.join(', ')}] @ ${s.url}`);
    }
  }

  // Extracted data so far
  const extractedKeys = Object.keys(context.extractedData);
  if (extractedKeys.length > 0) {
    parts.push('\nEXTRACTED DATA:');
    for (const key of extractedKeys) {
      parts.push(`  ${key}: ${context.extractedData[key]!.slice(0, 200)}`);
    }
  }

  parts.push('\nReturn your next action(s) as a JSON array:');
  return parts.join('\n');
}

// ── Agent ─────────────────────────────────────────────────

export class BrowserAgent {
  private readonly db: Database.Database;
  private readonly config: Required<BrowserAgentConfig>;
  private readonly log = getLogger();
  private browser: unknown = null;
  private planner: BrowserActionPlanner | null = null;
  private activeTasks = 0;
  private completedTasks = 0;
  private stalledTasks = 0;
  private totalSteps = 0;
  private totalTokensUsed = 0;
  private openPages = 0;

  // Prepared statements
  private readonly stmtLogAction;

  constructor(db: Database.Database, config: BrowserAgentConfig = {}) {
    this.db = db;
    this.config = {
      maxSteps: config.maxSteps ?? 25,
      failureThreshold: config.failureThreshold ?? 5,
      pageTimeoutMs: config.pageTimeoutMs ?? 30_000,
      allowedDomains: config.allowedDomains ?? [],
      blockedDomains: config.blockedDomains ?? DEFAULT_BLOCKED_DOMAINS,
      maxPages: config.maxPages ?? 3,
      screenshotEachStep: config.screenshotEachStep ?? false,
      actionsPerStep: config.actionsPerStep ?? 5,
      maxUrlRepeats: config.maxUrlRepeats ?? 3,
    };

    runBrowserAgentMigration(db);

    this.stmtLogAction = db.prepare(
      'INSERT INTO browser_agent_log (task_id, step, action_type, url, selector, success, error, duration_ms, tokens_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
  }

  // ── Setters ────────────────────────────────────────────

  /** Set the LLM planner for autonomous action selection. */
  setPlanner(planner: BrowserActionPlanner): void {
    this.planner = planner;
  }

  // ── Domain Safety ────────────────────────────────────────

  /** Check if a URL is allowed by domain whitelist/blacklist. */
  isDomainAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Block check first
      if (this.config.blockedDomains.some(d => hostname.includes(d))) {
        return false;
      }

      // If whitelist is set, enforce it
      if (this.config.allowedDomains.length > 0) {
        return this.config.allowedDomains.some(d => hostname.includes(d));
      }

      return true;
    } catch {
      return false;
    }
  }

  // ── Browser Lifecycle ──────────────────────────────────────

  /** Get or launch the browser instance (lazy init). */
  private async getBrowser(): Promise<unknown> {
    if (this.browser) {
      try {
        const b = this.browser as { isConnected?: () => boolean };
        if (b.isConnected && !b.isConnected()) {
          this.browser = null;
        }
      } catch {
        this.browser = null;
      }
    }

    if (!this.browser) {
      try {
        const pwPath = 'playwright';
        const pw = await import(/* webpackIgnore: true */ pwPath);
        this.browser = await pw.chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
        this.log.info('[browser-agent] Browser launched');
      } catch (err) {
        this.log.error(`[browser-agent] Failed to launch browser: ${(err as Error).message}`);
        throw new Error('Playwright not available. Install: npx playwright install chromium');
      }
    }

    return this.browser;
  }

  /** Shutdown the browser. */
  async shutdown(): Promise<void> {
    if (this.browser) {
      try {
        await (this.browser as { close: () => Promise<void> }).close();
      } catch { /* best effort */ }
      this.browser = null;
      this.openPages = 0;
      this.log.info('[browser-agent] Browser shut down');
    }
  }

  // ── DOM Analysis ──────────────────────────────────────────

  /** Analyze the current page DOM to understand interactive elements. */
  async analyzePage(page: unknown): Promise<PageState> {
    const p = page as {
      url: () => string;
      title: () => Promise<string>;
      evaluate: <T>(fn: () => T) => Promise<T>;
    };

    const url = p.url();
    const title = await p.title();

    const analysis = await p.evaluate(() => {
      const result = {
        interactiveElements: [] as DOMElement[],
        links: [] as DOMElement[],
        forms: [] as Array<{ action?: string; method?: string; fields: DOMElement[] }>,
        textContent: '',
        headings: [] as Array<{ level: number; text: string }>,
      };

      // Interactive elements (buttons, inputs, selects)
      const interactive = document.querySelectorAll('button, input, select, textarea, [role="button"], [onclick]');
      for (const el of Array.from(interactive).slice(0, 50)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        result.interactiveElements.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          classes: el.className ? el.className.split(/\s+/).slice(0, 5) : undefined,
          text: (el.textContent ?? '').trim().slice(0, 100) || undefined,
          type: (el as HTMLInputElement).type || undefined,
          name: (el as HTMLInputElement).name || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }

      // Links
      const links = document.querySelectorAll('a[href]');
      for (const el of Array.from(links).slice(0, 30)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        result.links.push({
          tag: 'a',
          text: (el.textContent ?? '').trim().slice(0, 100) || undefined,
          href: (el as HTMLAnchorElement).href || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
        });
      }

      // Forms
      const forms = document.querySelectorAll('form');
      for (const form of Array.from(forms).slice(0, 5)) {
        const fields: DOMElement[] = [];
        for (const field of Array.from(form.querySelectorAll('input, select, textarea')).slice(0, 20)) {
          fields.push({
            tag: field.tagName.toLowerCase(),
            id: field.id || undefined,
            name: (field as HTMLInputElement).name || undefined,
            type: (field as HTMLInputElement).type || undefined,
            placeholder: (field as HTMLInputElement).placeholder || undefined,
          });
        }
        result.forms.push({
          action: form.action || undefined,
          method: form.method || undefined,
          fields,
        });
      }

      // Text content (cleaned)
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, nav, footer, header, aside, [role="navigation"]')
        .forEach(el => el.remove());
      result.textContent = (clone.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 5000);

      // Headings
      const headings = document.querySelectorAll('h1, h2, h3, h4');
      for (const h of Array.from(headings).slice(0, 20)) {
        const level = parseInt(h.tagName[1]!, 10);
        result.headings.push({ level, text: (h.textContent ?? '').trim().slice(0, 200) });
      }

      return result;
    });

    return { url, title, ...analysis };
  }

  // ── Action Execution ─────────────────────────────────────

  /** Execute a single browser action. */
  async executeAction(page: unknown, action: BrowserAction): Promise<ActionResult> {
    const start = Date.now();
    const p = page as {
      goto: (url: string, opts?: { timeout?: number; waitUntil?: string }) => Promise<void>;
      click: (selector: string, opts?: { timeout?: number }) => Promise<void>;
      fill: (selector: string, value: string) => Promise<void>;
      selectOption: (selector: string, value: string) => Promise<void>;
      evaluate: <T>(fn: string | (() => T)) => Promise<T>;
      goBack: () => Promise<void>;
      waitForTimeout: (ms: number) => Promise<void>;
      waitForSelector: (selector: string, opts?: { timeout?: number }) => Promise<void>;
      screenshot: (opts?: { fullPage?: boolean; type?: string }) => Promise<Buffer>;
      textContent: (selector: string) => Promise<string | null>;
      url: () => string;
    };

    try {
      switch (action.type) {
        case 'navigate': {
          if (!action.url) throw new Error('navigate requires url');
          if (!this.isDomainAllowed(action.url)) {
            throw new Error(`Domain not allowed: ${action.url}`);
          }
          await p.goto(action.url, { timeout: this.config.pageTimeoutMs, waitUntil: 'domcontentloaded' });
          break;
        }
        case 'click': {
          if (!action.selector) throw new Error('click requires selector');
          await p.waitForSelector(action.selector, { timeout: 5000 });
          await p.click(action.selector, { timeout: 5000 });
          break;
        }
        case 'fill': {
          if (!action.selector || action.value === undefined) throw new Error('fill requires selector + value');
          await p.fill(action.selector, action.value);
          break;
        }
        case 'select': {
          if (!action.selector || !action.value) throw new Error('select requires selector + value');
          await p.selectOption(action.selector, action.value);
          break;
        }
        case 'scroll_down': {
          await p.evaluate(() => window.scrollBy(0, window.innerHeight));
          break;
        }
        case 'scroll_up': {
          await p.evaluate(() => window.scrollBy(0, -window.innerHeight));
          break;
        }
        case 'wait': {
          const ms = parseInt(action.value ?? '1000', 10);
          await p.waitForTimeout(Math.min(ms, 10_000));
          break;
        }
        case 'screenshot': {
          const buf = await p.screenshot({ fullPage: action.value === 'full', type: 'png' });
          return {
            action, success: true, url: p.url(),
            screenshot: buf.toString('base64'),
            durationMs: Date.now() - start,
          };
        }
        case 'extract': {
          if (!action.selector) throw new Error('extract requires selector');
          await p.waitForSelector(action.selector, { timeout: 5000 });
          const text = await p.textContent(action.selector);
          return {
            action, success: true, url: p.url(),
            extractedText: (text ?? '').trim().slice(0, 5000),
            durationMs: Date.now() - start,
          };
        }
        case 'back': {
          await p.goBack();
          break;
        }
        case 'evaluate': {
          if (!action.script) throw new Error('evaluate requires script');
          await p.evaluate(action.script);
          break;
        }
        case 'done':
        case 'fail': {
          // Terminal actions — handled by loop, not executed
          return { action, success: true, url: p.url(), durationMs: Date.now() - start };
        }
      }

      let screenshot: string | undefined;
      if (this.config.screenshotEachStep) {
        const buf = await p.screenshot({ type: 'png' });
        screenshot = buf.toString('base64');
      }

      return { action, success: true, url: p.url(), screenshot, durationMs: Date.now() - start };
    } catch (err) {
      return {
        action, success: false, url: p.url?.() ?? undefined,
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  }

  // ── Scripted Task (pre-defined actions) ───────────────────

  /** Execute a pre-defined sequence of browser actions. No LLM needed. */
  async executeTask(taskId: string, actions: BrowserAction[]): Promise<BrowserTaskResult> {
    const start = Date.now();
    const steps: BrowserStepResult[] = [];
    const screenshots: string[] = [];
    const extractedData: Record<string, string> = {};
    let consecutiveFailures = 0;

    if (actions.length > this.config.maxSteps) {
      return {
        taskId, status: 'aborted', steps, screenshots, extractedData,
        totalTokensUsed: 0, consecutiveFailures: 0,
        error: `Too many steps: ${actions.length} > ${this.config.maxSteps}`,
        durationMs: Date.now() - start,
      };
    }

    if (this.openPages >= this.config.maxPages) {
      return {
        taskId, status: 'aborted', steps, screenshots, extractedData,
        totalTokensUsed: 0, consecutiveFailures: 0,
        error: `Max concurrent pages reached (${this.config.maxPages})`,
        durationMs: Date.now() - start,
      };
    }

    this.activeTasks++;
    let page: unknown = null;

    try {
      const browser = await this.getBrowser();
      const b = browser as { newPage: () => Promise<unknown> };
      page = await b.newPage();
      this.openPages++;

      const stepStart = Date.now();
      const actionResults: ActionResult[] = [];

      for (const action of actions) {
        const result = await this.executeAction(page, action);
        actionResults.push(result);
        this.totalSteps++;

        this.stmtLogAction.run(
          taskId, 0, action.type, result.url ?? null,
          action.selector ?? null, result.success ? 1 : 0,
          result.error ?? null, result.durationMs, 0,
        );

        if (result.screenshot) screenshots.push(result.screenshot);

        if (result.extractedText && action.extractKey) {
          extractedData[action.extractKey] = result.extractedText;
        }

        if (!result.success) {
          consecutiveFailures++;
          this.log.warn(`[browser-agent] Step failed: ${action.type} — ${result.error}`);
          if (action.type === 'navigate' || consecutiveFailures >= this.config.failureThreshold) {
            return {
              taskId, status: 'failed', steps, screenshots, extractedData,
              totalTokensUsed: 0, consecutiveFailures,
              error: result.error, durationMs: Date.now() - start,
            };
          }
        } else {
          consecutiveFailures = 0;
        }
      }

      steps.push({
        step: 0, actions, results: actionResults,
        stallDetected: false, durationMs: Date.now() - stepStart,
      });

      this.completedTasks++;
      return {
        taskId, status: 'completed', steps, screenshots, extractedData,
        totalTokensUsed: 0, consecutiveFailures,
        durationMs: Date.now() - start,
      };

    } catch (err) {
      return {
        taskId, status: 'failed', steps, screenshots, extractedData,
        totalTokensUsed: 0, consecutiveFailures,
        error: (err as Error).message, durationMs: Date.now() - start,
      };
    } finally {
      this.activeTasks--;
      if (page) {
        try { await (page as { close: () => Promise<void> }).close(); } catch { /* */ }
        this.openPages--;
      }
    }
  }

  // ── Autonomous Task (LLM-driven loop) ────────────────────

  /**
   * Execute a task autonomously using the LLM feedback loop.
   *
   * Loop:
   *   1. analyzePage() → Page State
   *   2. planner.planNextActions(context) → Actions
   *   3. Execute actions → Results
   *   4. Check for 'done'/'fail'/stall → End or loop
   */
  async runAutonomous(taskId: string, task: string): Promise<BrowserTaskResult> {
    const start = Date.now();
    const steps: BrowserStepResult[] = [];
    const screenshots: string[] = [];
    const extractedData: Record<string, string> = {};
    let totalTokensUsed = 0;
    let consecutiveFailures = 0;

    if (!this.planner) {
      return {
        taskId, status: 'aborted', steps, screenshots, extractedData,
        totalTokensUsed: 0, consecutiveFailures: 0,
        error: 'No planner set. Call setPlanner() with a BrowserActionPlanner.',
        durationMs: Date.now() - start,
      };
    }

    if (this.openPages >= this.config.maxPages) {
      return {
        taskId, status: 'aborted', steps, screenshots, extractedData,
        totalTokensUsed: 0, consecutiveFailures: 0,
        error: `Max concurrent pages reached (${this.config.maxPages})`,
        durationMs: Date.now() - start,
      };
    }

    this.activeTasks++;
    const stall = new StallDetector(this.config.maxUrlRepeats);
    let page: unknown = null;

    try {
      const browser = await this.getBrowser();
      const b = browser as { newPage: () => Promise<unknown> };
      page = await b.newPage();
      this.openPages++;

      const previousSteps: PlannerContext['previousSteps'] = [];

      for (let step = 1; step <= this.config.maxSteps; step++) {
        const stepStart = Date.now();

        // 1. Analyze page
        let pageState: PageState;
        try {
          pageState = await this.analyzePage(page);
        } catch {
          pageState = {
            url: 'about:blank', title: '', interactiveElements: [],
            links: [], forms: [], textContent: '', headings: [],
          };
        }

        // 2. Ask LLM for next actions
        const plannerContext: PlannerContext = {
          task,
          currentStep: step,
          maxSteps: this.config.maxSteps,
          pageState,
          previousSteps,
          extractedData,
          consecutiveFailures,
        };

        let planResult: PlannerResult;
        try {
          planResult = await this.planner.planNextActions(plannerContext);
        } catch (err) {
          this.log.error(`[browser-agent] Planner error: ${(err as Error).message}`);
          consecutiveFailures++;
          if (consecutiveFailures >= this.config.failureThreshold) {
            return {
              taskId, status: 'failed', steps, screenshots, extractedData,
              totalTokensUsed, consecutiveFailures,
              error: `Planner failed ${consecutiveFailures} times consecutively`,
              durationMs: Date.now() - start,
            };
          }
          continue;
        }

        if (planResult.tokensUsed) {
          totalTokensUsed += planResult.tokensUsed;
        }

        // Limit actions per step
        const actions = planResult.actions.slice(0, this.config.actionsPerStep);

        // 3. Check for terminal actions
        const doneAction = actions.find(a => a.type === 'done');
        if (doneAction) {
          steps.push({
            step, actions, results: [],
            pageState, stallDetected: false,
            durationMs: Date.now() - stepStart,
          });
          this.completedTasks++;
          return {
            taskId, status: 'completed', steps, screenshots, extractedData,
            totalTokensUsed, consecutiveFailures,
            finalMessage: doneAction.message,
            durationMs: Date.now() - start,
          };
        }

        const failAction = actions.find(a => a.type === 'fail');
        if (failAction) {
          steps.push({
            step, actions, results: [],
            pageState, stallDetected: false,
            durationMs: Date.now() - stepStart,
          });
          return {
            taskId, status: 'failed', steps, screenshots, extractedData,
            totalTokensUsed, consecutiveFailures,
            error: failAction.message ?? 'Agent decided task cannot be completed',
            durationMs: Date.now() - start,
          };
        }

        // 4. Execute actions
        const results: ActionResult[] = [];
        let stepFailed = false;

        for (const action of actions) {
          const result = await this.executeAction(page, action);
          results.push(result);
          this.totalSteps++;

          this.stmtLogAction.run(
            taskId, step, action.type, result.url ?? null,
            action.selector ?? null, result.success ? 1 : 0,
            result.error ?? null, result.durationMs, planResult.tokensUsed ?? 0,
          );

          if (result.screenshot) screenshots.push(result.screenshot);

          if (result.extractedText && action.extractKey) {
            extractedData[action.extractKey] = result.extractedText;
          }

          if (!result.success) {
            stepFailed = true;
          }
        }

        // Track failures
        if (stepFailed) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }

        // 5. Stall detection
        const currentUrl = (page as { url: () => string }).url();
        stall.record(currentUrl, actions.map(a => `${a.type}:${a.selector ?? a.url ?? ''}`));
        const isStalled = stall.isStalled();

        steps.push({
          step, actions, results, pageState,
          stallDetected: isStalled,
          durationMs: Date.now() - stepStart,
        });

        // Record for next planner call
        previousSteps.push({
          step,
          actions: actions.map(a => `${a.type}${a.selector ? '(' + a.selector + ')' : ''}${a.url ? '(' + a.url + ')' : ''}`),
          results: results.map(r => r.success ? 'ok' : `fail:${r.error?.slice(0, 50)}`),
          url: currentUrl,
        });

        if (isStalled) {
          this.stalledTasks++;
          this.log.warn(`[browser-agent] Stall detected at step ${step} — aborting task "${taskId}"`);
          return {
            taskId, status: 'stalled', steps, screenshots, extractedData,
            totalTokensUsed, consecutiveFailures,
            error: 'Agent is stuck in a loop (same URL + same actions repeated)',
            durationMs: Date.now() - start,
          };
        }

        // Failure threshold
        if (consecutiveFailures >= this.config.failureThreshold) {
          this.log.warn(`[browser-agent] Too many failures (${consecutiveFailures}) — aborting task "${taskId}"`);
          return {
            taskId, status: 'failed', steps, screenshots, extractedData,
            totalTokensUsed, consecutiveFailures,
            error: `${consecutiveFailures} consecutive step failures`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Step limit reached
      return {
        taskId, status: 'aborted', steps, screenshots, extractedData,
        totalTokensUsed, consecutiveFailures,
        error: `Step limit reached (${this.config.maxSteps})`,
        durationMs: Date.now() - start,
      };

    } catch (err) {
      return {
        taskId, status: 'failed', steps, screenshots, extractedData,
        totalTokensUsed, consecutiveFailures,
        error: (err as Error).message, durationMs: Date.now() - start,
      };
    } finally {
      this.activeTasks--;
      if (page) {
        try { await (page as { close: () => Promise<void> }).close(); } catch { /* */ }
        this.openPages--;
      }
    }
  }

  // ── Status ────────────────────────────────────────────────

  getStatus(): BrowserAgentStatus {
    let connected = false;
    if (this.browser) {
      try {
        const b = this.browser as { isConnected?: () => boolean };
        connected = b.isConnected?.() ?? true;
      } catch { /* not connected */ }
    }

    return {
      activeTasks: this.activeTasks,
      completedTasks: this.completedTasks,
      stalledTasks: this.stalledTasks,
      totalSteps: this.totalSteps,
      totalTokensUsed: this.totalTokensUsed,
      pagesOpen: this.openPages,
      browserConnected: connected,
    };
  }

  getConfig(): Readonly<Required<BrowserAgentConfig>> {
    return { ...this.config };
  }
}
