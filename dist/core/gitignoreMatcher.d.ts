/**
 * scripts/lib/gitignoreMatcher.ts
 *
 * DYNAMIC GITIGNORE MATCHER (Node.js 26+ Native)
 * Reads and parses .gitignore rules dynamically to evaluate whether a file or directory
 * path is git-ignored, preventing auditors from enforcing the existence of transient,
 * scratch, or development artifacts in clean repositories or production.
 */
export interface GitIgnoreRule {
    readonly pattern: string;
    readonly isNegative: boolean;
    readonly isDirectoryOnly: boolean;
    readonly isRootRelative: boolean;
    readonly regex: RegExp;
}
export declare class GitIgnoreMatcher {
    private readonly rootDir;
    private readonly rules;
    private readonly ignoredDirPrefixes;
    constructor(rootDir?: string, customGitignorePath?: string);
    private loadRules;
    private patternToRegex;
    /**
     * Evaluates if a given path (relative to rootDir or absolute) matches .gitignore rules.
     */
    isIgnored(targetPath: string): boolean;
}
//# sourceMappingURL=gitignoreMatcher.d.ts.map