import type { ResearchConfig } from '../types/config.types.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { CodeModuleRepository } from '../db/repositories/code-module.repository.js';
import type { SynapseRepository } from '../db/repositories/synapse.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { ResearchCycleResult } from '../types/research.types.js';
import { TrendAnalyzer } from './trend-analyzer.js';
import { GapAnalyzer } from './gap-analyzer.js';
import { SynergyDetector } from './synergy-detector.js';
import { TemplateExtractor } from './template-extractor.js';
import { InsightGenerator } from './insight-generator.js';
import { BaseResearchEngine } from '@timmeck/brain-core';

export class ResearchEngine extends BaseResearchEngine {
  private trendAnalyzer: TrendAnalyzer;
  private gapAnalyzer: GapAnalyzer;
  private synergyDetector: SynergyDetector;
  private templateExtractor: TemplateExtractor;
  private insightGenerator: InsightGenerator;

  constructor(
    private config: ResearchConfig,
    private errorRepo: ErrorRepository,
    private solutionRepo: SolutionRepository,
    private projectRepo: ProjectRepository,
    private codeModuleRepo: CodeModuleRepository,
    private synapseRepo: SynapseRepository,
    private insightRepo: InsightRepository,
    private synapseManager: SynapseManager,
  ) {
    super(config);
    this.trendAnalyzer = new TrendAnalyzer(errorRepo, solutionRepo, projectRepo, insightRepo, config);
    this.gapAnalyzer = new GapAnalyzer(errorRepo, solutionRepo, synapseRepo, projectRepo, insightRepo, config);
    this.synergyDetector = new SynergyDetector(synapseRepo, codeModuleRepo, solutionRepo, errorRepo, projectRepo, insightRepo, config);
    this.templateExtractor = new TemplateExtractor(codeModuleRepo, projectRepo, insightRepo, config);
    this.insightGenerator = new InsightGenerator(projectRepo, errorRepo, solutionRepo, codeModuleRepo, insightRepo, config);
  }

  runCycle(): ResearchCycleResult {
    const start = Date.now();
    this.logger.info('Research cycle starting');

    const result: ResearchCycleResult = {
      insightsGenerated: 0,
      patternsFound: 0,
      correlationsFound: 0,
      duration: 0,
    };

    // Phase 1: Trend analysis
    const trends = this.trendAnalyzer.analyze();
    result.patternsFound += trends;
    result.insightsGenerated += trends;

    // Phase 2: Gap analysis
    const gaps = this.gapAnalyzer.analyze();
    result.insightsGenerated += gaps;

    // Phase 3: Synergy detection
    const synergies = this.synergyDetector.detect();
    result.correlationsFound += synergies;
    result.insightsGenerated += synergies;

    // Phase 4: Template extraction
    const templates = this.templateExtractor.extract();
    result.patternsFound += templates;
    result.insightsGenerated += templates;

    // Phase 5: Insight generation
    const generated = this.insightGenerator.generate();
    result.insightsGenerated += generated;

    // Phase 6: Insight prioritization (expire old insights)
    const expired = this.insightRepo.expire();
    if (expired > 0) {
      this.logger.info(`Expired ${expired} outdated insights`);
    }

    // Phase 7: Synapse maintenance
    const decay = this.synapseManager.runDecay();
    this.logger.debug(`Synapse maintenance: ${decay.decayed} decayed, ${decay.pruned} pruned`);

    result.duration = Date.now() - start;
    this.logger.info(
      `Research cycle complete: ${result.insightsGenerated} insights, ${result.patternsFound} patterns, ${result.correlationsFound} correlations (${result.duration}ms)`,
    );

    return result;
  }
}
