/**
 * scripts/auditors/architecture/validate_pinia_reactivity.ts
 *
 * PINIA REACTIVITY & STATE INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces Pinia reactivity standards across components and composables (vue-pinia-best-practices):
 *   1. No Store Destructuring Without storeToRefs (`no-store-destructuring-without-storetorefs`):
 *      Calling `const { a, b } = useXxxStore()` directly strips reactivity from reactive
 *      state properties and getters. Reactive state destructuring MUST be wrapped with `storeToRefs(store)`.
 *   2. No Direct State Mutation Outside Actions (`no-direct-state-mutation-outside-actions`):
 *      Direct assignment to `store.$state = ...` bypasses Pinia mutation tracking and action
 *      lifecycle. Permitted exclusively in authorized save persistence coordinators and tests.
 *
 * Escape Hatches:
 *   `// pinia-ok: <reason>`, `// store-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_pinia_reactivity.ts
 */
import ts from 'typescript';
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type PiniaReactivityRuleId = 'no-store-destructuring-without-storetorefs' | 'no-direct-state-mutation-outside-actions';
export declare const PINIA_REACTIVITY_RULES: readonly PiniaReactivityRuleId[];
export declare const DEFAULT_AUTHORIZED_STATE_MUTATION_FILES: readonly string[];
export declare function getAuthorizedStateMutationFiles(projectRoot?: string): ReadonlySet<string>;
export declare const AUTHORIZED_STATE_MUTATION_FILES: ReadonlySet<string>;
export declare class PiniaReactivityAuditor extends FileScanAuditor<PiniaReactivityRuleId> {
    private readonly storesRoots;
    private readonly authorizedStateMutationFiles;
    constructor(roots?: readonly string[], projectRoot?: string);
    private reportPiniaViolation;
    private checkStoreVariableDeclaration;
    private checkStateMutation;
    protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void;
}
//# sourceMappingURL=validate_pinia_reactivity.d.ts.map