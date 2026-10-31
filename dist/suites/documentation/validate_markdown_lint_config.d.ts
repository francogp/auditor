import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const MARKDOWNLINT_CONFIG_RULES: readonly ["markdownlint-config-missing", "markdownlint-config-syntax", "markdownlint-config-missing-strict-rule"];
export type MarkdownLintConfigRuleId = (typeof MARKDOWNLINT_CONFIG_RULES)[number];
export interface MarkdownLintConfigShape {
  default?: boolean;
  MD013?: boolean;
  MD060?: boolean;
  MD033?: boolean | {
    allowed_elements?: string[];
  };
  MD024?: boolean | {
    siblings_only?: boolean;
  };
  MD007?: boolean | {
    indent?: number;
  };
  [key: string]: unknown;
}
export declare const CANONICAL_MARKDOWNLINT_CONFIG: MarkdownLintConfigShape;
export declare const MARKDOWNLINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<MarkdownLintConfigRuleId>;
export interface MarkdownLintConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}
export declare class ValidateMarkdownLintConfigAuditor extends BaseAuditor<MarkdownLintConfigRuleId> {
  constructor(options?: MarkdownLintConfigAuditorOptions);
  runAudit(): Promise<void>;
}