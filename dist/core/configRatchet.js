import { safeReadFileSync } from "./safeUtils.js";
import { normalizePosixPath } from "./reportUtils.js";
import { createDomainSet } from "./domainCollections.js";
import "./safePath.js";
import { extractExportedConfigObjectLiteral } from "./astContext.js";
import { verifyTranscriptAuthorization } from "./transcriptAuthorizationVerifier.js";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { createHash } from "node:crypto";
// src/core/configRatchet.ts
/**
* src/core/configRatchet.ts
*
* UNIDIRECTIONAL ONLINE CONFIG RATCHET (Phase: 'setup')
*
* Protects project architectural configurations against unauthorized rule relaxations
* or exemptions introduced by AI agents or developers to make tests pass:
*
* 1. Online SSoT: Compares local configurations against `origin/main` (or configured productionRef).
* 2. Hardening Allowed (Local >= OnlineMain): Removing exemptions, raising coverage/similarity floors,
*    lowering complexity ceilings, enabling suites, promoting linter rules passes automatically with 0 friction.
* 3. Relaxation Blocked (Local < OnlineMain): Adding exemptions, disabling suites, lowering floors,
*    raising ceilings, or changing ratchet.productionRef generates a deterministic `RELAX-<8hex>` code
*    and blocks in phase: 'setup'.
* 4. Antigravity Native Authorization: If `RELAX-<8hex>` is verified in Antigravity's conversation transcript
*    from a USER_EXPLICIT step with zero model tampering, the relaxation is accepted.
*/
function astExpressionToPlainValue(expr) {
	if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
	if (ts.isNumericLiteral(expr)) return Number(expr.text);
	if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) return -Number(expr.operand.text);
	if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
	if (ts.isArrayLiteralExpression(expr)) return expr.elements.map((el) => astExpressionToPlainValue(el));
	if (ts.isObjectLiteralExpression(expr)) {
		const out = {};
		for (const prop of expr.properties) if (ts.isPropertyAssignment(prop) && prop.name) {
			const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : void 0;
			if (key !== void 0) out[key] = astExpressionToPlainValue(prop.initializer);
		}
		return out;
	}
}
function parseAuditConfigTextToRecord(code) {
	try {
		const source = ts.createSourceFile("audit.config.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		const configObj = extractExportedConfigObjectLiteral(source);
		if (!configObj) return null;
		const plain = astExpressionToPlainValue(configObj);
		return typeof plain === "object" && plain !== null && !Array.isArray(plain) ? plain : null;
	} catch {
		return null;
	}
}
function runGit(projectRoot, args) {
	const proc = spawnSync("git", args, {
		cwd: projectRoot,
		encoding: "utf-8",
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	return {
		ok: proc.status === 0,
		stdout: proc.stdout ?? ""
	};
}
function resolveProductionRef(projectRoot, configuredRef = "origin/main", skipNetwork = false) {
	const isGitRepo = runGit(projectRoot, ["rev-parse", "--is-inside-work-tree"]);
	if (!isGitRepo.ok || isGitRepo.stdout.trim() !== "true") return null;
	if (!skipNetwork && !process.env.AUDIT_SUBPROCESS && !process.env.VITEST) {
		const branchName = configuredRef.replace(/^origin\//, "");
		const remoteCheck = runGit(projectRoot, [
			"ls-remote",
			"--heads",
			"origin",
			branchName
		]);
		if (remoteCheck.ok && remoteCheck.stdout.trim().length > 0) runGit(projectRoot, [
			"fetch",
			"origin",
			branchName,
			"--quiet"
		]);
	}
	if (runGit(projectRoot, [
		"rev-parse",
		"--verify",
		"--quiet",
		`${configuredRef}^{commit}`
	]).ok) return configuredRef;
	if (runGit(projectRoot, [
		"rev-parse",
		"--verify",
		"--quiet",
		"origin/main^{commit}"
	]).ok) return "origin/main";
	if (runGit(projectRoot, [
		"rev-parse",
		"--verify",
		"--quiet",
		"HEAD^{commit}"
	]).ok) return "HEAD";
	return null;
}
function readGitFile(projectRoot, ref, relPath) {
	const res = runGit(projectRoot, ["show", `${ref}:${normalizePosixPath(relPath)}`]);
	return res.ok ? res.stdout : null;
}
/**
* Extracts all string elements from an array or Set.
*/
function toStringSet(val) {
	if (Array.isArray(val)) return new Set(val.map(String));
	if (val && typeof val === "object" && val instanceof Set) return new Set(Array.from(val).map(String));
	return /* @__PURE__ */ new Set();
}
/**
* Compares exemption list entries. Adding new exemptions is a relaxation.
*/
function compareExemptionLists(file, fieldPath, onlineVal, localVal, relaxations) {
	const onlineSet = toStringSet(onlineVal);
	const localSet = toStringSet(localVal);
	const added = Array.from(localSet).filter((x) => !onlineSet.has(x));
	if (added.length > 0) relaxations.push({
		file,
		path: fieldPath,
		description: `Added ${added.length} new exemption(s): ${added.slice(0, 3).join(", ")}${added.length > 3 ? "..." : ""}`,
		onlineValue: Array.from(onlineSet),
		localValue: Array.from(localSet)
	});
}
/**
* Compares numeric floors (lower is relaxation) or ceilings (higher is relaxation).
*/
function compareNumericBoundary(file, fieldPath, onlineVal, localVal, relaxations, mode) {
	const onlineNum = typeof onlineVal === "number" ? onlineVal : null;
	const localNum = typeof localVal === "number" ? localVal : null;
	if (onlineNum === null || localNum === null) return;
	if (!(mode === "floor" ? localNum < onlineNum : localNum > onlineNum)) return;
	const action = mode === "floor" ? "Lowered minimum floor" : "Raised maximum ceiling";
	relaxations.push({
		file,
		path: fieldPath,
		description: `${action} from ${onlineNum} to ${localNum}`,
		onlineValue: onlineNum,
		localValue: localNum
	});
}
const CEILING_METRIC_KEYS = createDomainSet([
	"maxChunkKb",
	"maxLinesPerFunction",
	"maxNestingDepth",
	"maxLines"
]);
const EXEMPTION_FIELD_NAMES = createDomainSet([
	"exemptGlobs",
	"exemptFiles",
	"ignoreGlobs",
	"dataRoots",
	"demoRoots",
	"cliRoots",
	"infraIdWhitelist",
	"disabledDetectors",
	"exemptMagicNumbers",
	"exemptCssFiles",
	"testFragmentationWhitelist"
]);
/**
* Recursively inspects parsed config objects to detect added exemptions, lowered floors, or disabled suites.
*/
function inspectAuditConfigChanges(onlineConfig, localConfig, configFile = ".auditor/audit.config.ts") {
	const relaxations = [];
	function evaluateNumericLimit(fieldPath, key, onlineVal, localVal) {
		if (typeof onlineVal !== "number") return false;
		if (fieldPath.includes("complexity") || CEILING_METRIC_KEYS.has(key)) {
			compareNumericBoundary(configFile, fieldPath, onlineVal, localVal, relaxations, "ceiling");
			return true;
		}
		if (fieldPath.includes("coverage") || fieldPath.includes("similarity") || key === "threshold" || key === "minCoverage") {
			compareNumericBoundary(configFile, fieldPath, onlineVal, localVal, relaxations, "floor");
			return true;
		}
		return false;
	}
	function evaluateSuiteEnabled(fieldPath, key, prefix, onlineVal, localVal) {
		if (key !== "enabled") return false;
		if (onlineVal === true && localVal === false) relaxations.push({
			file: configFile,
			path: fieldPath,
			description: `Disabled auditor suite '${prefix}' (was enabled in online baseline)`,
			onlineValue: true,
			localValue: false
		});
		return true;
	}
	function evaluateDegradations(fieldPath, key, onlineVal, localVal) {
		if (key !== "acknowledgedDegradations" || !localVal || typeof localVal !== "object") return false;
		const onlineDeg = onlineVal && typeof onlineVal === "object" ? onlineVal : {};
		const localDeg = localVal;
		for (const policy of Object.keys(localDeg)) compareExemptionLists(configFile, `${fieldPath}.${policy}`, onlineDeg[policy], localDeg[policy], relaxations);
		return true;
	}
	function scanObject(onlineObj, localObj, prefix = "") {
		const allKeys = /* @__PURE__ */ new Set([...Object.keys(onlineObj), ...Object.keys(localObj)]);
		for (const key of allKeys) {
			const fieldPath = prefix ? `${prefix}.${key}` : key;
			const onlineVal = onlineObj[key];
			const localVal = localObj[key];
			if (EXEMPTION_FIELD_NAMES.has(key)) {
				compareExemptionLists(configFile, fieldPath, onlineVal, localVal, relaxations);
				continue;
			}
			if (evaluateNumericLimit(fieldPath, key, onlineVal, localVal)) continue;
			if (evaluateSuiteEnabled(fieldPath, key, prefix, onlineVal, localVal)) continue;
			if (evaluateDegradations(fieldPath, key, onlineVal, localVal)) continue;
			if (onlineVal && localVal && typeof onlineVal === "object" && typeof localVal === "object" && !Array.isArray(onlineVal) && !Array.isArray(localVal)) scanObject(onlineVal, localVal, fieldPath);
		}
	}
	scanObject(onlineConfig, localConfig);
	return relaxations;
}
/**
* Compares linter JSON configuration (Stylelint, Fallow, HtmlValidate, tsconfig).
* Demoting rules ('error' -> 'warn' | 'off') is a relaxation.
*/
function inspectLinterConfigChanges(file, onlineContent, localContent) {
	if (!onlineContent || !localContent) return [];
	let onlineJson;
	let localJson;
	try {
		onlineJson = JSON.parse(onlineContent);
		localJson = JSON.parse(localContent);
	} catch {
		return [];
	}
	const relaxations = [];
	const SEVERITY_WEIGHT = {
		error: 3,
		warn: 2,
		warning: 2,
		off: 0,
		none: 0
	};
	const onlineRules = onlineJson.rules ?? onlineJson;
	const localRules = localJson.rules ?? localJson;
	for (const rule of Object.keys(onlineRules)) {
		const onlineRuleVal = onlineRules[rule];
		const localRuleVal = localRules[rule];
		if (localRuleVal === null || localRuleVal === "off" || localRuleVal === 0) {
			if (onlineRuleVal !== null && onlineRuleVal !== "off" && onlineRuleVal !== 0) {
				relaxations.push({
					file,
					path: `rules.${rule}`,
					description: `Demoted or disabled rule '${rule}'`,
					onlineValue: onlineRuleVal,
					localValue: localRuleVal
				});
				continue;
			}
		}
		const onlineSev = typeof onlineRuleVal === "string" ? SEVERITY_WEIGHT[onlineRuleVal] ?? null : null;
		const localSev = typeof localRuleVal === "string" ? SEVERITY_WEIGHT[localRuleVal] ?? null : null;
		if (onlineSev !== null && localSev !== null && localSev < onlineSev) relaxations.push({
			file,
			path: `rules.${rule}`,
			description: `Demoted rule '${rule}' from severity '${onlineRuleVal}' to '${localRuleVal}'`,
			onlineValue: onlineRuleVal,
			localValue: localRuleVal
		});
	}
	return relaxations;
}
/**
* Computes a deterministic RELAX-<8hex> token from the collected relaxations.
*/
function computeRelaxationCode(relaxations) {
	const sorted = [...relaxations].sort((a, b) => `${a.file}:${a.path}`.localeCompare(`${b.file}:${b.path}`));
	return `RELAX-${createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 8)}`;
}
/**
* Runs the complete Unidirectional Online Config Ratchet check.
*/
function auditConfigRatchet(projectRoot, localConfig, options = {}) {
	const effectiveRef = resolveProductionRef(projectRoot, options.productionRef ?? localConfig.ratchet?.productionRef ?? "origin/main", options.skipNetwork);
	if (!effectiveRef) return {
		passed: true,
		relaxations: [],
		relaxationCode: null,
		authorized: false,
		tamperingDetected: false
	};
	const relaxations = [];
	const rawOnlineAuditConfig = readGitFile(projectRoot, effectiveRef, ".auditor/audit.config.ts");
	if (rawOnlineAuditConfig) {
		const parsedOnlineTs = parseAuditConfigTextToRecord(rawOnlineAuditConfig);
		if (parsedOnlineTs) relaxations.push(...inspectAuditConfigChanges(parsedOnlineTs, localConfig));
	}
	for (const jsonFile of [
		".stylelintrc.json",
		".fallowrc.json",
		".htmlvalidate.json",
		"tsconfig.json"
	]) {
		const onlineText = readGitFile(projectRoot, effectiveRef, jsonFile);
		const localPath = path.resolve(projectRoot, jsonFile);
		const localText = safeReadFileSync(localPath);
		if (onlineText && localText) relaxations.push(...inspectLinterConfigChanges(jsonFile, onlineText, localText));
	}
	if (relaxations.length === 0) return {
		passed: true,
		relaxations: [],
		relaxationCode: null,
		authorized: false,
		tamperingDetected: false
	};
	const relaxationCode = computeRelaxationCode(relaxations);
	const auth = verifyTranscriptAuthorization(relaxationCode, options.transcriptOptions);
	if (auth.tamperingDetected) return {
		passed: false,
		relaxations,
		relaxationCode,
		authorized: false,
		tamperingDetected: true,
		message: `CRITICAL TAMPERING DETECTED: An AI model tool call attempted to write or edit transcript logs to spoof authorization for ${relaxationCode}. Execution is permanently blocked.`
	};
	if (auth.verified) return {
		passed: true,
		relaxations,
		relaxationCode,
		authorized: true,
		tamperingDetected: false,
		message: `Relaxation code ${relaxationCode} explicitly authorized by user in Antigravity chat.`
	};
	return {
		passed: false,
		relaxations,
		relaxationCode,
		authorized: false,
		tamperingDetected: false,
		message: `Unauthorized rule relaxation detected relative to '${effectiveRef}'.\nTo authorize this relaxation, confirm code '${relaxationCode}' in the Antigravity chat.`
	};
}
export { auditConfigRatchet, computeRelaxationCode, inspectAuditConfigChanges, inspectLinterConfigChanges, readGitFile, resolveProductionRef, runGit };
