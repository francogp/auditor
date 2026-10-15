import { BaseAuditor } from "../../core/auditorBase.js";
import { COMMAND_INVOCATION_TYPES, CommandInvocationType, ExtractedCommand, NpmCommandValidationEnv, VALID_NPM_BUILTINS, loadPackageScriptsAndBins } from "../../core/npmCommandUtils.js";
//#region src/suites/documentation/validate_documented_commands.d.ts
export type DocumentedCommandsRuleId = 'documented-cmd-unregistered-npm' | 'documented-cmd-invalid-npm-syntax' | 'documented-cmd-unregistered-npx';
export declare const DOCUMENTED_COMMANDS_RULES: readonly DocumentedCommandsRuleId[];
export declare function extractDocumentedCommands(content: string): ExtractedCommand[];
export interface DocumentedCommandViolation {
  readonly ruleId: DocumentedCommandsRuleId;
  readonly severity: 'error';
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly context: string;
}
export declare function evaluateCommandViolation(cmd: ExtractedCommand, relPosix: string, env: NpmCommandValidationEnv): DocumentedCommandViolation | null;
export declare class ValidateDocumentedCommandsAuditor extends BaseAuditor<DocumentedCommandsRuleId> {
  private readonly rootDir;
  private readonly gitIgnoreMatcher;
  constructor(options?: {
    projectRoot?: string;
  });
  runAudit(): Promise<void>;
}
//#endregion
export { COMMAND_INVOCATION_TYPES as DOCUMENTED_COMMAND_TYPES, type CommandInvocationType as DocumentedCommandType, type ExtractedCommand, VALID_NPM_BUILTINS, loadPackageScriptsAndBins };