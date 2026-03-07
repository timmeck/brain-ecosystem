import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { ResearchJournal } from '../research/journal.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';
import type { ExperimentEngine } from '../research/experiment-engine.js';
import type { AnomalyDetective } from '../research/anomaly-detective.js';
import type { AttentionEngine } from '../attention/attention-engine.js';
import type { TransferEngine } from '../transfer/transfer-engine.js';
import type { LLMService } from '../llm/llm-service.js';
import { createHash } from 'node:crypto';

// ── Types ────────────────────────────────────────────────

export interface NarrativeEngineConfig {
  brainName: string;
}

export interface NarrativeEngineDataSources {
  knowledgeDistiller?: KnowledgeDistiller;
  hypothesisEngine?: HypothesisEngine;
  journal?: ResearchJournal;
  predictionEngine?: PredictionEngine;
  experimentEngine?: ExperimentEngine;
  anomalyDetective?: AnomalyDetective;
  attentionEngine?: AttentionEngine;
  transferEngine?: TransferEngine;
}

export interface Narrative {
  topic: string;
  summary: string;
  details: string[];
  confidence: number;
  sources: string[];
  generatedAt: number;
}

export interface Contradiction {
  id: number;
  type: 'hypothesis_vs_antipattern' | 'principle_vs_principle' | 'hypothesis_vs_hypothesis' | 'prediction_vs_observation';
  statement_a: string;
  source_a: string;
  statement_b: string;
  source_b: string;
  tradeoff: string;
  severity: 'low' | 'medium' | 'high';
}

export interface WeeklyDigest {
  period: { from: string; to: string };
  summary: string;
  highlights: string[];
  principles_learned: number;
  hypotheses_tested: number;
  experiments_completed: number;
  anomalies_detected: number;
  predictions_accuracy: number;
  attention_focus: string;
  contradictions: number;
  transferScore: number;
  sections: DigestSection[];
  markdown: string;
  generatedAt: number;
}

export interface DigestSection {
  title: string;
  content: string;
}

export interface ConfidenceReport {
  topic: string;
  overallConfidence: number;
  factors: ConfidenceFactor[];
  uncertainties: string[];
  recommendation: string;
}

export interface ConfidenceFactor {
  source: string;
  confidence: number;
  description: string;
  sampleSize: number;
}

export interface NarrativeAnswer {
  question: string;
  answer: string;
  sources: string[];
  confidence: number;
  relatedTopics: string[];
}

// ── Engine ───────────────────────────────────────────────

export class NarrativeEngine {
  private brainName: string;
  private thoughtStream: ThoughtStream | null = null;
  private sources: NarrativeEngineDataSources = {};
  private llm: LLMService | null = null;
  private log = getLogger();

  constructor(private db: Database.Database, config: NarrativeEngineConfig) {
    this.brainName = config.brainName;

    // Create tables for storing generated narratives
    db.exec(`
      CREATE TABLE IF NOT EXISTS narrative_digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_from TEXT NOT NULL,
        period_to TEXT NOT NULL,
        markdown TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS narrative_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        topic TEXT,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  setDataSources(sources: NarrativeEngineDataSources): void {
    this.sources = sources;
  }

  setLLMService(llm: LLMService): void {
    this.llm = llm;
  }

  // ── Explain ────────────────────────────────────────────

  explain(topic: string): Narrative {
    this.thoughtStream?.emit('narrative', 'analyzing', `Explaining: "${topic}"`);

    // Gather context from all sources
    const { details, sources, avgConfidence, matchingPrinciples, matchingHypotheses, matchingAntiPatterns, matchingExperiments, journalEntries } = this.gatherContext(topic);

    // Try LLM synthesis if available, otherwise use heuristic summary
    let summary: string;
    if (details.length === 0) {
      summary = `No knowledge found about "${topic}". Brain has not yet observed enough data about this topic.`;
    } else if (this.llm?.isAvailable()) {
      // Fire-and-forget async LLM call — use cached sync version if available
      const contextBlock = details.join('\n');
      const llmPrompt = `Topic: "${topic}"\n\nKnowledge Base:\n${contextBlock}\n\nExplain what Brain knows about this topic. Synthesize across all sources into a coherent narrative.`;
      // We need sync behavior for backward compat — try cache first, then heuristic
      summary = this.tryLLMSync('explain', llmPrompt) ?? this.heuristicExplainSummary(topic, matchingPrinciples.length, matchingHypotheses.length, matchingAntiPatterns.length, matchingExperiments.length, journalEntries.length, avgConfidence);
    } else {
      summary = this.heuristicExplainSummary(topic, matchingPrinciples.length, matchingHypotheses.length, matchingAntiPatterns.length, matchingExperiments.length, journalEntries.length, avgConfidence);
    }

    this.thoughtStream?.emit('narrative', 'explaining', summary, details.length > 3 ? 'notable' : 'routine');
    this.logNarrative('explain', topic, summary);

    // Schedule async LLM enrichment for next call
    if (this.llm?.isAvailable() && details.length > 0) {
      const contextBlock = details.join('\n');
      const llmPrompt = `Topic: "${topic}"\n\nKnowledge Base:\n${contextBlock}\n\nExplain what Brain knows about this topic. Synthesize across all sources into a coherent narrative.`;
      void this.llm.call('explain', llmPrompt).catch(() => {});
    }

    return {
      topic,
      summary,
      details,
      confidence: avgConfidence,
      sources,
      generatedAt: Date.now(),
    };
  }

  /** Async version of explain() that waits for LLM response. */
  async explainAsync(topic: string): Promise<Narrative> {
    this.thoughtStream?.emit('narrative', 'analyzing', `Explaining (LLM): "${topic}"`);

    const { details, sources, avgConfidence, matchingPrinciples, matchingHypotheses, matchingAntiPatterns, matchingExperiments, journalEntries } = this.gatherContext(topic);

    let summary: string;
    if (details.length === 0) {
      summary = `No knowledge found about "${topic}". Brain has not yet observed enough data about this topic.`;
    } else if (this.llm?.isAvailable()) {
      const contextBlock = details.join('\n');
      const llmPrompt = `Topic: "${topic}"\n\nKnowledge Base:\n${contextBlock}\n\nExplain what Brain knows about this topic. Synthesize across all sources into a coherent narrative.`;
      const llmResult = await this.llm.call('explain', llmPrompt);
      summary = llmResult?.text ?? this.heuristicExplainSummary(topic, matchingPrinciples.length, matchingHypotheses.length, matchingAntiPatterns.length, matchingExperiments.length, journalEntries.length, avgConfidence);
    } else {
      summary = this.heuristicExplainSummary(topic, matchingPrinciples.length, matchingHypotheses.length, matchingAntiPatterns.length, matchingExperiments.length, journalEntries.length, avgConfidence);
    }

    this.thoughtStream?.emit('narrative', 'explaining', summary.substring(0, 200), details.length > 3 ? 'notable' : 'routine');
    this.logNarrative('explain', topic, summary);

    return { topic, summary, details, confidence: avgConfidence, sources, generatedAt: Date.now() };
  }

  private heuristicExplainSummary(topic: string, principleCount: number, hypothesisCount: number, apCount: number, expCount: number, journalCount: number, avgConfidence: number): string {
    return `About "${topic}": Found ${principleCount} principle(s), ${hypothesisCount} hypothesis/hypotheses, ${apCount} anti-pattern(s), ${expCount} experiment(s), and ${journalCount} journal entries. Overall confidence: ${(avgConfidence * 100).toFixed(0)}%.`;
  }

  private gatherContext(topic: string): {
    details: string[];
    sources: string[];
    avgConfidence: number;
    matchingPrinciples: unknown[];
    matchingHypotheses: unknown[];
    matchingAntiPatterns: unknown[];
    matchingExperiments: unknown[];
    journalEntries: unknown[];
  } {
    const details: string[] = [];
    const sources: string[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    // 1. Search principles
    const principles = this.sources.knowledgeDistiller?.getPrinciples(undefined, 50) ?? [];
    const matchingPrinciples = principles.filter(p => this.matches(p.statement, topic) || this.matches(p.domain, topic));
    for (const p of matchingPrinciples.slice(0, 5)) {
      details.push(`Principle (${(p.confidence * 100).toFixed(0)}% confident, ${p.sample_size} samples): ${p.statement}`);
      sources.push(`principle:${p.id}`);
      totalConfidence += p.confidence;
      confidenceCount++;
    }

    // 2. Search anti-patterns
    const antiPatterns = this.sources.knowledgeDistiller?.getAntiPatterns(undefined, 50) ?? [];
    const matchingAntiPatterns = antiPatterns.filter(a => this.matches(a.statement, topic) || this.matches(a.domain, topic));
    for (const a of matchingAntiPatterns.slice(0, 3)) {
      details.push(`Warning — Anti-Pattern (${(a.failure_rate * 100).toFixed(0)}% failure rate): ${a.statement}. Alternative: ${a.alternative}`);
      sources.push(`anti_pattern:${a.id}`);
      totalConfidence += a.confidence;
      confidenceCount++;
    }

    // 3. Search hypotheses
    const hypotheses = this.sources.hypothesisEngine?.list(undefined, 50) ?? [];
    const matchingHypotheses = hypotheses.filter(h => this.matches(h.statement, topic));
    for (const h of matchingHypotheses.slice(0, 5)) {
      const statusLabel = h.status === 'confirmed' ? 'Confirmed' : h.status === 'rejected' ? 'Rejected' : h.status === 'testing' ? 'Under test' : 'Proposed';
      details.push(`Hypothesis (${statusLabel}, p=${h.p_value.toFixed(3)}): ${h.statement}`);
      sources.push(`hypothesis:${h.id}`);
      totalConfidence += h.confidence;
      confidenceCount++;
    }

    // 4. Search journal entries
    const journalEntries = this.sources.journal?.search(topic, 10) ?? [];
    for (const j of journalEntries.slice(0, 3)) {
      details.push(`Journal [${j.significance}]: ${j.title} — ${j.content.substring(0, 120)}`);
      sources.push(`journal:${j.id}`);
    }

    // 5. Search experiments
    const experiments = this.sources.experimentEngine?.getResults(20) ?? [];
    const matchingExperiments = experiments.filter(e => this.matches(e.name, topic) || this.matches(e.hypothesis, topic));
    for (const e of matchingExperiments.slice(0, 3)) {
      const c = e.conclusion;
      if (c) {
        details.push(`Experiment "${e.name}": ${c.direction} effect (d=${c.effect_size.toFixed(2)}, p=${c.p_value.toFixed(3)}) → ${c.recommendation.replace(/_/g, ' ')}`);
        sources.push(`experiment:${e.id}`);
      }
    }

    // 6. Predictions
    const predictions = this.sources.predictionEngine?.list(undefined, undefined, 50) ?? [];
    const matchingPredictions = predictions.filter(p => this.matches(p.metric, topic) || this.matches(p.reasoning, topic));
    for (const p of matchingPredictions.slice(0, 3)) {
      details.push(`Prediction (${p.status}, ${(p.confidence * 100).toFixed(0)}% confident): ${p.metric} → ${p.predicted_direction} (${p.reasoning.substring(0, 80)})`);
      sources.push(`prediction:${p.prediction_id}`);
    }

    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return { details, sources, avgConfidence, matchingPrinciples, matchingHypotheses, matchingAntiPatterns, matchingExperiments, journalEntries };
  }

  /** Try to get LLM response from cache synchronously (fire-and-forget for warming). */
  private tryLLMSync(template: 'explain' | 'ask', prompt: string): string | null {
    // LLM is async — we can only check cache synchronously.
    // The actual call has been triggered in previous cycles, so cache may have it.
    // If not cached, return null and let the async path warm the cache.
    try {
      // Check if there's a cached response in the DB for a recent identical query
      const hash = this.hashPrompt(template, prompt);
      const row = this.db.prepare(
        "SELECT id FROM llm_usage WHERE prompt_hash = ? AND cached = 0 AND created_at > datetime('now', '-1 hour') LIMIT 1",
      ).get(hash) as { id: number } | undefined;
      if (row) {
        // There's been a recent call — the in-memory cache in LLMService may have it
        // We can't access it synchronously from here, so just return null
        // The async path will be used for enriched responses
      }
    } catch { /* best effort */ }
    return null;
  }

  private hashPrompt(template: string, prompt: string): string {
    return createHash('sha256').update(`${template}:${prompt}`).digest('hex');
  }

  // ── Ask ────────────────────────────────────────────────

  ask(question: string): NarrativeAnswer {
    this.thoughtStream?.emit('narrative', 'analyzing', `Answering: "${question}"`);

    const { answerParts, sources, relatedTopics, avgConfidence } = this.gatherAskContext(question);

    // Compose answer — try LLM for rich synthesis
    let answer: string;
    if (answerParts.length === 0) {
      answer = `I don't have enough data to answer "${question}" yet. This topic hasn't appeared in my observations, hypotheses, or principles.`;
    } else {
      answer = answerParts.join('\n\n');
    }

    // Schedule async LLM enrichment
    if (this.llm?.isAvailable() && answerParts.length > 0) {
      const context = answerParts.join('\n');
      const llmPrompt = `Question: "${question}"\n\nRelevant Knowledge:\n${context}\n\nAnswer the question based on the knowledge above. Be direct and cite sources.`;
      void this.llm.call('ask', llmPrompt).catch(() => {});
    }

    this.thoughtStream?.emit('narrative', 'explaining', `Answered "${question}" with ${sources.length} sources`, sources.length > 2 ? 'notable' : 'routine');
    this.logNarrative('ask', question, answer);

    return { question, answer, sources, confidence: avgConfidence, relatedTopics: [...relatedTopics] };
  }

  /** Async version of ask() that waits for LLM response. */
  async askAsync(question: string): Promise<NarrativeAnswer> {
    this.thoughtStream?.emit('narrative', 'analyzing', `Answering (LLM): "${question}"`);

    const { answerParts, sources, relatedTopics, avgConfidence } = this.gatherAskContext(question);

    let answer: string;
    if (answerParts.length === 0) {
      answer = `I don't have enough data to answer "${question}" yet. This topic hasn't appeared in my observations, hypotheses, or principles.`;
    } else if (this.llm?.isAvailable()) {
      const context = answerParts.join('\n');
      const llmPrompt = `Question: "${question}"\n\nRelevant Knowledge:\n${context}\n\nAnswer the question based on the knowledge above. Be direct and cite sources.`;
      const llmResult = await this.llm.call('ask', llmPrompt);
      answer = llmResult?.text ?? answerParts.join('\n\n');
    } else {
      answer = answerParts.join('\n\n');
    }

    this.thoughtStream?.emit('narrative', 'explaining', `Answered "${question}" with ${sources.length} sources`, sources.length > 2 ? 'notable' : 'routine');
    this.logNarrative('ask', question, answer);

    return { question, answer, sources, confidence: avgConfidence, relatedTopics: [...relatedTopics] };
  }

  private gatherAskContext(question: string): {
    answerParts: string[];
    sources: string[];
    relatedTopics: Set<string>;
    avgConfidence: number;
  } {
    const keywords = this.extractKeywords(question);
    const answerParts: string[] = [];
    const sources: string[] = [];
    const relatedTopics = new Set<string>();
    let totalConfidence = 0;
    let confidenceCount = 0;

    const principles = this.sources.knowledgeDistiller?.getPrinciples(undefined, 100) ?? [];
    const matching = principles.filter(p => keywords.some(k => this.matches(p.statement, k) || this.matches(p.domain, k)));
    for (const p of matching.slice(0, 5)) {
      answerParts.push(`Based on ${p.sample_size} observations: ${p.statement} (${(p.confidence * 100).toFixed(0)}% confident)`);
      sources.push(`principle:${p.id}`);
      relatedTopics.add(p.domain);
      totalConfidence += p.confidence;
      confidenceCount++;
    }

    const antiPatterns = this.sources.knowledgeDistiller?.getAntiPatterns(undefined, 100) ?? [];
    const matchingAP = antiPatterns.filter(a => keywords.some(k => this.matches(a.statement, k)));
    for (const a of matchingAP.slice(0, 3)) {
      answerParts.push(`Caution: ${a.statement} (${(a.failure_rate * 100).toFixed(0)}% failure rate). Try: ${a.alternative}`);
      sources.push(`anti_pattern:${a.id}`);
      relatedTopics.add(a.domain);
    }

    const hypotheses = this.sources.hypothesisEngine?.list(undefined, 100) ?? [];
    const matchingH = hypotheses.filter(h => keywords.some(k => this.matches(h.statement, k)));
    for (const h of matchingH.filter(h => h.status === 'confirmed').slice(0, 3)) {
      answerParts.push(`Confirmed: ${h.statement} (evidence: ${h.evidence_for} for, ${h.evidence_against} against)`);
      sources.push(`hypothesis:${h.id}`);
      totalConfidence += h.confidence;
      confidenceCount++;
    }

    const journalEntries = this.sources.journal?.search(keywords.join(' '), 5) ?? [];
    for (const j of journalEntries.slice(0, 2)) {
      if (j.significance !== 'routine') {
        answerParts.push(`From research journal: ${j.title} — ${j.content.substring(0, 100)}`);
        sources.push(`journal:${j.id}`);
      }
    }

    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    return { answerParts, sources, relatedTopics, avgConfidence };
  }

  // ── Contradiction Detection ─────────────────────────────

  findContradictions(): Contradiction[] {
    this.thoughtStream?.emit('narrative', 'analyzing', 'Scanning for contradictions...');

    const contradictions: Contradiction[] = [];
    let idCounter = 1;

    const principles = this.sources.knowledgeDistiller?.getPrinciples(undefined, 100) ?? [];
    const antiPatterns = this.sources.knowledgeDistiller?.getAntiPatterns(undefined, 100) ?? [];
    const hypotheses = this.sources.hypothesisEngine?.list(undefined, 200) ?? [];

    // 1. Confirmed hypotheses vs anti-patterns (need strong overlap + negation signal)
    const confirmed = hypotheses.filter(h => h.status === 'confirmed');
    for (const h of confirmed) {
      for (const a of antiPatterns) {
        if (this.topicOverlap(h.statement, a.statement) >= 0.5) {
          contradictions.push({
            id: idCounter++,
            type: 'hypothesis_vs_antipattern',
            statement_a: h.statement,
            source_a: `Confirmed hypothesis (${(h.confidence * 100).toFixed(0)}% confident)`,
            statement_b: a.statement,
            source_b: `Anti-pattern (${(a.failure_rate * 100).toFixed(0)}% failure rate)`,
            tradeoff: `Hypothesis suggests this works, but anti-pattern warns it often fails. Consider: ${a.alternative}`,
            severity: h.confidence > 0.7 && a.failure_rate > 0.5 ? 'high' : 'medium',
          });
        }
      }
    }

    // 2. Contradicting hypotheses (one confirmed, one rejected on similar topic)
    const rejected = hypotheses.filter(h => h.status === 'rejected');
    for (const c of confirmed) {
      for (const r of rejected) {
        if (this.topicOverlap(c.statement, r.statement) >= 0.5) {
          contradictions.push({
            id: idCounter++,
            type: 'hypothesis_vs_hypothesis',
            statement_a: c.statement,
            source_a: `Confirmed (p=${c.p_value.toFixed(3)})`,
            statement_b: r.statement,
            source_b: `Rejected (p=${r.p_value.toFixed(3)})`,
            tradeoff: 'These related hypotheses had opposite outcomes — the underlying mechanism may be context-dependent.',
            severity: 'low',
          });
        }
      }
    }

    // 3. Principles that seem to conflict
    for (let i = 0; i < principles.length; i++) {
      for (let j = i + 1; j < principles.length; j++) {
        const a = principles[i]!;
        const b = principles[j]!;
        // Check for negation patterns
        if (this.seemsContradictory(a.statement, b.statement)) {
          contradictions.push({
            id: idCounter++,
            type: 'principle_vs_principle',
            statement_a: a.statement,
            source_a: `Principle (${a.domain}, ${(a.confidence * 100).toFixed(0)}% confident)`,
            statement_b: b.statement,
            source_b: `Principle (${b.domain}, ${(b.confidence * 100).toFixed(0)}% confident)`,
            tradeoff: 'Both principles have evidence but point in different directions. The optimal approach may depend on context.',
            severity: a.confidence > 0.7 && b.confidence > 0.7 ? 'high' : 'medium',
          });
        }
      }
    }

    // 4. Predictions vs observations
    const predictions = this.sources.predictionEngine?.list(undefined, 'wrong', 20) ?? [];
    for (const p of predictions.slice(0, 5)) {
      if (p.actual_value !== undefined) {
        contradictions.push({
          id: idCounter++,
          type: 'prediction_vs_observation',
          statement_a: `Predicted ${p.metric} → ${p.predicted_direction} (value: ${p.predicted_value.toFixed(2)})`,
          source_a: `Prediction (${p.method}, ${(p.confidence * 100).toFixed(0)}% confident)`,
          statement_b: `Actual: ${p.actual_value.toFixed(2)} (error: ${((p.error ?? 0) * 100).toFixed(1)}%)`,
          source_b: 'Observation',
          tradeoff: `${p.reasoning.substring(0, 100)}. The prediction model may need recalibration for this metric.`,
          severity: (p.error ?? 0) > 0.5 ? 'high' : (p.error ?? 0) > 0.2 ? 'medium' : 'low',
        });
      }
    }

    // Cap: keep only the most severe contradictions to avoid noise
    contradictions.sort((a, b) => {
      const sev = { high: 3, medium: 2, low: 1 };
      return (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
    });
    const capped = contradictions.slice(0, 20);

    this.thoughtStream?.emit('narrative', 'discovering',
      `Found ${capped.length} contradictions (${capped.filter(c => c.severity === 'high').length} high severity)`,
      capped.length > 0 ? 'notable' : 'routine',
    );

    return capped;
  }

  // ── Weekly Digest ──────────────────────────────────────

  generateDigest(days = 7): WeeklyDigest {
    this.thoughtStream?.emit('narrative', 'analyzing', `Generating ${days}-day digest...`);

    const now = Date.now();
    const from = new Date(now - days * 86_400_000);
    const to = new Date(now);
    const fromStr = from.toISOString().split('T')[0]!;
    const toStr = to.toISOString().split('T')[0]!;

    // Gather data
    const principlesSummary = this.sources.knowledgeDistiller?.getSummary();
    const hypothesisSummary = this.sources.hypothesisEngine?.getSummary();
    const predictionSummary = this.sources.predictionEngine?.getSummary();

    const experiments = this.sources.experimentEngine?.getResults(20) ?? [];
    const recentExperiments = experiments.filter(e => e.completed_at && new Date(e.completed_at).getTime() > from.getTime());

    const anomalies = this.sources.anomalyDetective?.getAnomalies(undefined, 50) ?? [];
    const recentAnomalies = anomalies.filter(a => (a.timestamp || 0) > from.getTime());

    const attStatus = this.sources.attentionEngine?.getStatus();
    const transferStatus = this.sources.transferEngine?.getStatus();

    const contradictions = this.findContradictions();

    // Compute stats
    const principlesLearned = principlesSummary?.principles ?? 0;
    const hypothesesTested = (hypothesisSummary?.confirmed ?? 0) + (hypothesisSummary?.rejected ?? 0);
    const experimentsCompleted = recentExperiments.length;
    const anomaliesDetected = recentAnomalies.length;
    const predictionAccuracy = predictionSummary?.accuracy_rate ?? 0;
    const attentionFocus = attStatus?.currentContext ?? 'unknown';
    const transferScore = transferStatus?.avgEffectiveness ?? 0;

    // Build highlights
    const highlights: string[] = [];
    if (principlesLearned > 0) highlights.push(`${principlesLearned} principles distilled from confirmed hypotheses`);
    if (hypothesesTested > 0) highlights.push(`${hypothesesTested} hypotheses tested (${hypothesisSummary?.confirmed ?? 0} confirmed, ${hypothesisSummary?.rejected ?? 0} rejected)`);
    if (experimentsCompleted > 0) highlights.push(`${experimentsCompleted} experiments completed`);
    if (anomaliesDetected > 0) highlights.push(`${anomaliesDetected} anomalies detected`);
    if (predictionAccuracy > 0) highlights.push(`Prediction accuracy: ${(predictionAccuracy * 100).toFixed(0)}%`);
    if (contradictions.length > 0) highlights.push(`${contradictions.length} contradictions found (${contradictions.filter(c => c.severity === 'high').length} high severity)`);
    if ((transferStatus?.totalAnalogies ?? 0) > 0) highlights.push(`${transferStatus!.totalAnalogies} cross-domain analogies discovered`);

    // Build summary
    const totalFindings = principlesLearned + hypothesesTested + experimentsCompleted + anomaliesDetected;
    const summary = totalFindings > 0
      ? `In the past ${days} days, ${this.brainName} processed ${totalFindings} findings across ${highlights.length} areas. ${
        predictionAccuracy > 0.7 ? 'Prediction models are performing well.' :
        predictionAccuracy > 0 ? 'Prediction models need improvement.' :
        'No predictions resolved yet.'
      } Current focus: ${attentionFocus}.`
      : `${this.brainName} is still gathering initial data. No significant findings in the past ${days} days.`;

    // Build sections
    const sections: DigestSection[] = [];

    // Knowledge section
    if (principlesLearned > 0) {
      const topPrinciples = principlesSummary?.topPrinciples?.slice(0, 5) ?? [];
      sections.push({
        title: 'Knowledge Gained',
        content: topPrinciples.map(p => `- **${p.statement}** (${(p.confidence * 100).toFixed(0)}% confident, ${p.sample_size} samples)`).join('\n'),
      });
    }

    // Hypothesis section
    if ((hypothesisSummary?.total ?? 0) > 0) {
      const topConfirmed = hypothesisSummary?.topConfirmed?.slice(0, 5) ?? [];
      sections.push({
        title: 'Hypothesis Results',
        content: [
          `Total: ${hypothesisSummary!.total} (${hypothesisSummary!.confirmed} confirmed, ${hypothesisSummary!.rejected} rejected, ${hypothesisSummary!.testing} still testing)`,
          ...topConfirmed.map(h => `- **Confirmed**: ${h.statement} (p=${h.p_value.toFixed(3)})`),
        ].join('\n'),
      });
    }

    // Experiment section
    if (recentExperiments.length > 0) {
      sections.push({
        title: 'Experiments',
        content: recentExperiments.map(e => {
          const c = e.conclusion;
          return c
            ? `- **${e.name}**: ${c.direction} effect (d=${c.effect_size.toFixed(2)}, p=${c.p_value.toFixed(3)}) → ${c.recommendation.replace(/_/g, ' ')}`
            : `- **${e.name}**: ${e.status}`;
        }).join('\n'),
      });
    }

    // Anomaly section
    if (recentAnomalies.length > 0) {
      const bySeverity: Record<string, number> = {};
      for (const a of recentAnomalies) {
        bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
      }
      sections.push({
        title: 'Anomalies',
        content: [
          `Detected ${recentAnomalies.length}: ${Object.entries(bySeverity).map(([s, n]) => `${n} ${s}`).join(', ')}`,
          ...recentAnomalies.slice(0, 5).map(a => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.description.substring(0, 100)}`),
        ].join('\n'),
      });
    }

    // Prediction section
    if ((predictionSummary?.total_predictions ?? 0) > 0) {
      const byDomain = predictionSummary?.by_domain ?? [];
      sections.push({
        title: 'Predictions',
        content: [
          `Total: ${predictionSummary!.total_predictions} (${predictionSummary!.resolved} resolved, accuracy: ${(predictionSummary!.accuracy_rate * 100).toFixed(0)}%)`,
          ...byDomain.filter(d => d.total > 0).map(d => `- ${d.domain}: ${(d.accuracy_rate * 100).toFixed(0)}% accuracy (${d.total} predictions)`),
        ].join('\n'),
      });
    }

    // Contradictions section
    if (contradictions.length > 0) {
      sections.push({
        title: 'Contradictions & Trade-offs',
        content: contradictions.slice(0, 5).map(c =>
          `- [${c.severity.toUpperCase()}] ${c.statement_a.substring(0, 60)} **vs** ${c.statement_b.substring(0, 60)}\n  → ${c.tradeoff.substring(0, 120)}`,
        ).join('\n'),
      });
    }

    // Attention section
    if (attStatus) {
      const topTopics = attStatus.topTopics?.slice(0, 5) ?? [];
      sections.push({
        title: 'Attention & Focus',
        content: [
          `Current context: **${attStatus.currentContext}**`,
          ...topTopics.map(t => `- ${t.topic}: score ${t.score.toFixed(2)}`),
        ].join('\n'),
      });
    }

    // Compose markdown
    const markdown = this.composeMarkdown(fromStr, toStr, summary, highlights, sections);

    // Persist digest
    this.db.prepare('INSERT INTO narrative_digests (period_from, period_to, markdown) VALUES (?, ?, ?)').run(fromStr, toStr, markdown);

    this.thoughtStream?.emit('narrative', 'discovering',
      `Digest generated: ${highlights.length} highlights, ${sections.length} sections`,
      highlights.length > 3 ? 'notable' : 'routine',
    );

    return {
      period: { from: fromStr, to: toStr },
      summary,
      highlights,
      principles_learned: principlesLearned,
      hypotheses_tested: hypothesesTested,
      experiments_completed: experimentsCompleted,
      anomalies_detected: anomaliesDetected,
      predictions_accuracy: predictionAccuracy,
      attention_focus: attentionFocus,
      contradictions: contradictions.length,
      transferScore,
      sections,
      markdown,
      generatedAt: Date.now(),
    };
  }

  // ── Confidence Report ──────────────────────────────────

  getConfidenceReport(topic?: string): ConfidenceReport {
    const factors: ConfidenceFactor[] = [];
    const uncertainties: string[] = [];

    const principles = this.sources.knowledgeDistiller?.getPrinciples(undefined, 100) ?? [];
    const hypotheses = this.sources.hypothesisEngine?.list(undefined, 100) ?? [];

    const filterFn = topic ? (s: string) => this.matches(s, topic) : () => true;

    // Principles confidence
    const matchedPrinciples = principles.filter(p => filterFn(p.statement) || filterFn(p.domain));
    if (matchedPrinciples.length > 0) {
      const avgConf = matchedPrinciples.reduce((s, p) => s + p.confidence, 0) / matchedPrinciples.length;
      const totalSamples = matchedPrinciples.reduce((s, p) => s + p.sample_size, 0);
      factors.push({
        source: 'principles',
        confidence: avgConf,
        description: `${matchedPrinciples.length} principles with average ${(avgConf * 100).toFixed(0)}% confidence`,
        sampleSize: totalSamples,
      });
      if (totalSamples < 20) uncertainties.push(`Low sample size (${totalSamples}) — more data needed`);
    } else {
      uncertainties.push('No principles found for this topic');
    }

    // Hypothesis confidence
    const matchedHyp = hypotheses.filter(h => filterFn(h.statement));
    const confirmedH = matchedHyp.filter(h => h.status === 'confirmed');
    const testingH = matchedHyp.filter(h => h.status === 'testing');
    if (confirmedH.length > 0) {
      const avgConf = confirmedH.reduce((s, h) => s + h.confidence, 0) / confirmedH.length;
      factors.push({
        source: 'hypotheses',
        confidence: avgConf,
        description: `${confirmedH.length} confirmed hypotheses (${testingH.length} still testing)`,
        sampleSize: confirmedH.reduce((s, h) => s + h.evidence_for + h.evidence_against, 0),
      });
    }
    if (testingH.length > 0) uncertainties.push(`${testingH.length} hypotheses still under test`);

    // Prediction accuracy
    const predAccuracy = this.sources.predictionEngine?.getAccuracy();
    if (predAccuracy && predAccuracy.length > 0) {
      const avgAcc = predAccuracy.reduce((s, a) => s + a.accuracy_rate, 0) / predAccuracy.length;
      factors.push({
        source: 'predictions',
        confidence: avgAcc,
        description: `Prediction accuracy across ${predAccuracy.length} domains: ${(avgAcc * 100).toFixed(0)}%`,
        sampleSize: predAccuracy.reduce((s, a) => s + a.total, 0),
      });
      if (avgAcc < 0.5) uncertainties.push('Prediction accuracy is below 50% — forecasts unreliable');
    }

    // Experiment evidence
    const experiments = this.sources.experimentEngine?.getResults(50) ?? [];
    const matchedExp = experiments.filter(e => filterFn(e.name) || filterFn(e.hypothesis));
    if (matchedExp.length > 0) {
      const significant = matchedExp.filter(e => e.conclusion?.significant);
      factors.push({
        source: 'experiments',
        confidence: matchedExp.length > 0 ? significant.length / matchedExp.length : 0,
        description: `${significant.length}/${matchedExp.length} experiments showed significant results`,
        sampleSize: matchedExp.length,
      });
    }

    // Overall confidence
    const overallConfidence = factors.length > 0
      ? factors.reduce((s, f) => s + f.confidence, 0) / factors.length
      : 0;

    // Recommendation
    let recommendation: string;
    if (overallConfidence >= 0.8) recommendation = `High confidence. Brain is ${(overallConfidence * 100).toFixed(0)}% sure about this area.`;
    else if (overallConfidence >= 0.6) recommendation = `Moderate confidence (${(overallConfidence * 100).toFixed(0)}%). ${uncertainties.length > 0 ? 'Uncertainties: ' + uncertainties[0] : 'More data would help.'}`;
    else if (overallConfidence > 0) recommendation = `Low confidence (${(overallConfidence * 100).toFixed(0)}%). Significant uncertainty remains. ${uncertainties.join('. ')}.`;
    else recommendation = 'No data available for confidence assessment.';

    return {
      topic: topic || 'overall',
      overallConfidence,
      factors,
      uncertainties,
      recommendation,
    };
  }

  // ── Status ─────────────────────────────────────────────

  getStatus(): { digestCount: number; narrativeCount: number; lastDigest: string | null } {
    const digestCount = (this.db.prepare('SELECT COUNT(*) as c FROM narrative_digests').get() as { c: number }).c;
    const narrativeCount = (this.db.prepare('SELECT COUNT(*) as c FROM narrative_log').get() as { c: number }).c;
    const lastDigest = (this.db.prepare('SELECT created_at FROM narrative_digests ORDER BY id DESC LIMIT 1').get() as { created_at: string } | undefined)?.created_at ?? null;
    return { digestCount, narrativeCount, lastDigest };
  }

  getDigestHistory(limit = 10): Array<{ id: number; period_from: string; period_to: string; created_at: string }> {
    return this.db.prepare('SELECT id, period_from, period_to, created_at FROM narrative_digests ORDER BY id DESC LIMIT ?').all(limit) as Array<{ id: number; period_from: string; period_to: string; created_at: string }>;
  }

  getDigest(id: number): string | null {
    const row = this.db.prepare('SELECT markdown FROM narrative_digests WHERE id = ?').get(id) as { markdown: string } | undefined;
    return row?.markdown ?? null;
  }

  // ── Private Helpers ────────────────────────────────────

  private matches(text: string, query: string): boolean {
    if (!text || !query) return false;
    const lower = text.toLowerCase();
    const q = query.toLowerCase().trim();
    // Direct substring match
    if (lower.includes(q)) return true;
    // Word-level match (any keyword)
    const words = q.split(/\s+/).filter(w => w.length > 2);
    return words.length > 0 && words.some(w => lower.includes(w));
  }

  private extractKeywords(question: string): string[] {
    const stopwords = new Set(['what', 'why', 'how', 'when', 'where', 'who', 'which', 'does', 'did', 'will', 'can', 'should', 'would', 'could', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'to', 'and', 'or', 'not', 'but', 'if', 'my', 'me', 'ich', 'meine', 'warum', 'wie', 'was', 'wann', 'wo', 'wer', 'welche', 'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind', 'war', 'hat', 'haben', 'und', 'oder', 'nicht', 'aber', 'wenn', 'bei', 'mit', 'für', 'auf', 'von', 'zu', 'nach']);
    return question.toLowerCase()
      .replace(/[?!.,;:'"]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }

  private topicOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    return overlap / Math.max(wordsA.size, wordsB.size);
  }

  private seemsContradictory(a: string, b: string): boolean {
    // Simple heuristic: if statements share >55% words but contain negation/opposite signals
    if (this.topicOverlap(a, b) < 0.55) return false;
    const negations = ['not', 'never', 'no', 'decrease', 'reduce', 'lower', 'worse', 'fail', 'nicht', 'nie', 'kein'];
    const aHasNeg = negations.some(n => a.toLowerCase().includes(n));
    const bHasNeg = negations.some(n => b.toLowerCase().includes(n));
    // One has negation, the other doesn't
    return aHasNeg !== bHasNeg;
  }

  private composeMarkdown(from: string, to: string, summary: string, highlights: string[], sections: DigestSection[]): string {
    const lines: string[] = [];
    lines.push(`# ${this.brainName} — Weekly Digest`);
    lines.push(`**Period:** ${from} — ${to}`);
    lines.push('');
    lines.push('## Summary');
    lines.push(summary);
    lines.push('');

    if (highlights.length > 0) {
      lines.push('## Highlights');
      for (const h of highlights) lines.push(`- ${h}`);
      lines.push('');
    }

    for (const s of sections) {
      lines.push(`## ${s.title}`);
      lines.push(s.content);
      lines.push('');
    }

    lines.push('---');
    lines.push(`*Generated ${new Date().toISOString()} by ${this.brainName} NarrativeEngine*`);
    return lines.join('\n');
  }

  private logNarrative(type: string, topic: string | null, content: string): void {
    try {
      this.db.prepare('INSERT INTO narrative_log (type, topic, content) VALUES (?, ?, ?)').run(type, topic, content.substring(0, 5000));
    } catch { /* best effort */ }
  }
}
