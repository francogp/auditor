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
export type DocumentedCommandsRuleId = 'documented-cmd-unregistered-npm' | 'documented-cmd-invalid-npm-syntax' | 'documented-cmd-unregistered-npx';
export declare const DOCUMENTED_COMMANDS_RULES: readonly DocumentedCommandsRuleId[];
export declare const VALID_NPM_BUILTINS: ReadonlySet<string>;
export declare function loadPackageScriptsAndBins(rootDir: string): {
    scripts: Set<string>;
    declaredBins: Set<string>;
    installedBins: Set<string>;
};
export interface ExtractedCommand {
    readonly lineNum: number;
    readonly rawText: string;
    readonly type: 'npm-run' | 'npm-direct' | 'npx';
    readonly target: string;
}
export declare function extractDocumentedCommands(content: string): ExtractedCommand[];
export declare class ValidateDocumentedCommandsAuditor extends BaseAuditor<DocumentedCommandsRuleId> {
    private readonly rootDir;
    private readonly gitIgnoreMatcher;
    constructor(options?: {
        projectRoot?: string;
    });
    runAudit(): Promise<void>;
    private collectAllMarkdownFiles;
}
//# sourceMappingURL=validate_documented_commands.d.ts.map