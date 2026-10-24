import { AuditEngineConfig } from "../../core/auditConfigTypes.js";
import { AuditorOptions, BaseAuditor } from "../../core/auditorBase.js";
export declare const SCRIPT_EXTENSIONS_RULES: readonly ["banned-mjs-extension", "banned-cjs-extension", "banned-raw-js-script"];
export type ScriptExtensionsRuleId = (typeof SCRIPT_EXTENSIONS_RULES)[number];
export interface ScriptViolationInfo {
  readonly file: string;
  readonly fullPath: string;
  readonly ruleId: ScriptExtensionsRuleId;
  readonly message: string;
  readonly targetTsPath: string;
}
export declare function isCanonicalConfigExempt(relPath: string): boolean;
export declare function isExemptScriptFile(relPath: string, exemptList?: readonly string[]): boolean;
export declare function resolveScriptAndCliDirs(config: AuditEngineConfig): string[];
export declare class ValidateScriptExtensionsAuditor extends BaseAuditor<ScriptExtensionsRuleId> {
  constructor(options?: Partial<AuditorOptions<ScriptExtensionsRuleId>>);
  runAudit(): Promise<void>;
  private collectCandidateFiles;
  private executeFixes;
  private rewriteImportReferences;
  private rewritePackageJsonScripts;
}