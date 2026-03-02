export { ParameterRegistry, runParameterRegistryMigration } from './parameter-registry.js';
export type { ParameterDefinition, ParameterChange, ParameterSnapshot, RegisteredParameter } from './parameter-registry.js';

export { MetaCognitionLayer, runMetaCognitionMigration } from './meta-cognition-layer.js';
export type { EngineGrade, EngineMetric, EngineReportCard, FrequencyAdjustment, MetaCognitionStatus, MetaTrend, TrendDirection, LongTermAnalysis, SeasonalPattern } from './meta-cognition-layer.js';

export { AutoExperimentEngine, runAutoExperimentMigration } from './auto-experiment-engine.js';
export type { AutoExperiment, AutoExperimentStatus, ExperimentCandidate, AutoExperimentEngineStatus } from './auto-experiment-engine.js';

export { SelfTestEngine, runSelfTestMigration } from './self-test-engine.js';
export type { SelfTest, UnderstandingReport, SelfTestStatus } from './self-test-engine.js';

export { TeachEngine, runTeachEngineMigration } from './teach-engine.js';
export type { TeachingPackage, TeachEngineStatus } from './teach-engine.js';

export { SimulationEngine, runSimulationMigration } from './simulation-engine.js';
export type { Simulation, SimulationOutcome, SimulationStatus } from './simulation-engine.js';

export { EvolutionEngine, runEvolutionMigration } from './evolution-engine.js';
export type { EvolutionConfig, Genome, Individual, Generation, LineageEntry, EvolutionDataSources, EvolutionStatus } from './evolution-engine.js';
