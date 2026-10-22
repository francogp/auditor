import { safeRmSync, tryOrNull } from "../safeUtils.js";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import { execSync } from "node:child_process";
//#region src/core/refactor/worktreeSandbox.ts
/**
* src/core/refactor/worktreeSandbox.ts
*
* EPHEMERAL GIT WORKTREE MANAGER (Node.js 26+ Native)
* Provides fast, isolated worktrees for previewing and verifying code refactorings
* without mutating the working tree or risking git regressions.
*/
var WorktreeSandboxManager = class {
	/**
	* Creates an isolated detached worktree from target repository HEAD.
	* Links node_modules via directory junction (Windows) or symlink (Unix).
	*/
	static createSession(repoRoot, sessionName = `refactor-wt-${Date.now()}`) {
		const absRepo = path.resolve(repoRoot);
		const sandboxBase = path.resolve(process.cwd(), "scratch", "refactor-sandbox");
		fs.mkdirSync(sandboxBase, { recursive: true });
		const worktreeDir = path.join(sandboxBase, sessionName);
		if (fs.existsSync(worktreeDir)) this.forceClean(absRepo, worktreeDir);
		execSync(`git -C "${absRepo}" worktree add --detach "${worktreeDir}" HEAD`, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
		const originalNodeModules = path.join(absRepo, "node_modules");
		const targetNodeModules = path.join(worktreeDir, "node_modules");
		if (fs.existsSync(originalNodeModules) && !fs.existsSync(targetNodeModules)) try {
			const isWindows = process.platform === "win32";
			fs.symlinkSync(originalNodeModules, targetNodeModules, isWindows ? "junction" : "dir");
		} catch (err) {
			console.warn(`[WorktreeSandbox] Warning linking node_modules: ${err.message}`);
		}
		const reset = () => {
			try {
				execSync(`git -C "${worktreeDir}" checkout -- .`, {
					encoding: "utf8",
					stdio: [
						"pipe",
						"pipe",
						"pipe"
					]
				});
				execSync(`git -C "${worktreeDir}" clean -fd -e node_modules`, {
					encoding: "utf8",
					stdio: [
						"pipe",
						"pipe",
						"pipe"
					]
				});
			} catch (e) {
				console.warn(`[WorktreeSandbox] Warning resetting worktree: ${e.message}`);
			}
		};
		const cleanup = () => {
			this.forceClean(absRepo, worktreeDir);
		};
		return {
			repoRoot: absRepo,
			worktreeDir,
			cleanup,
			reset
		};
	}
	static forceClean(absRepo, worktreeDir) {
		const targetNodeModules = path.join(worktreeDir, "node_modules");
		if (fs.existsSync(targetNodeModules)) safeRmSync(targetNodeModules, {
			recursive: true,
			force: true
		});
		tryOrNull(() => execSync(`git -C "${absRepo}" worktree remove --force "${worktreeDir}"`, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		}));
		if (fs.existsSync(worktreeDir)) safeRmSync(worktreeDir, {
			recursive: true,
			force: true
		});
		tryOrNull(() => execSync(`git -C "${absRepo}" worktree prune`, {
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		}));
	}
};
/**
* Executes a mutation function safely inside an ephemeral Git worktree,
* runs typechecking/compilation verification, and applies to host only on success.
*/
async function executeInWorktreeWithVerification(projectRoot, applyFn) {
	const session = WorktreeSandboxManager.createSession(projectRoot);
	try {
		await applyFn(session.worktreeDir);
		try {
			execSync("npm run typecheck", {
				cwd: session.worktreeDir,
				stdio: "inherit"
			});
			await applyFn(projectRoot);
		} catch (err) {
			throw new Error(`TypeScript verification failed in worktree sandbox: ${err.message}`);
		}
	} finally {
		session.cleanup();
	}
}
/**
* Loads a refactor plan JSON file and executes it with optional worktree sandboxing.
*/
async function applyPlanFileWithWorktreeVerification(projectRoot, rawPlanPath, useWorktree, applyFn, commandHelpHint) {
	if (!rawPlanPath || !fs.existsSync(rawPlanPath)) {
		console.error(styleText("red", `❌ Error: Debes especificar un archivo de plan: ${commandHelpHint}`));
		process.exit(1);
	}
	const plan = JSON.parse(fs.readFileSync(rawPlanPath, "utf8"));
	if (useWorktree) {
		console.log(styleText("cyan", "🌿 Creando Git Worktree efímero para verificación aislada..."));
		try {
			await executeInWorktreeWithVerification(projectRoot, async (dir) => {
				await applyFn(dir, plan);
			});
			console.log(styleText("green", "✅ Verificación exitosa en Worktree y cambios aplicados al repositorio."));
		} catch (err) {
			console.error(styleText("red", `❌ Falló la verificación en el worktree: ${err.message}`));
			process.exit(1);
		}
	} else {
		console.log(styleText("yellow", "⚡ Aplicando refactorización directamente en el árbol de trabajo..."));
		await applyFn(projectRoot, plan);
	}
}
//#endregion
export { WorktreeSandboxManager, applyPlanFileWithWorktreeVerification, executeInWorktreeWithVerification };
