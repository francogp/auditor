import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_template_ids.d.ts
export type TemplateIdRuleId = 'template-duplicate-static-id' | 'template-shared-static-id' | 'template-missing-input-id';
export declare const TEMPLATE_ID_RULES: readonly TemplateIdRuleId[];
export interface TemplateIdAuditorOptions extends FileScanRootsOptions {
  readonly requireInputIds?: boolean;
}
export declare class TemplateIdAuditor extends FileScanAuditor<TemplateIdRuleId> {
  private readonly globalIdMap;
  private readonly requireInputIds;
  constructor(options?: TemplateIdAuditorOptions);
  getMatchLineInfo(content: string, lines: string[], offset: number): {
    lineNumber: number;
    lineContent: string;
    isIgnored: boolean;
  };
  protected scanFile(relPath: string, content: string): void;
  private checkSingleIdCollisions;
  runAudit(): Promise<void>;
}
//#endregion