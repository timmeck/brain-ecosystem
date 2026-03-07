export { KnowledgeGraphEngine, runKnowledgeGraphMigration } from './graph-engine.js';
export type {
  KnowledgeGraphConfig,
  KnowledgeFact,
  FactQuery,
  InferenceChain,
  Contradiction,
  KnowledgeGraphStatus,
} from './graph-engine.js';

export { FactExtractor } from './fact-extractor.js';
export type {
  ExtractedFact,
  FactExtractorConfig,
} from './fact-extractor.js';

export { ContradictionResolver, runContradictionResolverMigration } from './contradiction-resolver.js';
export type {
  ContradictionType,
  ResolutionStrategy,
  FactResolution,
  ContradictionResolverStatus,
} from './contradiction-resolver.js';
