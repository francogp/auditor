#!/usr/bin/env -S node --experimental-strip-types
/**
 * @file report_test_coverage.ts
 * @description AUDITOR TEST COVERAGE CLI (Node.js 26+)
 * Canonical test execution coverage reporting, analysis, and verification tool.
 * Evaluates Istanbul/V8 coverage JSON, aggregates directory metrics, detects untracked files,
 * displays uncovered line ranges, and gates pull requests / commits.
 */
import '../core/permissionGuard.ts';
export declare function runTestCoverageReport(): Promise<void>;
//# sourceMappingURL=report_test_coverage.d.ts.map