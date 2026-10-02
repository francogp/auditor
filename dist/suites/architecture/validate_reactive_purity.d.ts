/**
 * scripts/auditors/architecture/validate_reactive_purity.ts
 *
 * REACTIVE COMPUTED PURITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces pure, side-effect-free computed getters across stores and composables:
 *   1. Computed getters must NEVER mutate state (.value =, state.x =, this.x =, store.x =).
 *   2. Computed getters must NEVER trigger persistence side-effects (.save(), scheduleSave(), etc.).
 *
 * Escape Hatch:
 *   // purity-ok: <justification> disables check on that line or block.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_purity.ts
 *   npm run validate:reactive-purity
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type ReactivePurityRuleId = 'computed-state-mutation' | 'computed-side-effect';
export declare const REACTIVE_PURITY_RULES: readonly ReactivePurityRuleId[];
export declare class ReactivePurityAuditor extends FileScanAuditor<ReactivePurityRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    private checkComputedCall;
    protected scanFile(relPath: string, content: string): void;
    private reportComputedViolation;
    private inspectGetterBody;
    private hasPuritySuppression;
    private extractScript;
}
//# sourceMappingURL=validate_reactive_purity.d.ts.map