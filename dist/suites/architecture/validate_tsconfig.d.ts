import { AuditorConfigFileRequirement } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
export declare const TSCONFIG_RULES: readonly ["tsconfig-missing", "tsconfig-syntax", "tsconfig-missing-strict-compiler-option", "tsconfig-banned-option", "tsconfig-missing-source-include"];
export type TsConfigRuleId = (typeof TSCONFIG_RULES)[number];
export interface TsCompilerOptionsShape {
  target?: string;
  module?: string;
  moduleResolution?: string;
  strict?: boolean;
  noImplicitAny?: boolean;
  noUncheckedIndexedAccess?: boolean;
  verbatimModuleSyntax?: boolean;
  useUnknownInCatchVariables?: boolean;
  noPropertyAccessFromIndexSignature?: boolean;
  exactOptionalPropertyTypes?: boolean;
  isolatedModules?: boolean;
  skipLibCheck?: boolean;
  esModuleInterop?: boolean;
  resolveJsonModule?: boolean;
  suppressImplicitAnyIndexErrors?: boolean;
  noImplicitThis?: boolean;
  [key: string]: unknown;
}
export interface TsConfigShape {
  compilerOptions?: TsCompilerOptionsShape;
  include?: string[];
  exclude?: string[];
  references?: Array<{
    path: string;
  }>;
  [key: string]: unknown;
}
export declare const CANONICAL_TSCONFIG: TsConfigShape;
export declare const MANDATORY_STRICT_OPTIONS: readonly (keyof TsCompilerOptionsShape)[];
export declare const VALID_MODULE_RESOLUTIONS: readonly ["bundler", "node16", "nodenext"];
export declare const VALID_TARGETS: readonly ["es2025", "esnext"];
export declare const BANNED_COMPILER_OPTIONS: readonly ["suppressImplicitAnyIndexErrors"];
export declare const TSCONFIG_REQUIREMENT: AuditorConfigFileRequirement<TsConfigRuleId>;
export interface ValidateTsconfigOptions {
  readonly projectRoot?: string;
  readonly fix?: boolean;
  readonly configFile?: string;
}
export declare class ValidateTsconfigAuditor extends BaseAuditor<TsConfigRuleId> {
  constructor(options?: ValidateTsconfigOptions);
  runAudit(): Promise<void>;
}