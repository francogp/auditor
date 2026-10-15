import { AuditTaskDefinition } from "./auditContract.js";
import { BaseAuditor } from "./auditorBase.js";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
//#region src/core/auditorContractConformance.d.ts
export interface DiscoveredAuditorTask extends AuditTaskDefinition {
  isExtension?: boolean;
}
export interface AuditorConformanceViolation {
  auditorTaskUid: string;
  testFile?: string;
  type: 'missing-test-file' | 'missing-construction-block' | 'missing-clean-block' | 'missing-violation-block' | 'untested-declared-rule' | 'invalid-metadata' | 'invalid-rule-description';
  message: string;
}
export declare function isEligibleExtensionAuditorFile(name: string): boolean;
export declare function scanExtensionAuditors(projectRoot: string, tasks: DiscoveredAuditorTask[]): void;
/**
 * Discovers all auditor tasks: core suites in src/suites/ plus extensions in scripts/auditors and config.extensions.
 */
export declare function scanAllAuditorTasks(projectRoot?: string): Promise<DiscoveredAuditorTask[]>;
/**
 * Finds the exported BaseAuditor subclass in a loaded module.
 */
export declare function findAuditorClass(mod: Record<string, unknown>): (new (...args: unknown[]) => BaseAuditor<string>) | null;
/**
 * Safely instantiates an auditor class using supported constructor signatures.
 */
export declare function instantiateAuditorClass(Cls: new (...args: unknown[]) => BaseAuditor<string>, tempDir: string): BaseAuditor<string>;
/**
 * Validates in-memory constructor contract and metadata for an instantiated auditor.
 */
export declare function validateAuditorConstruction(auditor: BaseAuditor<string>, taskId?: string): string[];
/**
 * Finds dedicated test file(s) for an auditor across core and extension conventions.
 */
export declare function findDedicatedTestFile(projectRoot: string, taskId: string, testRoots?: readonly string[]): {
  testFileAbs: string | null;
  testFileRel: string;
  allTestSources?: string;
};
export declare function checkConstructionVerification(testSource: string): boolean;
export declare function checkCleanVerification(testSource: string): boolean;
export declare function checkViolationVerification(testSource: string): boolean;
/**
 * Validates that an auditor's dedicated test file adheres to the strict 5-point contract.
 */
export declare function validateAuditorTestFileContent(testSource: string, testFileRel: string, auditor: BaseAuditor<string>): string[];
export interface ConformanceVitestHooks {
  readonly describe: typeof describe;
  readonly it: typeof it;
  readonly expect: typeof expect;
  readonly beforeAll: typeof beforeAll;
  readonly afterAll: typeof afterAll;
}
export interface AuditorContractConformanceOptions {
  readonly projectRoot?: string;
  readonly vitest?: ConformanceVitestHooks;
}
/**
 * Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
 * Operates with zero top-level static Vitest runtime imports so consumer packages never crash when Vitest is absent.
 */
export declare function runAuditorContractConformanceTests(options?: AuditorContractConformanceOptions): void | Promise<void>;
//#endregion