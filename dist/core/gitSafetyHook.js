import { safeJsonParse, safeReadFileSync } from "./safeUtils.js";
import { GOVERNED_SATELLITE_FILES } from "./satelliteConfigParity.js";
import path from "node:path";
import fs from "node:fs";
// src/core/gitSafetyHook.ts
/**
* src/core/gitSafetyHook.ts
*
* CANONICAL GIT SAFETY GATE GENERATOR & INSPECTOR (Node.js 26+ Native)
*
* Manages the Antigravity PreToolUse lifecycle hook in `.agents/hooks.json`
* and `.agents/scripts/prevent_destructive_git.js`.
*
* Hard-blocks destructive git commands (git checkout --, git restore, git reset --hard,
* git clean -f, git push --force, etc.) executed by AI agents without human confirmation.
* Instructs the AI agent to inform the human user and provide the exact command for manual execution.
*/
/**
* Destructive Git Command Regular Expression Patterns.
* Matches operations that discard working tree modifications or rewrite history.
*/
const DESTRUCTIVE_GIT_PATTERNS = Object.freeze([
	/\bgit\b.*?\brestore\b/i,
	/\bgit\b.*?\bcheckout\s+(?:--\s+|-[a-zA-Z]*f[a-zA-Z]*\b|--force\b|\.\s*$|HEAD\s+--)/i,
	/\bgit\b.*?\bcheckout\s+(?!-b\b|-B\b|--orphan\b)[^\s]+\.(?:json|ts|js|mjs|cjs|vue|css|scss|md|html|ya?ml|lock|txt|sh|ps1)\b/i,
	/\bgit\b.*?\breset\s+--(?:hard|merge|keep)\b/i,
	/\bgit\b.*?\bclean\s+(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b/i,
	/\bgit\b.*?\bpush\b.*?(?:--force\b|-f\b|--force-with-lease\b)/i,
	/\bgit\b.*?\bbranch\s+(?:-[a-zA-Z]*[dD][a-zA-Z]*|--delete)\b/i
]);
/**
* Evaluates whether a given command line executes a destructive git command.
*/
function isDestructiveGitCommand(commandLine) {
	const trimmed = commandLine.trim();
	if (!trimmed) return { isDestructive: false };
	for (const pattern of DESTRUCTIVE_GIT_PATTERNS) if (pattern.test(trimmed)) return {
		isDestructive: true,
		matchedPattern: pattern.source,
		reason: `[GIT SAFETY GATE] Destructive command hard-blocked: "${trimmed}". The repository governance strictly forbids AI agents from discarding working tree changes, reverting files with git checkout/restore, or forcing git operations. INSTRUCTION FOR AI AGENT: Do NOT attempt workarounds or alternative destructive commands. Explain to the human user that this destructive operation was blocked for safety, and provide them with the exact command so they can run it manually in their terminal if they choose:\n  ${trimmed}`
	};
	return { isDestructive: false };
}
/**
* Canonical source code for `.agents/scripts/prevent_destructive_git.js`.
* Zero-dependency, ultra-fast Node.js 26+ native script for Antigravity PreToolUse.
* Hard-blocks destructive Git commands AND unauthorized direct writes to satellite configs.
*/
const CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT = `/**
 * .agents/scripts/prevent_destructive_git.js
 *
 * HARD PRE-TOOL USE GIT & SATELLITE CONFIG SAFETY GATE FOR ANTIGRAVITY (@francogp/auditor)
 *
 * Intercepts 'run_command', 'write_file', and 'edit_file' invocations before execution:
 *   1. Blocks any destructive Git commands that discard uncommitted working tree
 *      modifications or rewrite commit history without explicit prior human approval.
 *   2. Blocks any direct write/edit to governed satellite configuration files (.fallowrc.json,
 *      vite.config.ts, .stylelintrc.json, tsconfig.json, .htmlvalidate.json, etc.).
 *
 * Instructs the AI agent to declare configuration changes in .auditor/audit.config.ts
 * and run 'npm run auditor:fix' for deterministic synchronization.
 */

import fs from 'node:fs';

const GOVERNED_SATELLITE_FILES = ${JSON.stringify(GOVERNED_SATELLITE_FILES)};

function main() {
  try {
    const rawInput = fs.readFileSync(0, 'utf-8');
    if (!rawInput.trim()) {
      process.stdout.write(JSON.stringify({ decision: 'allow' }));
      return;
    }

    const payload = JSON.parse(rawInput);
    const toolCall = payload.toolCall ?? {};
    const toolName = String(toolCall.name ?? '').trim();
    const args = toolCall.args ?? {};

    // 1. Guard against direct manual editing of satellite configuration files
    if (toolName === 'write_file' || toolName === 'edit_file') {
      const targetPath = String(args.Path ?? args.path ?? '').trim();
      const fileName = targetPath.split(/[\\/\\\\]/).pop() || '';

      if (GOVERNED_SATELLITE_FILES.includes(fileName)) {
        process.stdout.write(
          JSON.stringify({
            decision: 'deny',
            reason: \`[SATELLITE CONFIG SOVEREIGNTY GATE] Direct manual editing of satellite configuration file "\${fileName}" is STRICTLY PROHIBITED. All satellite configurations are derived artifacts owned exclusively by @francogp/auditor.\\n\\nINSTRUCTION FOR AI AGENT:\\n1. Do NOT modify "\${fileName}" directly with write_file or edit_file.\\n2. If an exemption, rule, threshold, or setting is required, declare it in ".auditor/audit.config.ts".\\n3. Run "npm run auditor:fix" so @francogp/auditor synchronizes and projects the configuration automatically.\`
          })
        );
        return;
      }
    }

    // 2. Guard against shell commands modifying satellite configurations or running destructive git
    if (toolName === 'run_command') {
      const cmd = String(args.CommandLine ?? '').trim();

      // Check for shell redirects into satellite configs
      const isShellRedirect = />+|>>|\\|\\s*tee\\b/i.test(cmd);
      if (isShellRedirect) {
        for (const satFile of GOVERNED_SATELLITE_FILES) {
          if (cmd.includes(satFile)) {
            process.stdout.write(
              JSON.stringify({
                decision: 'deny',
                reason: \`[SATELLITE CONFIG SOVEREIGNTY GATE] Shell commands modifying satellite configuration file "\${satFile}" are STRICTLY PROHIBITED. Declare changes in ".auditor/audit.config.ts" and run "npm run auditor:fix".\`
              })
            );
            return;
          }
        }
      }

      // Regex matching destructive git actions
      const destructivePatterns = [
        // 1. git restore (discards uncommitted modifications or unstages files)
        /\\bgit\\b.*?\\brestore\\b/i,

        // 2. git checkout discarding working tree changes
        /\\bgit\\b.*?\\bcheckout\\s+(?:--\\s+|-[a-zA-Z]*f[a-zA-Z]*\\b|--force\\b|\\.\\s*$|HEAD\\s+--)/i,
        /\\bgit\\b.*?\\bcheckout\\s+(?!-b\\b|-B\\b|--orphan\\b)[^\\s]+\\.(?:json|ts|js|mjs|cjs|vue|css|scss|md|html|ya?ml|lock|txt|sh|ps1)\\b/i,

        // 3. git reset destructive (hard, merge, keep)
        /\\bgit\\b.*?\\breset\\s+--(?:hard|merge|keep)\\b/i,

        // 4. git clean with force (-f, -fd, -df, -xdf, --force)
        /\\bgit\\b.*?\\bclean\\s+(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\\b/i,

        // 5. git push with force (--force, -f, --force-with-lease)
        /\\bgit\\b.*?\\bpush\\b.*?(?:--force\\b|-f\\b|--force-with-lease\\b)/i,

        // 6. git branch destructive delete (-D, -d, --delete)
        /\\bgit\\b.*?\\bbranch\\s+(?:-[a-zA-Z]*[dD][a-zA-Z]*|--delete)\\b/i
      ];

      const isDestructive = destructivePatterns.some((pattern) => pattern.test(cmd));

      if (isDestructive) {
        process.stdout.write(
          JSON.stringify({
            decision: 'deny',
            reason: \`[GIT SAFETY GATE] Destructive command hard-blocked: "\${cmd}". The repository governance strictly forbids AI agents from discarding working tree changes, reverting files with git checkout/restore, or forcing git operations. INSTRUCTION FOR AI AGENT: Do NOT attempt workarounds or alternative destructive commands. Explain to the human user that this destructive operation was blocked for safety, and provide them with the exact command so they can run it manually in their terminal if they choose:\\n  \${cmd}\`
          })
        );
        return;
      }
    }

    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  } catch {
    // If parsing fails, fail open or safely allow
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  }
}

main();
`;
/**
* Evaluates whether git safety hook enforcement is active in configuration.
* Defaults to true unless explicitly disabled.
*/
function isGitSafetyHookActive(config) {
	if (config.gitSafety?.enabled === false) return false;
	if (config.agentPlugin?.gitSafetyHook === false || config.agentPlugin?.preventDestructiveGit === false) return false;
	return true;
}
function hasMatchingGateHook(hooks) {
	if (!Array.isArray(hooks)) return false;
	return hooks.some((h) => Boolean(h) && typeof h === "object" && typeof h["command"] === "string" && h["command"].includes("prevent_destructive_git"));
}
function hasPreToolUseHook(gate) {
	if (!gate || typeof gate !== "object") return false;
	const entries = gate["PreToolUse"];
	if (!Array.isArray(entries)) return false;
	return entries.some((entry) => {
		if (!entry || typeof entry !== "object") return false;
		const rawMatcher = entry["matcher"];
		if (!(typeof rawMatcher === "string" ? rawMatcher : "").includes("run_command")) return false;
		return hasMatchingGateHook(entry["hooks"]);
	});
}
/**
* Inspects whether the Git Safety Gate script and lifecycle hook exist and are up-to-date.
*/
function inspectGitSafetyHook(projectRoot, primaryAgentDir = ".agents") {
	const scriptPath = path.join(projectRoot, primaryAgentDir, "scripts", "prevent_destructive_git.js");
	const hooksJsonPath = path.join(projectRoot, primaryAgentDir, "hooks.json");
	let isScriptValid = false;
	if (fs.existsSync(scriptPath)) {
		const scriptContent = safeReadFileSync(scriptPath);
		if (scriptContent && scriptContent.includes("[GIT SAFETY GATE]") && scriptContent.includes("destructivePatterns") && scriptContent.includes("INSTRUCTION FOR AI AGENT") && scriptContent.includes("SATELLITE CONFIG SOVEREIGNTY GATE")) isScriptValid = true;
	}
	let isHookRegistered = false;
	if (fs.existsSync(hooksJsonPath)) {
		const raw = safeReadFileSync(hooksJsonPath);
		const parsed = raw ? safeJsonParse(raw) : null;
		if (parsed) isHookRegistered = hasPreToolUseHook(parsed["git-safety-gate"]);
	}
	return {
		isScriptValid,
		isHookRegistered,
		isComplete: isScriptValid && isHookRegistered
	};
}
/**
* Injects or synchronizes the Git Safety Gate script and lifecycle hook into the project.
* Merges into `.agents/hooks.json` in a non-destructive manner, preserving all other hooks.
*/
function syncGitSafetyHook(projectRoot, primaryAgentDir = ".agents") {
	const agentsDir = path.join(projectRoot, primaryAgentDir);
	const scriptsDir = path.join(agentsDir, "scripts");
	const scriptPath = path.join(scriptsDir, "prevent_destructive_git.js");
	const hooksJsonPath = path.join(agentsDir, "hooks.json");
	if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
	let scriptWritten = false;
	if ((fs.existsSync(scriptPath) ? safeReadFileSync(scriptPath) : null) !== CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT) {
		fs.writeFileSync(scriptPath, CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT, "utf8");
		scriptWritten = true;
	}
	const mirrorDir = path.join(agentsDir, primaryAgentDir, "scripts");
	const mirrorScriptPath = path.join(mirrorDir, "prevent_destructive_git.js");
	if (!fs.existsSync(mirrorDir)) fs.mkdirSync(mirrorDir, { recursive: true });
	if ((fs.existsSync(mirrorScriptPath) ? safeReadFileSync(mirrorScriptPath) : null) !== CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT) fs.writeFileSync(mirrorScriptPath, CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT, "utf8");
	let hookMerged = false;
	let hooksConfig = {};
	if (fs.existsSync(hooksJsonPath)) {
		const raw = safeReadFileSync(hooksJsonPath);
		hooksConfig = (raw ? safeJsonParse(raw) : null) ?? {};
	}
	const canonicalGateEntry = { PreToolUse: [{
		matcher: "run_command|write_file|edit_file",
		hooks: [{
			type: "command",
			command: "node scripts/prevent_destructive_git.js"
		}]
	}] };
	const currentGate = hooksConfig["git-safety-gate"];
	if (JSON.stringify(currentGate) !== JSON.stringify(canonicalGateEntry)) {
		hooksConfig["git-safety-gate"] = canonicalGateEntry;
		fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2) + "\n", "utf8");
		hookMerged = true;
	}
	return {
		scriptWritten,
		hookMerged
	};
}
export { CANONICAL_PREVENT_DESTRUCTIVE_GIT_SCRIPT, DESTRUCTIVE_GIT_PATTERNS, inspectGitSafetyHook, isDestructiveGitCommand, isGitSafetyHookActive, syncGitSafetyHook };
