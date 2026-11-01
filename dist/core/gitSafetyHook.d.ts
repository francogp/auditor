import { AuditEngineConfig } from "./auditConfigTypes.js";
/**
 * Destructive Git Command Regular Expression Patterns.
 * Matches operations that discard working tree modifications or rewrite history.
 */
export declare const DESTRUCTIVE_GIT_PATTERNS: readonly RegExp[];
/**
 * Evaluates whether a given command line executes a destructive git command.
 */
export declare function isDestructiveGitCommand(commandLine: string): {
  readonly isDestructive: boolean;
  readonly matchedPattern?: string;
  readonly reason?: string;
};
/**
 * Canonical source code for `.agents/scripts/prevent_destructive_git.js`.
 * Zero-dependency, ultra-fast Node.js 26+ native script for Antigravity PreToolUse.
 * Hard-blocks destructive Git commands AND unauthorized direct writes to satellite configs.
 */
export declare const CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT: string;
/**
 * Evaluates whether git safety hook enforcement is active in configuration.
 * Defaults to true unless explicitly disabled.
 */
export declare function isGitSafetyHookActive(config: AuditEngineConfig): boolean;
export interface GitSafetyInspectionResult {
  readonly isScriptValid: boolean;
  readonly isHookRegistered: boolean;
  readonly isComplete: boolean;
}
/**
 * Inspects whether the Git Safety Gate script and lifecycle hook exist and are up-to-date.
 */
export declare function inspectGitSafetyHook(projectRoot: string, primaryAgentDir?: string): GitSafetyInspectionResult;
/**
 * Injects or synchronizes the Git Safety Gate script and lifecycle hook into the project.
 * Merges into `.agents/hooks.json` in a non-destructive manner, preserving all other hooks.
 */
export declare function syncGitSafetyHook(projectRoot: string, primaryAgentDir?: string): {
  readonly scriptWritten: boolean;
  readonly hookMerged: boolean;
};