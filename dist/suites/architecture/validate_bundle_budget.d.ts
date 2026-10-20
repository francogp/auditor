import { GitIgnoreRequirement } from "../../core/auditContract.js";
import { SharedAstContext } from "../../core/astContext.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_bundle_budget.d.ts
export declare const BUNDLE_BUDGET_RULES: readonly ["bundle-runtime-leak", "bundle-heavy-import", "bundle-chunk-size"];
export type BundleBudgetRuleId = (typeof BUNDLE_BUDGET_RULES)[number];
export declare const DEFAULT_FORBIDDEN_VALUE_IMPORTS_UI: readonly {
  module: string;
  reason: string;
}[];
export declare function getForbiddenValueImportsUI(projectRoot?: string): readonly {
  module: string;
  reason: string;
}[];
export interface BundleBudgetAuditorOptions {
  readonly projectRoot?: string;
}
export declare class BundleBudgetAuditor extends BaseAuditor<BundleBudgetRuleId> {
  static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  constructor(options?: BundleBudgetAuditorOptions);
  runAudit(astContext?: SharedAstContext): Promise<void>;
}
//#endregion