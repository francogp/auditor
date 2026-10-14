/**
 * src/suites/documentation/validate_documented_commands.ts
 *
 * DOCUMENTED COMMANDS AUDITOR (Node.js 26+)
 * Recursively audits ALL repository documentation (.md, AGENTS.md, docs/, .agents/skills/)
 * and guarantees that:
 * 1. Every documented `npm run <script>` strictly exists in `package.json.scripts`.
 * 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
 * 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { type ExtractedCommand, type NpmCommandValidationEnv } from '../../core/npmCommandUtils.ts';
export { VALID_NPM_BUILTINS, loadPackageScriptsAndBins, type ExtractedCommand } from '../../core/npmCommandUtils.ts';
export type DocumentedCommandsRuleId = 'documented-cmd-unregistered-npm' | 'documented-cmd-invalid-npm-syntax' | 'documented-cmd-unregistered-npx';
export declare const DOCUMENTED_COMMANDS_RULES: readonly DocumentedCommandsRuleId[];
export { COMMAND_INVOCATION_TYPES as DOCUMENTED_COMMAND_TYPES, type CommandInvocationType as DocumentedCommandType } from '../../core/npmCommandUtils.ts';
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
//# sourceMappingURL=validate_documented_commands.d.ts.map