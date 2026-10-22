import { safeJsonParse, safeReadFileAsync, tryOrDefaultAsync } from "./safeUtils.js";
import { COVERAGE_SOURCES } from "./auditContract.js";
import path from "node:path";
import fs from "node:fs";
import fs$1 from "node:fs/promises";
//#region src/core/auditCoverage.ts
/**
* src/core/auditCoverage.ts
*
* AUDIT COVERAGE LEDGER (Node.js 26+ Native)
* Records, per suite and per run, which files were actually analyzed and how many times every rule
* was evaluated. Ledgers are consumed by `validate_audit_coverage` to detect blind spots:
* uncovered files, declaration/observation drift and dormant rules (false-clean results).
*/
const COVERAGE_LEDGER_DIR = "scratch/audits/coverage";
const COVERAGE_RUN_ID_ENV = "AUDIT_COVERAGE_RUN_ID";
/** 'full' only when audit_full runs every discovered suite (coverage is meaningless on partial runs). */
const COVERAGE_RUN_MODE_ENV = "AUDIT_COVERAGE_RUN_MODE";
/** Comma-separated ids of the suites executed before the post-run phase (each must leave a ledger). */
const COVERAGE_EXPECTED_SUITES_ENV = "AUDIT_COVERAGE_EXPECTED_SUITES";
/** Returns the run identifier of the orchestrated full run, if any. Ledgers are only written inside such runs. */
function resolveActiveCoverageRunId() {
	const runId = process.env[COVERAGE_RUN_ID_ENV];
	return runId && runId.trim().length > 0 ? runId : void 0;
}
/** Converts an absolute or relative path into a POSIX path relative to the project root. */
function toPosixRelative(projectRoot, filePath) {
	if (!filePath) return "";
	const posix = (path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath).replaceAll(path.win32.sep, path.posix.sep);
	const withoutLeadingDot = posix.startsWith("./") ? posix.slice(2) : posix;
	return withoutLeadingDot.endsWith("/") && withoutLeadingDot.length > 1 ? withoutLeadingDot.slice(0, -1) : withoutLeadingDot;
}
function matchesAnyGlob(relPosixPath, globs) {
	return globs.some((glob) => {
		if (path.posix.matchesGlob(relPosixPath, glob)) return true;
		if (glob.startsWith("**") && relPosixPath.startsWith(".")) {
			const withoutLeadingDot = relPosixPath.replace(/^\.+[/\\]?/, "");
			if (path.posix.matchesGlob(withoutLeadingDot, glob)) return true;
		}
		return false;
	});
}
const DEFAULT_NON_AUDITABLE_GLOBS = Object.freeze([
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lockb",
	"skills-lock.json",
	"**/*skills-lock.json",
	"**/.gitkeep",
	"**/.gitignore",
	"**/.gitattributes",
	".nvmrc",
	".node-version",
	".npmrc",
	".replit",
	".prettierrc*",
	".prettierignore",
	".markdownlintignore",
	"**/*.tsbuildinfo",
	"**/*.{png,jpg,jpeg,gif,webp,ico,bmp,tiff,avif}",
	"**/*.{mp3,ogg,wav,flac,mp4,webm,avi,mov}",
	"**/*.{woff,woff2,ttf,eot,otf}",
	"**/*.{db,sqlite,sqlite3,wasm,zip,tar,tar.gz,tgz}",
	"**/fixtures/**",
	"**/canaries/**",
	"**/*.canary",
	"**/backups/**",
	"setup-linux.sh",
	"setup-windows.ps1",
	"update-linux.sh",
	"update-windows.ps1",
	"scripts/setup/plugins/**",
	".env.example",
	"**/*.sample",
	"LICENSE*"
]);
const FAST_NON_AUDITABLE_EXTENSIONS = /* @__PURE__ */ new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".ico",
	".bmp",
	".tiff",
	".avif",
	".mp3",
	".ogg",
	".wav",
	".flac",
	".mp4",
	".webm",
	".avi",
	".mov",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".otf",
	".db",
	".sqlite",
	".sqlite3",
	".wasm",
	".zip",
	".tar",
	".gz",
	".tgz"
]);
/** Whether a file is part of the auditable codebase (excluding binaries, lockfiles, and tooling meta). */
function isAuditableCodebaseFile(relPosixPath, customExemptGlobs = []) {
	const ext = path.posix.extname(relPosixPath).toLowerCase();
	if (ext && FAST_NON_AUDITABLE_EXTENSIONS.has(ext)) return false;
	if (matchesAnyGlob(relPosixPath, DEFAULT_NON_AUDITABLE_GLOBS)) return false;
	if (customExemptGlobs.length > 0 && matchesAnyGlob(relPosixPath, customExemptGlobs)) return false;
	return true;
}
/** Whether a file falls inside the static coverage declaration of a suite. */
function isDeclaredByCoverage(relPosixPath, declaration) {
	if (!matchesAnyGlob(relPosixPath, declaration.include)) return false;
	return !matchesAnyGlob(relPosixPath, declaration.exclude ?? []);
}
/** Derives a coverage declaration from scan roots + extensions (used by FileScanAuditor). */
function deriveCoverageFromRoots(roots, extensions, projectRoot = process.cwd()) {
	const effectiveRoots = roots.length > 0 ? roots : [
		"src",
		"scripts",
		"tests"
	];
	const include = [];
	for (const root of effectiveRoots) {
		const cleanRoot = toPosixRelative(projectRoot, root);
		const isRootFolder = cleanRoot === "" || cleanRoot === ".";
		for (const ext of extensions) include.push(isRootFolder ? `**/*${ext}` : path.posix.join(cleanRoot, `**/*${ext}`));
	}
	return {
		include,
		source: "runtime"
	};
}
function resolveDirectoryPatterns(rel, allowedExtensions) {
	if (allowedExtensions && allowedExtensions.size > 0) return Array.from(allowedExtensions, (ext) => `${rel}/**/*${ext}`);
	return [`${rel}/**`];
}
function resolvePatternsForRequiredFile(rf, projectRoot, allowedExtensions) {
	const rel = toPosixRelative(projectRoot, rf);
	const abs = path.isAbsolute(rf) ? rf : path.resolve(projectRoot, rf);
	try {
		if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return resolveDirectoryPatterns(rel, allowedExtensions);
		return [rel];
	} catch {
		return [rel];
	}
}
/** Derives a coverage declaration from requiredFiles (used by BaseAuditor when coverage is omitted). */
function deriveCoverageFromRequiredFiles(requiredFiles, projectRoot = process.cwd(), allowedExtensions) {
	const include = [];
	for (const rf of requiredFiles) include.push(...resolvePatternsForRequiredFile(rf, projectRoot, allowedExtensions));
	return {
		include,
		source: "runtime"
	};
}
/** Fails loudly when a suite declares an invalid coverage contract. */
function validateCoverageDeclaration(suiteId, declaration) {
	if (!declaration || typeof declaration !== "object") throw new Error(`Auditor [${suiteId}] must declare 'coverage: { include: [...] }' (files it is responsible for). Blind-spot detection requires every suite to declare its coverage.`);
	if (!Array.isArray(declaration.include) || declaration.include.length === 0) throw new Error(`Auditor [${suiteId}] 'coverage.include' must be a non-empty array of POSIX globs.`);
	const allGlobs = [...declaration.include, ...declaration.exclude ?? []];
	for (const glob of allGlobs) if (typeof glob !== "string" || glob.trim().length === 0 || glob.includes("\\") || path.posix.isAbsolute(glob)) throw new Error(`Auditor [${suiteId}] declared an invalid coverage glob '${String(glob)}' (must be a relative POSIX glob).`);
	if (declaration.source !== void 0 && !COVERAGE_SOURCES.includes(declaration.source)) throw new Error(`Auditor [${suiteId}] declared unknown coverage source '${String(declaration.source)}'.`);
}
/**
* Mutable per-instance recorder owned by every BaseAuditor.
*/
var CoverageRecorder = class {
	projectRoot;
	scanned = /* @__PURE__ */ new Set();
	evaluations = /* @__PURE__ */ new Map();
	notApplicable = /* @__PURE__ */ new Map();
	dynamicRuleIds = /* @__PURE__ */ new Set();
	externalScanCount = 0;
	currentDeclaration;
	constructor(projectRoot, declaration) {
		this.projectRoot = projectRoot;
		this.currentDeclaration = declaration;
	}
	get declaration() {
		return this.currentDeclaration;
	}
	/** Replaces the static declaration with a config-resolved one (validated loudly). */
	redeclare(suiteId, declaration) {
		validateCoverageDeclaration(suiteId, declaration);
		this.currentDeclaration = declaration;
	}
	get source() {
		return this.declaration.source ?? "runtime";
	}
	get scannedCount() {
		return this.scanned.size > 0 ? this.scanned.size : this.externalScanCount;
	}
	recordScanned(filePath) {
		this.scanned.add(toPosixRelative(this.projectRoot, filePath));
	}
	unrecordScanned(filePath) {
		this.scanned.delete(toPosixRelative(this.projectRoot, filePath));
	}
	/** Only valid for `declared-only` suites, whose engine reports a count but not a file list. */
	recordExternalScanCount(count) {
		if (this.source !== "declared-only") throw new Error(`recordExternalScanCount() is only allowed for 'declared-only' coverage; record real files with recordScanned().`);
		this.externalScanCount = count;
	}
	markRuleEvaluated(ruleId, count = 1) {
		this.evaluations.set(ruleId, (this.evaluations.get(ruleId) ?? 0) + count);
	}
	markRuleNotApplicable(ruleId, reason) {
		if (!reason || reason.trim().length === 0) throw new Error(`markRuleNotApplicable('${ruleId}') requires an explicit justification.`);
		this.notApplicable.set(ruleId, reason);
	}
	declareRuleCatalog(ruleIds) {
		for (const id of ruleIds) this.dynamicRuleIds.add(id);
	}
	getEvaluations(ruleId) {
		return this.evaluations.get(ruleId) ?? 0;
	}
	toLedger(params) {
		const catalog = Array.from(/* @__PURE__ */ new Set([...params.ruleIds, ...this.dynamicRuleIds])).sort();
		return {
			runId: params.runId,
			suiteId: params.suiteId,
			skipped: params.skipped,
			declared: this.declaration,
			source: this.source,
			scanned: Array.from(this.scanned).sort(),
			ruleIds: catalog,
			ruleEvaluations: Object.fromEntries(catalog.map((id) => [id, this.getEvaluations(id)])),
			notApplicable: Object.fromEntries(this.notApplicable)
		};
	}
};
async function writeCoverageLedger(projectRoot, ledger) {
	const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
	await fs$1.mkdir(dir, { recursive: true });
	await fs$1.writeFile(path.join(dir, `${ledger.suiteId}.json`), JSON.stringify(ledger, null, 2), "utf-8");
}
async function clearCoverageLedgers(projectRoot) {
	await fs$1.rm(path.resolve(projectRoot, COVERAGE_LEDGER_DIR), {
		recursive: true,
		force: true
	});
}
/** Reads every ledger written during the given run (stale ledgers from previous runs are ignored). */
async function readCoverageLedgers(projectRoot, runId) {
	const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
	let entries;
	try {
		entries = await fs$1.readdir(dir);
	} catch {
		return [];
	}
	const ledgers = [];
	for (const entry of entries.filter((e) => e.endsWith(".json")).sort()) {
		const ledger = JSON.parse(await fs$1.readFile(path.join(dir, entry), "utf-8"));
		if (ledger.runId === runId) ledgers.push(ledger);
	}
	return ledgers;
}
/** Reads all ledgers from the latest run in scratch/audits/coverage. */
async function readLatestCoverageLedgers(projectRoot) {
	const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
	const entries = await tryOrDefaultAsync(async () => await fs$1.readdir(dir), []);
	if (entries.length === 0) return {
		runId: null,
		ledgers: []
	};
	const allLedgers = [];
	for (const entry of entries.filter((e) => e.endsWith(".json")).sort()) {
		const raw = await safeReadFileAsync(path.join(dir, entry));
		if (raw) {
			const ledger = safeJsonParse(raw);
			if (ledger) allLedgers.push(ledger);
		}
	}
	if (allLedgers.length === 0) return {
		runId: null,
		ledgers: []
	};
	const latestRunId = allLedgers[allLedgers.length - 1].runId;
	return {
		runId: latestRunId,
		ledgers: allLedgers.filter((l) => l.runId === latestRunId)
	};
}
//#endregion
export { COVERAGE_EXPECTED_SUITES_ENV, COVERAGE_LEDGER_DIR, COVERAGE_RUN_ID_ENV, COVERAGE_RUN_MODE_ENV, CoverageRecorder, DEFAULT_NON_AUDITABLE_GLOBS, FAST_NON_AUDITABLE_EXTENSIONS, clearCoverageLedgers, deriveCoverageFromRequiredFiles, deriveCoverageFromRoots, isAuditableCodebaseFile, isDeclaredByCoverage, matchesAnyGlob, readCoverageLedgers, readLatestCoverageLedgers, resolveActiveCoverageRunId, toPosixRelative, validateCoverageDeclaration, writeCoverageLedger };
