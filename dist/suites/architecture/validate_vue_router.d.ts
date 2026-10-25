import { AuditedDocument } from "../../core/auditedDocument.js";
import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
import ts from "typescript";
export type VueRouterRuleId = 'no-deprecated-router-next' | 'no-define-async-component-in-router' | 'no-window-location-navigation';
export declare const VUE_ROUTER_RULES: readonly VueRouterRuleId[];
export declare class ValidateVueRouterAuditor extends FileScanAuditor<VueRouterRuleId> {
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile, doc?: AuditedDocument): void;
  private scanDeprecatedRouterNext;
  private scanDefineAsyncComponent;
  private isSpaInternalUrl;
  private scanWindowLocationNavigation;
}