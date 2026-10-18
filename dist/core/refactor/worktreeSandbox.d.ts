//#region src/core/refactor/worktreeSandbox.d.ts
/**
 * src/core/refactor/worktreeSandbox.ts
 *
 * EPHEMERAL GIT WORKTREE MANAGER (Node.js 26+ Native)
 * Provides fast, isolated worktrees for previewing and verifying code refactorings
 * without mutating the working tree or risking git regressions.
 */
export interface WorktreeSession {
  readonly repoRoot: string;
  readonly worktreeDir: string;
  readonly cleanup: () => void;
  readonly reset: () => void;
}
export declare class WorktreeSandboxManager {
  /**
   * Creates an isolated detached worktree from target repository HEAD.
   * Links node_modules via directory junction (Windows) or symlink (Unix).
   */
  static createSession(repoRoot: string, sessionName?: string): WorktreeSession;
  private static forceClean;
}
/**
 * Executes a mutation function safely inside an ephemeral Git worktree,
 * runs typechecking/compilation verification, and applies to host only on success.
 */
export declare function executeInWorktreeWithVerification(projectRoot: string, applyFn: (targetDir: string) => Promise<void>): Promise<void>;
/**
 * Loads a refactor plan JSON file and executes it with optional worktree sandboxing.
 */
export declare function applyPlanFileWithWorktreeVerification<TPlan>(projectRoot: string, rawPlanPath: string | undefined, useWorktree: boolean, applyFn: (targetDir: string, plan: TPlan) => Promise<void>, commandHelpHint: string): Promise<void>;
//#endregion