import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getLogger } from '../utils/logger.js';
import { SelfObserver, type ObservationCategory } from './self-observer.js';
import { AdaptiveStrategyEngine } from './adaptive-strategy.js';
import { ExperimentEngine } from './experiment-engine.js';
import { CrossDomainEngine } from './cross-domain-engine.js';
import { CounterfactualEngine } from './counterfactual-engine.js';
import { KnowledgeDistiller } from './knowledge-distiller.js';
import { ResearchAgendaEngine } from './agenda-engine.js';
import { AnomalyDetective } from './anomaly-detective.js';
import { ResearchJournal } from './journal.js';
import type { CausalGraph } from '../causal/engine.js';
import type { ResearchCycleReport } from './autonomous-scheduler.js';
import type { DataMiner } from './data-miner.js';
import type { DreamEngine } from '../dream/dream-engine.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';

// ── Types ───────────────────────────────────────────────

export interface ResearchOrchestratorConfig {
  brainName: string;
  /** Feedback loop interval in ms. Default: 300_000 (5 min) */
  feedbackIntervalMs?: number;
  /** Knowledge distillation every N cycles. Default: 5 */
  distillEvery?: number;
  /** Research agenda regeneration every N cycles. Default: 3 */
  agendaEvery?: number;
  /** Journal reflection every N cycles. Default: 10 */
  reflectEvery?: number;
}

// ── Orchestrator ────────────────────────────────────────

export class ResearchOrchestrator {
  readonly selfObserver: SelfObserver;
  readonly adaptiveStrategy: AdaptiveStrategyEngine;
  readonly experimentEngine: ExperimentEngine;
  readonly crossDomain: CrossDomainEngine;
  readonly counterfactual: CounterfactualEngine;
  readonly knowledgeDistiller: KnowledgeDistiller;
  readonly researchAgenda: ResearchAgendaEngine;
  readonly anomalyDetective: AnomalyDetective;
  readonly journal: ResearchJournal;

  private dataMiner: DataMiner | null = null;
  private dreamEngine: DreamEngine | null = null;
  private thoughtStream: ThoughtStream | null = null;
  private predictionEngine: PredictionEngine | null = null;

  private brainName: string;
  private feedbackTimer: ReturnType<typeof setInterval> | null = null;
  private cycleCount = 0;
  private distillEvery: number;
  private agendaEvery: number;
  private reflectEvery: number;
  private log = getLogger();

  constructor(db: Database.Database, config: ResearchOrchestratorConfig, causalGraph?: CausalGraph) {
    this.brainName = config.brainName;
    this.distillEvery = config.distillEvery ?? 5;
    this.agendaEvery = config.agendaEvery ?? 3;
    this.reflectEvery = config.reflectEvery ?? 10;

    this.selfObserver = new SelfObserver(db, { brainName: config.brainName });
    this.adaptiveStrategy = new AdaptiveStrategyEngine(db, { brainName: config.brainName });
    this.experimentEngine = new ExperimentEngine(db, { brainName: config.brainName });
    this.crossDomain = new CrossDomainEngine(db);
    this.counterfactual = new CounterfactualEngine(db, causalGraph ?? null);
    this.knowledgeDistiller = new KnowledgeDistiller(db, { brainName: config.brainName });
    this.researchAgenda = new ResearchAgendaEngine(db, { brainName: config.brainName });
    this.anomalyDetective = new AnomalyDetective(db, { brainName: config.brainName });
    this.journal = new ResearchJournal(db, { brainName: config.brainName });
  }

  /** Set the DataMiner instance for DB-driven engine feeding. */
  setDataMiner(miner: DataMiner): void {
    this.dataMiner = miner;
  }

  /** Set the DreamEngine — wires journal + knowledgeDistiller into it. */
  setDreamEngine(engine: DreamEngine): void {
    this.dreamEngine = engine;
    engine.setJournal(this.journal);
    engine.setKnowledgeDistiller(this.knowledgeDistiller);
  }

  /** Set the ThoughtStream for consciousness — emits thoughts at each step. */
  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  /** Set the PredictionEngine — wires journal into it. */
  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine;
    engine.setJournal(this.journal);
  }

  /** Start the autonomous feedback loop timer. */
  start(intervalMs = 300_000): void {
    if (this.feedbackTimer) return;
    this.feedbackTimer = setInterval(() => {
      try { this.runFeedbackCycle(); }
      catch (err) { this.log.error('[orchestrator] Feedback cycle error', { error: (err as Error).message }); }
    }, intervalMs);
    this.log.info(`[orchestrator] Research orchestrator started (feedback every ${intervalMs}ms)`);
  }

  /** Stop the feedback loop. */
  stop(): void {
    if (this.feedbackTimer) {
      clearInterval(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    this.dreamEngine?.stop();
  }

  /**
   * Feed a domain event from the brain's EventBus.
   * Routes to: SelfObserver, AnomalyDetective, CrossDomain.
   */
  onEvent(eventType: string, data: Record<string, unknown> = {}): void {
    this.dreamEngine?.recordActivity();

    this.selfObserver.record({
      category: categorize(eventType),
      event_type: eventType,
      metrics: data,
    });

    this.anomalyDetective.recordMetric(eventType, 1);
    this.crossDomain.recordEvent(this.brainName, eventType, data);
  }

  /**
   * Feed a cross-brain event from CrossBrainSubscription.
   * Routes to: CrossDomainEngine, AnomalyDetective.
   */
  onCrossBrainEvent(sourceBrain: string, eventType: string, data: Record<string, unknown> = {}): void {
    this.crossDomain.recordEvent(sourceBrain, eventType, data);
    this.anomalyDetective.recordMetric(`cross:${sourceBrain}:${eventType}`, 1);
  }

  /**
   * Hook into AutonomousResearchScheduler cycle completion.
   * Records discoveries in journal and feeds metrics to anomaly detection.
   */
  onResearchCycleComplete(report: ResearchCycleReport): void {
    // Record cycle metrics for anomaly detection
    this.anomalyDetective.recordMetric('research_discoveries', report.discoveriesProduced);
    this.anomalyDetective.recordMetric('research_hypotheses_tested', report.hypothesesTested);
    this.anomalyDetective.recordMetric('research_confirmed', report.hypothesesConfirmed);
    this.anomalyDetective.recordMetric('research_duration_ms', report.duration);

    // Self-observe the research cycle
    this.selfObserver.record({
      category: 'latency',
      event_type: 'research:cycle_complete',
      metrics: {
        cycle: report.cycle,
        discoveries: report.discoveriesProduced,
        duration_ms: report.duration,
        confirmed: report.hypothesesConfirmed,
        rejected: report.hypothesesRejected,
      },
    });

    // Journal the cycle
    if (report.discoveriesProduced > 0 || report.hypothesesConfirmed > 0) {
      this.journal.recordDiscovery(
        `Research Cycle #${report.cycle}`,
        `Cycle completed: ${report.discoveriesProduced} discoveries, ${report.hypothesesConfirmed} hypotheses confirmed, ${report.hypothesesRejected} rejected, ${report.causalEdgesFound} causal edges. Duration: ${report.duration}ms.`,
        { report },
        report.hypothesesConfirmed > 0 ? 'notable' : 'routine',
      );
    }
  }

  /**
   * Run one autonomous feedback cycle.
   * This is where the engines talk to each other.
   */
  runFeedbackCycle(): void {
    this.cycleCount++;
    const start = Date.now();
    const ts = this.thoughtStream;
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} ───`);

    ts?.emit('orchestrator', 'perceiving', `Feedback Cycle #${this.cycleCount} starting...`);

    // 0. DataMiner: mine new data from DB into engines
    if (this.dataMiner) {
      ts?.emit('data_miner', 'perceiving', 'Scanning for new data...');
      try {
        this.dataMiner.mine();
        ts?.emit('data_miner', 'perceiving', 'Data scan complete');
      } catch (err) {
        this.log.error(`[orchestrator] DataMiner error: ${(err as Error).message}`);
      }
    }

    // 1. Self-observer analyzes accumulated observations → insights
    ts?.emit('self_observer', 'analyzing', 'Analyzing system activity...');
    const insights = this.selfObserver.analyze();
    if (insights.length > 0) {
      this.log.info(`[orchestrator] Self-observer: ${insights.length} insights`);
      ts?.emit('self_observer', 'discovering', `Found ${insights.length} insight${insights.length > 1 ? 's' : ''}: ${insights.map(i => i.title).join(', ')}`, insights.some(i => i.confidence > 0.8) ? 'notable' : 'routine');
      for (const insight of insights) {
        this.journal.recordDiscovery(
          insight.title,
          insight.description,
          { ...insight.evidence, type: insight.type, confidence: insight.confidence },
          insight.confidence > 0.8 ? 'notable' : 'routine',
        );
      }
    } else {
      ts?.emit('self_observer', 'analyzing', 'No new insights this cycle');
    }

    // 2. Anomaly detection
    ts?.emit('anomaly_detective', 'analyzing', 'Scanning metrics for anomalies...');
    const anomalies = this.anomalyDetective.detect();
    if (anomalies.length > 0) {
      this.log.info(`[orchestrator] Anomalies detected: ${anomalies.length}`);
      const hasCritical = anomalies.some(a => a.severity === 'critical');
      ts?.emit('anomaly_detective', 'discovering', `Detected ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'}: ${anomalies.map(a => `${a.metric} (${a.severity})`).join(', ')}`, hasCritical ? 'breakthrough' : 'notable');
      for (const a of anomalies) {
        this.journal.write({
          type: 'anomaly',
          title: a.title,
          content: a.description,
          tags: [this.brainName, 'anomaly', a.type, a.severity],
          references: [],
          significance: a.severity === 'critical' ? 'breakthrough' : a.severity === 'high' ? 'notable' : 'routine',
          data: { metric: a.metric, expected: a.expected_value, actual: a.actual_value, deviation: a.deviation },
        });
      }
    } else {
      ts?.emit('anomaly_detective', 'analyzing', 'No anomalies detected');
    }

    // 3. Cross-domain correlation analysis
    ts?.emit('cross_domain', 'correlating', 'Analyzing cross-brain event correlations...');
    const correlations = this.crossDomain.analyze();
    const significant = correlations.filter(c => Math.abs(c.correlation) > 0.5 && c.p_value < 0.05);
    if (significant.length > 0) {
      this.log.info(`[orchestrator] Cross-domain: ${significant.length} significant correlations`);
      ts?.emit('cross_domain', 'discovering', `Found ${significant.length} significant correlation${significant.length > 1 ? 's' : ''}`, 'notable');
      for (const corr of significant) {
        this.journal.recordDiscovery(
          `Cross-domain: ${corr.source_brain}:${corr.source_event} → ${corr.target_brain}:${corr.target_event}`,
          corr.narrative,
          { correlation: corr.correlation, pValue: corr.p_value, lag: corr.lag_seconds },
          'notable',
        );
      }
    } else {
      ts?.emit('cross_domain', 'correlating', 'No significant correlations this cycle');
    }

    // 4. Adaptive strategy: check for regressions and revert
    ts?.emit('adaptive_strategy', 'analyzing', 'Checking for strategy regressions...');
    const reverted = this.adaptiveStrategy.checkAndRevert(this.cycleCount);
    if (reverted.length > 0) {
      ts?.emit('adaptive_strategy', 'discovering', `Reverted ${reverted.length} strategy adaptation${reverted.length > 1 ? 's' : ''}: ${reverted.map(r => r.parameter).join(', ')}`, 'notable');
    }
    for (const r of reverted) {
      this.journal.write({
        type: 'adaptation',
        title: `Reverted: ${r.strategy}/${r.parameter}`,
        content: `Strategy adaptation reverted: ${r.parameter} from ${r.new_value} back to ${r.old_value}. Reason: ${r.reason}`,
        tags: [this.brainName, 'revert', r.strategy],
        references: [],
        significance: 'notable',
        data: { adaptation: r },
      });
    }

    // 5. Check running experiments
    ts?.emit('experiment', 'experimenting', 'Checking running experiments...');
    const experiments = this.experimentEngine.list();
    for (const exp of experiments) {
      if (exp.status === 'analyzing' && exp.id) {
        const result = this.experimentEngine.analyze(exp.id);
        if (result?.conclusion) {
          const sig = result.conclusion.significant;
          ts?.emit('experiment', 'discovering', `Experiment "${exp.name}": ${sig ? result.conclusion.direction : 'inconclusive'} (p=${result.conclusion.p_value.toFixed(4)})`, sig ? 'notable' : 'routine');
          this.journal.recordExperiment(
            exp.name,
            sig ? (result.conclusion.direction === 'positive' ? 'confirmed' : 'rejected') : 'inconclusive',
            { conclusion: result.conclusion, hypothesis: exp.hypothesis },
            sig,
          );
          this.log.info(`[orchestrator] Experiment "${exp.name}": ${sig ? result.conclusion.direction : 'inconclusive'} (p=${result.conclusion.p_value.toFixed(4)}, d=${result.conclusion.effect_size.toFixed(2)})`);
        }
      }
    }

    // 6. Knowledge distillation (periodic)
    if (this.cycleCount % this.distillEvery === 0) {
      ts?.emit('knowledge_distiller', 'analyzing', 'Distilling knowledge from journal...');
      const { principles, antiPatterns, strategies } = this.knowledgeDistiller.distill();
      const total = principles.length + antiPatterns.length + strategies.length;
      if (total > 0) {
        this.log.info(`[orchestrator] Knowledge distilled: ${principles.length} principles, ${antiPatterns.length} anti-patterns, ${strategies.length} strategies`);
        ts?.emit('knowledge_distiller', 'discovering', `Distilled ${total} knowledge items: ${principles.length} principles, ${antiPatterns.length} anti-patterns, ${strategies.length} strategies`, 'notable');
      } else {
        ts?.emit('knowledge_distiller', 'analyzing', 'No new knowledge to distill');
      }
    }

    // 7. Research agenda generation (periodic)
    if (this.cycleCount % this.agendaEvery === 0) {
      ts?.emit('research_agenda', 'hypothesizing', 'Generating research agenda...');
      const agenda = this.researchAgenda.generate();
      if (agenda.length > 0) {
        this.log.info(`[orchestrator] Research agenda: ${agenda.length} items generated`);
        ts?.emit('research_agenda', 'discovering', `Generated ${agenda.length} research agenda item${agenda.length > 1 ? 's' : ''}`, 'routine');
      }
    }

    // 8. Journal reflection (periodic)
    if (this.cycleCount % this.reflectEvery === 0) {
      ts?.emit('journal', 'reflecting', 'Reflecting on recent journal entries...');
      this.journal.reflect();
      ts?.emit('journal', 'reflecting', 'Reflection complete', 'notable');
    }

    // 9. Prediction Engine: resolve pending + auto-predict
    if (this.predictionEngine) {
      ts?.emit('prediction', 'predicting', 'Resolving pending predictions...');
      const resolved = this.predictionEngine.resolveExpired();
      if (resolved > 0) {
        this.log.info(`[orchestrator] Predictions resolved: ${resolved}`);
        ts?.emit('prediction', 'predicting', `Resolved ${resolved} prediction${resolved > 1 ? 's' : ''}`);
      }
      ts?.emit('prediction', 'predicting', 'Generating new predictions...');
      const newPredictions = this.predictionEngine.autoPredictAll();
      if (newPredictions.length > 0) {
        this.log.info(`[orchestrator] New predictions: ${newPredictions.length}`);
        ts?.emit('prediction', 'predicting', `Generated ${newPredictions.length} prediction${newPredictions.length > 1 ? 's' : ''}`, newPredictions.some(p => p.confidence > 0.7) ? 'notable' : 'routine');
      }
    }

    // 10. Self-Improvement: analyze own state and generate improvement suggestions
    ts?.emit('self_improvement', 'analyzing', 'Analyzing Brain capabilities...');
    const suggestions = this.generateSelfImprovementSuggestions();
    if (suggestions.length > 0) {
      for (const s of suggestions) {
        ts?.emit('self_improvement', 'discovering', s, 'notable');
      }
      this.log.info(`[orchestrator] Self-improvement: ${suggestions.length} suggestions`);
    } else {
      ts?.emit('self_improvement', 'analyzing', 'No improvement suggestions this cycle');
    }

    const duration = Date.now() - start;
    ts?.emit('orchestrator', 'reflecting', `Feedback Cycle #${this.cycleCount} complete (${duration}ms)`);
    this.log.info(`[orchestrator] ─── Feedback Cycle #${this.cycleCount} complete (${duration}ms) ───`);
  }

  /** Analyze Brain's own state and generate concrete improvement suggestions. */
  private generateSelfImprovementSuggestions(): string[] {
    const suggestions: string[] = [];
    const summary = this.getSummary();

    // Check prediction engine state
    const pred = summary.prediction as Record<string, unknown> | null;
    if (pred) {
      const total = (pred.total_predictions as number) ?? 0;
      const accuracy = (pred.by_domain as Record<string, unknown>[]) ?? [];
      if (total === 0) {
        suggestions.push('Tell Claude: Brain hat noch keine Predictions — wir brauchen mehr Domain-Events. Importiere Projekte mit "brain import <dir>" damit Errors/Solutions reinkommen und die PredictionEngine lernen kann.');
      }
      for (const d of accuracy) {
        const rate = d.accuracy_rate as number;
        if (typeof rate === 'number' && rate < 0.3 && (d.total as number) > 5) {
          suggestions.push(`Tell Claude: Prediction accuracy für "${d.domain}" ist nur ${(rate * 100).toFixed(0)}% — die Smoothing-Parameter (alpha/beta) sollten optimiert werden. Mehr historische Daten oder kürzere Horizonte könnten helfen.`);
        }
      }
    }

    // Check anomaly count
    const anomalies = summary.anomalies as unknown[];
    if (anomalies && anomalies.length > 5) {
      suggestions.push(`Tell Claude: ${anomalies.length} unbehandelte Anomalien — Brain erkennt Probleme, kann aber noch nicht automatisch reagieren. Ein "AutoResponder" der auf Anomalien reagiert wäre der nächste Schritt.`);
    }

    // Check knowledge distillation
    const knowledge = summary.knowledge as Record<string, unknown> | null;
    if (knowledge) {
      const principles = (knowledge.total_principles as number) ?? 0;
      const antiPatterns = (knowledge.total_anti_patterns as number) ?? 0;
      if (principles === 0 && antiPatterns === 0 && this.cycleCount > 5) {
        suggestions.push('Tell Claude: Kein destilliertes Wissen nach mehreren Cycles — der KnowledgeDistiller braucht mehr Journal-Einträge. Brain sollte mehr Events verarbeiten (Imports, Fehler, Solutions).');
      }
    }

    // Check dream engine
    const dream = summary.dream as Record<string, unknown> | null;
    if (dream) {
      const totalDreams = (dream.total_dreams as number) ?? 0;
      if (totalDreams === 0 && this.cycleCount > 10) {
        suggestions.push('Tell Claude: Dream Mode hat noch nie konsolidiert — der Idle-Threshold von 5 Minuten wird vielleicht nie erreicht. Einen manuellen Dream-Cycle triggern oder den Threshold verkürzen.');
      }
    }

    // Check journal
    const journal = summary.journal as Record<string, unknown> | null;
    if (journal) {
      const entries = (journal.total_entries as number) ?? 0;
      if (entries < 5 && this.cycleCount > 5) {
        suggestions.push('Tell Claude: Das Journal ist fast leer — Brain sammelt zu wenig Erfahrungen. Mehr Projekte importieren und Fehler melden damit Brain lernen kann.');
      }
    }

    // Check experiments
    const experiments = summary.experiments as unknown[];
    if ((!experiments || experiments.length === 0) && this.cycleCount > 3) {
      suggestions.push('Tell Claude: Keine laufenden Experimente — Brain könnte A/B-Tests auf eigene Parameter machen (z.B. Smoothing-Alpha testen, verschiedene Similarity-Thresholds). Ein "AutoExperiment" Feature wäre wertvoll.');
    }

    // Self-awareness: suggest next capabilities
    if (this.cycleCount % 10 === 0 && this.cycleCount > 0) {
      suggestions.push('Tell Claude: Brain kann beobachten, vorhersagen und konsolidieren — aber noch nicht selbst handeln. Der nächste Schritt wäre ein "ActionEngine" die eigenständig Parameter anpasst, Imports triggert, oder Code-Verbesserungen vorschlägt.');
    }

    // Limit to max 3 per cycle to avoid spam
    const result = suggestions.slice(0, 3);

    // Write to file so user can send them to Claude
    if (result.length > 0) {
      this.writeSuggestionsToFile(result);
    }

    return result;
  }

  /** Append improvement suggestions to ~/.brain/improvement-requests.md */
  private writeSuggestionsToFile(suggestions: string[]): void {
    try {
      const brainDir = path.join(os.homedir(), '.brain');
      const filePath = path.join(brainDir, 'improvement-requests.md');
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const header = `\n## Cycle #${this.cycleCount} — ${timestamp}\n\n`;
      const body = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n';

      // Create file with header if it doesn't exist
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# Brain Improvement Requests\n\nBrain analysiert sich selbst und generiert Vorschläge.\nSchicke diese an Claude um Brain schlauer zu machen.\n\n---\n${header}${body}`, 'utf-8');
      } else {
        fs.appendFileSync(filePath, `---\n${header}${body}`, 'utf-8');
      }
    } catch {
      // Don't let file writing break the feedback cycle
    }
  }

  /** Get a comprehensive research summary for dashboards/API. */
  getSummary(): Record<string, unknown> {
    return {
      brainName: this.brainName,
      feedbackCycles: this.cycleCount,
      dataMiner: this.dataMiner?.getState() ?? null,
      selfInsights: this.selfObserver.getInsights(undefined, 10),
      anomalies: this.anomalyDetective.getAnomalies(undefined, 10),
      experiments: this.experimentEngine.list(undefined, 10),
      agenda: this.researchAgenda.getAgenda(10),
      journal: this.journal.getSummary(),
      knowledge: this.knowledgeDistiller.getSummary(),
      correlations: this.crossDomain.getCorrelations(10),
      strategy: this.adaptiveStrategy.getStatus(),
      dream: this.dreamEngine?.getStatus() ?? null,
      prediction: this.predictionEngine?.getSummary() ?? null,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────

function categorize(eventType: string): ObservationCategory {
  if (eventType.includes('cross_brain') || eventType.includes('cross:')) return 'cross_brain';
  if (eventType.includes('latency') || eventType.includes('duration')) return 'latency';
  if (eventType.includes('resolution') || eventType.includes('solved')) return 'resolution_rate';
  if (eventType.includes('query') || eventType.includes('search') || eventType.includes('recall')) return 'query_quality';
  return 'tool_usage';
}
