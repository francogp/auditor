import { AUDIT_CONFIG_FILE } from "../../core/auditConfigTypes.js";
import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { getProcessCliArgs } from "../../core/cli/cittyHarness.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES, resolvePackageBin } from "../../cli/cliUtils.js";
import { isProductionEnvironment } from "../../core/auditorEnvironment.js";
import { BaseAuditor, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { styleText } from "node:util";
import childProcess from "node:child_process";
import os from "node:os";
//#region src/suites/architecture/validate_similar_code.ts
/**
* packages/auditor/src/suites/architecture/validate_similar_code.ts
*
* FALLOW SIMILAR-CODE SEMANTIC DUPLICATION AUDITOR (Node.js 26+)
*
* Detects semantically similar functions across the repository using Fallow's
* local vector embeddings model (jina-embeddings-v2-base-code).
*
* Key Architectural Guards:
*   1. Zero Fast-Preset Impact: Completely excluded from fast presets (speed=light, preset=md).
*   2. Strict High Threshold: Defaults to 0.95 threshold to eliminate cognitive noise and false positives.
*   3. Intra-File Filtering: Skips pairs within the same file (e.g. sync/async pairs like safeWriteFileSync/safeWriteFile).
*   4. Auto-Initialization: If the companion model is not ready, automatically downloads and sets up the local model with clear console notification.
*/
enableCompileCache();
const SIMILAR_CODE_RULES = ["fallow-similar-code", "fallow-similar-code-failed"];
const SIMILAR_CODE_RULE_CAPABILITIES = {
	"fallow-similar-code": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: false,
		critical: false
	},
	"fallow-similar-code-failed": {
		speed: "heavy",
		phase: "normal",
		fix: "none",
		md: false,
		ast: false,
		changedOnly: false,
		critical: false
	}
};
const DEFAULT_SIMILAR_CODE_THRESHOLD = .95;
const WINDOWS_UNBLOCK_TIMEOUT_MS = 5e3;
function resolveFallowBinary(projectRoot = process.cwd()) {
	return resolvePackageBin("fallow", {
		projectRoot,
		fallbackRelativeBin: "bin/fallow"
	});
}
function isFastPresetActive() {
	const joined = getProcessCliArgs().join(" ");
	return joined.includes("--preset=lint") || joined.includes("--preset=md");
}
function isSimilarCodeSkipped() {
	return isProductionEnvironment() || process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === "true" || process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS === "1" || process.env.AUDIT_SKIP_SIMILAR === "true" || process.env.AUDIT_SKIP_SIMILAR === "1";
}
function resolveFallowUserCacheDir() {
	if (process.platform === "win32") {
		const rawLocal = process.env.LOCALAPPDATA;
		const localAppData = rawLocal ? path.resolve(rawLocal) : path.join(os.homedir(), "AppData", "Local");
		return path.join(localAppData, "fallow", "similar-code");
	}
	if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "fallow", "similar-code");
	const rawXdg = process.env.XDG_CACHE_HOME;
	const xdg = rawXdg ? path.resolve(rawXdg) : path.join(os.homedir(), ".cache");
	return path.join(xdg, "fallow", "similar-code");
}
function ensureSimilarCodeCacheDir(_projectRoot) {
	const cacheDir = resolveFallowUserCacheDir();
	if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
	const modelsDir = path.join(cacheDir, "models");
	if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
	const vectorsDir = path.join(cacheDir, "vectors");
	if (!fs.existsSync(vectorsDir)) fs.mkdirSync(vectorsDir, { recursive: true });
	return cacheDir;
}
function checkOrInitializeModel(fallowBin, projectRoot, isFix = false) {
	ensureSimilarCodeCacheDir(projectRoot);
	if (isFix && process.platform === "win32") try {
		const candidates = [path.resolve(projectRoot, "node_modules/@fallow-cli"), path.resolve(process.cwd(), "node_modules/@fallow-cli")];
		for (const dir of candidates) if (fs.existsSync(dir)) childProcess.execSync(`powershell.exe -NoProfile -Command "Get-ChildItem -Path '${dir}' -Recurse -Filter '*.exe' -ErrorAction SilentlyContinue | Unblock-File"`, {
			stdio: "ignore",
			timeout: WINDOWS_UNBLOCK_TIMEOUT_MS
		});
	} catch {}
	try {
		const statusOut = childProcess.execSync(`node "${fallowBin}" similar-code status --format json`, {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"ignore"
			],
			timeout: 0
		});
		if (JSON.parse(statusOut).model_ready === true) return true;
	} catch {}
	process.stdout.write(styleText("cyan", "📦 El modelo de embeddings local para Fallow similar-code no está inicializado. Descargando e inicializando automáticamente...\n"));
	try {
		childProcess.execSync(`node "${fallowBin}" similar-code setup --local --yes`, {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"inherit"
			],
			timeout: 0
		});
		return true;
	} catch (err) {
		process.stderr.write(styleText("yellow", `⚠️ No se pudo inicializar el modelo de similar-code: ${err.message}. Se omitirá el análisis vectorial.\n`));
		return false;
	}
}
function normalizeRelativeCandidatePath(rawPath, projectRoot) {
	if (!rawPath) return "";
	return toPosixRelative(projectRoot, rawPath);
}
function isCandidatePairIgnored(options) {
	if (options.ignoreSameFile && options.leftPath === options.rightPath) return true;
	if (options.auditor.isPathIgnored(options.leftPath) || options.auditor.isPathExempt(options.leftPath) || options.auditor.isPathIgnored(options.rightPath) || options.auditor.isPathExempt(options.rightPath)) return true;
	if (!options.includeTests && (isTestPath(options.leftPath) || isTestPath(options.rightPath))) return true;
	return false;
}
function reportSingleCandidateViolation(c, leftPath, rightPath, auditor) {
	const similarityPct = (c.similarity * 100).toFixed(1);
	const leftDesc = `${c.left.name} (${leftPath}:${c.left.start_line})`;
	const rightDesc = `${c.right.name} (${rightPath}:${c.right.start_line})`;
	auditor.addViolation({
		ruleId: "fallow-similar-code",
		severity: "error",
		file: leftPath,
		line: c.left.start_line || 1,
		message: `Critical semantic similarity (${similarityPct}%) between '${c.left.name}' and '${c.right.name}'. Candidates: ${leftDesc} ~ ${rightDesc}`,
		context: `${c.left.name} ~ ${c.right.name}`
	});
}
function evaluateSimilarCodeCandidates(candidates, options, auditor) {
	if (!Array.isArray(candidates) || candidates.length === 0) return 0;
	const ignoreSameFile = options.ignoreSameFile ?? true;
	const config = getAuditConfig(auditor.projectRoot);
	let reportedCount = 0;
	for (const c of candidates) {
		const leftPath = normalizeRelativeCandidatePath(c.left?.path, auditor.projectRoot);
		const rightPath = normalizeRelativeCandidatePath(c.right?.path, auditor.projectRoot);
		if (isCandidatePairIgnored({
			leftPath,
			rightPath,
			ignoreSameFile,
			auditor,
			includeTests: Boolean(config.paths?.includeTestsInCodeAudit)
		})) continue;
		reportSingleCandidateViolation(c, leftPath, rightPath, auditor);
		reportedCount++;
	}
	return reportedCount;
}
var ValidateSimilarCodeAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot || process.cwd();
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "Fallow",
				fallbackBehavior: "violation",
				fallbackRuleId: "fallow-similar-code-failed"
			},
			ruleCapabilities: SIMILAR_CODE_RULE_CAPABILITIES,
			id: "validate_similar_code",
			name: "Fallow Similar Code Semantics Validator",
			description: "Detects semantic function duplication",
			family: "architecture",
			ruleIds: SIMILAR_CODE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SIMILAR_CODE_RULES, "dedup"),
			packageName: "Fallow",
			configKey: "fallow.similarCode.enabled",
			defaultConfig: {
				enabled: true,
				threshold: DEFAULT_SIMILAR_CODE_THRESHOLD,
				ignoreSameFile: true
			},
			criticalConfig: {},
			icon: "🔍",
			ruleDescriptions: {
				"fallow-similar-code": "Semantic duplication",
				"fallow-similar-code-failed": "Similar-code engine health"
			},
			ruleRemediations: {
				"fallow-similar-code": "📖 REMEDIATION GUIDE: fallow-similar-code\n1. Root Cause: Fallow vector embedding engine detected two functions with semantic similarity exceeding the configured threshold (≥ 0.95). Both implement identical conceptual intent with divergent syntax or variable names.\n2. Diagnosis: Inspect the two functions reported (left and right) at the indicated files and lines.\n3. Canonical Solution:\n   a) Extract common logic into a shared utility function in `src/utils/` or within the corresponding domain service.\n   b) Refactor both call sites to invoke the unified canonical function.\n   c) If functions serve strictly disjoint domains and similarity is coincidental, annotate with `// similar-code-ok: <reason>` above the function signature.\n4. Example / Auto-fix command:\n   ❌ Semantic duplicate: `formatUserDate()` and `parseDisplayTimestamp()` performing identical transformations.\n   ✅ Unified:            Canonical shared `formatDate()` helper.",
				"fallow-similar-code-failed": "📖 REMEDIATION GUIDE: fallow-similar-code-failed\n1. Root Cause: Fallow vector analysis engine failed to initialize, the native binary was missing, or Candle CPU model execution failed.\n2. Diagnosis: Check the console error output to determine if the binary is missing or if permissions/network errors occurred.\n3. Canonical Solution:\n   a) On Windows, run `npm run setup:windows` (or `npm run setup:linux` on Linux) to pre-create cache directories and verify binaries.\n   b) Verify `fallow` is installed in `node_modules/.bin/fallow`.\n   c) In CI environments without internet or in production builds, set `AUDITOR_ENV=production`.\n4. Example / Auto-fix command:\n   - Run `npm run setup:windows` or `npm run setup:linux`"
			},
			coverage: {
				include: [
					"src/**/*.ts",
					"src/**/*.vue",
					"scripts/**/*.ts"
				],
				source: "declared-only"
			},
			projectRoot
		});
	}
	ensureFallowBinaryAndModel() {
		const fallowBin = resolveFallowBinary(this.projectRoot);
		if (!fallowBin) {
			this.addViolation({
				ruleId: "fallow-similar-code-failed",
				severity: "error",
				file: "package.json",
				line: 1,
				message: "Fallow binary not found in local dependencies to run similar-code.",
				context: "binary-missing"
			});
			return null;
		}
		if (!checkOrInitializeModel(fallowBin, this.projectRoot, this.isFixActive())) {
			this.context.setMetric("Similar-Code", "Manual installation");
			this.addViolation({
				ruleId: "fallow-similar-code-failed",
				severity: "warning",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: "Failed to automatically initialize or download the embedding model for fallow similar-code. Manual installation is required.",
				context: "manual-setup-required"
			});
			return null;
		}
		return fallowBin;
	}
	executeAnalysis(fallowBin, similarCfg) {
		const threshold = similarCfg.threshold ?? .95;
		const minLines = similarCfg.minLines ?? 3;
		const ignoreSameFile = similarCfg.ignoreSameFile ?? true;
		const rawOutputFile = path.resolve(this.projectRoot, "scratch/audits/architecture/similar-code-raw.json");
		if (!fs.existsSync(path.dirname(rawOutputFile))) fs.mkdirSync(path.dirname(rawOutputFile), { recursive: true });
		ensureSimilarCodeCacheDir(this.projectRoot);
		const threads = os.availableParallelism?.() ?? os.cpus().length ?? 4;
		try {
			const cmd = `node "${fallowBin}" similar-code --format json --threshold ${threshold} --min-lines ${minLines} --threads ${threads} --output-file "${rawOutputFile}"`;
			childProcess.execSync(cmd, {
				cwd: this.projectRoot,
				encoding: "utf8",
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				maxBuffer: DEFAULT_SUBPROCESS_MAX_BUFFER_BYTES,
				timeout: 0
			});
			this.processRawOutputFile(rawOutputFile, ignoreSameFile);
		} catch (err) {
			const errorMsg = err.message || String(err);
			this.addViolation({
				ruleId: "fallow-similar-code-failed",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `Failure running fallow similar-code: ${errorMsg}`,
				context: errorMsg
			});
		}
	}
	processRawOutputFile(rawOutputFile, ignoreSameFile) {
		if (!fs.existsSync(rawOutputFile)) {
			this.addViolation({
				ruleId: "fallow-similar-code-failed",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: "fallow similar-code terminated but did not generate the expected report file in scratch.",
				context: "missing-output-file"
			});
			return;
		}
		const fileContent = fs.readFileSync(rawOutputFile, "utf8");
		const jsonStart = fileContent.indexOf("{");
		if (jsonStart !== -1) try {
			const parsed = JSON.parse(fileContent.substring(jsonStart));
			const totalCandidates = parsed.candidates?.length ?? 0;
			const reported = evaluateSimilarCodeCandidates(parsed.candidates, { ignoreSameFile }, this);
			this.context.setMetric("Total Candidates", totalCandidates);
			this.context.setMetric("Reported Pairs", reported);
			return;
		} catch (err) {
			this.addViolation({
				ruleId: "fallow-similar-code-failed",
				severity: "error",
				file: AUDIT_CONFIG_FILE,
				line: 1,
				message: `The fallow similar-code output file contains malformed JSON: ${err.message}`,
				context: "malformed-json"
			});
			return;
		}
		this.addViolation({
			ruleId: "fallow-similar-code-failed",
			severity: "error",
			file: AUDIT_CONFIG_FILE,
			line: 1,
			message: "fallow similar-code did not generate JSON content in the output file.",
			context: "empty-or-non-json"
		});
	}
	async runAudit() {
		this.recordExternalScanCount(1);
		const similarCfg = getAuditConfig(this.projectRoot).fallow?.similarCode;
		if (!similarCfg?.enabled) {
			this.markSkipped("Disabled in audit.config.ts (fallow.similarCode.enabled: false)");
			return;
		}
		if (isProductionEnvironment()) {
			this.markSkipped("Skipped in production environment (AUDITOR_ENV=production)");
			return;
		}
		if (isSimilarCodeSkipped()) {
			this.markSkipped("Omitido por variable de entorno (AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS)");
			return;
		}
		if (isFastPresetActive()) {
			this.markSkipped("Skipped in fast preset");
			return;
		}
		let fallowBin = null;
		this.runSubAuditorSync("fallow-similar-code-failed", () => {
			fallowBin = this.ensureFallowBinaryAndModel();
		});
		if (!fallowBin) {
			this.runSubAuditorSync("fallow-similar-code", () => {
				this.markRuleNotApplicable("fallow-similar-code", "Binario o modelo de Fallow no disponible");
			});
			return;
		}
		this.runSubAuditorSync("fallow-similar-code", () => {
			this.executeAnalysis(fallowBin, similarCfg);
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSimilarCodeAuditor());
//#endregion
export { DEFAULT_SIMILAR_CODE_THRESHOLD, SIMILAR_CODE_RULES, SIMILAR_CODE_RULE_CAPABILITIES, ValidateSimilarCodeAuditor, WINDOWS_UNBLOCK_TIMEOUT_MS, checkOrInitializeModel, ensureSimilarCodeCacheDir, evaluateSimilarCodeCandidates, isFastPresetActive, isSimilarCodeSkipped, resolveFallowBinary, resolveFallowUserCacheDir };
