import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/safePath.js";
import { isCliPath, isScriptPath } from "../../core/auditCodeRoots.js";
import { isExemptFile } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
// src/suites/architecture/validate_console_cleanliness.ts
/**
* scripts/auditors/architecture/validate_console_cleanliness.ts
*
* CONSOLE & DEBUGGER CLEANLINESS AUDITOR (Node.js 26+ Native)
*
* Enforces production code cleanliness across src/ (mobile-design & clean-code):
*   1. No Debugger Statement (`no-debugger-statement`):
*      Forbids `debugger;` statements in production source files.
*   2. No Raw Console Log in Src (`no-console-log-in-src`):
*      Prohibits uncoordinated `console.log(...)` in `src/`. Direct calls to `console.warn`
*      and `console.error` remain 100% permitted for standard system error reporting.
*      Authorized logging is mediated via `@/logic/utils/logger.ts`.
*
* Escape Hatches:
*   `// console-ok: <reason>`, `// debugger-ok: <reason>`
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_console_cleanliness.ts
*/
enableCompileCache();
const CONSOLE_CLEANLINESS_RULES = ["no-debugger-statement", "no-console-log-in-src"];
const DEBUGGER_REGEX = /\bdebugger\b;?/g;
const CONSOLE_LOG_REGEX = /\bconsole\.log\s*\(/g;
function getExemptLoggingFiles(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const custom = [...config.paths.exemptFiles ?? [], ...config.domain.loggerModule ? [config.domain.loggerModule] : []];
	return new Set(custom);
}
var ConsoleCleanlinessAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			roots: targetRoots,
			projectRoot: effectiveRoot,
			ruleCapabilities: createRuleCapabilities(CONSOLE_CLEANLINESS_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_console_cleanliness",
			name: "Console & Debugger Cleanliness Auditor",
			description: "Prohibits direct console.log and debugger in src/",
			family: "architecture",
			ruleIds: CONSOLE_CLEANLINESS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(CONSOLE_CLEANLINESS_RULES, "hygiene"),
			packageName: "Console",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🧹",
			ruleDescriptions: {
				"no-debugger-statement": "Debugger statements in src/",
				"no-console-log-in-src": "Direct console.log() calls"
			},
			ruleRemediations: {
				"no-debugger-statement": "📖 REMEDIATION GUIDE: no-debugger-statement\n1. Root Cause: A `debugger;` statement was found in source code. Debugger statements halt execution in browser and Node.js environments and must never ship to production.\n2. Diagnosis: Locate the line containing `debugger;`.\n3. Canonical Solution: Remove the `debugger;` statement. If temporarily debugging, remove breakpoints before committing.\n4. Example / Auto-fix command:\n   ❌ Prohibited: `debugger;`\n   ✅ Clean:      Removed.",
				"no-console-log-in-src": "📖 REMEDIATION GUIDE: no-console-log-in-src\n1. Root Cause: A direct call to `console.log()` was detected in production code (`src/`). It pollutes standard output, exposes sensitive data, and harms runtime performance.\n2. Diagnosis: Inspect the `console.log` call at the reported line.\n3. Canonical Solution:\n   a) If used for ad-hoc debugging: remove the call before committing.\n   b) If used for production diagnostics: use a structured logger or canonical error channels (`console.error()` / `console.warn()`).\n   c) If this is a CLI tool or terminal renderer that intentionally writes to stdout: add the path to `paths.cliRoots` in `audit.config.ts`.\n4. Example / Auto-fix command:\n   ❌ Prohibited: `console.log(\"Data received:\", data);`\n   ✅ Canonical:  `logger.debug(\"Data received\", { data });`"
			},
			allowedExtensions: /* @__PURE__ */ new Set([
				".ts",
				".vue",
				".js"
			])
		});
	}
	scanFile(relPath, content) {
		const normalizedPath = normalizePosixPath(relPath);
		this.runSubAuditorSync("no-debugger-statement", () => {
			this.auditDebugger(normalizedPath, content);
		});
		const config = getAuditConfig(this.projectRoot);
		const exemptFiles = getExemptLoggingFiles(this.projectRoot);
		const isCliOrTerminalOutput = isScriptPath(normalizedPath, config) || isExemptFile(normalizedPath, config) || isCliPath(normalizedPath, config);
		this.runSubAuditorSync("no-console-log-in-src", () => {
			if (!exemptFiles.has(normalizedPath) && !isCliOrTerminalOutput) this.auditConsoleLog(normalizedPath, content);
		});
	}
	auditDebugger(relPath, content) {
		this.scanRegexMatches(content, DEBUGGER_REGEX, relPath, "no-debugger-statement", "Forbidden debugger statement found. Remove all debug breakpoints before committing.", (lineContent) => {
			const trimmed = lineContent.trim();
			if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
			return !/['"`][^'"`]*\bdebugger\b[^'"`]*['"`]/.test(lineContent);
		});
	}
	auditConsoleLog(relPath, content) {
		this.scanRegexMatches(content, CONSOLE_LOG_REGEX, relPath, "no-console-log-in-src", "Direct console.log() call detected in src/. Use console.warn/console.error for standard reporting or logger service for structured tracing.", (lineContent) => {
			const trimmed = lineContent.trim();
			return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ConsoleCleanlinessAuditor());
export { CONSOLE_CLEANLINESS_RULES, ConsoleCleanlinessAuditor };
