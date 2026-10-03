/**
 * packages/auditor/src/suites/architecture/validate_dead_css.ts
 *
 * SCOPED DEAD CSS AUDITOR (Node.js 26+ Native)
 *
 * Enforces lean CSS bundles by detecting orphaned/unused classes inside <style scoped>
 * blocks of Vue components across src/components and src/views.
 *
 * Escape Hatch:
 *   // css-ok: <justification> or // dead-css-ok: <justification>
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_dead_css.ts
 *   npm run validate:dead-css
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type DeadCssRuleId = 'dead-scoped-css';
export declare const DEAD_CSS_RULES: readonly DeadCssRuleId[];
export declare const DEFAULT_GLOBAL_UTILITY_CLASSES: Set<string>;
export declare function getEffectiveGlobalUtilityClasses(projectRoot?: string): ReadonlySet<string>;
export interface ParsedScopedCssRule {
    readonly line: number;
    readonly selector: string;
    readonly rawBlock: string;
}
export declare function extractClassNamesFromSelector(selector: string): string[];
export declare function extractScopedRulesFromVueContent(rawContent: string): ParsedScopedCssRule[];
export declare class DeadCssAuditor extends BaseAuditor<DeadCssRuleId> {
    constructor(projectRoot?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_dead_css.d.ts.map