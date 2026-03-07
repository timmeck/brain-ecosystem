export { CodeMiner, runCodeMinerMigration } from './code-miner.js';
export { PatternExtractor, runPatternExtractorMigration } from './pattern-extractor.js';
export { ContextBuilder } from './context-builder.js';
export { CodeGenerator, runCodeGeneratorMigration } from './code-generator.js';
export type { SelfImprovementProposal } from './code-generator.js';
export { CodegenServer } from './codegen-server.js';
export type { CodegenServerOptions } from './codegen-server.js';
export { RepoAbsorber } from './repo-absorber.js';
export type { AbsorbResult, RepoAbsorberStatus } from './repo-absorber.js';
export { FeatureExtractor } from './feature-extractor.js';
export type { ExtractedFeature, FeatureCategory, FeatureExtractionResult, FeatureSearchOptions, FeatureStats } from './feature-extractor.js';
export type {
  CodeMinerConfig, RepoContent, CodeMinerSummary,
  ExtractedPattern, DependencyPattern, TechStack, ProjectStructure, ReadmePattern,
  ContextBuilderConfig, BuiltContext,
  CodeGeneratorConfig, GenerationTrigger, GenerationStatus,
  GenerationRequest, GenerationResult, GenerationRecord, CodeGeneratorSummary,
} from './types.js';
