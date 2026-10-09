/**
 * scripts/auditors/architecture/validate_component_styles.ts
 *
 * VUE COMPONENT STYLE LINKAGE & SCSS ORPHAN AUDITOR (Node.js 26+ Native)
 *
 * Enforces component-level style governance across the codebase:
 *   1. Broken style link verification: All `<style src="...">` in `.vue` files
 *      and `@use`/`@import`/`@forward` must resolve to existent files on disk.
 *   2. Missing style linkage verification: Every `.vue` component with custom
 *      template classes must have an associated `<style>` block or explicit link.
 *   3. SCSS orphan detection: All component stylesheets must be
 *      actively linked or imported in the dependency graph rooted at main SCSS entries
 *      or directly inside Vue components.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=. --allow-fs-write=. scripts/auditors/architecture/validate_component_styles.ts
 *   npm run validate:component-styles
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export declare const COMPONENT_STYLE_RULES: readonly ["broken-style-link", "missing-style-tag", "banned-style-inherited", "orphaned-scss", "ad-hoc-button-styles", "banned-plain-css-style", "banned-raw-css-file"];
export type ComponentStyleRuleId = (typeof COMPONENT_STYLE_RULES)[number];
export declare const COMPONENT_STYLE_VIOLATION_TYPES: readonly ["broken_style_link", "missing_style_tag", "banned_style_inherited", "orphaned_scss", "ad_hoc_button_styles", "banned_plain_css_style", "banned_raw_css_file"];
export type ComponentStyleViolationType = (typeof COMPONENT_STYLE_VIOLATION_TYPES)[number];
export interface ComponentStyleViolation {
    readonly file: string;
    readonly type: ComponentStyleViolationType;
    readonly message: string;
}
export interface ComponentStyleAuditResult {
    readonly vueComponentsScanned: number;
    readonly scssFilesScanned: number;
    readonly cssFilesScanned?: number;
    readonly violations: readonly ComponentStyleViolation[];
    readonly passed: boolean;
}
export declare class ComponentStylesAuditor extends BaseAuditor<ComponentStyleRuleId> {
    private readonly collectedViolations;
    private vueCount;
    private scssCount;
    private cssCount;
    constructor(options?: {
        projectRoot?: string;
        roots?: readonly string[];
        fix?: boolean;
    });
    recordViolation(v: ComponentStyleViolation, ruleId: ComponentStyleRuleId, context: string, line?: number, fixable?: boolean): void;
    getViolations(): readonly ComponentStyleViolation[];
    getVueCount(): number;
    getScssCount(): number;
    getCssCount(): number;
    runAudit(): void;
}
export declare function auditComponentStyles(rootDir?: string): ComponentStyleAuditResult;
//# sourceMappingURL=validate_component_styles.d.ts.map