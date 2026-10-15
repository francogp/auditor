import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_vue_reactivity.d.ts
export type VueReactivityRuleId = 'no-side-effects-in-computed' | 'watch-reactive-property-getter' | 'no-async-in-computed' | 'no-destructured-reactive';
export declare const VUE_REACTIVITY_RULES: readonly VueReactivityRuleId[];
export declare class ValidateVueReactivityAuditor extends FileScanAuditor<VueReactivityRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string);
  protected scanFile(relPath: string, content: string): void;
  private checkAsyncInComputed;
  private checkWatchPropertyGetter;
  private checkDestructuredReactive;
  private scanAst;
  private reportComputedViolation;
  private auditDirectMutations;
  private evalLocalIdentifierMutation;
  private auditLocalIdentifierMutations;
  private auditRefAssignments;
  private auditComputedSideEffects;
  private extractBalancedBlock;
}
//#endregion