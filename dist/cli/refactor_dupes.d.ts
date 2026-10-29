import { TriagedCloneCandidate } from "../core/refactor/refactorContracts.js";
/**
 * src/cli/refactor_dupes.ts
 *
 * CANONICAL REFACTORING & DUPLICATION REMEDIATION CLI (Node.js 26+ Native)
 * Provides interactive discovery, micro-context inspection, and AST refactor application.
 */
export declare const REFACTOR_DUPES_CLI_COMMAND = "auditor:dupes";
export declare function handleDupesDiscover(projectRoot: string, candidates: readonly TriagedCloneCandidate[], isJson: boolean, isVerbose?: boolean): void;
export declare function handleDupesInspect(projectRoot: string, fp: string | undefined, isJson: boolean): void;
export declare function handleDupesApply(projectRoot: string, rawPlanPath: string | undefined, useWorktree: boolean): Promise<void>;
export declare function executeDupesCli(parsed: Record<string, unknown>): Promise<void>;
export declare function runRefactorCli(rawInputArgs?: readonly string[]): Promise<void>;