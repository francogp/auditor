import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export declare const TEST_FRAGMENTATION_RULES: readonly ["no-fragmented-tests", "unnecessary-jsdom"];
export type TestFragmentationRuleId = (typeof TEST_FRAGMENTATION_RULES)[number];
export declare const MIN_TEST_FILE_LINES = 60;
export declare const DISTRIBUTION_SMALL_MAX_LINES = 300;
export declare const DISTRIBUTION_TARGET_MAX_LINES = 800;
export declare const DISTRIBUTION_OVERSIZED_MIN_LINES = 1200;
/**
 * Whitelist of legitimately standalone runners, process wrappers, container benchmarks,
 * and isolated Vue SFC view mounting specs that are exempt from the 60-line floor.
 */
export declare const TEST_FRAGMENTATION_WHITELIST: ReadonlySet<string>;
export interface TestSuiteDistribution {
  micro: number;
  small: number;
  target: number;
  oversized: number;
  other: number;
  totalTestFiles: number;
  totalTestLines: number;
}
export declare class TestFragmentationAuditor extends FileScanAuditor<TestFragmentationRuleId> {
  private readonly minTestLines;
  private readonly fragmentationWhitelist;
  private distribution;
  constructor(options?: FileScanRootsOptions);
  getDistribution(): Readonly<TestSuiteDistribution>;
  protected scanFile(relPath: string, content: string): void;
  private checkMicroTestFragmentation;
  private checkUnnecessaryJsdom;
  runAudit(): Promise<void>;
  printDistributionSummary(): void;
}