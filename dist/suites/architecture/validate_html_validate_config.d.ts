import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_html_validate_config.d.ts
export type HtmlValidateConfigRuleId = 'html-validate-config-missing' | 'html-validate-config-syntax' | 'html-validate-config-missing-strict-rule' | 'html-validate-config-missing-plugin' | 'html-validate-config-missing-transform' | 'html-validate-config-missing-doctype-style';
export declare const HTML_VALIDATE_CONFIG_RULES: readonly HtmlValidateConfigRuleId[];
export declare const MANDATORY_STRICT_HTML_RULES: readonly ["no-deprecated-attr", "deprecated", "element-permitted-content", "element-required-attributes", "attribute-allowed-values"];
export declare const CANONICAL_HTML_VALIDATE_CONFIG: {
  elements: string[];
  plugins: string[];
  extends: string[];
  transform: {
    '^.*\\.vue$': string;
  };
  rules: {
    'no-deprecated-attr': string;
    deprecated: string;
    'element-permitted-content': string;
    'element-required-attributes': string;
    'attribute-allowed-values': string;
    'doctype-style': (string | {
      style: string;
    })[];
    'element-case': string;
    'element-name': string;
    'no-inline-style': string;
    'text-content': string;
    'void-style': string;
    'no-implicit-button-type': string;
    'prefer-native-element': string;
    'unique-landmark': string;
    'wcag/h63': string;
  };
};
export declare const CANONICAL_HTML_VALIDATE_CONFIG_CONTENT: string;
export declare const HTML_VALIDATE_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<HtmlValidateConfigRuleId>;
export declare function isVueProjectContext(projectRoot: string): boolean;
export declare class ValidateHtmlValidateConfigAuditor extends BaseAuditor<HtmlValidateConfigRuleId> {
  constructor(rootsOrOptions?: readonly string[] | (Partial<AuditorOptions<HtmlValidateConfigRuleId>> & {
    projectRoot?: string;
    fix?: boolean;
    configFile?: string;
  }), maybeProjectRoot?: string);
  runAudit(): Promise<void>;
}
//#endregion