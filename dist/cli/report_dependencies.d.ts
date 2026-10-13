#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/report_dependencies.ts
 *
 * STANDALONE AUDITOR DEPENDENCY MINIMUMS CLI REPORTER (Node.js 26+ Native)
 *
 * Inspects, evaluates, and reports the status of mandatory minimum library versions
 * governed by @francogp/auditor against the target host project's package.json
 * and package-lock.json. Operates hermetically without loading auditor suites
 * or executing host extensions.
 */
import { type ProjectDependenciesReport } from '../core/auditorMinimums.ts';
export interface DependencyReportCliOptions {
    readonly project?: string;
    readonly json: boolean;
    readonly commandsOnly: boolean;
    readonly all: boolean;
    readonly noFail: boolean;
}
export declare function parseCliArgs(rawArgs?: readonly string[]): DependencyReportCliOptions;
export declare function runDependenciesReport(projectRoot?: string, options?: DependencyReportCliOptions): ProjectDependenciesReport;
//# sourceMappingURL=report_dependencies.d.ts.map