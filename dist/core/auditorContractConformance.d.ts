/**
 * src/core/auditorContractConformance.ts
 *
 * DYNAMIC AUDITOR CONTRACT & TESTING CONFORMANCE ENGINE (Node.js 26+ Native)
 * Automatically discovers all sub-auditors across core suites and extensions,
 * validating live BaseAuditor instantiation, metadata integrity, and the strict
 * 5-point test contract (Construction, Clean Path, Violation Path, Warnings, and 100% Rule Coverage).
 */
import { BaseAuditor } from './auditorBase.ts';
import type { AuditTaskDefinition } from './auditContract.ts';
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
/**
 * Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
 */
export declare function runAuditorContractConformanceTests(options?: {
    projectRoot?: string;
}): void;
//# sourceMappingURL=auditorContractConformance.d.ts.map