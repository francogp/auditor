/**
 * src/suites/architecture/validate_script_commands.ts
 *
 * SCRIPT & PIPELINE COMMANDS VALIDATOR (Node.js 26+)
 *
 * Recursively audits executable scripts and infrastructure pipelines (.sh, .ps1, .bat, .cmd,
 * Dockerfiles, .github/workflows/, and maintenance scripts) and guarantees that:
 * 1. Every invoked `npm run <script>` strictly exists in `package.json.scripts`.
 * 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
 * 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
 *
 * Enforces loud, immediate failures (severity: 'error', fix: 'none') to prevent runtime
 * deployment crashes caused by missing or unmigrated npm scripts.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
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
export { ValidateScriptCommandsAuditor as ScriptCommandsAuditor };
//# sourceMappingURL=validate_script_commands.d.ts.map