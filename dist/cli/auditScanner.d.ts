/**
 * packages/auditor/src/cli/auditScanner.ts
 *
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */
import { type AuditTaskDefinition } from '../core/auditContract.ts';
export declare const AUDIT_PRESETS: {
    readonly lint: readonly ["validate_domain_types", "validate_o1_data_structures", "validate_component_styles", "audit_project", "validate_vue_sfc_hygiene", "validate_console_cleanliness", "validate_audit_headers", "validate_type_check", "validate_markdown_lint", "validate_eslint", "validate_html_validate"];
    readonly md: readonly ["validate_markdown_links", "validate_markdown_code_references", "validate_markdown_lint", "validate_markdown_syntax", "validate_dox_integrity"];
};
export declare const AST_DEPENDENT_SUITE_IDS: readonly ["validate_pinia_reactivity", "validate_reactive_leaks", "validate_bundle_budget", "validate_duplicate_constants"];
export type AstDependentSuiteId = (typeof AST_DEPENDENT_SUITE_IDS)[number];
export declare const AST_DEPENDENT_SUITES: ReadonlySet<string>;
export type AuditPresetName = keyof typeof AUDIT_PRESETS;
export interface DiscoveryOptions {
    baseDir?: string;
    family?: string;
    task?: string;
    suites?: string[];
    preset?: string;
    fastOnly?: boolean;
}
export declare function discoverAuditors(options?: DiscoveryOptions): Promise<AuditTaskDefinition[]>;
//# sourceMappingURL=auditScanner.d.ts.map