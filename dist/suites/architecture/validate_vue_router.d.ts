import { FileScanAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_vue_router.d.ts
export type VueRouterRuleId = 'no-deprecated-router-next' | 'no-define-async-component-in-router' | 'no-window-location-navigation';
export declare const VUE_ROUTER_RULES: readonly VueRouterRuleId[];
export declare class ValidateVueRouterAuditor extends FileScanAuditor<VueRouterRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string);
  protected scanFile(relPath: string, content: string): void;
}
//#endregion