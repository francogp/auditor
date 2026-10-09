/**
 * packages/auditor/src/suites/architecture/validate_vue_reactivity.ts
 *
 * VUE REACTIVITY & STATE HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces Vue 3 Composition API reactivity rules (vue-best-practices):
 *   1. No Side Effects in Computed (`no-side-effects-in-computed`):
 *      Prohibits in-place mutations (.sort, .splice, .push, .pop, .reverse) and
 *      ref reassignments (.value = ) inside computed() property bodies.
 *   2. Watch Reactive Property Getter (`watch-reactive-property-getter`):
 *      Enforces getter function wrapper when watching reactive props (e.g. watch(() => props.foo))
 *      preventing silent reactivity loss on primitive properties.
 *   3. No Async in Computed (`no-async-in-computed`):
 *      Prohibits computed(async () => ...); computed cannot unwrap promises.
 *   4. No Destructured Reactive (`no-destructured-reactive`):
 *      Prohibits destructuring reactive() objects directly without toRefs().
 *      (Note: defineProps destructuring is permitted under Vue 3.5+ native compiler transform).
 *
 * Escape Hatch:
 *   // reactivity-ok: <reason>, // sfc-ok: <reason>
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type VueReactivityRuleId = 'no-side-effects-in-computed' | 'watch-reactive-property-getter' | 'no-async-in-computed' | 'no-destructured-reactive';
export declare const VUE_REACTIVITY_RULES: readonly VueReactivityRuleId[];
export declare class ValidateVueReactivityAuditor extends FileScanAuditor<VueReactivityRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
    private reportComputedViolation;
    private auditDirectMutations;
    private evalLocalIdentifierMutation;
    private auditLocalIdentifierMutations;
    private auditRefAssignments;
    private auditComputedSideEffects;
    private extractBalancedBlock;
}
//# sourceMappingURL=validate_vue_reactivity.d.ts.map