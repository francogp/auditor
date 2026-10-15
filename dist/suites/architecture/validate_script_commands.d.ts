import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_script_commands.d.ts
export type ScriptCommandsRuleId = 'script-cmd-unregistered-npm' | 'script-cmd-invalid-npm-syntax' | 'script-cmd-unregistered-npx';
export declare const SCRIPT_COMMANDS_RULES: readonly ScriptCommandsRuleId[];
export interface ScriptCommandViolation {
  readonly ruleId: ScriptCommandsRuleId;
  readonly severity: 'error';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly context: string;
}
export declare class ValidateScriptCommandsAuditor extends BaseAuditor<ScriptCommandsRuleId> {
  private readonly rootDir;
  private readonly gitIgnoreMatcher;
  constructor(options?: {
    projectRoot?: string;
  });
  runAudit(): Promise<void>;
  private readScannedFiles;
  private reportViolations;
  private isExempt;
  private collectScriptFiles;
}
//#endregion
export { ValidateScriptCommandsAuditor as ScriptCommandsAuditor };