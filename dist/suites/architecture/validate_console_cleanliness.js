import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { isCliPath, isExemptFile, isScriptPath } from "../../core/auditPathPredicates.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import "../../core/safePath.js";
import { enableCompileCache } from "node:module";
//#region src/suites/architecture/validate_console_cleanliness.ts
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
function resolveConsoleCleanlinessRoots(roots, projectRoot) {
	return roots ?? getAuditConfig(projectRoot).paths.srcRoots ?? [];
}
var ConsoleCleanlinessAuditor = class extends FileScanAuditor {
	constructor(roots, projectRoot) {
		const scannableRoots = resolveConsoleCleanlinessRoots(roots, projectRoot);
		super({
			usesThirdPartyTool: false,
			roots: scannableRoots,
			projectRoot,
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
			description: "Prohíbe console.log directo y debugger en src/",
			family: "architecture",
			ruleIds: CONSOLE_CLEANLINESS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(CONSOLE_CLEANLINESS_RULES, "hygiene"),
			packageName: "Consola",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🧹",
			ruleDescriptions: {
				"no-debugger-statement": "Instrucciones debugger en src/",
				"no-console-log-in-src": "Llamadas directas a console.log()"
			},
			ruleRemediations: {
				"no-debugger-statement": "Guía de diagnóstico y remediación para no-debugger-statement. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"no-console-log-in-src": "Guía de diagnóstico y remediación para no-console-log-in-src. Revisa la incidencia detectada y ajusta el código correspondiente."
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
		this.scanRegexMatches(content, DEBUGGER_REGEX, relPath, "no-debugger-statement", ["debugger-ok", "console-ok"], "Forbidden debugger statement found. Remove all debug breakpoints before committing.", (lineContent) => {
			const trimmed = lineContent.trim();
			if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
			return !/['"`][^'"`]*\bdebugger\b[^'"`]*['"`]/.test(lineContent);
		});
	}
	auditConsoleLog(relPath, content) {
		this.scanRegexMatches(content, CONSOLE_LOG_REGEX, relPath, "no-console-log-in-src", ["console-ok", "log-ok"], `Direct console.log() call detected in src/. Use console.warn/console.error for standard reporting, logger service for structured tracing, or '// console-ok: <reason>'.`, (lineContent) => {
			const trimmed = lineContent.trim();
			return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ConsoleCleanlinessAuditor());
//#endregion
export { CONSOLE_CLEANLINESS_RULES, ConsoleCleanlinessAuditor };
