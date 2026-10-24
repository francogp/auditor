import { ExemptionPolicy } from "../core/exemptionPolicies.js";
export type FileCoverageStatus = 'covered' | 'degraded' | 'uncovered' | 'exempt';
export interface FileCoverageEntry {
  file: string;
  status: FileCoverageStatus;
  coveringSuites: string[];
  degradedPolicies: ExemptionPolicy[];
  exemptionReason?: string;
}
export interface DirectoryCoverageSummary {
  directory: string;
  total: number;
  covered: number;
  degraded: number;
  uncovered: number;
  exempt: number;
  coveragePercent: number;
}
export interface CoverageMapResult {
  runId: string | null;
  totalTracked: number;
  totalCovered: number;
  totalDegraded: number;
  totalUncovered: number;
  totalExempt: number;
  overallCoveragePercent: number;
  directories: DirectoryCoverageSummary[];
  files: FileCoverageEntry[];
}
export interface CoverageMapCliOptions {
  projectRoot?: string;
  runId?: string;
  filesOnly?: boolean;
  uncoveredOnly?: boolean;
  degradedOnly?: boolean;
  jsonOutput?: boolean;
  human?: boolean;
}
export declare function parseCoverageMapCliArgs(rawInputArgs?: readonly string[]): CoverageMapCliOptions;
export declare function generateCoverageMap(options?: CoverageMapCliOptions): Promise<CoverageMapResult>;
export declare function renderDirectorySummaryTable(result: CoverageMapResult): string;
export declare function renderFilesTable(files: readonly FileCoverageEntry[]): string;
export declare function runCoverageMapReport(options?: CoverageMapCliOptions): Promise<void>;