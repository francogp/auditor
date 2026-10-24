import { DEFAULT_AUDIT_CONFIG } from "../../core/auditConfigDefaults.js";
import { safeRmSync, tryOrNull } from "../../core/safeUtils.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/safePath.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
// src/suites/architecture/validate_type_check.ts
/**
* scripts/auditors/architecture/validate_type_check.ts
*
* TYPESCRIPT & VUE SFC TYPE CHECK AUDITOR (Node.js 26+ Native)
*
* Runs `vue-tsc --noEmit` across the repository, parses TypeScript compiler diagnostics,
* maps them to StandardAuditResult findings with severity 'error', and persists structured
* JSON reports to scratch/audits/architecture/validate_type_check.json.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-child-process scripts/auditors/architecture/validate_type_check.ts
*   npm run validate:types
*/
enableCompileCache();
const TYPE_CHECK_RULES = ["ts-compiler-error"];
const MAX_BUFFER_BYTES = 52428800;
const EXECUTION_TIMEOUT_MS = 0;
const DEFAULT_ERROR_LINE = 1;
const DECIMAL_RADIX = 10;
const DIAGNOSTIC_REGEX = /^(?<file>[^(:\n]+)(?::(?<line>\d+):\d+|\((?<line2>\d+),\d+\))(?::\s*|\s*-\s*|\s+)(?:error|warning)\s+(?<code>TS\d+):\s*(?<msg>\S.*)$/;
function createFindingFromMatch(groups, cwd) {
	const rawFile = groups.file ?? "";
	const lineStr = groups.line ?? groups.line2 ?? "1";
	const code = groups.code ?? "TS";
	const msg = groups.msg ?? "TypeScript compiler error";
	const resolvedPath = path.isAbsolute(rawFile) ? path.relative(cwd, rawFile) : rawFile;
	return {
		suiteId: "validate_type_check",
		suiteName: "TypeScript & Vue Type Validator",
		ruleId: "ts-compiler-error",
		ruleDescription: "TypeScript: Compilation or type error",
		severity: "error",
		file: normalizePosixPath(resolvedPath),
		line: Number.parseInt(lineStr, DECIMAL_RADIX) || DEFAULT_ERROR_LINE,
		context: code,
		message: msg
	};
}
/**
* Parses raw diagnostic output from vue-tsc / tsc into canonical AuditFindings.
*/
function parseTypeScriptDiagnostics(output, cwd = process.cwd()) {
	const findings = [];
	if (!output || !output.trim()) return findings;
	const lines = output.split(/\r?\n/);
	let currentFinding = null;
	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (!line) continue;
		const match = DIAGNOSTIC_REGEX.exec(line);
		if (match?.groups) {
			if (currentFinding) findings.push(currentFinding);
			currentFinding = createFindingFromMatch(match.groups, cwd);
		} else if (currentFinding && line.startsWith("  ")) currentFinding.message += ` ${line.trim()}`;
	}
	if (currentFinding) findings.push(currentFinding);
	return findings;
}
function recordTsConfigFiles(projectRoot, recordScanned) {
	const rootFiles = tryOrNull(() => fs.readdirSync(projectRoot)) ?? [];
	for (const f of rootFiles) if (f.startsWith("tsconfig") && f.endsWith(".json")) recordScanned(path.join(projectRoot, f));
}
function resolveTypeCheckBinary(projectRoot) {
	const vueTscPath = path.resolve(projectRoot, "node_modules/vue-tsc/bin/vue-tsc.js");
	if (fs.existsSync(vueTscPath)) return {
		cmd: "node",
		args: [vueTscPath, "--noEmit"]
	};
	const tscCandidates = [
		path.resolve(projectRoot, "node_modules/typescript/bin/tsc"),
		path.resolve(import.meta.dirname, "../../../node_modules/typescript/bin/tsc"),
		path.resolve(import.meta.dirname, "../../../../typescript/bin/tsc")
	];
	for (const cand of tscCandidates) if (fs.existsSync(cand)) return {
		cmd: "node",
		args: [cand, "--noEmit"]
	};
	return {
		cmd: "tsc",
		args: ["--noEmit"]
	};
}
var TypeCheckAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const config = getAuditConfig(projectRoot);
		const targetRoots = [...config.paths?.codeRoots ?? DEFAULT_AUDIT_CONFIG.paths.codeRoots, ...config.paths?.testRoots ?? DEFAULT_AUDIT_CONFIG.paths.testRoots];
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "TypeScript",
				fallbackBehavior: "throw"
			},
			ruleCapabilities: createRuleCapabilities(TYPE_CHECK_RULES, {
				speed: ["light", "full"],
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: true
			}),
			id: "validate_type_check",
			name: "TypeScript & Vue Type Validator",
			description: "Type and compilation errors in TypeScript and Vue SFCs",
			family: "architecture",
			packageName: "TypeScript",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🏷️",
			ruleIds: TYPE_CHECK_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(TYPE_CHECK_RULES, "contracts"),
			ruleDescriptions: { "ts-compiler-error": "Compilation or type error" },
			ruleRemediations: { "ts-compiler-error": "📖 REMEDIATION GUIDE: ts-compiler-error\n1. Root Cause: The TypeScript compiler (`tsc` or `vue-tsc`) detected a type mismatch, incompatible interface, missing property, or static syntax failure (diagnostic code TSxxxx).\n2. Diagnosis: Inspect the file, line number, and TS error code emitted (e.g., TS2322 type incompatibility, TS2339 missing property, TS2345 invalid argument).\n3. Canonical Solution:\n   a) Correct the type signature or interface contract at the source to satisfy the compiler.\n   b) If properties are missing in an object literal, provide them according to the expected type or make them optional (`?`) if permitted by domain.\n   c) Never use `// @ts-ignore` or blind casts like `as any`. Model domain types rigorously.\n4. Example / Auto-fix command:\n   ❌ TS2322: `const id: number = \"123\";`\n   ✅ Correct: `const id: string = \"123\";`" },
			coverage: {
				include: [...deriveCoverageFromRoots(targetRoots, /* @__PURE__ */ new Set([".ts", ".vue"]), projectRoot).include, "tsconfig*.json"],
				source: "declared-only"
			},
			projectRoot
		});
	}
	async runAudit() {
		this.markRuleEvaluated("ts-compiler-error");
		recordTsConfigFiles(this.projectRoot, (p) => this.recordScanned(p));
		const { cmd, args: baseArgs } = resolveTypeCheckBinary(this.projectRoot);
		const tsBuildInfoPath = path.resolve(this.projectRoot, "scratch/.tsbuildinfo");
		const standardArgs = [
			...baseArgs,
			"--pretty",
			"false"
		];
		const incrementalArgs = [
			...standardArgs,
			"--incremental",
			"--tsBuildInfoFile",
			tsBuildInfoPath
		];
		const resolvedArgs = this.resolveCommandArgs({
			command: "tsc-type-check",
			defaultArgs: standardArgs,
			profiles: {
				light: incrementalArgs,
				full: standardArgs
			}
		});
		if (resolvedArgs.includes("--incremental")) tryOrNull(() => fs.mkdirSync(path.dirname(tsBuildInfoPath), { recursive: true }));
		else if (fs.existsSync(tsBuildInfoPath)) safeRmSync(tsBuildInfoPath, { force: true });
		const proc = spawnSync(cmd, resolvedArgs, {
			cwd: this.projectRoot,
			encoding: "utf-8",
			maxBuffer: MAX_BUFFER_BYTES,
			timeout: EXECUTION_TIMEOUT_MS
		});
		const combinedOutput = `${proc.stdout || ""}\n${proc.stderr || ""}`;
		const findings = parseTypeScriptDiagnostics(combinedOutput, this.projectRoot);
		if (findings.length === 0 && (proc.error || proc.status !== 0)) throw new Error(`[validate_type_check] The compiler exited with status ${String(proc.status)} but no diagnostics could be parsed (false-pass prevented). Output: ${combinedOutput.trim().slice(0, 500)}${proc.error ? ` | error: ${proc.error.message}` : ""}`);
		this.importAuditFindings(findings, "ts-compiler-error", "TS");
		this.recordExternalScanCount(1);
		this.context.setMetric("total_type_errors", findings.length);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new TypeCheckAuditor());
export { TYPE_CHECK_RULES, TypeCheckAuditor, parseTypeScriptDiagnostics };
