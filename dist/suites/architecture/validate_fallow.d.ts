/**
 * packages/auditor/src/suites/architecture/validate_fallow.ts
 *
 * OFFICIAL FALLOW STATIC INTELLIGENCE & REFACTORING TARGETS AUDITOR
 *
 * Dedicated standalone auditor for Fallow intelligence engine:
 *   1. Duplicate and triplicate code detection.
 *   2. Static security vulnerability analysis (CWE sinks).
 *   3. Dead code, unused exports, files, dependencies, and circular dependencies.
 *   4. Structural complexity and refactoring targets enforcement.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import type { FindingSeverity } from '../../core/auditContract.ts';
import type { FallowTargetPriority } from '../../core/auditConfigTypes.ts';
export declare const FALLOW_RULES: readonly ["fallow-refactoring-targets", "fallow-duplicate-code", "fallow-triplicate-code", "fallow-unused-exports", "fallow-unused-files", "fallow-unused-dependencies", "fallow-circular-dependencies", "fallow-boundary-violations", "fallow-stale-suppressions", "fallow-workspace-diagnostic", "fallow-security-cwe"];
export type FallowRuleId = (typeof FALLOW_RULES)[number];
export declare const FALLOW_RULE_DESCRIPTIONS: Record<FallowRuleId, string>;
export declare const FALLOW_HIGH_PRIORITY_THRESHOLD = 20;
export declare const FALLOW_CRITICAL_PRIORITY_THRESHOLD = 30;
export declare const FALLOW_PRIORITY_MIN_THRESHOLDS: Record<FallowTargetPriority, number>;
export interface FallowCloneGroup {
    readonly instances: Array<{
        file: string;
        start_line: number;
    }>;
    readonly duplicated_tokens?: number;
    readonly token_count?: number;
}
export interface FallowComplexityFinding {
    readonly path: string;
    readonly name?: string;
    readonly line: number;
    readonly cyclomatic?: number;
    readonly cognitive?: number;
    readonly line_count?: number;
    readonly exceeded?: string;
    readonly rule_id?: string;
    readonly message?: string;
}
export interface FallowTarget {
    readonly path: string;
    readonly priority?: number;
    readonly recommendation?: string;
    readonly category?: string;
}
export interface FallowDeadCodeData {
    readonly unused_files?: Array<{
        path: string;
    }>;
    readonly unused_exports?: Array<{
        path: string;
        export_name: string;
        line: number;
    }>;
    readonly unused_dependencies?: Array<{
        path?: string;
        package_name: string;
        line?: number;
    }>;
    readonly unused_dev_dependencies?: Array<{
        path?: string;
        package_name: string;
        line?: number;
    }>;
    readonly circular_dependencies?: Array<{
        files?: string[];
        cycle?: string[];
        path?: string;
        line?: number;
        message?: string;
    }>;
    readonly stale_suppressions?: Array<{
        path?: string;
        file?: string;
        line?: number;
        message?: string;
        kind?: string;
        origin?: {
            issue_kind?: string;
            kind_known?: boolean;
        };
    }>;
    readonly duplicate_exports?: Array<{
        export_name?: string;
        name?: string;
        locations?: Array<{
            path?: string;
            file?: string;
            line?: number;
        }>;
        path?: string;
        file?: string;
        line?: number;
    }>;
    readonly workspace_diagnostics?: Array<{
        kind?: string;
        message?: string;
        path?: string;
    }>;
    readonly unlisted_dependencies?: Array<{
        path: string;
        package_name: string;
        line: number;
    }>;
    readonly unresolved_imports?: Array<{
        path: string;
        specifier: string;
        line: number;
    }>;
}
export interface FallowAuditData extends FallowDeadCodeData {
    readonly clone_groups?: FallowCloneGroup[];
    readonly findings?: FallowComplexityFinding[];
    readonly dead_code?: FallowDeadCodeData;
    readonly boundary_violations?: Array<{
        path: string;
        line: number;
        message: string;
    }>;
    readonly targets?: FallowTarget[];
    readonly complexity?: {
        findings?: FallowComplexityFinding[];
    };
}
export interface FallowFindingItem {
    readonly file: string;
    readonly line: number;
    readonly message: string;
    readonly context: string;
    readonly ruleId: FallowRuleId;
    readonly severity: FindingSeverity;
}
export declare function mapFallowJson(command: string, data: FallowAuditData, projectRoot?: string): FallowFindingItem[];
export declare class FallowArchitectureAuditor extends BaseAuditor<FallowRuleId> {
    constructor(projectRoot?: string);
    private runFallowSubCommand;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_fallow.d.ts.map