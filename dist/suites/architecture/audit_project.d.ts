/**
 * scripts/audit_project.ts
 *
 * STABLE PROJECT AUDIT ENGINE (Node.js 26+)
 *
 * Final Safe Version: Context-aware GPU checking.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type Violation } from './audit_rules.ts';
interface FallowInstance {
    path?: string;
    file?: string;
    line?: number;
    start_line?: number;
}
interface FallowCloneGroup {
    instances: FallowInstance[];
    duplicated_tokens?: number;
    token_count?: number;
}
interface FallowFinding {
    path: string;
    line: number;
    cwe?: number;
    evidence?: string;
    kind?: string;
    name?: string;
    function_name?: string;
    cognitive?: number;
    cyclomatic?: number;
    line_count?: number;
    param_count?: number;
    exceeded?: string;
    severity?: string;
}
interface FallowLargeFunction {
    path: string;
    name?: string;
    line: number;
    line_count: number;
}
interface FallowTarget {
    path: string;
    priority?: number;
    recommendation?: string;
    category?: string;
}
interface FallowUnresolvedImport {
    path: string;
    specifier: string;
    line?: number;
}
interface FallowUnusedDep {
    package_name: string;
    path?: string;
    line?: number;
}
interface FallowUnusedExport {
    export_name: string;
    path: string;
    line?: number;
}
interface FallowUnusedFile {
    path: string;
}
interface FallowCircularDep {
    path?: string;
    cycle?: string[];
    files?: string[];
    message?: string;
    line?: number;
}
interface FallowStaleSuppression {
    path?: string;
    file?: string;
    line?: number;
    kind?: string;
    message?: string;
    origin?: {
        type?: string;
        issue_kind?: string;
        is_file_level?: boolean;
        kind_known?: boolean;
    };
}
interface FallowLocation {
    path?: string;
    file?: string;
    line?: number;
    col?: number;
}
interface FallowDuplicateExport {
    path?: string;
    file?: string;
    line?: number;
    export_name?: string;
    name?: string;
    locations?: FallowLocation[];
}
interface FallowUnusedStoreMember {
    path: string;
    parent_name: string;
    member_name: string;
    kind?: string;
    line: number;
    col?: number;
}
interface FallowUnusedClassMember {
    path: string;
    parent_name: string;
    member_name: string;
    kind?: string;
    line: number;
    col?: number;
}
interface FallowUnusedType {
    path: string;
    export_name: string;
    line: number;
    col?: number;
    is_type_only?: boolean;
    is_re_export?: boolean;
}
interface FallowUnusedComponentEmit {
    path: string;
    component_name: string;
    emit_name: string;
    line: number;
    col?: number;
}
interface FallowUnlistedDependency {
    package_name: string;
    imported_from?: Array<{
        path?: string;
        line?: number;
        col?: number;
    }>;
}
interface FallowBoundaryViolation {
    from_path: string;
    to_path: string;
    from_zone: string;
    to_zone: string;
    import_specifier?: string;
    line: number;
    col?: number;
}
interface FallowUnusedComponentProp {
    path: string;
    component_name: string;
    prop_name: string;
    line: number;
    col?: number;
}
interface FallowUnrenderedComponent {
    path: string;
    component_name: string;
    line: number;
    col?: number;
}
interface FallowUnprovidedInject {
    path: string;
    inject_key: string;
    line: number;
    col?: number;
}
interface FallowDeadCode {
    unused_dependencies?: FallowUnusedDep[];
    unused_dev_dependencies?: FallowUnusedDep[];
    unused_exports?: FallowUnusedExport[];
    unused_files?: FallowUnusedFile[];
    circular_dependencies?: FallowCircularDep[];
    stale_suppressions?: FallowStaleSuppression[];
    duplicate_exports?: FallowDuplicateExport[];
    unused_store_members?: FallowUnusedStoreMember[];
    unused_class_members?: FallowUnusedClassMember[];
    unused_types?: FallowUnusedType[];
    unused_component_emits?: FallowUnusedComponentEmit[];
    unlisted_dependencies?: FallowUnlistedDependency[];
    boundary_violations?: FallowBoundaryViolation[];
    unused_component_props?: FallowUnusedComponentProp[];
    unrendered_components?: FallowUnrenderedComponent[];
    unprovided_injects?: FallowUnprovidedInject[];
    unresolved_imports?: FallowUnresolvedImport[];
    workspace_diagnostics?: FallowWorkspaceDiagnostic[];
}
interface FallowWorkspaceDiagnostic {
    path?: string;
    kind?: string;
    message?: string;
}
interface FallowComplexity {
    findings?: FallowFinding[];
}
export interface FallowAuditData {
    clone_groups?: FallowCloneGroup[];
    security_findings?: FallowFinding[];
    dead_code?: FallowDeadCode;
    complexity?: FallowComplexity;
    findings?: FallowFinding[];
    large_functions?: FallowLargeFunction[];
    targets?: FallowTarget[];
    workspace_diagnostics?: FallowWorkspaceDiagnostic[];
    unused_dependencies?: FallowUnusedDep[];
    unused_dev_dependencies?: FallowUnusedDep[];
    unused_exports?: FallowUnusedExport[];
    unused_files?: FallowUnusedFile[];
    unresolved_imports?: FallowUnresolvedImport[];
    circular_dependencies?: FallowCircularDep[];
    stale_suppressions?: FallowStaleSuppression[];
    duplicate_exports?: FallowDuplicateExport[];
    unused_store_members?: FallowUnusedStoreMember[];
    unused_class_members?: FallowUnusedClassMember[];
    unused_types?: FallowUnusedType[];
    unused_component_emits?: FallowUnusedComponentEmit[];
    unlisted_dependencies?: FallowUnlistedDependency[];
    boundary_violations?: FallowBoundaryViolation[];
    unused_component_props?: FallowUnusedComponentProp[];
    unrendered_components?: FallowUnrenderedComponent[];
    unprovided_injects?: FallowUnprovidedInject[];
}
export declare function mapFallowJson(command: string, data: FallowAuditData): Violation[];
export declare function getViolationCategory(v: Violation): string;
export declare class ProjectArchitectureAuditor extends BaseAuditor<string> {
    constructor();
    runAudit(): Promise<void>;
}
export {};
//# sourceMappingURL=audit_project.d.ts.map