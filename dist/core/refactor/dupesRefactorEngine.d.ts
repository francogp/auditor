import { BaseRefactorEngine, RefactorEngineOptions } from "./baseRefactorEngine.js";
import { CloneTopology, RefactorPlan, TriagedCloneCandidate } from "./refactorContracts.js";
import { FallowArchitectureAuditor } from "../../suites/architecture/validate_fallow.js";
export declare function runFallowJson<T>(cmd: string, args: string[], projectRoot: string): T;
export declare function determineTopology(files: readonly string[]): CloneTopology;
export type DupesRefactorEngineOptions = RefactorEngineOptions<FallowArchitectureAuditor>;
export declare class DupesRefactorEngine extends BaseRefactorEngine<TriagedCloneCandidate, RefactorPlan, FallowArchitectureAuditor> {
  readonly toolId = "auditor-dupes";
  readonly configSectionKey: "fallow";
  private readonly cachedCandidatesByMin;
  constructor(options?: DupesRefactorEngineOptions);
  discoverInFile(filePath: string): readonly TriagedCloneCandidate[];
  createPlan(id: string, findings: readonly TriagedCloneCandidate[]): RefactorPlan;
  applyPlan(projectRoot: string, plan: RefactorPlan): Promise<{
    readonly modifiedFiles: readonly string[];
  }>;
  /**
   * Discovers and triages clone groups from Fallow, strictly filtering
   * instances through the canonical sub-auditor path resolution.
   */
  triageCandidates(minOccurrences?: number): readonly TriagedCloneCandidate[];
}