import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const EDITORCONFIG_RULES: readonly ["editorconfig-missing", "editorconfig-missing-setting"];
export type EditorConfigRuleId = (typeof EDITORCONFIG_RULES)[number];
export declare const CANONICAL_EDITORCONFIG_LINES: readonly ["# EditorConfig helps maintain consistent coding styles for multiple developers", "# https://editorconfig.org", "", "root = true", "", "[*]", "charset = utf-8", "end_of_line = lf", "indent_style = space", "indent_size = 2", "insert_final_newline = true", "trim_trailing_whitespace = true", "", "[*.md]", "trim_trailing_whitespace = false", ""];
export declare const CANONICAL_EDITORCONFIG_CONTENT: string;
export declare const EDITORCONFIG_REQUIREMENT: AuditorConfigFileRequirement<EditorConfigRuleId>;
export interface EditorConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}
export declare class ValidateEditorconfigAuditor extends BaseAuditor<EditorConfigRuleId> {
  constructor(options?: EditorConfigAuditorOptions);
  runAudit(): Promise<void>;
}